// src/services/MyService.ts

import { StickData } from "./PlayData";
import { Point3D } from "./RenderService";

/**
 * ブロックなどのキャラクタの大きさの半分
 */
export const HALF_SIZE = 8

// ビームを出している長さ
export const BEAM_STEP = 15;
// ビームが終わった後の移動までの待ち時間
const BEAM_WAIT = 1;
// ロボットが穴から復活するまでのカウント
const HOLE_WAIT_COUNT = 50;
// ロボットが復活する時の待ち時間
const REBOTN_COUNT = 10;
// ロボットが金塊を持ち歩く最大歩数
const CARRY_MAX = 28;

// ポーズ中の視点の移動速度
const AUTO_MOVE_X = 4;
const AUTO_MOVE_Y = 3;

// ロボットの速さ
// P:E = 12:8, 12:6, 12:5,
//       60:40, 60:30, 60:24
//      211211211211
//      1111111111111111
//      11110111101111011110
//      110110110110110110110110
export enum BlockType {
    Empty,
    Brick,
    Concrete,
    Ladder,
    Bar,
    Trapdoor,
    EscapeLadder,
    Gold,
    Enemy,
    Player
}
export interface Point {
    x: number;
    y: number;
}
export interface HoleData extends Point {
    time: number;
}

/**
 * チャラクタの移動
 */
enum WalkType {
    Left,
    Right,
    Up,
    Down,
    Fall,
    LeftBeam,
    RightBeam,
    Pause
}

export class ScreenData {
    private blocks: Uint8Array;
    public readonly WIDTH: number;
    public readonly HEIGHT: number;
    public readonly info: {
        stageNum: number;
        name: string;
    };

    public constructor(data: string[], width: number, height: number, info: { stageNum: number; name: string; });
    public constructor(data: ScreenData);
    public constructor(data: string[] | ScreenData, width?: number, height?: number, info?: { stageNum: number; name: string; }) {
        if (data instanceof ScreenData) {
            this.WIDTH = data.WIDTH;
            this.HEIGHT = data.HEIGHT;
            this.blocks = new Uint8Array(data.WIDTH * data.HEIGHT);
            this.info = data.info;
            // コピー
            this.blocks.set(data.blocks);
            for (let i = 0; i < this.blocks.length; i++) {
                switch (this.blocks[i]) {
                    case BlockType.EscapeLadder:
                    case BlockType.Enemy:
                    case BlockType.Player:
                        this.blocks[i] = BlockType.Empty;
                        break;
                }
            }
        } else {
            this.WIDTH = width!;
            this.HEIGHT = height!;
            this.info = info!;
            this.blocks = new Uint8Array(width! * height!);
            for (let y = 0; y < data.length; y++) {
                let dt = data[y];
                for (let x = 0; x < dt.length; x++) {
                    switch (dt[x]) {
                        case 'O':
                            this.set(x, y, BlockType.Brick);
                            break;
                        case 'X':
                            this.set(x, y, BlockType.Concrete);
                            break;
                        case '#':
                            this.set(x, y, BlockType.Ladder);
                            break;
                        case '~':
                        case '-':
                        case '^':
                            this.set(x, y, BlockType.Bar);
                            break;
                        case 'V':
                            this.set(x, y, BlockType.Trapdoor);
                            break;
                        case '!':
                            this.set(x, y, BlockType.EscapeLadder);
                            break;
                        case '$':
                            this.set(x, y, BlockType.Gold);
                            break;
                        case 'E':
                            this.set(x, y, BlockType.Enemy);
                            break;
                        case 'P':
                            this.set(x, y, BlockType.Player);
                            break;
                    }
                }
            }
        }
    }
    public get(pos: Point): BlockType;
    public get(x: number, y: number): BlockType;
    public get(x: number | Point, y?: number) {
        let xx: number;
        let yy: number;
        if (typeof x === 'number') {
            xx = x;
            yy = y!;
        } else {
            xx = x.x;
            yy = x.y;
        }
        if (yy < 0 || yy >= this.HEIGHT) {
            return BlockType.Concrete;
        }
        if (xx < 0 || xx >= this.WIDTH || yy < 0) {
            return BlockType.Empty;
        }
        return this.blocks[yy * this.WIDTH + xx];
    }
    public set(pos: Point, blk: BlockType): void;
    public set(x: number, y: number, blk: BlockType): void;
    public set(v1: number | Point, v2: number | BlockType, v3?: BlockType) {
        let x: number;
        let y: number;
        let blk: BlockType;
        if (typeof v1 === 'number') {
            x = v1;
            y = v2 as number;
            blk = v3!;
        } else {
            x = v1.x;
            y = v1.y;
            blk = v2 as BlockType;
        }
        if (x < 0 || x >= this.WIDTH || y < 0 || y >= this.HEIGHT) {
            return;
        }
        this.blocks[y * this.WIDTH + x] = blk;
    }
}

export class StageData {
    public readonly current: ScreenData;
    public readonly buffer: ScreenData;
    public readonly player: Point;
    public readonly holeList: HoleData[];
    public readonly HOLE_STEP: number;
    public readonly WIDTH: number;
    public readonly HEIGHT: number;

    public listener?: {
        block: (bx: number, by: number, blk: BlockType) => void;
        brick: (key: string, bx: number, by: number, sprite: SpritePosition) => void;
        gold: (key: string, sprite: SpritePosition) => void;
        cancel: (key: string) => void;
    };

    public constructor(public readonly stage: ScreenData, holeStep: number) {
        this.HOLE_STEP = holeStep;
        this.WIDTH = stage.WIDTH;
        this.HEIGHT = stage.HEIGHT;
        this.current = new ScreenData(stage);
        this.buffer = new ScreenData(stage);
        this.player = { x: 0, y: 0 };
        this.holeList = [];
    }

    public fireDraw(bx: number, by: number, blk: BlockType): void {
        if (this.listener) {
            this.listener.block(bx, by, blk);
        }
    }
    public fireBrickBreak(key: string, bx: number, by: number, sprite: SpritePosition): void {
        if (this.listener) {
            this.listener.brick(key, bx, by, sprite);
        }
    }
    public fireGetGold(key: string, sprite: SpritePosition): void {
        if (this.listener) {
            this.listener.gold(key, sprite);
        }
    }
    public fireCancel(key: string): void {
        if (this.listener) {
            this.listener.cancel(key);
        }
    }

