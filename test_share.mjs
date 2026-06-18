/**
 * 分享網址 codec 的獨立驗證腳本（非測試套件，臨時驗證用，比照 test_hull.js）。
 * 執行：node test_share.mjs
 * 驗證 round-trip、UTF-8 中文 id，以及安全閘是否擋下惡意輸入。
 */
import { encodeSnapshot, decodeShareString } from './js/share-codec.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name); } };
const throws = (name, fn) => { try { fn(); fail++; console.log('  FAIL', name, '(did not throw)'); } catch (e) { pass++; console.log('  PASS', name, '->', e.message); } };

const topo = {
  params: { theta: 30, L1: 40, Lcoup: 90 },
  steps: [
    { id: 'O2', type: 'ground', x: 0, y: 0 },
    { id: '輸出', type: 'input_crank', center: 'O2', len_param: 'L1', physical_motor: '1' }
  ],
  tracePoint: '輸出',
  _wizard_data: [{ type: 'bar', id: 'Link1', color: '#3498db', lenParam: 'L1' }]
};
const snapshot = {
  version: 1, mechType: 'multilink', createdAt: new Date().toISOString(),
  data: { mech: { topology: JSON.stringify(topo) }, partSpec: {}, mfg: {}, viewParams: {}, dynamicParams: { L1: 40 } }
};

const enc = encodeSnapshot(snapshot);
ok('encode 產生 URL-safe 字串', /^[A-Za-z0-9_-]+$/.test(enc));
const dec = decodeShareString(enc);
ok('round-trip 還原一致', JSON.stringify(dec) === JSON.stringify(snapshot));
ok('中文 id 保留', JSON.parse(dec.data.mech.topology).tracePoint === '輸出');

const badId = JSON.parse(JSON.stringify(snapshot));
const t2 = JSON.parse(badId.data.mech.topology);
t2.steps[0].id = '<img src=x onerror=alert(1)>';
badId.data.mech.topology = JSON.stringify(t2);
throws('擋下惡意 id (含 < >)', () => decodeShareString(encodeSnapshot(badId)));

const badColor = JSON.parse(JSON.stringify(snapshot));
const t3 = JSON.parse(badColor.data.mech.topology);
t3._wizard_data[0].color = 'x" onmouseover="alert(1)';
badColor.data.mech.topology = JSON.stringify(t3);
throws('擋下惡意 color (含 ")', () => decodeShareString(encodeSnapshot(badColor)));

const badTop = JSON.parse(JSON.stringify(snapshot));
badTop.mechType = '<script>';
throws('擋下頂層惡意字串', () => decodeShareString(encodeSnapshot(badTop)));

throws('擋下損壞字串', () => decodeShareString('!!!not-base64!!!'));
throws('擋下空字串', () => decodeShareString(''));

const fixed = { version:1, mechType:'fourbar', data:{ mech:{ Lc:40, Lcoup:90 }, partSpec:{}, mfg:{}, viewParams:{}, dynamicParams:{} } };
ok('非 multilink round-trip', JSON.stringify(decodeShareString(encodeSnapshot(fixed))) === JSON.stringify(fixed));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
