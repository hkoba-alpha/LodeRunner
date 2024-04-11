import { FontRender, getFontRender } from "./FontRender";
import { PlayerData, ScreenData, StageData, StagePlayData } from "./MyService";
import { ButtonType, IPlay, StickData, saveData } from "./PlayData";
import { Point3D, RenderService } from "./RenderService";
import { StageSelectPlay } from "./StageSelectPlay";

let renderer: RenderService;

class LostPlay implements IPlay {
    private count = 200;
    private vy = -0.15;

    public constructor(private stageData: StagePlayData) {
        this.stageData.playerData.deadCount = {
            count: 0,
            dx: 0,
            dy: 0,
            dz: 0
        };
    }

    stepFrame(gl: WebGL2RenderingContext, stick: StickData): IPlay {
        this.count--;
        if (this.count <= 0) {
            renderer.close(gl);
            return new StageSelectPlay(gl, "restart");
        }
        if (this.stageData.playerData.deadCount!.dz < 0.5) {
            this.stageData.playerData.deadCount!.dz += 0.01;
        } else {
            this.stageData.playerData.deadCount!.dy += this.vy;
            this.vy += 0.01;
        }
        renderer.draw(gl, this.stageData.playerData, this.stageData.enemy);
        this.stageData.playerData.deadCount!.count++;
        return this;
    }
}
class ClearPlay extends StageData implements IPlay, StickData {
    private count = 350;
    private playerData: PlayerData;
    private fontRender: FontRender;
    private clearText: string;
    private bestScore: boolean = false;

    public constructor(gl: WebGL2RenderingContext, stage: ScreenData, clearTime: number) {
        super(new ScreenData([
            "           #                ",
            "           #",
            "           #",
            "           #",
            "           #",
            "           #",
            "           #",
            "           #",
            "           #",
            "           #",
            "           #",
            "         XXXXXXXX#XX",
            "                 #",
            "                 #",
            "                 #",
            "                 #",
            "                 #",
            "                 #",
        ], 28, 18, stage.info), 20);
        renderer.close(gl);
        renderer.init(gl);
        renderer.setStage(this);
        this.playerData = new PlayerData(17, 17, this);
        this.fontRender = getFontRender(gl);
        this.clearText = "clear time " + saveData.getTimeText(clearTime);
        saveData.setClearTime(stage.info.name, stage.info.stageNum, clearTime).then(ret => this.bestScore = ret);
    }
    checkButton(): void {
        throw new Error("Method not implemented.");
    }
    stepFrame(gl: WebGL2RenderingContext, stick: StickData): IPlay {
        this.count--;
        if (this.count <= 0 || stick.isSelect(true)) {
            renderer.close(gl);
            return new StageSelectPlay(gl, "clear");
        }
        this.playerData.moveFrame(this);
        renderer.draw(gl, this.playerData, []);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        this.fontRender.drawFrame(gl, [-0.1, -0.4, 1, 0.5], [0.3, 0.3, 0.9, 0.5]);
        this.fontRender.draw(gl, "STAGE CLEAR", [0, -0.3, 0.8, 0.1], [1, 1, 1]);
        this.fontRender.draw(gl, this.clearText, [0.05, 0, 0.04 * this.clearText.length, 0.07], [0.9, 0.9, 0.6]);
        if (this.bestScore) {
            this.fontRender.draw(gl, "BEST TIME", [0.05, -0.15, 0.6, 0.08], [0.9, 0.3, 0.3]);
        }
        gl.disable(gl.BLEND);
        return this;
    }
    public getViewPos(): Point3D {
        // オーバーライドして実装
        // z はあかりの範囲
        return { x: 14, y: 7, z: this.count > 200 ? 1 : this.count / 50.0 - 3 };
    }
    public getRestGold(): number {
        return 1;
    }

    isLeft(cancel?: boolean): boolean {
        return this.count > 100;
    }
    isRight(cancel?: boolean): boolean {
        return false;
    }
    isUp(cancel?: boolean): boolean {
        return true;
    }
    isDown(cancel?: boolean): boolean {
        return false;
    }
    isLeftBeam(cancel?: boolean): boolean {
        return false;
    }
    isRightBeam(cancel?: boolean): boolean {
        return false;
    }
    isPause(cancel?: boolean): boolean {
        return false;
    }
    isSelect(cancel?: boolean): boolean {
        return false;
    }
    getButtonName(type: ButtonType): string {
        return "";
    }
}
export class StagePlay implements IPlay {
    private stageData: StagePlayData;
    private fontRender: FontRender;
    private startCount: number;

    public constructor(gl: WebGL2RenderingContext, stick: StickData, stage: StagePlayData) {
        if (!renderer) {
            renderer = new RenderService(gl);
        }
        this.stageData = stage;
        renderer.setStage(this.stageData);
        renderer.init(gl);
        this.fontRender = getFontRender(gl);
        this.startCount = 180;
    }
    stepFrame(gl: WebGL2RenderingContext, stick: StickData): IPlay {
        if (stick.isSelect(true)) {
            renderer.close(gl);
            return new StageSelectPlay(gl);
        }
        if (this.stageData) {
            this.stageData.stepFrame();
            renderer.draw(gl, this.stageData.playerData, this.stageData.enemy);
            if (this.stageData.isClear()) {
                return new ClearPlay(gl, this.stageData.stage, this.stageData.getPlayTime());
            }
            if (this.stageData.isLost()) {
                return new LostPlay(this.stageData);
            }
            if (this.startCount > 0) {
                this.startCount--;
                let alpha = 1.0;
                if (this.startCount < 20) {
                    alpha = this.startCount / 20.0;
                }
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                this.fontRender.draw(gl, this.stageData.stage.info.name, [-0.4, -0.3, this.stageData.stage.info.name.length * 0.05, 0.1], [1, 0.8, 0.5, alpha]);
                this.fontRender.draw(gl, "STAGE " + this.stageData.stage.info.stageNum, [-0.4, -0.1, 0.8, 0.2], [1, 1, 1, alpha]);
                gl.disable(gl.BLEND);
            }
        }
        return this;
    }
}