    public getBG(pos: Point): BlockType;
    public getBG(x: number, y: number): BlockType;
    public getBG(x: number | Point, y?: number) {
        let xx: number;
        let yy: number;
        if (typeof x === 'number') {
            xx = x;
            yy = y!;
        } else {
            xx = x.x;
            yy = x.y;
        }
        let ret = this.current.get(xx, yy);
        if (ret === BlockType.Player || ret === BlockType.Enemy) {
            ret = this.buffer.get(xx, yy);
            if (ret === BlockType.Brick) {
                ret = BlockType.Empty;
            }
        }
        return ret;
    }
    public getRestGold(): number {
        return 0;
    }

    public huntGold(): void {
        // オーバーライドして実装
    }
    public fireLost(): void {
        // オーバーライドして実装
    }
    public fireClear(): void {
        // オーバーライドして実装
    }
    public getViewPos(): Point3D {
        // オーバーライドして実装
        // z はあかりの範囲
        return { x: 0, y: 0, z: 1 };
    }
    public getHoleList(): HoleData[] {
        // オーバーライドして実装
        return [];
    }
}

/**
 * キャラクタの位置
 */
export abstract class SpritePosition {
    protected sx: number;
    protected sy: number;
    protected type: WalkType;
    protected bar: boolean;
    /**
     * フレームごとのステップデータ
     * "*1": 移動先判定の後に１ピクセル移動
     * "*2": 移動先判定の後に２ピクセル移動
     * "*11*110"：移動先判定の後１ピクセル移動、次も１ピクセル移動、移動先判定の後１ピクセル移動、次も１ピクセル移動、次は休止
     */
    private frameData: string;
    private frameIndex: number;
    private frameStep: number[];
    protected viewData: {
        dir: WalkType.Left | WalkType.Right;
        time: number;
    };

    protected constructor(protected bx: number, protected by: number, frame: string, wait = 0) {
        this.viewData = {
            dir: WalkType.Left,
            time: 0
        }
        this.sx = this.sy = 0;
        this.type = WalkType.Left;
        this.bar = false;
        this.frameData = frame;
        this.frameIndex = 0;
        this.frameStep = [];
        for (let i = 0; i < wait; i++) {
            this.frameStep.push(0);
        }
    }
    public getDrawPoint(): Point {
        return {
            x: this.bx * HALF_SIZE * 2 + this.sx,
            y: this.by * HALF_SIZE * 2 + this.sy
        };
    }
    public getDrawMap(): { [key: string]: Point3D } {
        return {};
    }
    protected canMove(play: StageData, nx: number, ny: number): boolean {
        if (nx < 0 || nx >= play.WIDTH) {
            return false;
        }
        let b = play.getBG(nx, ny);
        if (b === BlockType.Brick || b === BlockType.Concrete) {
            return false;
        }
        if (ny <= this.by) {
            // 以上
            if (b === BlockType.Trapdoor) {
                return false;
            }
        }
        return true;
    }
    abstract onMove(play: StageData, before: Point, after: Point): void;
    abstract doMove(play: StageData): WalkType | undefined;
    abstract onGold(play: StageData): void;
    abstract onDead(play: StageData): void;
    protected isAutoFall(): boolean {
        return true;
    }
    protected preMove(play: StageData): void {
    }
    public moveFrame(play: StageData): void {
        if (this.frameStep.length > 0) {
            let cnt = this.frameStep.pop()!;
            for (let i = 0; i < cnt; i++) {
                this.step(play);
            }
        } else {
            this.preMove(play);
            if (play.current.get(this.bx, this.by) === BlockType.Brick) {
                // 煉瓦に埋まった
                this.onDead(play);
                return;
            }
            let type: WalkType | undefined = undefined;
            let fall = () => {
                if (this.isAutoFall()) {
                    let b0 = play.buffer.get(this.bx, this.by);
                    if (b0 === BlockType.Ladder || (this.sy === 0 && b0 === BlockType.Bar)) {
                        // 落ちない
                    } else if (this.sy < 0) {
                        // 落ちる
                        return true;
                    } else {
                        let b1 = play.current.get(this.bx, this.by + 1);
                        if (b1 !== BlockType.Brick && b1 !== BlockType.Concrete && b1 !== BlockType.Ladder && b1 !== BlockType.Enemy) {
                            // 落ちる
                            return true;
                        }
                    }
                }
                return false;
            };
            // 落ちるかどうかのチェック
            if (fall()) {
                type = WalkType.Fall;
            }
            if (type === undefined) {
                type = this.doMove(play);
            }
            this.frameIndex++;
            let total = 0;
            while (this.frameIndex < this.frameData.length) {
                let ch = this.frameData.charAt(this.frameIndex);
                if (ch === '*') {
                    break;
                }
                let cnt = parseInt(ch);
                if (type === undefined) {
                    cnt = 0;
                }
                total += cnt;
                this.frameStep.push(cnt);
                this.frameIndex++;
            }
            if (this.frameIndex >= this.frameData.length) {
                this.frameIndex = 0;
            }
            let noMove = () => {
                for (let i = 0; i < this.frameStep.length; i++) {
                    this.frameStep[i] = 0;
                }
            };
            let before = { x: this.bx, y: this.by };
            // ブロック移動のチェック
            if (type === WalkType.Left) {
                if (!this.canMove(play, this.bx - 1, this.by) && this.sx <= 0) {
                    // 移動できない
                    noMove();
                } else {
                    this.type = type;
                    if (this.sx - total < -HALF_SIZE) {
                        this.sx += HALF_SIZE * 2;
                        this.bx--;
                        // 落ちるかどうかのチェック
                        //this.onMove(play, { x: this.bx + 1, y: this.by }, { x: this.bx, y: this.by });
                    }
                }
            } else if (type === WalkType.Right) {
                if (!this.canMove(play, this.bx + 1, this.by) && this.sx >= 0) {
                    // 移動できない
                    noMove();
                } else {
                    this.type = type;
                    if (this.sx + total >= HALF_SIZE) {
                        this.sx -= HALF_SIZE * 2;
                        this.bx++;
                        // 落ちるかどうかのチェック
                        //this.onMove(play, { x: this.bx - 1, y: this.by }, { x: this.bx, y: this.by });
                    }
                }
            } else if (type === WalkType.Up) {
                if (!this.canMove(play, this.bx, this.by - 1) && this.sy <= 0) {
                    // 移動できない
                    noMove();
                } else {
                    this.type = type;
                    if (this.sy - total < -HALF_SIZE) {
                        this.sy += HALF_SIZE * 2;
                        this.by--;
                        //this.onMove(play, { x: this.bx, y: this.by + 1 }, { x: this.bx, y: this.by });
                    }
                }
            } else if (type === WalkType.Down || type === WalkType.Fall) {
                if (!this.canMove(play, this.bx, this.by + 1) && this.sy >= 0) {
                    // 移動できない
                    noMove();
                } else {
                    this.type = type;
                    if (this.sy + total >= HALF_SIZE) {
                        this.sy -= HALF_SIZE * 2;
                        this.by++;
                        //this.onMove(play, { x: this.bx, y: this.by - 1 }, { x: this.bx, y: this.by });
                    }
                }
            } else if (type === WalkType.LeftBeam || type === WalkType.RightBeam) {
                this.type = type;
            }
            // 落とし穴
            if (before.x !== this.bx || before.y !== this.by) {
                if (play.getBG(this.bx, this.by) === BlockType.Trapdoor) {
                    play.fireDraw(this.bx, this.by, BlockType.Trapdoor);
                }
            }
            this.onMove(play, before, { x: this.bx, y: this.by });
            this.moveFrame(play);
        }
    }
    protected step(play: StageData): void {
        if (this.type === WalkType.Left) {
            this.sx--;
            this.sy -= Math.sign(this.sy);
            /*
            if (this.sx < -HALF_SIZE) {
                this.sx += HALF_SIZE * 2;
                this.bx--;
            }
            */
            this.viewData.dir = WalkType.Left;
            this.viewData.time++;
        } else if (this.type === WalkType.Right) {
            this.sx++;
            this.sy -= Math.sign(this.sy);
            /*
            if (this.sx >= HALF_SIZE) {
                this.sx -= HALF_SIZE * 2;
                this.bx++;
            }
            */
            this.viewData.dir = WalkType.Right;
            this.viewData.time++;
        } else if (this.type === WalkType.Up) {
            this.sy--;
            this.sx -= Math.sign(this.sx);
            /*
            if (this.sy < -HALF_SIZE) {
                this.sy += HALF_SIZE * 2;
                this.by--;
            }]*/
            this.viewData.time++;
        } else if (this.type === WalkType.Down || this.type === WalkType.Fall) {
            this.sy++;
            this.sx -= Math.sign(this.sx);
            /*
            if (this.sy >= HALF_SIZE) {
                this.sy -= HALF_SIZE * 2;
                this.by++;
            }
            */
            this.viewData.time++;
        } else {
            this.sx -= Math.sign(this.sx);
            this.sy -= Math.sign(this.sy);
            if (this.type === WalkType.LeftBeam) {
                this.viewData.dir = WalkType.Left;
            } else if (this.type === WalkType.RightBeam) {
                this.viewData.dir = WalkType.Right;
            }
        }
        this.bar = (this.sy === 0 && play.buffer.get(this.bx, this.by) === BlockType.Bar);
        if (this.sx === 0 && this.sy === 0 && play.buffer.get(this.bx, this.by) === BlockType.Gold) {
            this.onGold(play);
        }
    }

}

