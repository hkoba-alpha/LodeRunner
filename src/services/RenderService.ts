import { BEAM_STEP, BlockType, EnemyData, HALF_SIZE, PlayerData, Point, SpritePosition, StageData } from "./MyService";
import { getProjection, getTranslation } from "./RenderCommon";

const v_shader1 = `
attribute vec3 a_pos;
// z: >=0 色, <0 テクスチャ >=2.0, <-2.0 Y軸補正  -1.0> >=-2.0 テクスチャ座標もY補正  abs(z) >= 10 明るさ補正
attribute vec3 a_color;
uniform mat4 u_trans;
uniform mat4 u_proj;
uniform vec2 u_pos;
uniform float u_down;
uniform int u_depth;
varying vec4 v_color;
varying vec2 v_pos;
uniform vec4 u_light;
varying vec4 v_light;

void main() {
    vec3 pos = a_pos;
    vec4 col = vec4(a_color, 1.0);
    v_light = vec4(u_light.rgb, 1.0);
    if (abs(col.z) >= 10.0) {
        col.z -= sign(col.z) * 10.0;
        col.a = u_light.a;
    }

    if (col.z < -2.0) {
        // Y軸のみ補正
        col.z += 2.0;
        if (u_down > 0.0) {
            pos.y += u_down;
        }
    } else if (col.z < -1.0) {
        // Y軸補正
        col.z += 1.0;
        if (u_down > 0.0) {
            pos.y += u_down;
            col.y += u_down / 2.0;
        }
    } else if (col.z >= 2.0) {
        // Y軸のみ補正
        col.z -= 2.0;
        if (u_down > 0.0) {
            pos.y += u_down;
        }
    }
    v_pos = pos.xy + u_pos;
    gl_Position = u_proj * u_trans * vec4(pos + vec3(u_pos, 0.0), 1.0);
    if (u_depth == 1) {
        gl_Position.z = -0.0;
    } else if (u_depth == 2) {
        v_light.a = 0.5;
    }
    v_color = col;
}
`;

const f_shader1 = `
precision mediump float;

uniform sampler2D u_tex;
varying vec4 v_color;
varying vec2 v_pos;
varying vec4 v_light;

void main() {
    vec4 light = vec4(vec3(min(max(2.0 - length(v_light.xy - v_pos) / 6.0, 0.1) + v_light.z, 1.0)), v_light.a);
    vec3 col = v_color.rgb;
    if (v_color.z < 0.0) {
        if (v_color.z > -1.0) {
            col = (texture2D(u_tex, vec2(v_color.x, v_color.y)) * vec4(vec3(-v_color.z), 1.0)).rgb;
        } else {
            col = texture2D(u_tex, vec2(v_color.x, v_color.y)).rgb;
        }
    }
    gl_FragColor = vec4(clamp(col.rgb * v_color.a, vec3(0.0), vec3(1.0)), 1.0) * light;
}
`;

/**
 * 描画用のデータ
 */
class DrawItem {
    posList: number[][] = [];
    colorList: number[][] = [];
    ixList: number[] = [];
    private posVbo: WebGLBuffer | undefined;
    private colorVbo: WebGLBuffer | undefined;
    private ibo: WebGLBuffer | undefined;

    public constructor(private texture?: WebGLTexture) {
    }

    private getIndex(pos: number[], color: number[]): number {
        for (let i = 0; i < this.posList.length; i++) {
            let p = this.posList[i];
            let c = this.colorList[i];
            if (p[0] === pos[0] && p[1] === pos[1] && p[2] === pos[2] && c[0] === color[0] && c[1] === color[1] && c[2] === color[2]) {
                return i;
            }
        }
        this.posList.push(pos);
        this.colorList.push(color);
        return this.posList.length - 1;
    }
    public close(gl: WebGL2RenderingContext): void {
        if (this.posVbo) {
            gl.deleteBuffer(this.posVbo);
            this.posVbo = undefined;
        }
        if (this.colorVbo) {
            gl.deleteBuffer(this.colorVbo);
            this.colorVbo = undefined;
        }
        if (this.ibo) {
            gl.deleteBuffer(this.ibo);
            this.ibo = undefined;
        }
    }

    public addTriangle(pos: number[][], color: number[][]): DrawItem {
        for (let i = 0; i < pos.length; i++) {
            this.ixList.push(this.getIndex(pos[i], color[i]));
        }
        return this;
    }
    /**
     * 
     * @param pos [0]=中心、左回りの周囲
     * @param color 
     * @returns 
     */
    public addTriangleFan(pos: number[][], color: number[][]): DrawItem {
        let centorIx = this.getIndex(pos[0], color[0]);
        let bakIx = centorIx;
        let lastIx = this.getIndex(pos[1], color[1]);
        for (let i = 2; i < pos.length; i++) {
            bakIx = lastIx;
            lastIx = this.getIndex(pos[i], color[i]);
            this.ixList.push(centorIx, bakIx, lastIx);
        }
        return this;
    }
    public addTriangleStrip(pos: number[][], color: number[][]): DrawItem {
        let bakIx: number[] = [];
        for (let i = 0; i < pos.length; i++) {
            bakIx.push(this.getIndex(pos[i], color[i]));
            if (bakIx.length > 3) {
                bakIx.splice(0, 1);
            }
            if (bakIx.length === 3) {
                if (i & 1) {
                    // 逆
                    this.ixList.push(bakIx[0], bakIx[2], bakIx[1]);
                } else {
                    this.ixList.push(...bakIx);
                }
            }
        }
        return this;
    }

    public getPosVbo(gl: WebGL2RenderingContext): WebGLBuffer {
        if (!this.posVbo) {
            this.posVbo = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.posVbo);
            let pos: number[] = [];
            for (let p of this.posList) {
                pos.push(...p);
            }
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        }
        return this.posVbo;
    }
    public getColorVbo(gl: WebGL2RenderingContext): WebGLBuffer {
        if (!this.colorVbo) {
            this.colorVbo = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.colorVbo);
            let col: number[] = [];
            for (let c of this.colorList) {
                col.push(...c);
            }
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(col), gl.STATIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        }
        return this.colorVbo;
    }
    public getIbo(gl: WebGL2RenderingContext): WebGLBuffer {
        if (!this.ibo) {
            this.ibo = gl.createBuffer()!;
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.ixList), gl.STATIC_DRAW);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }
        return this.ibo;
    }
    public preDraw(gl: WebGL2RenderingContext, aPos: number, aColor: number): void {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.getPosVbo(gl));
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.getColorVbo(gl));
        gl.enableVertexAttribArray(aColor);
        gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.getIbo(gl));
        if (this.texture) {
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.activeTexture(gl.TEXTURE0);
        }
    }
}

class BlockDrawItem {
    private posMap: { [pos: string]: number[] } = {};
    public constructor(private draw: DrawItem, private trap: boolean = false) {
    }

    public set(bx: number, by: number, option?: number): BlockDrawItem {
        if (option !== undefined) {
            this.posMap[bx + "_" + by] = [bx, by, option];
        } else {
            this.posMap[bx + "_" + by] = [bx, by];
        }
        return this;
    }
    public clear(bx: number, by: number): BlockDrawItem {
        delete this.posMap[bx + "_" + by];
        return this;
    }

    public isTrap(): boolean {
        return this.trap;
    }

    public drawBlock(gl: WebGL2RenderingContext, aPos: number, aColor: number, uPos: WebGLUniformLocation): void {
        let pos = Object.keys(this.posMap);
        if (pos.length > 0) {
            this.draw.preDraw(gl, aPos, aColor);
            for (let p of pos) {
                let ix = this.posMap[p];
                gl.uniform2f(uPos, ix[0], ix[1]);
                if (this.trap) {
                    gl.drawElements(gl.TRIANGLES, this.draw.ixList.length - 6, gl.UNSIGNED_SHORT, 12);
                } else {
                    gl.drawElements(gl.TRIANGLES, this.draw.ixList.length, gl.UNSIGNED_SHORT, 0);
                }
            }
        }
    }
    public drawTrap(gl: WebGL2RenderingContext, aPos: number, aColor: number, uPos: WebGLUniformLocation, uDepth: WebGLUniformLocation): void {
        let pos = Object.keys(this.posMap);
        if (pos.length > 0) {
            this.draw.preDraw(gl, aPos, aColor);
            gl.disable(gl.DEPTH_TEST);
            gl.uniform1i(uDepth, 1);
            for (let p of pos) {
                let ix = this.posMap[p];
                if (ix.length > 2) {
                    continue;
                }
                gl.uniform2f(uPos, ix[0], ix[1]);
                gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
            }
            gl.uniform1i(uDepth, 0);
            gl.enable(gl.DEPTH_TEST);
        }
    }
    public drawTrap2(gl: WebGL2RenderingContext, aPos: number, aColor: number, uPos: WebGLUniformLocation, uDepth: WebGLUniformLocation): void {
        let pos = Object.keys(this.posMap);
        if (pos.length > 0) {
            this.draw.preDraw(gl, aPos, aColor);
            gl.enable(gl.BLEND);
            gl.uniform1i(uDepth, 2);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            for (let p of pos) {
                let ix = this.posMap[p];
                gl.uniform2f(uPos, ix[0], ix[1]);
                gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
            }
            gl.uniform1i(uDepth, 0);
            gl.disable(gl.BLEND);
        }
    }
}

export interface Point3D {
    // 座標のベースとなるキー座標
    base?: string;
    x: number;
    y: number;
    z: number;
}
export interface Vector3D {
    name: string;
    pos: Point3D;
}
interface Polar3D {
    length: number;
    angleXZ: number;
    angleY: number;
}
interface Tree3D {
    vec: Vector3D;
    pos?: Point3D;
    polar?: Polar3D;
    children: Tree3D[];
}

export class Quaternion {
    constructor(public x: number, public y: number, public z: number, public w: number) { }

    static fromTwoVectors(v1: Point3D, v2: Point3D): Quaternion {
        // Normalize vectors
        const v1n = Quaternion.normalize(v1);
        const v2n = Quaternion.normalize(v2);

        // Compute rotation axis
        const axis = Quaternion.crossProduct(v1n, v2n);
        if (axis.x === 0 && axis.y === 0 && axis.z === 0) {
            axis.y = -1;
        }

        // Compute rotation angle
        const dotProduct = Quaternion.dotProduct(v1n, v2n);
        const angle = Math.acos(dotProduct);

        // Create quaternion
        return Quaternion.fromAxisAngle(axis, angle);
    }

    static normalize(v: Point3D): Point3D {
        const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        return { x: v.x / length, y: v.y / length, z: v.z / length };
    }

    static dotProduct(v1: Point3D, v2: Point3D): number {
        return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    }

    static crossProduct(v1: Point3D, v2: Point3D): Point3D {
        return {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
        };
    }

