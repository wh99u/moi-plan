/*
 * Traced from the reference video (393×813 phone screen, 15 fps). Do not hand-tune:
 * the path was fitted to the final frame, the timings to every frame, and the colours in
 * body.png / head.png were sampled from the video along this exact path.
 */

/** Reference screen the numbers below are measured in. */
export const REF_W = 393;

/** Centre line control points (Catmull-Rom, 40 steps per segment). */
export const CTRL: [number, number][] = [[600.0, 40.0], [435.9, 104.7], [328.5, 159.4], [237.1, 175.8], [156.9, 142.8], [112.0, 50.0], [160.0, 4.0], [222.0, 18.0], [236.0, 92.0], [224.5, 193.7], [139.7, 238.2], [121.9, 319.5], [172.3, 358.9], [254.0, 303.3], [325.0, 319.4], [331.4, 438.1], [466.5, 502.0]];

/** Half the ribbon's width. */
export const HW = 62.4;
/** Length of the whole centre line. */
export const LENGTH = 1602.64;
/** Where the second end starts: hidden under the top band. */
export const SPLIT = 860.0;

/** How far the first end has drawn, [seconds, length]: right edge → top loop. */
export const FRONT_A: [number, number][] = [[0.0, 100.0], [0.67, 173.8], [0.73, 178.6], [0.8, 184.6], [0.87, 194.2], [0.93, 203.8], [1.0, 212.2], [1.07, 221.8], [1.13, 232.6], [1.2, 242.2], [1.27, 254.2], [1.33, 266.2], [1.4, 277.0], [1.47, 290.2], [1.53, 302.2], [1.6, 311.8], [1.67, 323.8], [1.73, 338.2], [1.8, 349.0], [1.87, 358.6], [1.93, 367.0], [2.0, 391.0], [2.2, 439.0], [2.4, 479.0], [2.6, 560.0], [2.75, 650.0], [2.95, 780.0], [3.15, 860.0]];
/** The second end: out from under the band → both lower loops → off the right edge. */
export const FRONT_B: [number, number][] = [[0.0, 860.0], [2.0, 860.0], [2.3, 930.0], [2.5, 1030.0], [2.7, 1200.0], [2.85, 1270.0], [3.0, 1292.0], [3.2, 1348.0], [3.5, 1396.0], [3.8, 1452.0], [3.95, 1476.0], [4.4, 1602.64]];

/** Colour texture rows: one block of lateral samples per video frame. */
export const FRAMES = { start: 2 / 3, fps: 15, count: 79 };
export const ACROSS = [-0.75, -0.625, -0.5, -0.375, -0.25, -0.125, 0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75];
export const BODY_W = 320;
export const HEAD_W = 56;
/** Head texture spans this distance behind an end (negative = the round cap ahead). */
export const HEAD_RANGE: [number, number] = [-62.4, 187.2];