export class EnemyData extends SpritePosition {
    /**
     * 金塊を持って歩いた距離
     */
    private goldWalk: number;

    /**
     * 穴にはまっている残り時間
     * 正の数：残り時間
     */
    private fallCount: number;

    /**
     * 最後に入っていた穴
     */
    private lastHole?: HoleData;

    /**
     * 復活している時の待ち時間
     */
    private rebornCount: number;

    private enemyIndex: number;

    public constructor(bx: number, by: number, ix: number, count: number) {
        super(bx, by, getStepData((count + 1) * STEP_SPEED, count * 3 * STEP_TIMES), ix);
        this.goldWalk = 0;
        this.fallCount = 0;
        this.rebornCount = 0;
        this.enemyIndex = ix;
    }

    public getDrawPoint(): Point {
        let pos = super.getDrawPoint();
        if (this.fallCount > 0 && this.fallCount < 8) {
            pos.x += (this.fallCount & 2) - 1;
        }
        return pos;
    }
    /**
     * 同じ高さの地続きチェック
     * @param px 
     * @param current
     * @param buffer
     * @returns 
     */
    private checkSameHeight(px: number, current: ScreenData, buffer: ScreenData): number {
        let ax = Math.sign(px - this.bx);
        let x = this.bx + ax;
        while (true) {
            let b0 = buffer.get(x, this.by);
            let b1 = buffer.get(x, this.by + 1);
            if (b0 !== BlockType.Ladder && b0 !== BlockType.Bar && b1 !== BlockType.Brick
                && b1 !== BlockType.Concrete && b1 !== BlockType.Ladder && b1 !== BlockType.Bar && b1 !== BlockType.Gold) {
                return 0;
            }
            if (x === px) {
                return ax;
            }
            x += ax;
        }
    }

