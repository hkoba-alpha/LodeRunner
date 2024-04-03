import { FontRender, getFontRender } from "./FontRender";
import { IPlay, StickData } from "./PlayData";
import { StageSelectPlay } from "./StageSelectPlay";

export class TitlePlay implements IPlay {
    private fontRender: FontRender;

    public constructor(gl: WebGL2RenderingContext) {
        this.fontRender = getFontRender(gl);

    }
    stepFrame(gl: WebGL2RenderingContext, stick: StickData): IPlay {
        if (stick.isPause(true)) {
            console.log("NEXT TITLE");
            return new StageSelectPlay(gl);
        }
        gl.clearColor(0, 0, 0, 1);
        gl.clearDepth(1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        //gl.disable(gl.CULL_FACE);
        this.fontRender.drawFrame(gl, [-0.9, -0.6, 1.8, 1], [0.2, 0.2, 0.5], [1, 1, 1]);
        this.fontRender.draw(gl, "LODE RUNNER", [-0.75, -0.4, 1.5, 0.3], [0.7, 0.7, 0.9]);
        this.fontRender.draw(gl, "PRESS ENTER", [-0.5, 0.1, 1, 0.1], [0.8, 0.8, 0.4]);
        return this;
    }
}