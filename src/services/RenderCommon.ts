export function getProjection(fieldOfViewInRadians: number, aspectRatio: number, near: number, far: number): number[] {
    let f = 1.0 / Math.tan(fieldOfViewInRadians / 2);
    let rangeInv = 1 / (near - far);

    return [
        f / aspectRatio, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (near + far) * rangeInv, -1,
        0, 0, near * far * rangeInv * 2, 0
    ];
}
export function getTranslation(pos: number[], target: number[], up: number[]): number[] {
    function norm(vec: number[]): number[] {
        let len2 = 0;
        for (let v of vec) {
            len2 += v * v;
        }
        len2 = Math.sqrt(len2);
        let ret: number[] = [];
        for (let v of vec) {
            ret.push(v / len2);
        }
        return ret;
    }
    function cross(left: number[], right: number[]): number[] {
        return [
            left[1] * right[2] - left[2] * right[1],
            left[2] * right[0] - left[0] * right[2],
            left[0] * right[1] - left[1] * right[0]
        ];
    }
    function dot(left: number[], right: number[]): number {
        return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
    }
    let forward = norm([target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]]);
    let right = norm(cross(up, forward));
    let up2 = cross(forward, right);
    return [
        right[0], up2[0], -forward[0], 0,
        right[1], up2[1], -forward[1], 0,
        right[2], up2[2], -forward[2], 0,
        -dot(right, pos), -dot(up2, pos), dot(forward, pos), 1
    ];
}