    private getHorizontalView(current: ScreenData, buffer: ScreenData): number[] {
        let check = (ax: number) => {
            let x = this.bx;
            while (true) {
                let nx = x + ax;
                let b0 = current.get(nx, this.by);
                if (nx < 0 || nx >= buffer.WIDTH || b0 === BlockType.Brick || b0 === BlockType.Concrete) {
                    return x;
                }
                x = nx;
                let b1 = buffer.get(x, this.by + 1);
                if (b0 !== BlockType.Ladder && b0 !== BlockType.Bar && b1 !== BlockType.Brick && b1 !== BlockType.Concrete && b1 !== BlockType.Ladder) {
                    return x;
                }
            }
        }
        return [check(-1), check(1)];
    }
    private getVerticalView(x: number, data: ScreenData): number[] {
        let y1 = this.by;
        while (data.get(x, y1) === BlockType.Ladder) {
            y1--;
        }
        let y2 = this.by;
        while (true) {
            let b = data.get(x, y2 + 1);
            if (y2 >= data.HEIGHT - 1 || b === BlockType.Brick || b === BlockType.Concrete) {
                break;
            }
            y2++;
        }
        return [y1, y2];
    }
    private getTargetPositions(py: number, current: ScreenData, buffer: ScreenData): { x: number; y: number; }[] {
        let result: { x: number; y: number; }[] = [];
        let xpos = this.getHorizontalView(current, buffer);
        for (let x = xpos[0]; x <= xpos[1]; x++) {
            let ypos = this.getVerticalView(x, buffer);
            if (ypos[0] === ypos[1]) {
                continue;
            }
            // 上方向チェック
            if (ypos[0] < this.by) {
                // 頂点
                result.push({ x: x, y: ypos[0] });
                for (let y = this.by - 1; y > ypos[0]; y--) {
                    let b00 = buffer.get(x - 1, y);
                    let b01 = buffer.get(x + 1, y);
                    let b10 = buffer.get(x - 1, y + 1);
                    let b11 = buffer.get(x + 1, y + 1);
                    if (b00 === BlockType.Bar
                        || b01 === BlockType.Bar
                        || b10 === BlockType.Brick || b10 === BlockType.Concrete || b10 === BlockType.Ladder
                        || b11 === BlockType.Brick || b11 === BlockType.Concrete || b11 === BlockType.Ladder) {
                        result.push({ x: x, y: y });
                    }
                }
            }
            // 下方向チェック
            if (ypos[1] > this.by) {
                for (let y = this.by; y <= ypos[1]; y++) {
                    // 縦視界は掘ったレンガはレンガとみなすので buffer を使う
                    let b = buffer.get(x, y + 1);
                    if (b === BlockType.Brick || b === BlockType.Concrete) {
                        result.push({ x: x, y: y });
                        continue;
                    }
                    if (y < py) {
                        // ランナーの高さより高ければ不要
                        continue;
                    }
                    b = buffer.get(x, y);
                    let b1 = current.get(x, y);
                    if (b !== BlockType.Ladder && b !== BlockType.Bar && b !== BlockType.Trapdoor && b !== BlockType.Gold && !(b1 === BlockType.Empty && b === BlockType.Brick)) {
                        continue;
                    }
                    let l0 = buffer.get(x - 1, y);
                    let l1 = buffer.get(x - 1, y + 1);
                    let r0 = buffer.get(x + 1, y);
                    let r1 = buffer.get(x + 1, y + 1);
                    if (l1 === BlockType.Brick || l1 === BlockType.Concrete || l1 === BlockType.Ladder
                        || r1 === BlockType.Brick || r1 === BlockType.Concrete || r1 === BlockType.Ladder) {
                        result.push({ x: x, y: y });
                        continue;
                    }
                    if (l0 === BlockType.Bar || (x === 0 && r0 === BlockType.Bar) || (x > 0 && r1 === BlockType.Bar)) {
                        result.push({ x: x, y: y });
                        continue;
                    }
                }
            }
        }
        return result;
    }
    onMove(play: StageData, before: Point, after: Point): void {
        // 移動先がプレイヤーなら終了
        if (play.current.get(after) === BlockType.Player) {
            play.fireLost();
            return;
        }
        play.current.set(before, play.getBG(before));
        play.current.set(after, BlockType.Enemy);
        if (before.x === after.x && before.y === after.y) {
            return;
        }
        if (this.lastHole) {
            if (this.lastHole.x === before.x && this.lastHole.y === before.y + 1) {
                // 這い上がった後に隣へと移動した
                this.lastHole = undefined;
            } else if (play.buffer.get(after) === BlockType.Brick) {
                // 這い上がったが、レンガを掘ったところだった
                this.lastHole.time = 1;
            }
        }
        // 穴に落ちたかをチェック
        if (after.y > before.y) {
            if (play.buffer.get(after.x, after.y) === BlockType.Brick) {
                // 穴に落ちた
                this.fallCount = HOLE_WAIT_COUNT;
                if (this.goldWalk > 0) {
                    // 金塊を放出
                    this.goldWalk = 0;
                    if (play.buffer.get(after.x, after.y - 1) === BlockType.Empty) {
                        // 金塊を出す
                        play.buffer.set(after.x, after.y - 1, BlockType.Gold);
                        play.current.set(after.x, after.y - 1, BlockType.Gold);
                        play.fireDraw(after.x, after.y - 1, BlockType.Gold);
                    } else {
                        // 金塊が消える
                        play.huntGold();
                    }
                    play.fireCancel("e_" + (this.enemyIndex));
                }
            }
        }
        if (this.goldWalk > 0) {
            // 金塊を持っていた
            this.goldWalk++;
            if (play.buffer.get(before.x, before.y) === BlockType.Empty && this.type !== WalkType.Fall) {
                // TODO 金塊を置くチェック
                if (this.goldWalk >= CARRY_MAX || Math.random() < 0.1) {
                    // 置く
                    play.buffer.set(before, BlockType.Gold);
                    play.current.set(before, BlockType.Gold);
                    play.fireDraw(before.x, before.y, BlockType.Gold);
                    this.goldWalk = 0;
                    play.fireCancel("e_" + (this.enemyIndex));
                }
            }
        }
    }
    protected isAutoFall(): boolean {
        return this.fallCount === 0 && this.rebornCount === 0 && this.lastHole === undefined;
    }
    protected canMove(play: StageData, nx: number, ny: number): boolean {
        if (play.current.get(nx, ny) === BlockType.Enemy) {
            return false;
        }
        return super.canMove(play, nx, ny);
    }
    onDead(play: StageData): void {
        if (this.goldWalk > 0) {
            // 金塊を消す
            this.goldWalk = 0;
            play.huntGold();
            play.fireCancel("e_" + (this.enemyIndex));
        }
        // 上のどこかに出す
        let nx = Math.floor(Math.random() * play.WIDTH);
        let ny = 1;
        while (ny < play.HEIGHT) {
            if (play.buffer.get(nx, ny) === BlockType.Empty) {
                break;
            }
            nx++;
            if (nx >= play.WIDTH) {
                nx = 0;
                ny++;
            }
        }
        this.viewData.dir = WalkType.Left;
        this.bx = nx;
        this.by = ny;
        this.sx = 0;
        this.sy = 0;
        this.fallCount = 0;
        this.lastHole = undefined;
        this.type = WalkType.Fall;
        this.rebornCount = REBOTN_COUNT;
        play.current.set(nx, ny, BlockType.Enemy);
    }
    onGold(play: StageData): void {
        if (this.goldWalk === 0) {
            play.buffer.set(this.bx, this.by, BlockType.Empty);
            play.fireDraw(this.bx, this.by, BlockType.Empty);
            play.fireGetGold("e_" + (this.enemyIndex), this);
            this.goldWalk = 1;
        }
    }
    doMove(play: StageData): WalkType | undefined {
        if (this.rebornCount > 0) {
            this.rebornCount--;
            return undefined;
        }
        if (this.fallCount > 0) {
            this.fallCount--;
            if (this.sy < 0) {
                return WalkType.Fall;
            }
            if (this.fallCount === 0) {
                // 復活
                this.sx = 0;
                this.lastHole = {
                    x: this.bx,
                    y: this.by,
                    time: HALF_SIZE * 3
                };
                return WalkType.Up;
            }
            return undefined;
        } else if (this.lastHole) {
            this.lastHole.time--;
            if (this.lastHole.x === this.bx && this.lastHole.y === this.by) {
                // 這い上がる
                return WalkType.Up;
            }
            if (this.lastHole.time === 0) {
                this.lastHole = undefined;
            }
        }
        let target = this.getTarget(play.player.x, play.player.y, play.current, play.buffer);
        if (target.ax < 0) {
            return WalkType.Left;
        } else if (target.ax > 0) {
            return WalkType.Right;
        } else if (target.ay < 0) {
            return WalkType.Up;
        } else if (target.ay > 0) {
            return WalkType.Down;
        }
        return WalkType.Down;
    }

