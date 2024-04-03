export interface StickData {
    isLeft(cancel?: boolean): boolean;
    isRight(cancel?: boolean): boolean;
    isUp(cancel?: boolean): boolean;
    isDown(cancel?: boolean): boolean;
    isLeftBeam(cancel?: boolean): boolean;
    isRightBeam(cancel?: boolean): boolean;
    isPause(cancel?: boolean): boolean;
    isSelect(cancel?: boolean): boolean;
}

export interface IPlay {
    stepFrame(gl: WebGL2RenderingContext, stick: StickData): IPlay;
}

/**
 * ボタンの種類
 */
enum ButtonType {
    Left,
    Right,
    Up,
    Down,
    LeftBeam,
    RightBeam,
    Pause,
    Select
}

/**
 * キーボード
 */
export class KeyboardStick implements StickData {
    private keyFlag: number;
    /**
     * 押しっぱなし検出
     */
    private keepFlag: number;

    public constructor() {
        this.keyFlag = 0;
        this.keepFlag = 0;
    }
    public processEvent(event: KeyboardEvent): void {
        let flag = 0;
        switch (event.code) {
            case 'ArrowUp':
                flag = 1 << ButtonType.Up;
                break;
            case 'ArrowDown':
                flag = 1 << ButtonType.Down;
                break;
            case 'ArrowLeft':
                flag = 1 << ButtonType.Left;
                break;
            case 'ArrowRight':
                flag = 1 << ButtonType.Right;
                break;
            case 'KeyZ':
                flag = 1 << ButtonType.LeftBeam;
                break;
            case 'KeyX':
                flag = 1 << ButtonType.RightBeam;
                break;
            case 'Enter':
                flag = 1 << ButtonType.Pause;
                break;
            case 'ShiftLeft':
                flag = 1 << ButtonType.Select;
                break;
        }
        if (flag) {
            if (event.type === 'keydown') {
                this.keyFlag |= flag;
            } else if (event.type === 'keyup') {
                this.keyFlag &= ~flag;
                this.keepFlag &= ~flag;
            }
        }
    }
    private isButtonDown(type: ButtonType, cancel?: boolean): boolean {
        let ret = (this.keyFlag & (1 << type) & ~this.keepFlag) > 0;
        if (cancel && ret) {
            this.keepFlag |= (1 << type);
        }
        return ret;
    }

    isLeft(cancel?: boolean): boolean {
        return this.isButtonDown(ButtonType.Left, cancel);
    }
    isRight(cancel?: boolean): boolean {
        return this.isButtonDown(ButtonType.Right, cancel);
    }
    isUp(cancel?: boolean): boolean {
        return this.isButtonDown(ButtonType.Up, cancel);
    }
    isDown(cancel?: boolean): boolean {
        return this.isButtonDown(ButtonType.Down, cancel);
    }
    isLeftBeam(cancel?: boolean): boolean {
        return this.isButtonDown(ButtonType.LeftBeam, cancel);
    }
    isRightBeam(cancel?: boolean): boolean {
        return this.isButtonDown(ButtonType.RightBeam, cancel);
    }
    isPause(cancel?: boolean): boolean {
        return this.isButtonDown(ButtonType.Pause, cancel);
    }
    isSelect(cancel?: boolean): boolean {
        return this.isButtonDown(ButtonType.Select, cancel);
    }

}