    static fromAxisAngle(axis: Point3D, angle: number): Quaternion {
        const halfAngle = angle / 2;
        const s = Math.sin(halfAngle);
        axis = Quaternion.normalize(axis);
        return new Quaternion(
            axis.x * s,
            axis.y * s,
            axis.z * s,
            Math.cos(halfAngle)
        );
    }

    public multiply(q2: Quaternion): Quaternion {
        const q1 = this;
        return new Quaternion(
            q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
            q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
            q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
            q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z
        );
    }

    public conjugate(): Quaternion {
        return new Quaternion(-this.x, -this.y, -this.z, this.w);
    }

    public rotateVector(v: Point3D, base?: Point3D): Point3D {
        let quaternion: Quaternion;
        if (base) {
            quaternion = new Quaternion(v.x - base.x, v.y - base.y, v.z - base.z, 0);
        } else {
            quaternion = new Quaternion(v.x, v.y, v.z, 0);
        }
        const rotatedQuaternion = this.multiply(quaternion).multiply(this.conjugate());
        let ret = { x: rotatedQuaternion.x, y: rotatedQuaternion.y, z: rotatedQuaternion.z };
        if (base) {
            ret.x += base.x;
            ret.y += base.y;
            ret.z += base.z;
        }
        return ret;
    }
}

function vecToPolar(pos: Point3D): Polar3D {
    // ベクトルの長さを計算
    const length = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2);

    // ベクトルの角度を計算
    // x, y 平面上の角度
    const angleXZ = Math.atan2(pos.z, pos.x);
    // z 軸との角度
    const angleY = Math.atan2(pos.y, Math.sqrt(pos.x ** 2 + pos.z ** 2));

    return {
        length: length,
        angleXZ: angleXZ,
        angleY: angleY
    };
}

function getPolar(from: Point3D, to: Point3D): Polar3D {
    return vecToPolar({
        x: to.x - from.x,
        y: to.y - from.y,
        z: to.z - from.z
    });
}

function polarToVec(polar: Polar3D): Point3D {
    let xz = polar.length * Math.cos(polar.angleY);
    return {
        x: xz * Math.cos(polar.angleXZ),
        y: polar.length * Math.sin(polar.angleY),
        z: xz * Math.sin(polar.angleXZ)
    };
}

/**
 * 座標が動く描画
 */
class PosDrawItem {
    private base: { [key: string]: Tree3D } = {};
    private tree: Tree3D;
    private posList: Tree3D[] = [];
    private colorList: number[][] = [];
    private ixList: number[] = [];
    private posVbo: WebGLBuffer | undefined;
    private colorVbo: WebGLBuffer | undefined;
    private ibo: WebGLBuffer | undefined;
    private updateFlag = false;
    private offset: Point3D;

    public constructor(center: Point3D, private texture?: WebGLTexture) {
        this.tree = {
            vec: { name: "", pos: center },
            pos: center,
            children: []
        };
        this.base[""] = this.tree;
        this.offset = { x: 0, y: 0, z: 0 };
    }
    public close(gl: WebGL2RenderingContext): void {
        if (this.posVbo) {
            gl.deleteBuffer(this.posVbo);
            this.posVbo = undefined;
        }
        if (this.colorVbo) {
            // なぜかこれでエラーになる
            //gl.deleteBuffer(this.colorVbo);
            this.colorVbo = undefined;
        }
        if (this.ibo) {
            gl.deleteBuffer(this.ibo);
            this.ibo = undefined;
        }
    }
    public addBase(...bases: Vector3D[]): PosDrawItem {
        for (let pos of bases) {
            if (pos.name in this.base) {
                // すでにあった
                this.base[pos.name].vec.pos = pos.pos;
            } else {
                if (pos.pos.base) {
                    if (pos.pos.base in this.base) {
                        let polar = getPolar(this.base[pos.pos.base].vec.pos, pos.pos);
                        let p = this.base[pos.pos.base];
                        polar.angleXZ -= p.polar!.angleXZ;
                        polar.angleY -= p.polar!.angleY;
                        this.base[pos.name] = { vec: pos, children: [], pos: pos.pos, polar: polar };
                        this.base[pos.pos.base].children.push(this.base[pos.name]);
                    } else {
                        throw "No Name Vector " + pos.pos.base;
                    }
                } else {
                    this.base[pos.name] = { vec: pos, children: [], pos: pos.pos, polar: getPolar(this.tree.vec.pos, pos.pos) };
                    this.tree.children.push(this.base[pos.name]);
                }
            }
        }
        this.updateFlag = true;
        return this;
    }
    private getIndex(pos: Point3D, color: number[]): number {
        for (let i = 0; i < this.posList.length; i++) {
            let p = this.posList[i].vec;
            let c = this.colorList[i];
            if (p.pos.base === pos.base && p.pos.x === pos.x && p.pos.y === pos.y && p.pos.z === pos.z && c[0] === color[0] && c[1] === color[1] && c[2] === color[2]) {
                return i;
            }
        }
        let dt: Tree3D;
        if (pos.base) {
            if (pos.base in this.base) {
                let base = this.base[pos.base];
                base = this.base[base.pos!.base || ""];
                dt = { vec: { name: "_", pos: pos }, children: [], pos: pos, polar: getPolar(base.vec.pos, pos) };
                this.base[pos.base].children.push(dt);
            } else {
                throw "No Name Vector " + pos.base;
            }
        } else {
            dt = { vec: { name: "_", pos: pos }, children: [], pos: pos, polar: getPolar(this.tree.vec.pos, pos) };
            this.tree.children.push(dt);
        }
        this.posList.push(dt);
        this.colorList.push(color);
        return this.posList.length - 1;
    }
    public addTriangle(pos: Point3D[], color: number[][]): PosDrawItem {
        for (let i = 0; i < pos.length; i++) {
            this.ixList.push(this.getIndex(pos[i], color[i]));
        }
        this.updateFlag = true;
        return this;
    }
    /**
     * 
     * @param pos [0]=中心、左回りの周囲
     * @param color 
     * @returns 
     */
    public addTriangleFan(pos: Point3D[], color: number[][]): PosDrawItem {
        let centorIx = this.getIndex(pos[0], color[0]);
        let bakIx = centorIx;
        let lastIx = this.getIndex(pos[1], color[1]);
        for (let i = 2; i < pos.length; i++) {
            bakIx = lastIx;
            lastIx = this.getIndex(pos[i], color[i]);
            this.ixList.push(centorIx, bakIx, lastIx);
        }
        this.updateFlag = true;
        return this;
    }
    public addTriangleStrip(pos: Point3D[], color: number[][]): PosDrawItem {
        let bakIx: number[] = [];
        for (let i = 0; i < pos.length; i++) {
            bakIx.push(this.getIndex(pos[i], color[i]));
            if (bakIx.length > 3) {
                bakIx.splice(0, 1);
            }
            if (bakIx.length === 3) {
                if (bakIx[0] === bakIx[1] || bakIx[1] === bakIx[2] || bakIx[0] === bakIx[2]) {
                    continue;
                }
                if (i & 1) {
                    // 逆
                    this.ixList.push(bakIx[0], bakIx[2], bakIx[1]);
                } else {
                    this.ixList.push(...bakIx);
                }
            }
        }
        this.updateFlag = true;
        return this;
    }

    public setPosition(pos: { [key: string]: Point3D }): void {
        if ("" in pos) {
            let base = this.tree.pos!;
            let base2 = pos[""];
            this.offset.x = base2.x - base.x;
            this.offset.y = base2.y - base.y;
            this.offset.z = base2.z - base.z;
        } else {
            this.offset.x = this.offset.y = this.offset.z = 0;
        }
        let proc = (basepos: Point3D, movepos: Point3D, node: Tree3D, qt?: Quaternion) => {
            for (let chld of node.children) {
                if (chld.vec.name in pos) {
                    const to = pos[chld.vec.name];
                    basepos = node.vec.pos;
                    let qt2 = Quaternion.fromTwoVectors(
                        //{ x: chld.pos.x - basepos.x, y: chld.pos.y - basepos.y, z: chld.pos.z - basepos.z },
                        //{ x: to.x - basepos.x, y: to.y - basepos.y, z: to.z - basepos.z }
                        { x: chld.vec.pos.x - node.vec.pos.x, y: chld.vec.pos.y - node.vec.pos.y, z: chld.vec.pos.z - node.vec.pos.z },
                        { x: to.x - node.vec.pos.x, y: to.y - node.vec.pos.y, z: to.z - node.vec.pos.z }
                    );
                    if (qt) {
                        //qt = qt2.multiply(qt);
                        qt = qt.multiply(qt2);
                    } else {
                        qt = qt2;
                    }
                    //chld.pos = qt.rotateVector(chld.pos, basepos);
                    //chld.pos = qt.rotateVector(chld.vec.pos, basepos);
                    //movepos = { x: basepos.x - node.vec.pos.x, y: basepos.y - node.vec.pos.y, z: basepos.z - node.vec.pos.z };
                    movepos = { x: node.pos!.x - basepos.x, y: node.pos!.y - basepos.y, z: node.pos!.z - basepos.z };
                }
                if (qt) {
                    chld.pos = qt.rotateVector(chld.vec.pos, basepos)
                } else {
                    chld.pos = { x: chld.vec.pos.x, y: chld.vec.pos.y, z: chld.vec.pos.z };
                }
                chld.pos.x += movepos.x;
                chld.pos.y += movepos.y;
                chld.pos.z += movepos.z;
                proc(basepos, movepos, chld, qt);
            }
        };
        proc(this.tree.pos!, { x: 0, y: 0, z: 0 }, this.tree);
        this.updateFlag = true;
    }

    public getPosVbo(gl: WebGL2RenderingContext): WebGLBuffer {
        if (!this.posVbo) {
            this.posVbo = gl.createBuffer()!;
        }
        if (this.updateFlag) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.posVbo);
            let pos: number[] = [];
            for (let p of this.posList) {
                pos.push(p.pos!.x + this.offset.x, p.pos!.y + this.offset.y, p.pos!.z + this.offset.z);
            }
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            this.updateFlag = false;
        }
        return this.posVbo;
    }
    public getColorVbo(gl: WebGL2RenderingContext): WebGLBuffer {
        if (!this.colorVbo) {
            this.colorVbo = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, this.colorVbo);
            let col: number[] = [];
            for (let c of this.colorList) {
                col.push(...c);
            }
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(col), gl.STATIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
        }
        return this.colorVbo;
    }
    public getIbo(gl: WebGL2RenderingContext): WebGLBuffer {
        if (!this.ibo) {
            this.ibo = gl.createBuffer()!;
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.ixList), gl.STATIC_DRAW);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
        }
        return this.ibo;
    }

    public preDraw(gl: WebGL2RenderingContext, aPos: number, aColor: number): void {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.getPosVbo(gl));
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.getColorVbo(gl));
        gl.enableVertexAttribArray(aColor);
        gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.getIbo(gl));
        if (this.texture) {
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.activeTexture(gl.TEXTURE0);
        }
    }


    public drawBlock(gl: WebGL2RenderingContext, aPos: number, aColor: number, uPos: WebGLUniformLocation, pos: number[]): void {
        this.preDraw(gl, aPos, aColor);
        gl.uniform2fv(uPos, new Float32Array([pos[0] / HALF_SIZE / 2, pos[1] / HALF_SIZE / 2]));
        gl.drawElements(gl.TRIANGLES, this.ixList.length, gl.UNSIGNED_SHORT, 0);
    }
}