    private getTarget(px: number, py: number, current: ScreenData, buffer: ScreenData): { ax: number; ay: number; } {
        if (py === this.by) {
            let ax = this.checkSameHeight(px, current, buffer);
            if (ax !== 0) {
                // 確定
                return { ax: ax, ay: 0 };
            }
        }
        let poslist = this.getTargetPositions(py, current, buffer);
        if (poslist.length === 0) {
            return {
                ax: 0,
                ay: 1
            };
        }
        let pos = poslist[0];
        let getPriority = (p: { x: number; y: number }) => {
            // プレイヤーと同じ高さ優先
            if (py === p.y) {
                // 距離優先で同じ距離なら左優先
                return Math.abs(this.bx - p.x) * 2 + ((this.bx < p.x) ? 1 : 0);
            }
            // 上優先
            let ret = Math.abs(py - p.y) * buffer.WIDTH + buffer.WIDTH;
            if (p.y > py) {
                // 下
                ret += buffer.HEIGHT * buffer.WIDTH * 2;
            }
            // 同じX座標優先、その後左優先
            if (p.x < this.bx) {
                ret++;
            } else if (p.x > this.bx) {
                ret += 2;
            }
            return ret;
        };
        for (let i = 1; i < poslist.length; i++) {
            let p = poslist[i];
            if (getPriority(p) < getPriority(pos)) {
                pos = p;
            }
        }
        if (pos.x < this.bx) {
            return { ax: -1, ay: 0 };
        } else if (pos.x > this.bx) {
            return { ax: 1, ay: 0 };
        } else if (pos.y < this.by) {
            return { ax: 0, ay: -1 };
        }
        return { ax: 0, ay: 1 };
    }

    public getDrawMap(): { [key: string]: Point3D } {
        let sig = Math.sin(Math.PI * (this.viewData.time & 15) / 8);
        if (this.type === WalkType.Up || this.type === WalkType.Down) {
            return {
                body: {
                    x: 0.5,
                    y: 0.5,
                    z: 0.3
                },
                r_arm1: {
                    x: 0.3 + sig / 7,
                    y: 0.3,
                    z: 0.8 + sig / 5
                },
                l_arm1: {
                    x: 0.7 + sig / 7,
                    y: 0.3,
                    z: 0.8 - sig / 5
                },
                r_leg1: {
                    x: 0.2 - sig / 4,
                    y: 1,
                    z: 0.7 + sig / 5
                },
                l_leg1: {
                    x: 0.8 - sig / 4,
                    y: 1,
                    z: 0.7 - sig / 5
                }
            };
        } else if (this.bar) {
            let ret = {
                "": {
                    x: 0.3,
                    y: 0.7,
                    z: 0.5
                },
                r_arm1: {
                    x: 0.3,
                    y: 0.45 + sig / 10,
                    z: 0.9
                },
                l_arm1: {
                    x: 0.7,
                    y: 0.45 - sig / 10,
                    z: 0.9
                },
                r_leg1: {
                    x: 0.4,
                    y: 0.7 + sig / 10,
                    z: 0.9
                },
                l_leg1: {
                    x: 0.6,
                    y: 0.7 - sig / 10,
                    z: 0.9
                },
                dir: {
                    x: 0.7,
                    y: 0.7,
                    z: 0.5
                },
                body: {
                    x: 0.3,
                    y: 0.5,
                    z: 0.5
                }
            };
            if (this.viewData.dir === WalkType.Left) {
                ret[""].x = 0.7;
                ret.dir.x = 0.3;
                ret.body.x = 0.7;

            }
            return ret;
        } else {
            let ret = {
                body: {
                    x: this.viewData.dir === WalkType.Left ? 0.4 : 0.6,
                    y: 0.5,
                    z: 0.6
                },
                r_leg1: {
                    x: 0.35,
                    y: 1,
                    z: 0.5 + sig / 2
                },
                l_leg1: {
                    x: 0.65,
                    y: 1,
                    z: 0.5 - sig / 2
                },
                r_arm1: {
                    x: 0.2,
                    y: 0.7,
                    z: 0.5 - sig / 4
                },
                l_arm1: {
                    x: 0.8,
                    y: 0.7,
                    z: 0.5 + sig / 4
                }
            };
            if (this.bar) {
                // バー
                ret.r_leg1 = {
                    x: 0.35 + sig / 5,
                    y: 1,
                    z: 0.5
                };
                ret.l_leg1 = {
                    x: 0.65 - sig / 5,
                    y: 1,
                    z: 0.5
                };
                if (this.viewData.dir === WalkType.Left) {
                    ret.l_arm1 = {
                        x: 0.8 + sig / 10,
                        y: 0,
                        z: 0.3 + sig / 10
                    };
                    ret.r_arm1 = {
                        x: 0.2 - sig / 10,
                        y: 0,
                        z: 0.7 - sig / 10
                    };
                } else {
                    ret.l_arm1 = {
                        x: 0.8 + sig / 10,
                        y: 0,
                        z: 0.7 - sig / 10
                    };
                    ret.r_arm1 = {
                        x: 0.2 - sig / 10,
                        y: 0,
                        z: 0.3 + sig / 10
                    };
                }
            } else if (this.type === WalkType.Fall) {
                ret.r_arm1 = {
                    x: 0,
                    y: 0.2 + sig / 5,
                    z: 0.5
                };
                ret.l_arm1 = {
                    x: 1,
                    y: 0.2 + sig / 5,
                    z: 0.5
                };
                ret.r_leg1 = {
                    x: 0.1,
                    y: 0.9 - sig / 10,
                    z: 0.5
                };
                ret.l_leg1 = {
                    x: 0.9,
                    y: 0.9 - sig / 10,
                    z: 0.5
                };
                if (this.rebornCount > 0) {
                    const sin = Math.sin(this.rebornCount * Math.PI / 4);
                    const cos = Math.cos(this.rebornCount * Math.PI / 4);
                    ret.body.x = 0.5 + sin * 0.2;
                    ret.body.z = 0.5 + cos * 0.2;
                }
            }
            return ret;
        }
    }
}

