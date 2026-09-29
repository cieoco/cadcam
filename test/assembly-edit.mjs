// M1b 刀 3：編輯守門用的純函式（SDD-ASSEMBLY-MODULES §4.2 合併防呆、D3、「新零件歸屬起點模組」）。
import { readFileSync } from 'node:fs';
import { connectionModule, selectionModule } from '../js/blocks/assembly.js';
import { check, report } from './_harness.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fixture = JSON.parse(readFileSync(new URL('./fixtures/assembly/lift-gripper.json', import.meta.url), 'utf8'));
const comps = [...fixture.comps, { type: 'bar', id: 'Free', p1: { id: 'X', type: 'floating', x: 0, y: 0 }, p2: { id: 'Y', type: 'floating', x: 9, y: 0 }, lenParam: 'FL' }];

// connectionModule：新零件要接的既有節點必須同屬一個模組（根也算一個）
check('沒有接任何既有節點 → 根', same(connectionModule(comps, []), { ok: true, moduleId: null }));
check('忽略 null／undefined／空字串', same(connectionModule(comps, [null, undefined, '']), { ok: true, moduleId: null }));
check('接同一模組的兩點 → 該模組', same(connectionModule(comps, ['GCA', 'GCB']), { ok: true, moduleId: 'Grip1' }));
check('只接一個模組點 → 該模組', same(connectionModule(comps, ['LiftOutput']), { ok: true, moduleId: 'Lift1' }));
check('接不同模組 → 拒絕', connectionModule(comps, ['GCA', 'LPC']).ok === false);
check('接模組點與根點 → 拒絕', connectionModule(comps, ['GCA', 'X']).ok === false);
check('兩個根點 → 根', same(connectionModule(comps, ['X', 'Y']), { ok: true, moduleId: null }));
check('找不到的點視為根', same(connectionModule(comps, ['Nope', 'X']), { ok: true, moduleId: null }) && connectionModule(comps, ['Nope', 'GCA']).ok === false);
check('同一點重複出現不影響', same(connectionModule(comps, ['GCA', 'GCA']), { ok: true, moduleId: 'Grip1' }));

// selectionModule：目前選取的東西屬於哪個模組（零件看 moduleId、節點看引用它的零件）
check('選齒輪 → Grip1', selectionModule(comps, { gearId: 'GearA' }) === 'Grip1');
check('選三點桿 → Grip1', selectionModule(comps, { triangleId: 'LeftJaw' }) === 'Grip1');
check('選節點（齒條孔）→ Lift1', selectionModule(comps, { nodeId: 'LiftOutput' }) === 'Lift1');
check('選根零件 → null', selectionModule(comps, { linkId: 'Free' }) === null);
check('沒選 → null', selectionModule(comps, {}) === null && selectionModule(comps, null) === null);
check('選到不存在的零件 → null', selectionModule(comps, { linkId: 'Nope' }) === null);
check('多個欄位時依 link → triangle → slider → gear → node 順序取第一個有值的',
  selectionModule(comps, { linkId: null, triangleId: 'LeftJaw', nodeId: 'LiftOutput' }) === 'Grip1');

report('assembly-edit');
