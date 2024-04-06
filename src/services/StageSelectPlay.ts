import { FontRender, getFontRender } from "./FontRender";
import { BlockType, ScreenData, StagePlayData } from "./MyService";
import { ButtonType, IPlay, StickData, saveData } from "./PlayData";
import { StagePlay } from "./StagePlay";

export interface StageProperty {
    width: number;
    height: number;
    offset: number;
    max: number;
    holeCount: number;
    name: string;
}
export class StageTypeData {
    private stageData: string[][] = [];
    private stageNum: number;

    public constructor(public readonly type: string, public readonly prop: StageProperty) {
        this.stageNum = 0;
    }

    public async loadData() {
        for (let i = 1; i <= this.prop.max; i++) {
            let res = await fetch(`stage/${this.type}/${i}.txt`);
            if (!res.ok) {
                throw new Error(`Invalid Stage ${this.type}-${i}`);
            }
            const text = await res.text();
            this.stageData.push(text.split(/\n/));
        }
        return this;
    }

    public getStageData(stage: number): ScreenData {
        let data = [...this.stageData[stage - 1]];
        for (let i = 0; i < this.prop.offset; i++) {
            data.unshift("");
        }
        let maxwd = 0;
        for (let dt of data) {
            maxwd = Math.max(maxwd, dt.length);
        }
        if (maxwd < this.prop.width) {
            let sz = Math.floor((this.prop.width - maxwd) / 2);
            let sp = "";
            for (let i = 0; i < sz; i++) {
                sp += ' ';
            }
            for (let i = 0; i < data.length; i++) {
                data[i] = sp + data[i];
            }
        }
        return new ScreenData(data, this.prop.width, this.prop.height + this.prop.offset, { stageNum: stage, name: this.prop.name });
    }

    public getStageNum(): number {
        return this.stageNum + 1;
    }
    public addStage(add: number): number {
        this.stageNum = (this.stageNum + add + this.prop.max) % this.prop.max;
        return this.stageNum + 1;
    }
}

let stageTypeList: StageTypeData[];
let lastType: number = 0;

async function loadStageType(type: string) {
    let res = await fetch(`stage/${type}/stage.properties`);
    if (!res.ok) {
        throw new Error("Invalid Stage " + type);
    }
    const text = await res.text();
    let map: { [key: string]: string } = {};
    for (let ln of text.split(/\n/)) {
        let ix = ln.indexOf('=');
        if (ix > 0) {
            map[ln.substring(0, ix)] = ln.substring(ix + 1);
        }
    }
    const holeCnt = map['block.holeCount'].split(',');
    let prop: StageProperty = {
        width: parseInt(map['stage.width']),
        height: parseInt(map['stage.height']),
        offset: parseInt(map['stage.offset']),
        max: parseInt(map['stage.max']),
        holeCount: Math.min(280, Math.round(parseInt(holeCnt[0], 16)) + Math.round(parseInt(holeCnt[1], 16)) * 2),
        name: map['name']
    };
    return await new StageTypeData(type, prop).loadData();
}

const v_shader = `
attribute vec2 a_pos;
// xy, zw(キャンバスの幅と高さ)
uniform vec4 u_pos;
varying vec4 v_pos;

void main() {
    v_pos = u_pos;
    gl_Position = vec4((u_pos.x + a_pos.x) * 2.0 / u_pos.z - 1.0, -(u_pos.y + a_pos.y) * 2.0 / u_pos.w + 1.0, -0.7, 1.0);
}
`;

const f_shader = `
precision mediump float;

uniform sampler2D u_tex;
uniform sampler2D u_stage;
// xy, zw(キャンバスの幅と高さ)
//uniform vec4 u_pos;

varying vec4 v_pos;

void main() {
    vec2 pos = vec2(gl_FragCoord.x - v_pos.x, v_pos.w - v_pos.y - gl_FragCoord.y);
    vec2 blkpos = floor(pos / 8.0);
    float blk = floor(texture2D(u_stage, blkpos / 31.0).a * 255.0 + 0.5);
    vec2 offset = pos - floor(pos / 8.0) * 8.0;
    vec2 texpos = vec2((blk * 8.0 + offset.x) / 128.0 + 0.0, offset.y / 8.0);
    vec4 col = texture2D(u_tex, texpos);
    gl_FragColor = col;
    //gl_FragColor = vec4(blk, 1, 1, 1);
}
`;