function getStepData(move: number, times: number): string {
    let count = 0;
    let data: string = "";
    let total = 0;
    let next = 0;
    while ((count % times) !== 0 || total === 0 || (total & 1) > 0) {
        count += move;
        let dt = 0;
        while (count > total * times) {
            dt++;
            total++;
        }
        if (total > next) {
            data += "*";
            next += 2;
        }
        data += dt;
        if (total > 100) {
            break;
        }
    }
    return data;
}

const STEP_SPEED = 6;
const STEP_TIMES = 5;

export class PlayerData extends SpritePosition {
    private beamCount: number = 0;
    private waitCount: number = 0;
    public deadCount?: {
        count: number;
        dx: number;
        dy: number;
        dz: number;
    };
    /**
     * プレイヤーの移動処理のリスナー
     */
    public listener?: () => void;

    public constructor(bx: number, by: number, public readonly stick: StickData) {
        super(bx, by, getStepData(STEP_SPEED, STEP_TIMES));
    }
    protected isAutoFall(): boolean {
        return this.beamCount === 0;
    }
    onDead(play: StageData): void {
        play.fireLost();
    }
    onGold(play: StageData): void {
        play.buffer.set(this.bx, this.by, BlockType.Empty);
        play.fireDraw(this.bx, this.by, BlockType.Empty);
        play.fireGetGold("p", this);
        play.huntGold();
    }
    onMove(play: StageData, before: Point, after: Point): void {
        /*
        if (play.current.get(after) === BlockType.Enemy) {
            // 移動先が敵なら死亡
            play.fireLost();
            return;
        }
        */
        play.current.set(before, play.getBG(before));
        play.current.set(after, BlockType.Player);
        play.player.x = this.bx;
        play.player.y = this.by;
        if (before.y !== after.y) {
            this.waitCount = 0;
        }
        if (play.getRestGold() === 0 && this.sy === 0 && this.by === 0) {
            play.fireClear();
        }
    }
    protected preMove(play: StageData): void {
        if (this.listener) {
            this.listener();
        }
        for (let i = 0; i < play.holeList.length; i++) {
            play.holeList[i].time--;
            if (play.holeList[i].time === 0) {
                // 消す
                let ht = play.holeList[i];
                play.holeList.splice(i, 1);
                i--;
                play.current.set(ht.x, ht.y, BlockType.Brick);
                play.fireDraw(ht.x, ht.y, BlockType.Brick);
            }
        }

    }
    doMove(play: StageData): WalkType | undefined {
        if (play.current.get(this.bx, this.by) !== BlockType.Player) {
            // 終了
            play.fireLost();
            return;
        }
        if (Math.abs(this.beamCount) > BEAM_WAIT) {
            if (play.current.get(this.bx + Math.sign(this.beamCount), this.by) !== BlockType.Empty) {
                play.fireDraw(this.bx + Math.sign(this.beamCount), this.by + 1, BlockType.Brick);
                // 掘っている途中で中断
                play.fireCancel("b_" + (this.bx + Math.sign(this.beamCount)) + "_" + (this.by + 1));
                this.beamCount = 0;
            }
        } else if (this.beamCount === BEAM_WAIT) {
            play.current.set(this.bx + 1, this.by + 1, BlockType.Empty);
            play.holeList.push({
                time: play.HOLE_STEP,
                x: this.bx + 1,
                y: this.by + 1
            });
        } else if (this.beamCount === -BEAM_WAIT) {
            play.current.set(this.bx - 1, this.by + 1, BlockType.Empty);
            play.holeList.push({
                time: play.HOLE_STEP,
                x: this.bx - 1,
                y: this.by + 1
            });
        }
        if (this.beamCount < 0) {
            this.beamCount++;
            this.waitCount = 0;
            return WalkType.LeftBeam;
        } else if (this.beamCount > 0) {
            this.beamCount--;
            return WalkType.RightBeam;
        }
        if (this.stick.isLeftBeam()) {
            if (play.current.get(this.bx - 1, this.by + 1) === BlockType.Brick && play.current.get(this.bx - 1, this.by) === BlockType.Empty) {
                this.beamCount = -BEAM_STEP;
                play.fireDraw(this.bx - 1, this.by + 1, BlockType.Empty);
                play.fireBrickBreak('b_' + (this.bx - 1) + "_" + (this.by + 1), this.bx - 1, this.by + 1, this);
                this.waitCount = 0;
                return WalkType.LeftBeam;
            }
        }
        if (this.stick.isRightBeam()) {
            if (play.current.get(this.bx + 1, this.by + 1) === BlockType.Brick && play.current.get(this.bx + 1, this.by) === BlockType.Empty) {
                this.beamCount = BEAM_STEP;
                play.fireDraw(this.bx + 1, this.by + 1, BlockType.Empty);
                play.fireBrickBreak('b_' + (this.bx + 1) + "_" + (this.by + 1), this.bx + 1, this.by + 1, this);
                this.waitCount = 0;
                return WalkType.RightBeam;
            }
        }
        if (this.stick.isUp()) {
            if (play.buffer.get(this.bx, this.by) === BlockType.Ladder || (this.sy > 0 && play.buffer.get(this.bx, this.by + 1) === BlockType.Ladder)) {
                if (this.sy > 0 || this.canMove(play, this.bx, this.by - 1)) {
                    this.waitCount = 0;
                    return WalkType.Up;
                }
            }
        }
        if (this.stick.isDown()) {
            if (this.sy < 0 || this.canMove(play, this.bx, this.by + 1)) {
                this.waitCount = 0;
                return WalkType.Down;
            }
        }
        if (this.stick.isLeft()) {
            if (this.sx > 0 || this.canMove(play, this.bx - 1, this.by)) {
                this.waitCount = 0;
                return WalkType.Left;
            }
        }
        if (this.stick.isRight()) {
            if (this.sx < 0 || this.canMove(play, this.bx + 1, this.by)) {
                this.waitCount = 0;
                return WalkType.Right;
            }
        }
        this.waitCount++;
        if (this.waitCount >= 20 && !this.bar) {
            if (this.type === WalkType.Left || this.type === WalkType.Right || this.type === WalkType.Fall) {
                this.viewData.time = 0;
                if (this.waitCount % 20 === 0) {
                    if (this.viewData.dir === WalkType.Left) {
                        this.viewData.dir = WalkType.Right;
                        this.type = WalkType.Right;
                    } else {
                        this.viewData.dir = WalkType.Left;
                        this.type = WalkType.Left;
                    }
                }
            }
        }
        return undefined;
    }
    public getHoleData(): HoleData | undefined {
        if (this.beamCount <= -BEAM_WAIT) {
            return {
                x: this.bx - 1,
                y: this.by + 1,
                time: (BEAM_STEP + this.beamCount) * 4
            };
        } else if (this.beamCount >= BEAM_WAIT) {
            return {
                x: this.bx + 1,
                y: this.by + 1,
                time: (BEAM_STEP - this.beamCount) * 4
            };
        }
        return undefined;
    }
    public getDrawMap(): { [key: string]: Point3D } {
        if (this.deadCount) {
            const sin = Math.sin(this.deadCount.count * Math.PI / 8);
            const cos = Math.cos(this.deadCount.count * Math.PI / 8);
            let ret = {
                "": {
                    x: 0.5 + this.deadCount.dx,
                    y: 0.7 + this.deadCount.dy,
                    z: 0.5 + this.deadCount.dz
                },
                body: {
                    x: 0.5 + sin * 0.2,
                    y: 0.5,
                    z: 0.5 + cos * 0.2
                },
                r_arm1: {
                    x: 0,
                    y: 0.2,
                    z: 0.5
                },
                l_arm1: {
                    x: 1,
                    y: 0.2,
                    z: 0.5
                },
                r_leg1: {
                    x: 0.1,
                    y: 0.9,
                    z: 0.5
                }, l_leg1: {
                    x: 0.9,
                    y: 0.9,
                    z: 0.5
                }
            };
            return ret;
        }
        let sig = Math.sin(Math.PI * (this.viewData.time & 15) / 8);
        if (this.type === WalkType.Up || this.type === WalkType.Down) {
            let ret = {
                body: {
                    x: 0.5,
                    y: 0.5,
                    z: 0.3
                },
                r_arm1: {
                    x: 0.3 + sig / 7,
                    y: 0.3,
                    z: 0.8 + sig / 5
                },
                l_arm1: {
                    x: 0.7 + sig / 7,
                    y: 0.3,
                    z: 0.8 - sig / 5
                },
                r_leg1: {
                    x: 0.2 - sig / 4,
                    y: 1,
                    z: 0.7 + sig / 5
                },
                l_leg1: {
                    x: 0.8 - sig / 4,
                    y: 1,
                    z: 0.7 - sig / 5
                }
            };
            return ret;
        } else if (this.bar) {
            let ret = {
                "": {
                    x: 0.3,
                    y: 0.7,
                    z: 0.5
                },
                r_arm1: {
                    x: 0.3,
                    y: 0.45 + sig / 10,
                    z: 0.9
                },
                l_arm1: {
                    x: 0.7,
                    y: 0.45 - sig / 10,
                    z: 0.9
                },
                r_leg1: {
                    x: 0.4,
                    y: 0.7 + sig / 10,
                    z: 0.9
                },
                l_leg1: {
                    x: 0.6,
                    y: 0.7 - sig / 10,
                    z: 0.9
                },
                dir: {
                    x: 0.7,
                    y: 0.7,
                    z: 0.5
                },
                body: {
                    x: 0.3,
                    y: 0.5,
                    z: 0.5
                }
            };
            if (this.viewData.dir === WalkType.Left) {
                ret[""].x = 0.7;
                ret.dir.x = 0.3;
                ret.body.x = 0.7;
            }
            if (this.type === WalkType.LeftBeam) {
                ret.body.z = 0.7;
                ret.r_arm1 = {
                    x: 0.1,
                    y: 0.15,
                    z: 0.4
                };
            } else if (this.type === WalkType.RightBeam) {
                ret.body.z = 0.7;
                ret.r_arm1 = {
                    x: 0.9,
                    y: 0.85,
                    z: 0.4
                };
            }
            return ret;
        } else if (this.type === WalkType.LeftBeam) {
            return {
                body: {
                    x: 0.4,
                    y: 0.5,
                    z: 0.6
                },
                r_arm1: {
                    x: 0,
                    y: 0.65,
                    z: 0.6
                }
            };
        } else if (this.type === WalkType.RightBeam) {
            return {
                body: {
                    x: 0.6,
                    y: 0.5,
                    z: 0.6
                },
                l_arm1: {
                    x: 1,
                    y: 0.65,
                    z: 0.6
                }
            };
        } else {
            let ret = {
                body: {
                    x: this.viewData.dir === WalkType.Left ? 0.4 : 0.6,
                    y: 0.5,
                    z: 0.6
                },
                r_leg1: {
                    x: 0.35,
                    y: 1,
                    z: 0.5 + sig / 2
                },
                l_leg1: {
                    x: 0.65,
                    y: 1,
                    z: 0.5 - sig / 2
                },
                r_arm1: {
                    x: 0.2,
                    y: 0.7,
                    z: 0.5 - sig / 4
                },
                l_arm1: {
                    x: 0.8,
                    y: 0.7,
                    z: 0.5 + sig / 4
                }
            };
            if (this.type === WalkType.Fall) {
                ret.r_arm1 = {
                    x: 0,
                    y: 0.2 + sig / 5,
                    z: 0.5
                };
                ret.l_arm1 = {
                    x: 1,
                    y: 0.2 + sig / 5,
                    z: 0.5
                };
                ret.r_leg1 = {
                    x: 0.1,
                    y: 0.9 - sig / 10,
                    z: 0.5
                };
                ret.l_leg1 = {
                    x: 0.9,
                    y: 0.9 - sig / 10,
                    z: 0.5
                };
            }
            return ret;
        }
    }
}