/**
 * アニメーションしながら描画する
 */
class AnimateDrawItem {
    private posVbo: WebGLBuffer | undefined;
    private colorVbo: WebGLBuffer | undefined;
    private polygon?: { pos: number[], color: number[] }[];

    public constructor(public readonly key: string, private texture?: WebGLTexture) {

    }
    public close(gl: WebGL2RenderingContext): void {
        if (this.posVbo) {
            gl.deleteBuffer(this.posVbo);
            this.posVbo = undefined;
        }
        if (this.colorVbo) {
            gl.deleteBuffer(this.colorVbo);
            this.colorVbo = undefined;
        }
    }

    public getPosVbo(gl: WebGL2RenderingContext): WebGLBuffer {
        if (!this.posVbo) {
            this.posVbo = gl.createBuffer()!;
        }
        return this.posVbo;
    }
    public getColorVbo(gl: WebGL2RenderingContext): WebGLBuffer {
        if (!this.colorVbo) {
            this.colorVbo = gl.createBuffer()!;
        }
        return this.colorVbo;
    }

    protected getPolygon(): { pos: number[], color: number[] }[] {
        return [];
    }
    public stepFrame(): boolean {
        this.polygon = this.getPolygon();
        return this.polygon.length > 0;
    }

    public draw(gl: WebGL2RenderingContext, aPos: number, aColor: number, uPos: WebGLUniformLocation): void {
        if (!this.polygon) {
            return;
        }
        let draws: number[][] = [];
        let posList: number[] = [];
        let colList: number[] = [];
        for (let dt of this.polygon) {
            let sz = dt.pos.length / 3;
            draws.push([posList.length / 3, sz]);
            posList.push(...dt.pos);
            colList.push(...dt.color);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.getPosVbo(gl));
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(posList), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.getColorVbo(gl));
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colList), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aColor);
        gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        if (this.texture) {
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.activeTexture(gl.TEXTURE0);
        }
        gl.uniform2f(uPos, 0, 0);
        for (let dt of draws) {
            gl.drawArrays(gl.TRIANGLE_STRIP, dt[0], dt[1]);
        }
        gl.disableVertexAttribArray(aPos);
        gl.disableVertexAttribArray(aColor);
    }
}

class BrickBreakDraw extends AnimateDrawItem {
    private drawData: {
        x: number;
        y: number;
        dx: number;
        dy: number;
        px: number;
        py: number;
        ey: number;
        time: number;
    }[] = [];
    private beamData: {
        bx: number;
        by: number;
        ay: number;
        dx: number;
        time: number;
    };

    public constructor(key: string, texture: WebGLTexture, bx: number, by: number, private sprite: SpritePosition) {
        super(key, texture);
        const sig = Math.sign(sprite.getDrawPoint().x / HALF_SIZE / 2 - bx);
        this.beamData = {
            bx: bx + 0.5,
            by: by,
            ay: 1 / BEAM_STEP,
            dx: 0.5 - sig * 0.4,
            time: BEAM_STEP
        };
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                this.drawData.push({
                    x: bx + x / 4.0,
                    y: by + y / 4.0,
                    dx: (Math.random() - 0.5 + (x - 1.5) / 2.5) * 0.1,
                    dy: -Math.random() * 0.3,
                    px: x / 8.0 + 0.25,
                    py: y / 8.0 + 0.25,
                    ey: by + 1,
                    time: -y * (BEAM_STEP / 4) + 1
                });
            }
        }
    }

    protected getPolygon(): { pos: number[]; color: number[]; }[] {
        let ret: { pos: number[], color: number[] }[] = []
        this.beamData.time--;
        this.beamData.by += this.beamData.ay;
        if (this.beamData.time > 0) {
            const dy = this.beamData.by;
            const dx = this.beamData.bx;
            const pt = this.sprite.getDrawPoint();
            const px = pt.x / HALF_SIZE / 2 + this.beamData.dx;
            const py = pt.y / HALF_SIZE / 2 + 0.5;
            ret.push({
                pos: [dx - 0.3, dy - 0.2, 0.5, dx - 0.2, dy, 0.5, dx + 0.2, dy, 0.5],
                color: [0.7, 0.7, 10.9, 0.7, 0.7, 10.9, 0.7, 0.7, 10.9]
            });
            ret.push({
                pos: [dx + 0.3, dy - 0.2, 0.5, dx - 0.2, dy, 0.5, dx + 0.2, dy, 0.5],
                color: [0.7, 0.7, 10.9, 0.7, 0.7, 10.9, 0.7, 0.7, 10.9]
            });
            ret.push({
                pos: [px, py, 0.5, dx - 0.1, dy, 0.5, dx + 0.1, dy, 0.5],
                color: [0.7, 0.7, 10.9, 0.7, 0.7, 10.9, 0.7, 0.7, 10.9]
            });
        }
        for (let dt of this.drawData) {
            if (dt.dy > 0 && dt.y > dt.ey) {
                continue;
            }
            dt.time++;
            if (dt.time > 0) {
                dt.x += dt.dx;
                dt.y += dt.dy;
                dt.dy += 0.03;
                ret.push({
                    pos: [dt.x, dt.y, 1.1, dt.x, dt.y + 0.25, 1.1, dt.x + 0.25, dt.y, 1.1, dt.x + 0.25, dt.y + 0.25, 1.1],
                    color: [dt.px, dt.py, -1, dt.px, dt.py + 0.125, -1, dt.px + 0.125, dt.py, -1, dt.px + 0.125, dt.py + 0.125, -1]
                });
            }
        }
        return ret;
    }
}

class GoldGetDraw extends AnimateDrawItem {
    private drawData: {
        y: number;
        width: number;
        vx: number;
        vy: number;
        ax: number;
        theta: number;
    }[] = [];
    public constructor(key: string, private sprite: SpritePosition) {
        super(key);
        if (sprite instanceof EnemyData) {
            // 敵
            this.drawData.push({
                y: 0.2,
                vy: 0,
                width: 0.45,
                vx: 0,
                ax: 0,
                theta: 0
            });
            this.drawData.push({
                y: 0.6,
                vy: 0,
                width: 0.45,
                vx: 0,
                ax: 0,
                theta: Math.PI
            });
        } else {
            // プレイヤー
            const wdList = [0.2, 0.25, 0.3, 0.35];
            const vxList = [0.10, 0.11, 0.12, 0.13];
            const axList = [-0.01, -0.01, -0.01, -0.01];
            for (let y = 0; y < 4; y++) {
                this.drawData.push({
                    y: y * 0.25,
                    vy: -0.02,
                    width: wdList[y],
                    vx: vxList[y],
                    ax: axList[y],
                    theta: Math.PI * y / 4
                });
                this.drawData.push({
                    y: y * 0.25 + 0.1,
                    vy: -0.02,
                    width: wdList[y],
                    vx: vxList[y],
                    ax: axList[y],
                    theta: Math.PI * y / 4 + Math.PI
                });
            }
        }
    }

    protected getPolygon(): { pos: number[]; color: number[]; }[] {
        let ret: { pos: number[], color: number[] }[] = []
        let pt = this.sprite.getDrawPoint();
        let px = pt.x / HALF_SIZE / 2;
        let py = pt.y / HALF_SIZE / 2;
        for (let dt of this.drawData) {
            if (dt.width > 0) {
                let z = Math.cos(dt.theta) * 0.5 + 0.7;
                let x = px + 0.5 + dt.width * Math.sin(dt.theta);
                ret.push({
                    pos: [x - 0.1, py + dt.y, z, x - 0.15, py + dt.y + 0.2, z, x + 0.1, py + dt.y, z, x + 0.15, py + dt.y + 0.2, z],
                    color: [0.8, 0.8, 10.2, 0.7, 0.7, 10.2, 0.7, 0.7, 10.2, 0.6, 0.6, 10.2]
                });
                dt.y += dt.vy;
                dt.theta += 0.1;
                dt.width += dt.vx;
                dt.vx += dt.ax;
            }
        }
        return ret;
    }
}

/**
 * 座標管理するクラス
 */
class PointManager {
    private posMap: { [key: string]: Point3D } = {};

    public addPoint(pos: {
        base?: string;
        pos: {
            [key: string]: number[];
        }
    }): PointManager {
        for (let key in pos.pos) {
            const pt = pos.pos[key];
            this.posMap[key] = { base: pos.base, x: pt[0], y: pt[1], z: pt[2] };
        }
        return this;
    }
    public getData(data: [string, number, number, number][]): [Point3D[], number[][]] {
        let pos: Point3D[] = [];
        let color: number[][] = [];
        for (let dt of data) {
            pos.push(this.posMap[dt[0]]);
            color.push([dt[1], dt[2], dt[3]]);
        }
        return [pos, color];
    }
    public getVector(data: [string, number, number, number][]): [number[][], number[][]] {
        let pos: number[][] = [];
        let color: number[][] = [];
        for (let dt of data) {
            const p = this.posMap[dt[0]];
            pos.push([p.x, p.y, p.z]);
            color.push([dt[1], dt[2], dt[3]]);
        }
        return [pos, color];
    }
}