class StageRender {
    private program: WebGLProgram;
    private aPos: number;
    private uTex: WebGLUniformLocation;
    private uPos: WebGLUniformLocation;
    private uStage: WebGLUniformLocation;
    private posVbo: WebGLBuffer;
    private blockTex: WebGLTexture;
    private stageTex: WebGLTexture;

    public constructor(gl: WebGL2RenderingContext) {
        let vs = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vs, v_shader);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.log(gl.getShaderInfoLog(vs));
        }
        let fs = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fs, f_shader);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.log(gl.getShaderInfoLog(fs));
        }
        this.program = gl.createProgram()!;
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);
        //
        gl.useProgram(this.program);
        this.aPos = gl.getAttribLocation(this.program, "a_pos");
        this.uTex = gl.getUniformLocation(this.program, "u_tex")!;
        this.uPos = gl.getUniformLocation(this.program, "u_pos")!;
        this.uStage = gl.getUniformLocation(this.program, "u_stage")!;
        //
        this.posVbo = gl.createBuffer()!;
        this.blockTex = gl.createTexture()!;
        this.stageTex = gl.createTexture()!;
        let img = new Image();
        img.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, this.blockTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.bindTexture(gl.TEXTURE_2D, null);
        };
        img.src = "all.png";
    }

    public close(gl: WebGL2RenderingContext): void {
        gl.deleteBuffer(this.posVbo);
        gl.deleteTexture(this.blockTex);
        gl.deleteTexture(this.stageTex);
    }

    public setStage(gl: WebGL2RenderingContext, stage: ScreenData): void {
        const buf = new Uint8Array(32 * 32);
        for (let y = 0; y < stage.HEIGHT; y++) {
            for (let x = 0; x < stage.WIDTH; x++) {
                let ch = 0;
                switch (stage.get(x, y)) {
                    case BlockType.Brick:
                    case BlockType.Trapdoor:
                        ch = 1;
                        break;
                    case BlockType.Concrete:
                        ch = 2;
                        break;
                    case BlockType.Ladder:
                        ch = 3;
                        break;
                    case BlockType.Bar:
                        ch = 4;
                        break;
                    case BlockType.Gold:
                        ch = 5;
                        break;
                    case BlockType.Enemy:
                        ch = 8;
                        break;
                    case BlockType.Player:
                        ch = 9;
                        break;
                }
                buf[y * 32 + x] = ch;
            }
        }
        gl.bindTexture(gl.TEXTURE_2D, this.stageTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, 32, 32, 0, gl.ALPHA, gl.UNSIGNED_BYTE, buf);
        //gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posVbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, stage.HEIGHT * 8, stage.WIDTH * 8, 0, stage.WIDTH * 8, stage.HEIGHT * 8]), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    public draw(gl: WebGL2RenderingContext, x: number, y: number): void {
        gl.useProgram(this.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posVbo);
        gl.enableVertexAttribArray(this.aPos);
        gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.blockTex);
        gl.uniform1i(this.uTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.stageTex);
        gl.uniform1i(this.uStage, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.uniform4f(this.uPos, x, y, 512, 480);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disableVertexAttribArray(this.aPos);
    }
}

let stageRender: StageRender;

export class StageSelectPlay implements IPlay {
    private mode: "select" | "start" | "clear";
    private fontRender: FontRender;
    private clearText?: string;

