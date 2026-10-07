/** 接合板擺放記錄；不把未支援的 3D 姿態寫成舊 mount。 */
import { solveFaceMate } from './face-mate.js';

export function buildFacePlacement({ host, child, selection } = {}) {
  if (!host?.surface || !child?.surface || !selection) return { ok: false, reason: '缺少接合板或選面資料' };
  const keys = ['hostFace', 'childFace', 'alignU', 'alignV', 'offsetU', 'offsetV', 'gap', 'quarterTurns'];
  const chosen = Object.fromEntries(keys.map(k => [k, selection[k]]));
  if (selection.rotationDeg !== undefined) chosen.rotationDeg = selection.rotationDeg;
  const mate = solveFaceMate({ ...chosen, hostBox: host.box, childBox: child.box });
  if (!mate.ok) return mate;
  const center = box => Object.fromEntries(['x', 'y', 'z'].map(k => [k, (box.min[k] + box.max[k]) / 2]));
  const hc = center(host.surface.box), cc = center(child.surface.box);
  // 原型將板件中心搬到原點；回復成各自模組座標的剛體轉換。
  const axes = ['x', 'y', 'z'];
  const translation = Object.fromEntries(axes.map((k, i) => [k,
    hc[k] + mate.translation[k] - mate.rotation[i].reduce((s, v, j) => s + v * cc[axes[j]], 0)
  ]));
  if (!Object.values(translation).every(Number.isFinite)) return { ok: false, reason: '擺放座標超出有效範圍' };
  const r = mate.rotation, eps = 1e-8;
  const planar = Math.abs(r[2][0]) < eps && Math.abs(r[2][1]) < eps && Math.abs(r[0][2]) < eps && Math.abs(r[1][2]) < eps && Math.abs(r[2][2] - 1) < eps;
  const reason = !planar ? '此接法需要完整 3D 安裝姿態，尚不能轉成現有 mount。'
    : Math.abs(translation.z) > eps ? '此接法含板厚或面間距的高度差，現有平面 mount 無法保存。'
    : '平面姿態可表達；仍須驗證宿主輸出參考與固定接口，尚未建立 mount。';
  const identify = item => ({ moduleId: item.surface.moduleId, surfaceId: item.surface.id, kind: item.surface.kind, outputId: item.surface.outputId || null });
  return { ok: true, record: { format: 'face-placement-preview', version: 1, units: 'mm', host: identify(host), child: identify(child), selection: chosen,
    transform: { rotation: r.map(row => [...row]), translation },
    compatibility: { status: 'preview-only', planar, reason },
    warnings: [...(host.surface.warnings || []), ...(child.surface.warnings || [])]
  } };
}