export class StagePlayData extends StageData {
    public readonly playerData: PlayerData;
    public readonly enemy: EnemyData[];
    private restGold: number;
    private playTime: number;

    private pausePos: {
        x: number;
        y: number;
        base: number;
        /**
         * -3: ゲームオーバー
         * -1: ポーズ中
         * 0: プレイ
         * 1: 右
         * 2: 下
         * 3: 左
         * 4: 上
         * 5: プレイヤーへ水平移動
         * 6: プレイヤーへ垂直移動
         */
        mode: number;
    };

    public constructor(data: ScreenData, stick: StickData, holeStep: number) {
        super(data, holeStep);
        this.pausePos = {
            x: 0,
            y: 0,
            base: 50,
            mode: 1
        };
        this.playTime = 0;
        this.enemy = [];
        this.playerData = new PlayerData(0, 0, stick);
        let enePos: Point[] = [];
        this.restGold = 0;
        for (let y = 0; y < data.HEIGHT; y++) {
            for (let x = 0; x < data.WIDTH; x++) {
                let b = this.stage.get(x, y);
                if (b === BlockType.Player) {
                    this.playerData = new PlayerData(x, y, stick);
                    this.player.x = x;
                    this.player.y = y;
                    this.current.set(x, y, BlockType.Player);
                } else if (b === BlockType.Enemy) {
                    enePos.push({ x: x, y: y });
                    this.current.set(x, y, BlockType.Enemy);
                } else if (b === BlockType.Gold) {
                    this.restGold++;
                }
            }
        }
        for (let i = 0; i < enePos.length; i++) {
            this.enemy.push(new EnemyData(enePos[i].x, enePos[i].y, i, enePos.length));
        }
    }
    public huntGold(): void {
        this.restGold--;
        console.log("HUNT GOLD", this.restGold);
        if (this.restGold === 0) {
            // 脱出はしご
            for (let y = 0; y < this.stage.HEIGHT; y++) {
                for (let x = 0; x < this.stage.WIDTH; x++) {
                    if (this.stage.get(x, y) === BlockType.EscapeLadder) {
                        this.buffer.set(x, y, BlockType.Ladder);
                        if (this.current.get(x, y) === BlockType.Empty) {
                            this.current.set(x, y, BlockType.Ladder);
                        }
                    }
                }
            }
        }
    }
    public getRestGold(): number {
        return this.restGold;
    }