    public constructor(gl: WebGL2RenderingContext, mode: "select" | "restart" | "clear" = "select") {
        this.fontRender = getFontRender(gl);
        this.fontRender.init(gl);
        this.mode = "select";
        if (!stageTypeList) {
            console.log("Load Start");
            Promise.all([
                loadStageType('loderun'),
                loadStageType('champ'),
                loadStageType('tsume')
            ]).then(res => {
                stageTypeList = res;
                console.log("Load End");
                this.makeStageTexture(gl);
            });
        } else {
            this.makeStageTexture(gl);
        }
        if (mode === "clear") {
            stageTypeList[lastType].addStage(1);
            this.mode = "clear";
        } else if (mode === "restart") {
            this.mode = "start";
        }
    }
    private makeStageTexture(gl: WebGL2RenderingContext): void {
        const type = stageTypeList[lastType];
        const data = type.getStageData(type.getStageNum());
        this.clearText = "";
        if (!stageRender) {
            stageRender = new StageRender(gl);
        }
        stageRender.setStage(gl, data);
        saveData.getClearTime(type.prop.name, type.getStageNum()).then(res => {
            if (res > 0) {
                this.clearText = "CLEAR TIME " + saveData.getTimeText(res);
            }
        });
    }
    private close(gl: WebGL2RenderingContext): void {
        /*
        for (let key in this.texMap) {
            gl.deleteTexture(this.texMap[key]);
        }
        this.canvas.remove();
        */
    }
    stepFrame(gl: WebGL2RenderingContext, stick: StickData): IPlay {
        if (!stageTypeList) {
            return this;
        }
        switch (this.mode) {
            case "clear":
                this.mode = "start";
                break;
            case "select":
                if (stick.isPause(true)) {
                    this.mode = "start";
                } else if (stick.isSelect(true)) {
                    lastType = (lastType + 1) % stageTypeList.length;
                    this.makeStageTexture(gl);
                } else {
                    const type = stageTypeList[lastType];
                    if (stick.isLeft(true)) {
                        type.addStage(-1);
                        this.makeStageTexture(gl);
                    } else if (stick.isRight(true)) {
                        type.addStage(1);
                        this.makeStageTexture(gl);
                    } else if (stick.isUp(true)) {
                        type.addStage(10);
                        this.makeStageTexture(gl);
                    } else if (stick.isDown(true)) {
                        type.addStage(-10);
                        this.makeStageTexture(gl);
                    }
                }
                gl.clearColor(0, 0, 0, 1);
                gl.clearDepth(1.0);
                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                gl.enable(gl.DEPTH_TEST);
                gl.enable(gl.CULL_FACE);
                {
                    const type = stageTypeList[lastType];
                    this.fontRender.drawFrame(gl, [-0.9, -0.9, 1.2, 0.4], [0.4, 0.4, 0.4], [0.9, 0.9, 0.9]);
                    this.fontRender.draw(gl, type.prop.name, [-0.8, -0.8, 0.06 * type.prop.name.length, 0.1], [0.9, 0.9, 0.3]);
                    const label = stick.getButtonName(ButtonType.Select) + " TO SWITCH";
                    this.fontRender.draw(gl, label, [-0.75, -0.65, label.length * 0.04, 0.05], [1, 1, 1]);

                    this.fontRender.drawFrame(gl, [-0.9, -0.2, 1.8, 1], [0.2, 0.3, 0], [0.9, 0.7, 0.2]);
                    const label2 = stick.getButtonName(ButtonType.Pause) + " TO START";
                    const stage = "STAGE " + type.getStageNum();
                    this.fontRender.draw(gl, stage, [-0.8, -0.12, 0.1 * stage.length, 0.18], [0.9, 0.9, 1]);
                    this.fontRender.draw(gl, label2, [0.05, 0, label.length * 0.03, 0.05], [1, 1, 1]);
                    if (this.clearText) {
                        this.fontRender.draw(gl, this.clearText, [-0.7, 0.7, 0.04 * this.clearText.length, 0.07], [0.9, 0.9, 0.6]);
                    }
                }
                stageRender.draw(gl, 100, 270);
                gl.flush();
                break;
            case "start":
                this.close(gl);
                const type = stageTypeList[lastType];
                const data = type.getStageData(type.getStageNum());
                console.log("Select Stage");
                return new StagePlay(gl, stick, new StagePlayData(data, stick, type.prop.holeCount));
        }
        return this;
    }
}