// 「鐘形曲柄夾爪」範例（按需載入，不進啟動；由 unit-start-examples.js 的 register 帶入）。
// 機架板上的 TT 馬達帶動曲柄，經連桿推 2 臂 90° 彎桿的第 1 臂；第 2 臂的端孔像夾指一樣擺動，運動方向轉了約 90°。
// 尺寸全在 8 mm 孔距上：機架孔距 48、曲柄 16、連桿 56、彎桿第 1 臂 40（5 孔）、第 2 臂 32（4 孔）。
// 最短桿（曲柄）接機架，16 + 56 ≤ 40 + 48，所以曲柄能轉整圈、彎桿往復擺動（曲柄搖桿）。
import {makeStandardBlank} from './standard-blank.js';
// 彎桿的孔位與外形在 arm-blank.js；先載入再建立，載入範例後外形才會馬上正確。
await import('./arm-blank.js');

const HUB = {u: 40, v: 16}, MOTOR = {u: 88, v: 16};         // 機架板上的兩個孔（距離 48 mm）
const CRANK = 16, COUPLER = 56, ARM1 = 5, ARM2 = 4;          // mm／孔數
const THETA = 0;                                            // 起始姿態：θ=0，曲柄沿機架兩孔連線朝外（開檔不需調整相位）
const hole = p => `Blank1_H${p.u}_${p.v}`;

function build() {
  const frameMade = makeStandardBlank({kind: 'plate', columns: 18, rows: 9, n: 1, origin: {x: 0, y: 0}});
  const frame = frameMade.comp, params = {...frameMade.params};
  // TT 馬達的座孔（中心孔＋三個鎖孔）不算一般格孔，另記在 mountHoles。
  const mountCells = [[MOTOR.u, MOTOR.v], [MOTOR.u + 8, MOTOR.v], [MOTOR.u + 24, MOTOR.v - 8], [MOTOR.u + 24, MOTOR.v + 8]];
  const isMount = h => mountCells.some(([u, v]) => h.u === u && h.v === v);
  frame.standardBlank.mountHoles = frame.holes.filter(isMount).map(h => ({...h}));
  frame.holes = frame.holes.filter(h => !isMount(h));
  frame.standardBlank.mountHoles.length === 4 || (() => { throw Error('馬達座孔數不對'); })();
  frame.p1.type = frame.p2.type = 'fixed';
  frame.motorMountPoint = hole(MOTOR); frame.frameSeparate = true; frame.name = '機架板'; frame.color = '#27ae60';

  // 曲柄端點、彎桿第 1 臂端點（兩圓交點，取機架板內的一側）。
  const a = THETA * Math.PI / 180, crankEnd = {x: MOTOR.u + CRANK * Math.cos(a), y: MOTOR.v + CRANK * Math.sin(a)};
  const hub = {x: HUB.u, y: HUB.v}, L1 = 8 * ARM1;
  const d = Math.hypot(crankEnd.x - hub.x, crankEnd.y - hub.y), l = (L1 * L1 - COUPLER * COUPLER + d * d) / (2 * d), h = Math.sqrt(L1 * L1 - l * l);
  const ux = (crankEnd.x - hub.x) / d, uy = (crankEnd.y - hub.y) / d;
  const armEnd = {x: hub.x + l * ux - h * uy, y: hub.y + l * uy + h * ux};

  const barMade = (n, length, p1, p2) => {
    const m = makeStandardBlank({kind: 'bar', lengthMm: length, n, origin: {x: 0, y: 0}}), c = m.comp;
    Object.assign(params, m.params);
    c.p1 = {...c.p1, ...p1}; c.p2 = {...c.p2, ...p2}; c.color = '#3498db';
    return c;
  };
  const crank = barMade(2, CRANK, {id: hole(MOTOR), type: 'fixed', x: MOTOR.u, y: MOTOR.v, physicalMotor: '1'}, {id: 'Blank2.B', type: 'floating', x: crankEnd.x, y: crankEnd.y});
  Object.assign(crank, {name: '曲柄', color: '#e74c3c', isInput: true, physicalMotor: '1', motorType: 'tt', phaseOffset: 0,
    motorMount: {motor: '1', partId: 'Motor1', center: hole(MOTOR), outputBody: crank.id, frameBody: frame.id, orientation: 'follow-frame', angleDeg: 0, reversed: false, face: 'back', order: ['motor', 'frameBody', 'outputBody']}});
  const coupler = barMade(3, COUPLER, {id: 'Blank2.B', type: 'floating', x: crankEnd.x, y: crankEnd.y}, {id: 'Blank4.B', type: 'floating', x: armEnd.x, y: armEnd.y});
  coupler.name = '連桿';

  // 彎桿：中心孔在機架樞軸孔，第 1 臂端孔接連桿，第 2 臂端孔是「夾指」。
  const bellMade = makeStandardBlank({kind: 'arms', arms: [{holes: ARM1, angleDeg: 0}, {holes: ARM2, angleDeg: 90}], n: 4, origin: {x: 0, y: 0}});
  if (!bellMade.ok) throw Error(bellMade.message);
  const bell = bellMade.comp, rot = Math.atan2(armEnd.y - hub.y, armEnd.x - hub.x);
  const at = p => ({x: hub.x + p.x * Math.cos(rot) - p.y * Math.sin(rot), y: hub.y + p.x * Math.sin(rot) + p.y * Math.cos(rot)});
  Object.assign(params, bellMade.params);
  bell.p1 = {...bell.p1, id: hole(HUB), type: 'fixed', ...at(bellMade.comp.p1)};
  bell.p2 = {...bell.p2, id: 'Blank4.B', type: 'floating', ...at(bellMade.comp.p2)};
  bell.p3 = {...bell.p3, ...at(bellMade.comp.p3)};
  bell.name = '鐘形彎桿'; bell.color = '#e67e22';
  params.theta = THETA;
  return {
    kind: 'blocks', v: 1, counter: 5, projectName: '鐘形曲柄夾爪', tracePoint: bell.p3.id,
    comps: [frame, crank, coupler, bell], params
  };
}

