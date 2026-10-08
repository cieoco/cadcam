// Six-face mount contract, normalization, reference placement, and dynamic host following.
import { readFileSync } from 'node:fs';
import { check, report } from './_harness.mjs';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { compileAssembly, orthogonalFrame, solveAssembly } from '../js/blocks/assembly.js';
import { mountFacePlacement } from '../js/blocks/face-mount.js';
import { solveFaceMate } from '../js/blocks/face-mate.js';
import { mateOfMount, mateStyle } from '../js/blocks/mate-connect.js';
import { connectionSelection } from '../js/blocks/connection-selection.js';
import { moduleToTemplate, normalizeTemplate, instantiateTemplate } from '../js/blocks/module-ops.js';

const clone = value => JSON.parse(JSON.stringify(value));
const raw = JSON.parse(readFileSync(new URL('./fixtures/assembly/lift-gripper.json', import.meta.url), 'utf8'));
const fixture = normalizeSnapshot(raw);
{
  const mod = fixture.modules.find(m => m.outputs?.some(o => o.body?.id));
  const part = mod.outputs.find(o => o.body?.id).body.id;
  const snap = normalizeSnapshot({ ...raw, modules: raw.modules.map(m => m.id === mod.id ? { ...m, faceParts: { part, face: 'bottom' } } : m) });
  const selected = snap.modules.find(m => m.id === mod.id);
  check('每個設計保存一個桿件與一個面的預選', JSON.stringify(selected.faceParts) === JSON.stringify({ part, face: 'bottom' }));
  check('同一預選面不因安裝角色改變', JSON.stringify(connectionSelection(selected, 'host')) === JSON.stringify(connectionSelection(selected, 'child')));
  const template = normalizeTemplate(moduleToTemplate(snap.comps, snap.modules, snap.params, mod.id)).template;
  const instance = instantiateTemplate(template, {});
  check('匯出模組再插入仍選到同一桿件的面', template.faceParts?.part === part && instance.module.faceParts?.face === 'bottom' && instance.comps.some(c => c.id === instance.module.faceParts.part));
  const removed = normalizeSnapshot({ ...raw, modules: raw.modules.map(m => ({ ...m, faceParts: { part: 'deleted-part', face: 'top' } })) });
  check('已刪除桿件的預選面被清除', removed.modules.every(m => !m.faceParts));
}
{
  const configured = normalizeSnapshot({ ...raw, modules: raw.modules.map(m => ({ ...m, faceParts: { receive: m.outputs?.[0]?.id, attach: 'frame', receiveFace: 'bottom', attachFace: 'top' } })) });
  check('設計接合部位與接合面在存檔正規化後保留', configured.modules.every(m => m.faceParts?.attach === 'frame' && m.faceParts?.receiveFace === 'bottom' && m.faceParts?.attachFace === 'top'));
  const invalid = normalizeSnapshot({ ...raw, modules: raw.modules.map(m => ({ ...m, faceParts: { receive: 'missing', attach: 'missing', receiveFace: 'north' } })) });
  check('不存在的接合部位不保留', invalid.modules.every(m => !m.faceParts));
}
const near = (a, b, eps = 1e-5) => Math.abs(a - b) <= eps;
const faceFor = (quarterTurns = 0) => {
  const mate = solveFaceMate({
    hostBox: { min: { x: -80, y: -40, z: -2 }, max: { x: 80, y: 40, z: 2 } },
    childBox: { min: { x: -50, y: -30, z: -2 }, max: { x: 50, y: 30, z: 2 } },
    hostFace: 'top', childFace: 'bottom', quarterTurns, gap: 0
  });
  return { version: 1, rotation: mate.rotation, translation: mate.translation,
    selection: { hostFace: 'top', childFace: 'bottom', alignU: 0, alignV: 0, offsetU: 0, offsetV: 0, gap: 0, quarterTurns },
    hostThicknessMm: 4, childThicknessMm: 4 };
};

{
  const modules = fixture.modules.map(m => m.id === 'Grip1' ? { ...m, mount: { to: { module: 'Lift1', output: 'carriage' }, face: faceFor() } } : m);
  check('自由選面不可被誤認為已設計的平貼對鎖接法', mateStyle(modules, 'Grip1') === null && mateOfMount(fixture.comps, modules, 'Grip1', fixture.params) === null);
}

{
  const face = faceFor(); face.selection.rotationDeg = 37.5;
  const saved = { ...raw, modules: fixture.modules.map(m => m.id === 'Grip1' ? { ...m, mount: { to: {module:'Lift1',output:'carriage'}, ref: {x:0,y:0,a:0}, home: {}, face } } : m) };
  const restored = normalizeSnapshot(JSON.parse(JSON.stringify(saved)));
  check('自訂接合角度存檔還原後保留', restored.modules.find(m => m.id === 'Grip1').mount.face.selection.rotationDeg === 37.5);
}
// Every face pair and quarter-turn must produce a proper rotation accepted by the persisted contract.
{
  let valid = 0;
  const faces = ['right', 'left', 'front', 'back', 'top', 'bottom'];
  for (const hostFace of faces) for (const childFace of faces) for (let quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
    const mate = solveFaceMate({ hostBox: { min: { x: -20, y: -15, z: -3 }, max: { x: 20, y: 15, z: 3 } },
      childBox: { min: { x: -12, y: -9, z: -2 }, max: { x: 12, y: 9, z: 2 } }, hostFace, childFace, quarterTurns });
    const candidate = { ...faceFor(quarterTurns), rotation: mate.rotation, translation: mate.translation,
      selection: { hostFace, childFace, alignU: 0, alignV: 0, offsetU: 0, offsetV: 0, gap: 0, quarterTurns } };
    const n = normalizeSnapshot({ kind: 'blocks', v: 1, comps: fixture.comps, params: fixture.params,
      modules: fixture.modules.map(m => m.id === 'Grip1' ? { ...m, mount: { to: { module: 'Lift1', output: 'carriage' }, ref: { x: 0, y: 0, a: 0 }, home: {}, face: candidate } } : m) });
    if (mate.ok && n?.modules.find(m => m.id === 'Grip1')?.mount?.face) valid++;
  }
  check(`所有 144 種面配對／四分之一轉向正規化成功（${valid}/144）`, valid === 144);
}

