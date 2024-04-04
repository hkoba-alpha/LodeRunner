import Dexie, { Table } from "dexie";

export interface SaveData {
    id?: number;
    name: string;
    stage: number;
    time: number;
}

class StageSaveData extends Dexie {
    private data: Table<SaveData>;

    public constructor() {
        super('LodeRunnerData');

        this.version(1).stores({
            saveData: '++id, [name+stage], time'
        });
        this.data = this.table('saveData');
    }

    public getTimeText(time: number): string {
        const tm = Math.floor(time * 10 / 6);
        if (tm >= 6000) {
            return Math.floor(tm / 6000) + ":" + Math.floor((tm % 6000) / 100).toString().padStart(2, "0") + "." + (tm % 10).toString().padStart(2, "0");
        } else {
            return Math.floor(tm / 100) + "." + (tm % 100).toString().padStart(2, "0");
        }
    }
    public async getClearTime(name: string, stage: number): Promise<number> {
        const dt = await this.data.get({ name: name, stage: stage });
        if (dt) {
            return dt.time;
        }
        return -1;
    }


    public async setClearTime(name: string, stage: number, time: number): Promise<boolean> {
        const dt = await this.data.get({ name: name, stage: stage });
        if (dt) {
            if (time < dt.time) {
                // 更新
                await this.data.update(dt.id, { name: name, stage: stage, time: time });
                return true;
            }
            return false;
        }
        await this.data.add({ name: name, stage: stage, time: time });
        return true;
    }
}

export const saveData = new StageSaveData();

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
        switch (event.key) {
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
        }
        if (!flag) {
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
