import {normalizeTabNut} from './tab-nut-geometry.js';
import { normalizeBracketSelection } from './face-bracket-geometry.js?v=20261008_bracket3d';
/** 接合板擺放記錄；不把未支援的 3D 姿態寫成舊 mount。 */
import { solveFaceMate } from './face-mate.js';
import {applyEdgeRelations,normalizeEdgeRelations,faceBoundaryEdges} from './face-edge-relations.js';
import {normalizeFaceRelations,solveFaceRelations} from './face-relations.js';
import {normalizeAssemblyPin,alignAssemblyPin} from './assembly-pin-contract.js';

export function buildFacePlacement({ host, child, selection } = {}) {
  if (!host?.surface || !child?.surface || !selection) return { ok: false, reason: '缺少接合板或選面資料' };
  const keys = ['hostFace', 'childFace', 'alignU', 'alignV', 'offsetU', 'offsetV', 'gap', 'quarterTurns'];
  const chosen = Object.fromEntries(keys.map(k => [k, selection[k]]));
  if (selection.rotationDeg !== undefined) chosen.rotationDeg = selection.rotationDeg;
  if(selection.pin!==undefined){chosen.pin=normalizeAssemblyPin(selection.pin);if(!chosen.pin||selection.brackets||selection.fastener||selection.edgeRelations?.length||selection.faceRelations?.length)return {ok:false,reason:'插銷不能與榫接、角碼或選面關係重複設定。'};}
  if(selection.faceRelations!==undefined){chosen.faceRelations=normalizeFaceRelations(selection.faceRelations);if(!chosen.faceRelations)return {ok:false,reason:'面關係格式無效。'};}
  if(selection.edgeRelations!==undefined){chosen.edgeRelations=normalizeEdgeRelations(selection.edgeRelations);if(!chosen.edgeRelations)return {ok:false,reason:'接合邊關係無效。'};}
  if (selection.brackets !== undefined) {
    chosen.brackets = normalizeBracketSelection(selection.brackets);
    if (!chosen.brackets) return { ok: false, reason: '角碼固定設定不合法' };
  }
  if(selection.fastener!==undefined){chosen.fastener=normalizeTabNut(selection.fastener);if(!chosen.fastener||chosen.brackets)return {ok:false,reason:'榫槽設定不合法或與角碼重複。'};}
  let mate = solveFaceMate({ ...chosen, hostBox: host.box, childBox: child.box });
  if (!mate.ok) return mate;
  if(chosen.pin){mate=alignAssemblyPin(mate,host,child,chosen.pin);if(!mate.ok)return mate;}
  if(chosen.edgeRelations?.length){mate=applyEdgeRelations(mate,{host:host.surface,child:child.surface,hostFace:chosen.hostFace,childFace:chosen.childFace,relations:chosen.edgeRelations});if(!mate.ok)return mate;}
  if(chosen.faceRelations?.length){
    for(const r of chosen.faceRelations)for(const [key,item]of [['hostFaces',host],['childFaces',child]])if(r[key].some(id=>!['top','bottom'].includes(id)&&!faceBoundaryEdges(item.surface,id).length))return {ok:false,reason:'原先選的材料側面已不存在，請重新選面。'};
    if((chosen.brackets||chosen.fastener&&chosen.fastener.contactMode!=='actual')&&!chosen.faceRelations.some(r=>r.kind==='mate'&&r.hostFaces[0]===chosen.hostFace&&r.childFaces[0]===chosen.childFace&&Math.abs(r.offsetMm-chosen.gap)<1e-6))return {ok:false,reason:'這組面關係的固定件尚未核對，請先選「先只定位」。'};
    mate=solveFaceRelations(mate,{hostBox:host.box,childBox:child.box,relations:chosen.faceRelations});if(!mate.ok)return mate;
    if(chosen.edgeRelations?.length){const check=applyEdgeRelations(mate,{host:host.surface,child:child.surface,hostFace:chosen.hostFace,childFace:chosen.childFace,relations:chosen.edgeRelations});if(!check.ok||['x','y','z'].some(k=>Math.abs(check.translation[k]-mate.translation[k])>1e-5))return {ok:false,reason:'新面關係與原有邊定位衝突，請調整或移除原有邊定位。'};}
  }
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