function getLadder(height: number, escape = true): DrawItem {
    let item = new DrawItem();
    for (let x = 0; x < 2; x++) {
        let ax = x * 0.6;
        item.addTriangle(
            [[0.1 + ax, 0, 0.2], [0.2 + ax, 0.1, 0.4], [0.3 + ax, 0, 0.2]],
            [[0.8, 0.8, 0.8], [1, 1, 1], [0.6, 0.6, 0.6]]
        ).addTriangle(
            [[0.1 + ax, 0, 0.2], [0.1 + ax, height, 0.2], [0.2 + ax, 0.1, 0.4]],
            [[0.8, 0.8, 0.8], [0.8, 0.8, 0.8], [1, 1, 1]]
        ).addTriangle(
            [[0.1 + ax, height, 0.2], [0.2 + ax, height - 0.1, 0.4], [0.2 + ax, 0.1, 0.4]],
            [[0.8, 0.8, 0.8], [1, 1, 1], [1, 1, 1]]
        ).addTriangle(
            [[0.3 + ax, 0, 0.2], [0.2 + ax, 0.1, 0.4], [0.2 + ax, height - 0.1, 0.4]],
            [[0.6, 0.6, 0.6], [1, 1, 1], [1, 1, 1]]
        ).addTriangle(
            [[0.2 + ax, height - 0.1, 0.4], [0.3 + ax, height, 0.2], [0.3 + ax, 0, 0.2]],
            [[1, 1, 1], [0.6, 0.6, 0.6], [0.6, 0.6, 0.6]]
        ).addTriangle(
            [[0.2 + ax, height - 0.1, 0.4], [0.1 + ax, height, 0.2], [0.3 + ax, height, 0.2]],
            [[1, 1, 1], [0.8, 0.8, 0.8], [0.6, 0.6, 0.6]]
        );
        // 影
        item.addTriangle(
            [[0.15 + ax, 0.05, 0], [0.15 + ax, height + 0.05, 0], [0.35 + ax, 0.05, 0]],
            [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
        ).addTriangle(
            [[0.35 + ax, 0.05, 0], [0.15 + ax, height + 0.05, 0], [0.35 + ax, height + 0.05, 0]],
            [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
        );
    }
    for (let y = 0; y < height * 2; y++) {
        let ay = y * 0.5;
        item.addTriangle(
            [[0.2, 0.2 + ay, 0.1], [0.2, 0.3 + ay, 0.3], [0.8, 0.2 + ay, 0.1]],
            [[0.8, 0.8, 0.8], [1, 1, 1], [0.8, 0.8, 0.8]]
        ).addTriangle(
            [[0.2, 0.3 + ay, 0.3], [0.8, 0.3 + ay, 0.3], [0.8, 0.2 + ay, 0.1]],
            [[1, 1, 1], [1, 1, 1], [0.8, 0.8, 0.8]]
        ).addTriangle(
            [[0.2, 0.3 + ay, 0.3], [0.2, 0.4 + ay, 0.1], [0.8, 0.4 + ay, 0.1]],
            [[1, 1, 1], [0.6, 0.6, 0.6], [0.6, 0.6, 0.6]]
        ).addTriangle(
            [[0.2, 0.3 + ay, 0.3], [0.8, 0.4 + ay, 0.1], [0.8, 0.3 + ay, 0.3]],
            [[1, 1, 1], [0.6, 0.6, 0.6], [1, 1, 1]]
        );
        // 影
        item.addTriangle(
            [[0.25, 0.25 + ay, 0], [0.25, 0.45 + ay, 0], [0.85, 0.25 + ay, 0]],
            [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
        ).addTriangle(
            [[0.85, 0.25 + ay, 0], [0.25, 0.45 + ay, 0], [0.85, 0.45 + ay, 0]],
            [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
        );
    }
    if (escape) {
        for (let col of item.colorList) {
            if (col[0] > 0) {
                col[0] *= 0.9;
                col[1] *= 0.9;
                col[2] = col[2] * 0.9 + 10;
            }
        }
    }
    return item;
}
function getBar(wd: number): DrawItem {
    let ret = new DrawItem();
    ret.addTriangle(
        [[0.1, 0.2, 0.4], [wd - 0.1, 0.3, 0.6], [wd - 0.1, 0.2, 0.4]],
        [[0.8, 0.8, 0.8], [1, 1, 1], [0.8, 0.8, 0.8]]
    ).addTriangle(
        [[0.1, 0.2, 0.4], [0.1, 0.3, 0.6], [wd - 0.1, 0.3, 0.6]],
        [[0.8, 0.8, 0.8], [1, 1, 1], [1, 1, 1]]
    ).addTriangle(
        [[0.1, 0.3, 0.6], [0.1, 0.4, 0.4], [wd - 0.1, 0.3, 0.6]],
        [[1, 1, 1], [0.7, 0.7, 0.7], [1, 1, 1]]
    ).addTriangle(
        [[0.1, 0.4, 0.4], [wd - 0.1, 0.4, 0.4], [wd - 0.1, 0.3, 0.6]],
        [[0.7, 0.7, 0.7], [0.7, 0.7, 0.7], [1, 1, 1]]
    );
    // 影
    ret.addTriangle(
        [[0.2, 0.3, 0], [wd, 0.5, 0], [wd, 0.3, 0]],
        [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    ).addTriangle(
        [[0.2, 0.3, 0], [0.2, 0.5, 0], [wd, 0.5, 0]],
        [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    );
    return ret;
}

function getBrick(texture: WebGLTexture): DrawItem {
    let blk = new DrawItem(texture);
    const manager = new PointManager();
    manager.addPoint({
        pos: {
            "u0": [0, 0, 0],
            "u1": [0, 0, 1],
            "u2": [1, 0, 1],
            "u3": [1, 0, 0],
            "d0": [0, 1, 0],
            "d1": [0, 1, 1],
            "d2": [1, 1, 1],
            "d3": [1, 1, 0],
            "s1": [0.2, 1.2, 0],
            "s2": [1.2, 1.2, 0],
            "s3": [1.2, 0.2, 0]
        }
    });
    // 正面
    blk.addTriangleStrip(...manager.getVector([
        ["u1", 0.25, 0.25, -2],
        ["d1", 0.25, 0.75, -1],
        ["u2", 0.75, 0.25, -2],
        ["d2", 0.75, 0.75, -1]
    ]));
    // 上
    blk.addTriangleStrip(...manager.getVector([
        ["u0", 0.25, 0, -2.8],
        ["u1", 0.25, 0.25, -2.8],
        ["u3", 0.75, 0, -2.8],
        ["u2", 0.75, 0.25, -2.8]
    ]));
    // 左
    blk.addTriangleStrip(...manager.getVector([
        ["u0", 0, 0.25, -1.9],
        ["d0", 0, 0.75, -0.9],
        ["u1", 0.25, 0.25, -1.9],
        ["d1", 0.25, 0.75, -0.9]
    ]));
    // 右
    blk.addTriangleStrip(...manager.getVector([
        ["u3", 1, 0.25, -1.7],
        ["u2", 0.75, 0.25, -1.7],
        ["d3", 1, 0.75, -0.7],
        ["d2", 0.75, 0.75, -0.7]
    ]));
    // 下
    blk.addTriangleStrip(...manager.getVector([
        ["d0", 0.25, 1, -0.6],
        ["d3", 0.75, 1, -0.6],
        ["d1", 0.25, 0.75, -0.6],
        ["d2", 0.75, 0.75, -0.6]
    ]));
    // 影
    /*
    blk.addTriangleStrip(...manager.getVector([
        ["d0", 0, 0, 0],
        ["s1", 0, 0, 0],
        ["d3", 0, 0, 0],
        ["s2", 0, 0, 0],
        ["u3", 0, 0, 2],
        ["s3", 0, 0, 2]
    ]));
    */
    blk.addTriangleFan(...manager.getVector([
        ["u0", 0, 0, 2],
        ["d0", 0, 0, 0],
        ["s1", 0, 0, 0],
        ["s2", 0, 0, 0],
        ["s3", 0, 0, 2],
        ["u3", 0, 0, 2]
    ]));
    return blk;
}

function getConcrete(texture: WebGLTexture): DrawItem {
    let blk = new DrawItem(texture);
    blk.addTriangle(    // 正面
        [[-0.01, -0.01, 1], [-0.01, 1.01, 1], [1.01, -0.01, 1]],
        [[0.25, 0.25, -1], [0.25, 0.75, -1], [0.75, 0.25, -1]]
    ).addTriangle(
        [[1.01, -0.01, 1], [-0.01, 1.01, 1], [1.01, 1.01, 1]],
        //[[1, 0.4, 0.4], [1, 0.4, 0.4], [1, 0.3, 0.3]]
        [[0.75, 0.25, -1], [0.25, 0.75, -1], [0.75, 0.75, -1]]
    ).addTriangle(  // 上
        [[0, 0, 0], [0, 0, 1], [1, 0, 0]],
        [[0.25, 0, -0.8], [0.25, 0.25, -0.8], [0.75, 0, -0.8]]
    ).addTriangle(
        [[1, 0, 0], [0, 0, 1], [1, 0, 1]],
        [[0.75, 0, -0.8], [0.25, 0.25, -0.8], [0.75, 0.25, -0.8]]
    ).addTriangle(  // 左
        [[0, 0, 0], [0, 1, 0], [0, 0, 1]],
        [[0, 0.25, -0.9], [0, 0.75, -0.9], [0.25, 0.25, -0.9]]
    ).addTriangle(
        [[0, 0, 1], [0, 1, 0], [0, 1, 1]],
        [[0.25, 0.25, -0.9], [0, 0.75, -0.9], [0.25, 0.75, -0.9]]
    ).addTriangle(  // 右
        [[1, 0, 0], [1, 0, 1], [1, 1, 1]],
        [[1, 0.25, -0.7], [0.75, 0.25, -0.7], [0.75, 0.75, -0.7]]
    ).addTriangle(
        [[1, 1, 1], [1, 1, 0], [1, 0, 0]],
        [[0.75, 0.75, -0.7], [1, 0.75, -0.7], [1, 0.25, -0.7]]
    ).addTriangle(  // 下
        [[0, 1, 0], [1, 1, 1], [0, 1, 1]],
        [[0.25, 1, -0.6], [0.75, 0.75, -0.6], [0.25, 0.75, -0.6]]
    ).addTriangle(
        [[1, 1, 1], [0, 1, 0], [1, 1, 0]],
        [[0.75, 0.75, -0.6], [0.25, 1, -0.6], [0.75, 1, -0.6]]
    );
    // 影
    blk.addTriangle(
        [[0, 1, 0], [0.25, 1.25, 0], [1.25, 1.25, 0]],
        [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    ).addTriangle(
        [[1, 0, 0], [1.25, 1.25, 0], [1.25, 0.25, 0]],
        [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    ).addTriangle(
        [[1, 0, 0], [0, 1, 0], [1.25, 1.25, 0]],
        [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    );
    return blk;
}

function getGold(): DrawItem {
    let ret = new DrawItem();
    let func = (x: number, y: number, margin: number) => {
        ret.addTriangle(
            [[x - 0.1, y, 0.95 - margin], [x - 0.12, y + 0.2, 1 - margin], [x + 0.12, y + 0.2, 1 - margin]],
            [[0.9, 0.9, 10.4], [0.7, 0.7, 0.3], [0.9, 0.9, 0.3]]
        ).addTriangle(
            [[x - 0.1, y, 0.95 - margin], [x + 0.12, y + 0.2, 1 - margin], [x + 0.1, y, 0.95 - margin]],
            [[0.9, 0.9, 10.4], [0.7, 0.7, 0.3], [0.9, 0.9, 10.4]]
        ).addTriangle(
            [[x - 0.1, y, margin + 0.05], [x - 0.1, y, 0.95 - margin], [x + 0.1, y, margin + 0.05]],
            [[0.6, 0.6, 10.2], [0.6, 0.6, 10.2], [0.6, 0.6, 10.2]]
        ).addTriangle(
            [[x + 0.1, y, margin + 0.05], [x - 0.1, y, 0.95 - margin], [x + 0.1, y, 0.95 - margin]],
            [[0.6, 0.6, 10.2], [0.6, 0.6, 10.2], [0.6, 0.6, 10.2]]
        ).addTriangle(
            [[x + 0.1, y, 0.95 - margin], [x + 0.12, y + 0.2, 1 - margin], [x + 0.1, y, margin + 0.05]],
            [[0.6, 0.6, 10.2], [0.6, 0.6, 0.2], [0.6, 0.6, 10.2]]
        ).addTriangle(
            [[x + 0.1, y, margin + 0.05], [x + 0.12, y + 0.2, 1 - margin], [x + 0.12, y + 0.2, margin]],
            [[0.6, 0.6, 10.2], [0.6, 0.6, 0.2], [0.6, 0.6, 0.2]]
        ).addTriangle(
            [[x - 0.1, y, margin + 0.05], [x - 0.12, y + 0.2, margin], [x - 0.1, y, 0.95 - margin]],
            [[0.8, 0.8, 10.3], [0.8, 0.8, 10.3], [0.8, 0.8, 10.3]]
        ).addTriangle(
            [[x - 0.1, y, 0.95 - margin], [x - 0.12, y + 0.2, margin], [x - 0.12, y + 0.2, 1 - margin]],
            [[0.8, 0.8, 10.3], [0.8, 0.8, 10.3], [0.8, 0.8, 10.3]]
        ).addTriangle(
            [[x - 0.12, y + 0.2, margin], [x + 0.12, y + 0.2, 1 - margin], [x - 0.12, y + 0.2, 1 - margin]],
            [[0.6, 0.6, 10.2], [0.6, 0.6, 0.2], [0.6, 0.6, 10.2]]
        ).addTriangle(
            [[x - 0.12, y + 0.2, margin], [x + 0.12, y + 0.2, margin], [x + 0.12, y + 0.2, 1 - margin]],
            [[0.6, 0.6, 10.2], [0.6, 0.6, 0.2], [0.6, 0.6, 0.2]]
        );
    };
    func(0.5, 0.2, 0.3);
    func(0.38, 0.4, 0.25);
    func(0.62, 0.4, 0.25);
    func(0.26, 0.6, 0.2);
    func(0.5, 0.6, 0.2);
    func(0.74, 0.6, 0.2);
    func(0.14, 0.8, 0.1);
    func(0.38, 0.8, 0.1);
    func(0.62, 0.8, 0.1);
    func(0.86, 0.8, 0.1);
    return ret;
}

function getPlayer(): PosDrawItem {
    let ret = new PosDrawItem({ x: 0.5, y: 0.7, z: 0.5 });
    ret.addBase({
        name: "dir",
        pos: {
            x: 0.5,
            y: 0.5,
            z: 0.5
        }
    }, {
        name: "body",
        pos: {
            base: "dir",
            x: 0.5,
            y: 0.5,
            z: 0.7
        }
    }, {
        name: "r_arm0",
        pos: {
            base: "body",
            x: 0.3,
            y: 0.45,
            z: 0.5
        }
    }, {
        name: "l_arm0",
        pos: {
            base: "body",
            x: 0.7,
            y: 0.45,
            z: 0.5
        }
    }, {
        name: "r_arm1",
        pos: {
            base: "r_arm0",
            x: 0.2,
            y: 0.7,
            z: 0.5
        }
    }, {
        name: "l_arm1",
        pos: {
            base: "l_arm0",
            x: 0.8,
            y: 0.7,
            z: 0.5
        }
    }, {
        name: "r_leg0",
        pos: {
            base: "body",
            x: 0.4,
            y: 0.7,
            z: 0.5
        }
    }, {
        name: "l_leg0",
        pos: {
            base: "body",
            x: 0.6,
            y: 0.7,
            z: 0.5
        }
    }, {
        name: "r_leg1",
        pos: {
            base: "r_leg0",
            x: 0.35,
            y: 1,
            z: 0.5
        }
    }, {
        name: "l_leg1",
        pos: {
            base: "l_leg0",
            x: 0.65,
            y: 1,
            z: 0.5
        }
    });
    const manager = new PointManager();
    manager.addPoint({
        base: "body",
        pos: {
            "h00": [0.5, 0, 0.5],
            "h1_1": [0.65, 0.125, 0.7],
            "h1_4": [0.7, 0.125, 0.5],
            "h1_7": [0.65, 0.125, 0.3],
            "h1_9": [0.35, 0.125, 0.3],
            "h1_c": [0.3, 0.125, 0.5],
            "h1_f": [0.35, 0.125, 0.7],
            "h2_1": [0.65, 0.25, 0.7],
            "h2_4": [0.7, 0.25, 0.5],
            "h2_7": [0.65, 0.25, 0.3],
            "h2_9": [0.35, 0.25, 0.3],
            "h2_c": [0.3, 0.25, 0.5],
            "h2_f": [0.35, 0.25, 0.7],
            "h3_1": [0.625, 0.38, 0.65],
            "h3_4": [0.675, 0.38, 0.5],
            "h3_7": [0.625, 0.38, 0.35],
            "h3_9": [0.375, 0.38, 0.35],
            "h3_c": [0.325, 0.38, 0.5],
            "h3_f": [0.375, 0.38, 0.65],
            // body
            "b0_1": [0.6, 0.35, 0.6],
            "b0_4": [0.65, 0.35, 0.5],
            "b0_7": [0.6, 0.35, 0.4],
            "b0_9": [0.4, 0.35, 0.4],
            "b0_c": [0.35, 0.35, 0.5],
            "b0_f": [0.4, 0.35, 0.6],
            "b1_1": [0.65, 0.5, 0.7],
            "b1_4": [0.72, 0.5, 0.5],
            "b1_7": [0.65, 0.5, 0.3],
            "b1_9": [0.35, 0.5, 0.3],
            "b1_c": [0.28, 0.5, 0.5],
            "b1_f": [0.35, 0.5, 0.7],
            "b2_1": [0.63, 0.7, 0.7],
            "b2_4": [0.66, 0.7, 0.5],
            "b2_7": [0.63, 0.7, 0.3],
            "b2_9": [0.37, 0.7, 0.3],
            "b2_c": [0.34, 0.7, 0.5],
            "b2_f": [0.37, 0.7, 0.7],
            "b30": [0.5, 0.77, 0.5]
        }
    }).addPoint({
        base: "r_arm1",
        pos: {
            "ra0_1": [0.35, 0.35, 0.5],
            "ra0_2": [0.38, 0.4, 0.55],
            "ra0_3": [0.38, 0.45, 0.5],
            "ra0_4": [0.4, 0.4, 0.45],
            "ra1_1": [0.1, 0.65, 0.5],
            "ra1_2": [0.15, 0.7, 0.55],
            "ra1_3": [0.2, 0.75, 0.5],
            "ra1_4": [0.15, 0.7, 0.45],
            "ra2": [0.1, 0.75, 0.5]
        }
    }).addPoint({
        base: "l_arm1",
        pos: {
            "la0_1": [0.65, 0.35, 0.5],
            "la0_2": [0.63, 0.4, 0.45],
            "la0_3": [0.63, 0.45, 0.5],
            "la0_4": [0.6, 0.4, 0.55],
            "la1_1": [0.9, 0.65, 0.5],
            "la1_2": [0.85, 0.7, 0.45],
            "la1_3": [0.8, 0.75, 0.5],
            "la1_4": [0.85, 0.7, 0.55],
            "la2": [0.9, 0.75, 0.5]
        }
    }).addPoint({
        base: "r_leg1",
        pos: {
            "rl0_1": [0.4, 0.5, 0.55],
            "rl0_2": [0.45, 0.5, 0.5],
            "rl0_3": [0.4, 0.5, 0.45],
            "rl0_4": [0.35, 0.5, 0.5],
            "rl1_1": [0.35, 1, 0.58],
            "rl1_2": [0.43, 1, 0.5],
            "rl1_3": [0.35, 1, 0.42],
            "rl1_4": [0.27, 1, 0.5]
        }
    }).addPoint({
        base: "l_leg1",
        pos: {
            "ll0_1": [0.6, 0.5, 0.55],
            "ll0_2": [0.65, 0.5, 0.5],
            "ll0_3": [0.6, 0.5, 0.45],
            "ll0_4": [0.55, 0.5, 0.5],
            "ll1_1": [0.65, 1, 0.58],
            "ll1_2": [0.73, 1, 0.5],
            "ll1_3": [0.65, 1, 0.42],
            "ll1_4": [0.57, 1, 0.5]
        }
    });
    ret.addTriangleFan(
        ...manager.getData([
            ["h00", 0.2, 0.2, 0.9],
            ["h1_1", 0.2, 0.2, 0.9],
            ["h1_4", 0.1, 0.1, 0.8],
            ["h1_7", 0.1, 0.1, 0.7],
            ["h1_9", 0.1, 0.1, 0.8],
            ["h1_c", 0.2, 0.2, 0.9],
            ["h1_f", 0.3, 0.3, 1],
            ["h1_1", 0.2, 0.2, 0.9]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["h1_c", 0.4, 0.4, 1],
            ["h2_f", 0.5, 0.5, 1],
            ["h1_f", 0.5, 0.5, 1],
            ["h2_1", 0.4, 0.4, 1],
            ["h1_1", 0.4, 0.4, 1],
            ["h1_4", 0.3, 0.3, 1]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["h2_1", 0.8, 0.7, 0.4],
            ["h2_4", 0.7, 0.6, 0.3],
            ["h1_4", 0.8, 0.7, 0.4],
            ["h2_7", 0.7, 0.6, 0.3],
            ["h1_7", 0.7, 0.6, 0.3],
            ["h2_9", 0.8, 0.7, 0.4],
            ["h1_9", 0.8, 0.7, 0.4],
            ["h2_c", 0.9, 0.8, 0.4],
            ["h1_c", 0.9, 0.8, 0.4],
            ["h2_f", 1, 0.8, 0.5]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["h2_f", 1, 0.8, 0.5],
            ["h3_1", 0.8, 0.7, 0.4],
            ["h2_1", 0.8, 0.7, 0.4],
            ["h3_4", 0.7, 0.6, 0.3],
            ["h2_4", 0.7, 0.6, 0.3],
            ["h3_7", 0.6, 0.5, 0.3],
            ["h2_7", 0.7, 0.6, 0.3],
            ["h3_9", 0.7, 0.6, 0.3],
            ["h2_9", 0.8, 0.7, 0.4],
            ["h3_c", 0.8, 0.7, 0.4],
            ["h2_c", 0.9, 0.8, 0.4],
            ["h3_f", 0.9, 0.8, 0.4],
            ["h2_f", 1, 0.8, 0.5],
            ["h3_1", 0.8, 0.7, 0.4]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["b0_1", 0.9, 0.4, 0.4],
            ["b1_1", 0.9, 0.4, 0.4],
            ["b0_4", 0.8, 0.3, 0.3],
            ["b1_4", 0.8, 0.3, 0.3],
            ["b0_7", 0.8, 0.4, 0.4],
            ["b1_7", 0.8, 0.4, 0.4],
            ["b0_9", 0.9, 0.4, 0.4],
            ["b1_9", 0.9, 0.4, 0.4],
            ["b0_c", 1, 0.4, 0.4],
            ["b1_c", 1, 0.4, 0.4],
            ["b0_f", 1, 0.5, 0.5],
            ["b1_f", 1, 0.5, 0.5],
            ["b0_1", 0.9, 0.4, 0.4],
            ["b1_1", 0.9, 0.4, 0.4]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["b1_1", 0.4, 0.4, 0.9],
            ["b2_1", 0.4, 0.4, 0.9],
            ["b1_4", 0.3, 0.3, 0.8],
            ["b2_4", 0.3, 0.3, 0.8],
            ["b1_7", 0.4, 0.4, 0.8],
            ["b2_7", 0.4, 0.4, 0.8],
            ["b1_9", 0.4, 0.4, 0.9],
            ["b2_9", 0.4, 0.4, 0.9],
            ["b1_c", 0.4, 0.4, 1],
            ["b2_c", 0.4, 0.4, 1],
            ["b1_f", 0.5, 0.5, 1],
            ["b2_f", 0.5, 0.5, 1],
            ["b1_1", 0.4, 0.4, 0.9],
            ["b2_1", 0.4, 0.4, 0.9]
        ])
    ).addTriangleFan(
        ...manager.getData([
            ["b30", 0.3, 0.3, 0.8],
            ["b2_f", 0.5, 0.5, 1],
            ["b2_c", 0.4, 0.4, 1],
            ["b2_9", 0.4, 0.4, 0.9],
            ["b2_7", 0.4, 0.4, 0.8],
            ["b2_4", 0.3, 0.3, 0.8],
            ["b2_1", 0.4, 0.4, 0.9],
            ["b2_f", 0.5, 0.5, 1]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["ra0_1", 1, 0.3, 0.3],
            ["ra1_1", 1, 0.3, 0.3],
            ["ra0_2", 0.9, 0.3, 0.3],
            ["ra1_2", 0.9, 0.3, 0.3],
            ["ra0_3", 0.8, 0.2, 0.2],
            ["ra1_3", 0.8, 0.2, 0.2],
            ["ra0_4", 0.9, 0.3, 0.3],
            ["ra1_4", 0.9, 0.3, 0.3],
            ["ra0_1", 1, 0.3, 0.3],
            ["ra1_1", 1, 0.3, 0.3]
        ])
    ).addTriangleFan(
        ...manager.getData([
            ["ra2", 0.8, 0.8, 0.3],
            ["ra1_1", 0.8, 0.8, 0.3],
            ["ra1_2", 0.7, 0.9, 0.3],
            ["ra1_3", 0.8, 0.8, 0.3],
            ["ra1_4", 0.9, 0.9, 0.4],
            ["ra1_1", 0.8, 0.8, 0.3]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["la0_1", 1, 0.3, 0.3],
            ["la1_1", 1, 0.3, 0.3],
            ["la0_2", 0.9, 0.3, 0.3],
            ["la1_2", 0.9, 0.3, 0.3],
            ["la0_3", 0.8, 0.2, 0.2],
            ["la1_3", 0.8, 0.2, 0.2],
            ["la0_4", 0.9, 0.3, 0.3],
            ["la1_4", 0.9, 0.3, 0.3],
            ["la0_1", 1, 0.3, 0.3],
            ["la1_1", 1, 0.3, 0.3]
        ])
    ).addTriangleFan(
        ...manager.getData([
            ["la2", 0.8, 0.8, 0.3],
            ["la1_1", 0.8, 0.8, 0.3],
            ["la1_2", 0.7, 0.7, 0.3],
            ["la1_3", 0.8, 0.8, 0.3],
            ["la1_4", 0.9, 0.9, 0.4],
            ["la1_1", 0.8, 0.8, 0.3]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["rl0_1", 0.9, 0.3, 0.3],
            ["rl1_1", 0.9, 0.3, 0.3],
            ["rl0_2", 0.8, 0.2, 0.2],
            ["rl1_2", 0.8, 0.2, 0.2],
            ["rl0_3", 0.9, 0.3, 0.3],
            ["rl1_3", 0.9, 0.3, 0.3],
            ["rl0_4", 1, 0.3, 0.3],
            ["rl1_4", 1, 0.3, 0.3],
            ["rl0_1", 0.9, 0.3, 0.3],
            ["rl1_1", 0.9, 0.3, 0.3]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["ll0_1", 0.9, 0.3, 0.3],
            ["ll1_1", 0.9, 0.3, 0.3],
            ["ll0_2", 0.8, 0.2, 0.2],
            ["ll1_2", 0.8, 0.2, 0.2],
            ["ll0_3", 0.9, 0.3, 0.3],
            ["ll1_3", 0.9, 0.3, 0.3],
            ["ll0_4", 1, 0.3, 0.3],
            ["ll1_4", 1, 0.3, 0.3],
            ["ll0_1", 0.9, 0.3, 0.3],
            ["ll1_1", 0.9, 0.3, 0.3]
        ])
    );
    return ret;
}
function getEnemy(): PosDrawItem {
    let ret = new PosDrawItem({ x: 0.5, y: 0.7, z: 0.5 });
    ret.addBase({
        name: "dir",
        pos: {
            x: 0.5,
            y: 0.5,
            z: 0.5
        }
    }, {
        name: "body",
        pos: {
            base: "dir",
            x: 0.5,
            y: 0.5,
            z: 0.7
        }
    }, {
        name: "r_arm0",
        pos: {
            base: "body",
            x: 0.3,
            y: 0.45,
            z: 0.5
        }
    }, {
        name: "l_arm0",
        pos: {
            base: "body",
            x: 0.7,
            y: 0.45,
            z: 0.5
        }
    }, {
        name: "r_arm1",
        pos: {
            base: "r_arm0",
            x: 0.2,
            y: 0.7,
            z: 0.5
        }
    }, {
        name: "l_arm1",
        pos: {
            base: "l_arm0",
            x: 0.8,
            y: 0.7,
            z: 0.5
        }
    }, {
        name: "r_leg0",
        pos: {
            base: "body",
            x: 0.4,
            y: 0.7,
            z: 0.5
        }
    }, {
        name: "l_leg0",
        pos: {
            base: "body",
            x: 0.6,
            y: 0.7,
            z: 0.5
        }
    }, {
        name: "r_leg1",
        pos: {
            base: "r_leg0",
            x: 0.35,
            y: 1,
            z: 0.5
        }
    }, {
        name: "l_leg1",
        pos: {
            base: "l_leg0",
            x: 0.65,
            y: 1,
            z: 0.5
        }
    });
    const manager = new PointManager();
    manager.addPoint({
        base: "body",
        pos: {
            "h00": [0.5, 0, 0.5],
            "h1_1": [0.65, 0.125, 0.7],
            "h1_4": [0.7, 0.125, 0.5],
            "h1_7": [0.65, 0.125, 0.3],
            "h1_9": [0.35, 0.125, 0.3],
            "h1_c": [0.3, 0.125, 0.5],
            "h1_f": [0.35, 0.125, 0.7],
            "h2_1": [0.65, 0.25, 0.7],
            "h2_4": [0.7, 0.25, 0.5],
            "h2_7": [0.65, 0.25, 0.3],
            "h2_9": [0.35, 0.25, 0.3],
            "h2_c": [0.3, 0.25, 0.5],
            "h2_f": [0.35, 0.25, 0.7],
            "h3_1": [0.625, 0.38, 0.65],
            "h3_4": [0.675, 0.38, 0.5],
            "h3_7": [0.625, 0.38, 0.35],
            "h3_9": [0.375, 0.38, 0.35],
            "h3_c": [0.325, 0.38, 0.5],
            "h3_f": [0.375, 0.38, 0.65],
            // body
            "b0_1": [0.6, 0.35, 0.6],
            "b0_4": [0.65, 0.35, 0.5],
            "b0_7": [0.6, 0.35, 0.4],
            "b0_9": [0.4, 0.35, 0.4],
            "b0_c": [0.35, 0.35, 0.5],
            "b0_f": [0.4, 0.35, 0.6],
            "b1_1": [0.65, 0.5, 0.7],
            "b1_4": [0.72, 0.5, 0.5],
            "b1_7": [0.65, 0.5, 0.3],
            "b1_9": [0.35, 0.5, 0.3],
            "b1_c": [0.28, 0.5, 0.5],
            "b1_f": [0.35, 0.5, 0.7],
            "b2_1": [0.63, 0.7, 0.7],
            "b2_4": [0.66, 0.7, 0.5],
            "b2_7": [0.63, 0.7, 0.3],
            "b2_9": [0.37, 0.7, 0.3],
            "b2_c": [0.34, 0.7, 0.5],
            "b2_f": [0.37, 0.7, 0.7],
            "b30": [0.5, 0.77, 0.5]
        }
    }).addPoint({
        base: "r_arm1",
        pos: {
            "ra0_1": [0.35, 0.35, 0.5],
            "ra0_2": [0.38, 0.4, 0.55],
            "ra0_3": [0.38, 0.45, 0.5],
            "ra0_4": [0.4, 0.4, 0.45],
            "ra1_1": [0.1, 0.65, 0.5],
            "ra1_2": [0.15, 0.7, 0.55],
            "ra1_3": [0.2, 0.75, 0.5],
            "ra1_4": [0.15, 0.7, 0.45],
            "ra2": [0.1, 0.75, 0.5]
        }
    }).addPoint({
        base: "l_arm1",
        pos: {
            "la0_1": [0.65, 0.35, 0.5],
            "la0_2": [0.63, 0.4, 0.45],
            "la0_3": [0.63, 0.45, 0.5],
            "la0_4": [0.6, 0.4, 0.55],
            "la1_1": [0.9, 0.65, 0.5],
            "la1_2": [0.85, 0.7, 0.45],
            "la1_3": [0.8, 0.75, 0.5],
            "la1_4": [0.85, 0.7, 0.55],
            "la2": [0.9, 0.75, 0.5]
        }
    }).addPoint({
        base: "r_leg1",
        pos: {
            "rl0_1": [0.4, 0.5, 0.55],
            "rl0_2": [0.45, 0.5, 0.5],
            "rl0_3": [0.4, 0.5, 0.45],
            "rl0_4": [0.35, 0.5, 0.5],
            "rl1_1": [0.35, 1, 0.58],
            "rl1_2": [0.43, 1, 0.5],
            "rl1_3": [0.35, 1, 0.42],
            "rl1_4": [0.27, 1, 0.5]
        }
    }).addPoint({
        base: "l_leg1",
        pos: {
            "ll0_1": [0.6, 0.5, 0.55],
            "ll0_2": [0.65, 0.5, 0.5],
            "ll0_3": [0.6, 0.5, 0.45],
            "ll0_4": [0.55, 0.5, 0.5],
            "ll1_1": [0.65, 1, 0.58],
            "ll1_2": [0.73, 1, 0.5],
            "ll1_3": [0.65, 1, 0.42],
            "ll1_4": [0.57, 1, 0.5]
        }
    });
    ret.addTriangleFan(
        ...manager.getData([
            ["h00", 0.9, 0.9, 0.9],
            ["h1_1", 0.9, 0.9, 0.9],
            ["h1_4", 0.8, 0.8, 0.8],
            ["h1_7", 0.7, 0.7, 0.7],
            ["h1_9", 0.8, 0.8, 0.8],
            ["h1_c", 0.9, 0.9, 0.9],
            ["h1_f", 1, 1, 1],
            ["h1_1", 0.9, 0.9, 0.9]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["h1_c", 1, 0.3, 0.3],
            ["h2_f", 1, 0.4, 0.4],
            ["h1_f", 1, 0.4, 0.4],
            ["h2_1", 1, 0.3, 0.3],
            ["h1_1", 1, 0.3, 0.3],
            ["h1_4", 1, 0.2, 0.2]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["h2_1", 0.8, 0.8, 0.8],
            ["h2_4", 0.7, 0.7, 0.7],
            ["h1_4", 0.8, 0.8, 0.8],
            ["h2_7", 0.7, 0.7, 0.7],
            ["h1_7", 0.7, 0.7, 0.7],
            ["h2_9", 0.8, 0.8, 0.8],
            ["h1_9", 0.8, 0.8, 0.8],
            ["h2_c", 0.9, 0.9, 0.9],
            ["h1_c", 0.9, 0.9, 0.9],
            ["h2_f", 1, 1, 1]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["h2_f", 1, 1, 1],
            ["h3_1", 0.8, 0.8, 0.8],
            ["h2_1", 0.8, 0.8, 0.8],
            ["h3_4", 0.7, 0.7, 0.7],
            ["h2_4", 0.7, 0.7, 0.7],
            ["h3_7", 0.6, 0.6, 0.6],
            ["h2_7", 0.7, 0.7, 0.7],
            ["h3_9", 0.7, 0.7, 0.7],
            ["h2_9", 0.8, 0.8, 0.8],
            ["h3_c", 0.8, 0.8, 0.8],
            ["h2_c", 0.9, 0.9, 0.9],
            ["h3_f", 0.9, 0.9, 0.9],
            ["h2_f", 1, 1, 1],
            ["h3_1", 0.8, 0.8, 0.8]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["b0_1", 0.4, 0.4, 0.9],
            ["b1_1", 0.4, 0.4, 0.9],
            ["b0_4", 0.3, 0.3, 0.8],
            ["b1_4", 0.3, 0.3, 0.8],
            ["b0_7", 0.4, 0.4, 0.8],
            ["b1_7", 0.4, 0.4, 0.8],
            ["b0_9", 0.4, 0.4, 0.9],
            ["b1_9", 0.4, 0.4, 0.9],
            ["b0_c", 0.4, 0.4, 1],
            ["b1_c", 0.4, 0.4, 1],
            ["b0_f", 0.5, 0.5, 1],
            ["b1_f", 0.5, 0.5, 1],
            ["b0_1", 0.4, 0.4, 0.9],
            ["b1_1", 0.4, 0.4, 0.9]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["b1_1", 0.4, 0.4, 0.9],
            ["b2_1", 0.4, 0.4, 0.9],
            ["b1_4", 0.3, 0.3, 0.8],
            ["b2_4", 0.3, 0.3, 0.8],
            ["b1_7", 0.4, 0.4, 0.8],
            ["b2_7", 0.4, 0.4, 0.8],
            ["b1_9", 0.4, 0.4, 0.9],
            ["b2_9", 0.4, 0.4, 0.9],
            ["b1_c", 0.4, 0.4, 1],
            ["b2_c", 0.4, 0.4, 1],
            ["b1_f", 0.5, 0.5, 1],
            ["b2_f", 0.5, 0.5, 1],
            ["b1_1", 0.4, 0.4, 0.9],
            ["b2_1", 0.4, 0.4, 0.9]
        ])
    ).addTriangleFan(
        ...manager.getData([
            ["b30", 0.3, 0.3, 0.8],
            ["b2_f", 0.5, 0.5, 1],
            ["b2_c", 0.4, 0.4, 1],
            ["b2_9", 0.4, 0.4, 0.9],
            ["b2_7", 0.4, 0.4, 0.8],
            ["b2_4", 0.3, 0.3, 0.8],
            ["b2_1", 0.4, 0.4, 0.9],
            ["b2_f", 0.5, 0.5, 1]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["ra0_1", 1, 1, 1],
            ["ra1_1", 1, 1, 1],
            ["ra0_2", 0.9, 0.9, 0.9],
            ["ra1_2", 0.9, 0.9, 0.9],
            ["ra0_3", 0.8, 0.8, 0.8],
            ["ra1_3", 0.8, 0.8, 0.8],
            ["ra0_4", 0.9, 0.9, 0.9],
            ["ra1_4", 0.9, 0.9, 0.9],
            ["ra0_1", 1, 1, 1],
            ["ra1_1", 1, 1, 1]
        ])
    ).addTriangleFan(
        ...manager.getData([
            ["ra2", 0.8, 0.3, 0.3],
            ["ra1_1", 0.8, 0.3, 0.3],
            ["ra1_2", 0.7, 0.3, 0.3],
            ["ra1_3", 0.8, 0.3, 0.3],
            ["ra1_4", 0.9, 0.4, 0.4],
            ["ra1_1", 0.8, 0.3, 0.3]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["la0_1", 1, 1, 1],
            ["la1_1", 1, 1, 1],
            ["la0_2", 0.9, 0.9, 0.9],
            ["la1_2", 0.9, 0.9, 0.9],
            ["la0_3", 0.8, 0.8, 0.8],
            ["la1_3", 0.8, 0.8, 0.8],
            ["la0_4", 0.9, 0.9, 0.9],
            ["la1_4", 0.9, 0.9, 0.9],
            ["la0_1", 1, 1, 1],
            ["la1_1", 1, 1, 1]
        ])
    ).addTriangleFan(
        ...manager.getData([
            ["la2", 0.8, 0.3, 0.3],
            ["la1_1", 0.8, 0.3, 0.3],
            ["la1_2", 0.7, 0.3, 0.3],
            ["la1_3", 0.8, 0.3, 0.3],
            ["la1_4", 0.9, 0.4, 0.4],
            ["la1_1", 0.8, 0.3, 0.3]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["rl0_1", 0.9, 0.9, 0.9],
            ["rl1_1", 0.9, 0.9, 0.9],
            ["rl0_2", 0.8, 0.8, 0.8],
            ["rl1_2", 0.8, 0.8, 0.8],
            ["rl0_3", 0.9, 0.9, 0.9],
            ["rl1_3", 0.9, 0.9, 0.9],
            ["rl0_4", 1, 1, 1],
            ["rl1_4", 1, 1, 1],
            ["rl0_1", 0.9, 0.9, 0.9],
            ["rl1_1", 0.9, 0.9, 0.9]
        ])
    ).addTriangleStrip(
        ...manager.getData([
            ["ll0_1", 0.9, 0.9, 0.9],
            ["ll1_1", 0.9, 0.9, 0.9],
            ["ll0_2", 0.8, 0.8, 0.8],
            ["ll1_2", 0.8, 0.8, 0.8],
            ["ll0_3", 0.9, 0.9, 0.9],
            ["ll1_3", 0.9, 0.9, 0.9],
            ["ll0_4", 1, 1, 1],
            ["ll1_4", 1, 1, 1],
            ["ll0_1", 0.9, 0.9, 0.9],
            ["ll1_1", 0.9, 0.9, 0.9]
        ])
    );
    return ret;
}

function getBG(texture: WebGLTexture, width: number, height: number): DrawItem {
    let ret = new DrawItem(texture);
    const margin = 8;
    ret.addTriangle(
        [[-margin / 2, -margin / 2, 0], [-margin / 2, height + margin / 2, 0], [width + margin / 2, -margin / 2, 0]],
        [[0, 0, -11], [0, (height + margin) / 4, -11], [(width + margin) / 4, 0, -11]]
    ).addTriangle(
        [[width + margin / 2, -margin / 2, 0], [-margin / 2, height + margin / 2, 0], [width + margin / 2, height + margin / 2, 0]],
        [[(width + margin) / 4, 0, -11], [0, (height + margin) / 4, -11], [(width + margin) / 4, (height + margin) / 4, -11]]
    );
    return ret;
}

export class RenderService {
    private program: WebGLProgram;
    private uProj: WebGLUniformLocation;
    private uTrans: WebGLUniformLocation;
    private uPos: WebGLUniformLocation;
    private uTex: WebGLUniformLocation;
    private uDepth: WebGLUniformLocation;
    private uDown: WebGLUniformLocation;
    private uLight: WebGLUniformLocation;
    private aPos: number;
    private aColor: number;
    private projection: number[];
    private translation: number[];
    public stageData: StageData | undefined;
    private light: number = 0;
    private escapeTime: number = 0;
    private drawData?: {
        playerDraw: PosDrawItem;
        enemyDraw: PosDrawItem;
        brick: DrawItem;
        // 特殊描画
        trapDraw: BlockDrawItem;
        bg: BlockDrawItem;
        // 増える
        escapeDraw: BlockDrawItem[];
        // すべて
        drawList: BlockDrawItem[];
        // 解放のためのDrawItem
        drawItemList: DrawItem[];
        // アニメーション
        animateDraw: AnimateDrawItem[];
    };
    private texData: {
        bg: WebGLTexture;
        brick: WebGLTexture;
        concrete: WebGLTexture;
    };
    private drawCancel: string[] = [];

    public constructor(gl: WebGL2RenderingContext) {
        let vs = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vs, v_shader1);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.log(gl.getShaderInfoLog(vs));
        }
        let fs = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fs, f_shader1);
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
        this.uProj = gl.getUniformLocation(this.program, "u_proj")!;
        this.uTrans = gl.getUniformLocation(this.program, "u_trans")!;
        this.uPos = gl.getUniformLocation(this.program, "u_pos")!;
        this.uTex = gl.getUniformLocation(this.program, "u_tex")!;
        this.uDepth = gl.getUniformLocation(this.program, "u_depth")!;
        this.uDown = gl.getUniformLocation(this.program, "u_down")!;
        this.uLight = gl.getUniformLocation(this.program, "u_light")!;
        this.aPos = gl.getAttribLocation(this.program, "a_pos");
        this.aColor = gl.getAttribLocation(this.program, "a_color");
        this.projection = getProjection(0.8, 1, 1, -1);
        this.translation = getTranslation([2, 2, 15.5], [8, 5, 0], [0, -1, 0]);
        this.texData = {
            bg: gl.createTexture()!,
            brick: gl.createTexture()!,
            concrete: gl.createTexture()!
        };

        for (let key in this.texData) {
            let img = new Image();
            img.onload = () => {
                console.log("Image Loaded", key);
                gl.bindTexture(gl.TEXTURE_2D, (this.texData as any)[key]);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.bindTexture(gl.TEXTURE_2D, null);
            };
            img.src = key + ".png";
        }
    }
    public init(gl: WebGL2RenderingContext): void {
        gl.useProgram(this.program);
    }
    public close(gl: WebGL2RenderingContext): void {
        if (this.drawData) {
            this.drawData.playerDraw.close(gl);
            this.drawData.enemyDraw.close(gl);
            this.drawData.drawItemList.forEach(itm => itm.close(gl));
            this.drawData.animateDraw.forEach(itm => itm.close(gl));
            this.drawData = undefined;
        }
    }
    public setStage(stage: StageData): void {
        let drawList: DrawItem[] = [
            getBrick(this.texData.brick),
            getConcrete(this.texData.concrete),
            getGold(),
            getBG(this.texData.bg, stage.WIDTH, stage.HEIGHT)
        ];
        this.stageData = stage;
        let blk = drawList[0];
        let brick = new BlockDrawItem(blk);
        let concrete = new BlockDrawItem(drawList[1]);
        let trap = new BlockDrawItem(blk, true);
        let gold = new BlockDrawItem(drawList[2]);
        let bg = new BlockDrawItem(drawList[3]);
        this.escapeTime = 0;
        bg.set(0, 0);
        let ladder: {
            draw: DrawItem;
            item: BlockDrawItem;
        }[] = [];
        let escape: {
            draw: DrawItem;
            item: BlockDrawItem;
        }[] = [];
        this.drawCancel = [];
        let bar: BlockDrawItem[] = [];
        for (let y = 0; y < this.stageData.HEIGHT; y++) {
            concrete.set(-1, y).set(this.stageData.WIDTH, y);
            for (let x = -1; x <= this.stageData.WIDTH; x++) {
                concrete.set(x, this.stageData.HEIGHT);
                concrete.set(x, -1);
            }
            for (let x = 0; x < this.stageData.WIDTH; x++) {
                let b = stage.stage.get(x, y);
                switch (b) {
                    case BlockType.Ladder:
                    case BlockType.EscapeLadder:
                        if (y === 0 || stage.stage.get(x, y - 1) !== b) {
                            // ここから
                            let ht = 1;
                            while (true) {
                                if (stage.stage.get(x, y + ht) !== b) {
                                    break;
                                }
                                ht++;
                            }
                            let item = ladder;
                            if (b === BlockType.EscapeLadder) {
                                item = escape;
                            }
                            if (!item[ht]) {
                                const draw = getLadder(ht, b === BlockType.EscapeLadder);
                                item[ht] = {
                                    draw: draw,
                                    item: new BlockDrawItem(draw)
                                };
                                drawList.push(draw);
                            }
                            item[ht].item.set(x, y);
                        }
                        break;
                    case BlockType.Brick:
                        brick.set(x, y);
                        break;
                    case BlockType.Trapdoor:
                        trap.set(x, y);
                        break;
                    case BlockType.Concrete:
                        concrete.set(x, y);
                        break;
                    case BlockType.Bar:
                        // バー
                        if (x === 0 || stage.getBG(x - 1, y) !== BlockType.Bar) {
                            let wd = 1;
                            while (true) {
                                if (stage.getBG(x + wd, y) !== BlockType.Bar) {
                                    break;
                                }
                                wd++;
                            }
                            if (!bar[wd]) {
                                let itm = getBar(wd);
                                drawList.push(itm);
                                bar[wd] = new BlockDrawItem(itm);
                            }
                            bar[wd].set(x, y);
                        }
                        break;
                    case BlockType.Gold:
                        gold.set(x, y);
                        break;
                }
            }
            this.drawData = {
                playerDraw: getPlayer(),
                enemyDraw: getEnemy(),
                bg: bg,
                brick: blk,
                trapDraw: trap,
                escapeDraw: [],
                drawList: [brick, gold, trap, concrete],
                drawItemList: drawList,
                animateDraw: []
            };
            for (let k in bar) {
                this.drawData.drawList.push(bar[k]);
            }
            for (let k in ladder) {
                let item = ladder[k];
                this.drawData.drawList.push(item.item);
            }
            for (let k in escape) {
                let item = escape[k];
                this.drawData.escapeDraw.push(item.item);
            }
        }
        stage.listener = {
            block: (bx: number, by: number, blk: BlockType) => {
                switch (blk) {
                    case BlockType.Empty:
                        brick.clear(bx, by);
                        gold.clear(bx, by);
                        break;
                    case BlockType.Brick:
                        brick.set(bx, by);
                        break;
                    case BlockType.Gold:
                        gold.set(bx, by);
                        break;
                    case BlockType.Trapdoor:
                        trap.set(bx, by, 1);
                        break;
                }
            },
            brick: (key: string, bx: number, by: number, sprite: SpritePosition) => {
                this.drawData?.animateDraw.push(new BrickBreakDraw(key, this.texData.brick, bx, by, sprite));
            },
            gold: (key: string, sprite: SpritePosition) => {
                this.drawData?.animateDraw.push(new GoldGetDraw(key, sprite));
            },
            cancel: (key: string) => {
                this.drawCancel.push(key);
            }
        };

    }

    public draw(gl: WebGL2RenderingContext, playerData: PlayerData, enemyList: EnemyData[]): void {
        let plPos: Point | undefined;
        let viewPos: Point3D = { x: 0, y: 0, z: 0 };
        if (this.stageData) {
            plPos = playerData.getDrawPoint();
            //plPos.x /= (HALF_SIZE * 2);
            //plPos.y /= (HALF_SIZE * 2);
            viewPos = this.stageData.getViewPos();
            let dx = viewPos.x - this.stageData.WIDTH / 2;
            let dy = viewPos.y - this.stageData.HEIGHT / 2;
            dx *= (this.stageData.WIDTH / 28);
            dy *= (this.stageData.HEIGHT / 16);
            this.translation = getTranslation([dx + this.stageData.WIDTH / 2, dy / 2 + this.stageData.HEIGHT / 2, 17 + Math.cos(Math.PI * dx / this.stageData.WIDTH) * 2], [dx / 1.5 + this.stageData.WIDTH / 2, dy / 4 + this.stageData.HEIGHT / 2, -5], [0, -1, 0]);
        }
        playerData.listener = () => this.stepAnimate(gl);
        gl.clearColor(0, 0, 0, 1);
        gl.clearDepth(1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);

        gl.useProgram(this.program);

        gl.uniformMatrix4fv(this.uProj, false, this.projection);
        gl.uniformMatrix4fv(this.uTrans, false, this.translation);
        gl.uniform1f(this.uDown, 0);
        this.light = (this.light + 1) % 60;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texData.bg);
        gl.uniform1i(this.uTex, 0);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        if (this.drawData && this.stageData) {
            // bg
            gl.uniform1i(this.uDepth, 1);
            if (this.escapeTime > 0 && this.escapeTime < 60) {
                gl.uniform4f(this.uLight, viewPos.x, viewPos.y, viewPos.z, 1.2 + Math.sin(Math.PI * this.escapeTime / 8) * 0.2);
            }
            else {
                gl.uniform4f(this.uLight, viewPos.x, viewPos.y, viewPos.z, 1);
            }
            this.drawData.bg.drawBlock(gl, this.aPos, this.aColor, this.uPos);
            gl.uniform1i(this.uDepth, 0);
            gl.uniform4f(this.uLight, viewPos.x, viewPos.y, viewPos.z, Math.sin(Math.PI * this.light / 30) / 4 + 1.2);

            for (let item of this.drawData.drawList) {
                item.drawBlock(gl, this.aPos, this.aColor, this.uPos);
            }
            // 消える結果
            this.drawData.brick.preDraw(gl, this.aPos, this.aColor);
            for (let hole of this.stageData.getHoleList()) {
                let down = hole.time / 64.0 + 0.1;
                if (down < 0.95) {
                    gl.uniform1f(this.uDown, down);
                    gl.uniform2fv(this.uPos, new Float32Array([hole.x, hole.y]));
                    gl.drawElements(gl.TRIANGLES, this.drawData.brick.ixList.length, gl.UNSIGNED_SHORT, 0);
                }
            }
            gl.uniform1f(this.uDown, 0);
            if (this.stageData.getRestGold() === 0) {
                for (let d of this.drawData.escapeDraw) {
                    d.drawBlock(gl, this.aPos, this.aColor, this.uPos);
                }
                this.escapeTime++;
            }
            this.drawData.trapDraw.drawTrap(gl, this.aPos, this.aColor, this.uPos, this.uDepth);
            if (this.stageData) {
                //this.drawData.enemyDraw.setPosition({ body: { x: 0.55, y: 0.5, z: 0.6 }, l1: { x: 0.2, y: 0.85, z: 0.55 }, l2: { x: 0.2, y: 1.0, z: 0.6 }, r1: { x: 0.8, y: 0.85, z: 0.45 }, r2: { x: 0.8, y: 1.0, z: 0.4 } })
                for (let ene of enemyList) {
                    let pt = ene.getDrawPoint();
                    this.drawData.enemyDraw.setPosition(ene.getDrawMap());
                    this.drawData.enemyDraw.drawBlock(gl, this.aPos, this.aColor, this.uPos, [pt.x, pt.y]);
                }
            }
            if (plPos) {
                this.drawData.playerDraw.setPosition(playerData.getDrawMap());
                this.drawData.playerDraw.drawBlock(gl, this.aPos, this.aColor, this.uPos, [plPos.x, plPos.y]);
            }
            // 以下の２つの後にfontrenderがおかしくなる
            this.drawData.trapDraw.drawTrap2(gl, this.aPos, this.aColor, this.uPos, this.uDepth);
            // animate
            this.drawData.animateDraw.forEach(itm => itm.draw(gl, this.aPos, this.aColor, this.uPos));
            gl.disableVertexAttribArray(this.aPos);
            gl.disableVertexAttribArray(this.aColor);
        }

        gl.flush();
    }
    public stepAnimate(gl: WebGL2RenderingContext): void {
        if (this.drawData) {
            if (this.drawData.animateDraw.length > 0) {
                let newList: AnimateDrawItem[] = [];
                this.drawData.animateDraw.forEach(itm => {
                    if (this.drawCancel.includes(itm.key)) {
                        // キャンセル
                        itm.close(gl);
                        return;
                    }
                    if (itm.stepFrame()) {
                        newList.push(itm);
                    } else {
                        itm.close(gl);
                    }
                });
                this.drawData.animateDraw = newList;
            }
            this.drawCancel = [];
        }
    }
}