    public getHoleList(): HoleData[] {
        let ret: HoleData[] = [...this.holeList];
        let hole = this.playerData.getHoleData();
        if (hole) {
            ret.push(hole);
        }

        return ret;
    }

    /**
     * プレイヤーが死亡
     */
    public fireLost(): void {
        this.pausePos.mode = -3;
        let pos = this.playerData.getDrawPoint();
        this.pausePos.x = pos.x;
        this.pausePos.y = pos.y;
        console.log("***LOST***", pos);
    }
    public fireClear(): void {
        console.log("***CLEAR***");
        this.pausePos.mode = -2;
        let pos = this.playerData.getDrawPoint();
        this.pausePos.x = pos.x;
        this.pausePos.y = pos.y;
    }
    public isLost(): boolean {
        return this.pausePos.mode === -3;
    }
    public isClear(): boolean {
        return this.pausePos.mode === -2;
    }
    public getPlayTime(): number {
        return this.playTime;
    }

    public getViewPos(): Point3D {
        if (this.pausePos.mode !== 0) {
            return {
                x: this.pausePos.x / HALF_SIZE / 2 + 0.5,
                y: this.pausePos.y / HALF_SIZE / 2 + 0.5,
                z: this.pausePos.base / 50
            };
        }
        let pos = this.playerData.getDrawPoint();
        return {
            x: pos.x / HALF_SIZE / 2 + 0.5,
            y: pos.y / HALF_SIZE / 2 + 0.5,
            z: this.pausePos.base / 50
        };
    }

    public stepFrame(): void {
        switch (this.pausePos.mode) {
            case -1:
                if (this.playerData.stick.isPause(true)) {
                    console.log("Pause out");
                    this.pausePos.mode = 5;
                }
                if (this.pausePos.base < 50) {
                    this.pausePos.base++;
                }
                break;
            case 1:
            case 2:
            case 3:
            case 4:
                break;
            default:
                if (this.pausePos.base > 0) {
                    this.pausePos.base--;
                }
                break;
        }
        if (this.pausePos.mode !== 0) {
            // 最初の移動
            switch (this.pausePos.mode) {
                case -1:    // ポーズ
                    if (this.playerData.stick.isRight() && this.pausePos.x < this.stage.WIDTH * HALF_SIZE * 2) {
                        this.pausePos.x += AUTO_MOVE_X;
                    }
                    if (this.playerData.stick.isLeft() && this.pausePos.x > 0) {
                        this.pausePos.x -= AUTO_MOVE_X;
                    }
                    if (this.playerData.stick.isDown() && this.pausePos.y < this.stage.HEIGHT * HALF_SIZE * 2) {
                        this.pausePos.y += AUTO_MOVE_Y;
                    }
                    if (this.playerData.stick.isUp() && this.pausePos.y > 0) {
                        this.pausePos.y -= AUTO_MOVE_Y;
                    }
                    break;
                case 1:
                    this.pausePos.x += AUTO_MOVE_X;
                    if (this.pausePos.x >= this.stage.WIDTH * HALF_SIZE * 2) {
                        this.pausePos.mode++;
                    }
                    break;
                case 2:
                    this.pausePos.y += AUTO_MOVE_Y;
                    if (this.pausePos.y >= this.stage.HEIGHT * HALF_SIZE * 2) {
                        this.pausePos.mode++;
                    }
                    break;
                case 3:
                    this.pausePos.x -= AUTO_MOVE_X;
                    if (this.pausePos.x <= 0) {
                        this.pausePos.mode++;
                    }
                    break;
                case 4:
                    this.pausePos.y -= AUTO_MOVE_Y;
                    if (this.pausePos.y <= 0) {
                        this.pausePos.mode++;
                    }
                    break;
                case 5:
                    {
                        let nx = this.playerData.getDrawPoint().x;
                        if (Math.abs(nx - this.pausePos.x) <= AUTO_MOVE_X) {
                            this.pausePos.x = nx;
                            this.pausePos.mode++;
                        } else {
                            this.pausePos.x += Math.sign(nx - this.pausePos.x) * AUTO_MOVE_X;
                        }
                    }
                    break;
                case 6:
                    {
                        let ny = this.playerData.getDrawPoint().y;
                        if (Math.abs(ny - this.pausePos.y) <= AUTO_MOVE_Y) {
                            this.pausePos.y = ny;
                            this.pausePos.mode = 0;
                        } else {
                            this.pausePos.y += Math.sign(ny - this.pausePos.y) * AUTO_MOVE_Y;
                        }
                    }
                    break;
            }
            return;
        }
        if (this.playerData.stick.isPause(true)) {
            // ポーズ
            this.pausePos.mode = -1;
            let pt = this.playerData.getDrawPoint();
            this.pausePos.x = pt.x;
            this.pausePos.y = pt.y;
            console.log("Pause Start");
            return;
        }
        this.playTime++;        
        this.playerData.moveFrame(this);
        for (let ene of this.enemy) {
            ene.moveFrame(this);
        }
    }
}