// Malformed face records must unmount with a warning and never become planar mounts.
{
  const invalidFaces = [
    { ...faceFor(), rotation: [[1, 0, 0], [0, 1, 0], [0, 0, -1]] },
    { ...faceFor(), rotation: [[1, 0, 0], [0, 2, 0], [0, 0, 1]] },
    { ...faceFor(), translation: { x: 0, y: NaN, z: 0 } },
    { ...faceFor(), selection: { ...faceFor().selection, hostFace: 'north' } },
    { ...faceFor(), selection: { ...faceFor().selection, gap: -1 } },
    { ...faceFor(), hostThicknessMm: 0 },
    { ...faceFor(), orient: { type: 'orthogonal' } }
  ];
  const rejected = invalidFaces.every(face => {
    const modules = fixture.modules.map(m => m.id === 'Grip1' ? { ...m, mount: { to: { module: 'Lift1', output: 'carriage' }, ref: { x: 0, y: 0, a: 0 }, home: {}, face } } : m);
    const n = normalizeSnapshot({ kind: 'blocks', v: 1, comps: fixture.comps, params: fixture.params, modules });
    return n && n.modules.find(m => m.id === 'Grip1').mount === null && n.warnings.some(w => /六面安裝/.test(w));
  });
  check('無效旋轉、座標、選面、板厚或混合 orient 一律警告並解除安裝', rejected);
}

// Confirmed face mount captures a static host reference, follows later host motion, and keeps inputs immutable.
{
  const comps = clone(fixture.comps);
  const modules = clone(fixture.modules);
  const child = modules.find(m => m.id === 'Grip1'); child.mount = null;
  const before = JSON.stringify({ comps, modules });
  const result = mountFacePlacement(comps, modules, 'Grip1', { hostId: 'Lift1', outputId: 'carriage', face: faceFor() }, fixture.params, { activeMotor: '1', theta: 47, motorAngles: { '1': 47 } });
  check('mountFacePlacement 建立六面 mount', result.ok && result.mount.face.version === 1);
  check('使用靜態 home 參考而不寫入即時馬達角', result.ok && JSON.stringify(result.mount.home) === '{}' && Number.isFinite(result.mount.ref.x));
  check('放置計算不修改輸入', before === JSON.stringify({ comps, modules }));
  if (result.ok) {
    const mounted = modules.map(m => m.id === 'Grip1' ? { ...m, mount: result.mount } : m);
    const asm = compileAssembly(comps, mounted, { params: fixture.params });
    const at0 = solveAssembly(asm, { thetaDeg: 0, motorAngles: { '1': 0 } });
    const at40 = solveAssembly(asm, { thetaDeg: 0, motorAngles: { '1': 40 } });
    const f0 = orthogonalFrame(comps, mounted, 'Grip1', at0.points, fixture.params);
    const f40 = orthogonalFrame(comps, mounted, 'Grip1', at40.points, fixture.params);
    const localChild = comps.find(c => c.moduleId === 'Grip1' && c.type === 'gear');
    check('面模組在獨立平面求解並提供完整正交 frame', at0.isValid && f0 && f0.d && f0.n && f0.m && f0.base.x === 0 && f0.e.x === 1 && f0.f.y === 1);
    check('宿主輸出運動帶動六面 frame 原點', f0 && f40 && (Math.hypot(f40.origin.x - f0.origin.x, f40.origin.y - f0.origin.y) > 1e-4 || Math.abs(f40.origin.z - f0.origin.z) > 1e-4));
    check('子模組原始點仍在自身平面', localChild && at0.points[localChild.p1.id] && near(at0.points[localChild.p1.id].x, localChild.p1.x) && near(at0.points[localChild.p1.id].y, localChild.p1.y));
    const cyclicModules = mounted.map(m => m.id === 'Grip1' ? { ...m, outputs: [{ id: 'grip', name: 'grip', at: 'GCA', body: { kind: 'points', a: 'GCA', b: 'GCB' } }] }
      : m.id === 'Lift1' ? { ...m, mount: { to: { module: 'Grip1', output: 'grip' }, ref: { x: 0, y: 0, a: 0 }, home: {}, face: faceFor() } } : m);
    check('形成迴圈時拒絕六面安裝', !mountFacePlacement(comps, cyclicModules, 'Lift1', { hostId: 'Grip1', outputId: 'grip', face: faceFor() }, fixture.params).ok);
  }
}

report('face-mount');