export const BELL_CRANK_SNAPSHOT = build;
export const BELL_CRANK_ID = 'bell-crank-gripper';
export const BELL_CRANK_LESSON = {
  group: 'manipulator', level: '入門',
  use: '馬達轉一圈，曲柄經連桿推動 90° 彎桿；彎桿第 2 臂的端孔像夾指一樣往復擺動，運動方向比曲柄轉了約 90°。狀態：模擬已驗證（只驗證幾何運動，未驗證夾持力、承載、加工或實物）。',
  learn: '學什麼：彎桿（鐘形曲柄）把一個方向的推拉，轉成另一個方向的擺動；兩支臂的長度比，決定擺得多遠、推得多用力。',
  try: [
    '按播放，看紅色曲柄轉整圈、橘色彎桿來回擺；綠色曲線是第 2 臂端孔走過的軌跡',
    '實操（一次只改一個變數）：點彎桿，只把第 2 臂的孔數從 4 改成 5，再播放，看端孔擺得更遠還是更近；改回 4，再只把夾角從 90° 改成 120°，再播放。',
    '反思：第 2 臂加長以後，端孔擺得更遠，但推東西的力會變大還是變小？為什麼？',
    '解決一個問題：夾指要「多合上一點」（端孔擺幅要更大）。只改一個地方，你會改哪裡？先預測，再試。',
    '反例：把第 2 臂的端孔也固定到機架板上，再按播放；狀態會說明機構不能動。試完請復原。'
  ],
  predict: '先猜：曲柄轉一整圈，彎桿會跟著轉一整圈，還是只來回擺？',
  measure: '播放一圈，記下第 2 臂端孔最左與最右的位置，量出擺幅；再只改孔數，量一次。',
  explain: '用「臂越長，端點走的弧越大，但同樣的力矩推出的力越小」說明你看到的結果。這是模擬，不代表夾得住物件，也沒有測過實物。'
};

/** 加進範例清單與教學資料；重複呼叫不會重複加入。 */
export function register(examples, lessons) {
  if (!examples.some(e => e.id === BELL_CRANK_ID)) {
    examples.push({id: BELL_CRANK_ID, title: '鐘形曲柄夾爪（彎桿轉向）',
      note: 'TT 馬達帶動曲柄與連桿，2 臂 90° 彎桿把推拉轉成約 90° 的擺動。模擬已驗證；夾持力、加工與實物未驗證。', snapshot: build()});
  }
  lessons[BELL_CRANK_ID] = BELL_CRANK_LESSON;
}
