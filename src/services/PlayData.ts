import Dexie, { Table } from "dexie";

export interface SaveData {
    id?: number;
    name: string;
    stage: number;
    time: number;
}
export interface ConfigData {
    id?: number;
    name: string;
    config: string;
}

class GameSaveData extends Dexie {
    private data: Table<SaveData>;
    private config: Table<ConfigData>;

    public constructor() {
        super('LodeRunnerData');

        this.version(2).stores({
            saveData: '++id, [name+stage], time',
            configData: '++id, name, config'
        });
        this.data = this.table('saveData');
        this.config = this.table('configData');
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

    public async setConfig(name: string, config: any): Promise<boolean> {
        const dt = await this.config.get({ name: name });
        if (dt) {
            await this.config.update(dt.id, { name: name, config: JSON.stringify(config) });
        } else {
            await this.config.put({ name: name, config: JSON.stringify(config) });
        }
        return true;
    }
    public async getConfig(name: string): Promise<any> {
        const dt = await this.config.get({ name: name });
        if (dt) {
            return JSON.parse(dt.config);
        }
        return null;
    }
}

export const saveData = new GameSaveData();

export interface StickData {
    isLeft(cancel?: boolean): boolean;
    isRight(cancel?: boolean): boolean;
    isUp(cancel?: boolean): boolean;
    isDown(cancel?: boolean): boolean;
    isLeftBeam(cancel?: boolean): boolean;
    isRightBeam(cancel?: boolean): boolean;
    isPause(cancel?: boolean): boolean;
    isSelect(cancel?: boolean): boolean;
    getButtonName(type: ButtonType): string;
}

export interface IPlay {
    stepFrame(gl: WebGL2RenderingContext, stick: StickData): IPlay;
}

/**
 * ボタンの種類
 */
export enum ButtonType {
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
    private keyConfig: { [key: string]: ButtonType; } = {
        'ArrowUp': ButtonType.Up,
        'ArrowLeft': ButtonType.Left,
        'ArrowRight': ButtonType.Right,
        'ArrowDown': ButtonType.Down,
        'KeyZ': ButtonType.LeftBeam,
        'KeyX': ButtonType.RightBeam,
        'ShiftLeft': ButtonType.Select,
        'Enter': ButtonType.Pause
    };
    private buttonName: { [type: number]: string; } = {};

    public constructor() {
        this.keyFlag = 0;
        this.keepFlag = 0;
        saveData.getConfig('keyConfig').then(res => {
            if (res) {
                this.keyConfig = res;
                this.buttonName = {};
            }
        });
    }
    public processEvent(event: KeyboardEvent): boolean {
        let flag = 0;
        if (event.key in this.keyConfig) {
            flag = 1 << this.keyConfig[event.key];
        } else if (event.code in this.keyConfig) {
            flag = 1 << this.keyConfig[event.code];
        }
        /*
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
        */
        if (flag) {
            if (event.type === 'keydown') {
                this.keyFlag |= flag;
            } else if (event.type === 'keyup') {
                this.keyFlag &= ~flag;
                this.keepFlag &= ~flag;
            }
            return true;
        }
        return false;
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
    getButtonName(type: ButtonType): string {
        if (!this.buttonName[type]) {
            for (let key in this.keyConfig) {
                if (this.keyConfig[key] === type) {
                    let text = "";
                    for (let i = 0; i < key.length; i++) {
                        const ch = key[i];
                        const big = ch.toUpperCase();
                        if (i > 0 && ch === big) {
                            text += ' ';
                        }
                        text += big;
                    }
                    this.buttonName[type] = text;
                    break;
                }
            }
        }
        return this.buttonName[type];
    }

    public getKeyConfig(): { [key: string]: ButtonType; } {
        return Object.assign({}, this.keyConfig);
    }
    public setKeyConfig(config: { [key: string]: ButtonType; }): void {
        this.keyConfig = config;
        this.buttonName = {};
        saveData.setConfig("keyConfig", config).then();
    }
}
