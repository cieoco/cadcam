/**
 * blocks / integrity  (pack C1 of docs/SDD-CONNECTION-INTEGRITY.md)
 *
 * 作品資料一致性檢查 I1–I9。只讀、只回報（影子模式）：不顯示給學生、不阻擋操作、不修復。
 *   checkWork(work, relations?) -> [{ code, severity, parts:[compId], ids:[pointOrHoleId], message }]
 * severity：contradiction 資料自相矛盾／dangling 引用失效／notice 可疑但可能合法。
 * 欄位角色見 SDD 3.1：只比對「同角色」的資料，欄位缺席不等於矛盾。
 */
import {buildRelations, workParts} from './relations.js';
import {pointKeysFor} from './part-types.js';
import {inspectBarFusionData} from '../core/bar-fusion.js';
import {attachmentFrame} from '../core/syringe.js';
import {isDisk, diskDiameter} from './disk-plate.js';
import {fusionPairReason} from './part-fusion.js';

const TOL_MM = 0.01;          // I1 座標容差
const PHASE_TOL_DEG = 0.05;   // 與 schema.alignSavedInputPhase 相同
const isStr = v => typeof v === 'string' && v !== '';
const hasId = p => !!p && typeof p === 'object' && isStr(p.id);
const fix1 = n => (Math.round(n * 10) / 10).toString();
const wrap360 = d => ((d % 360) + 540) % 360 - 180;

export function checkWork(work, relations) {
  const rel = relations || buildRelations(work);
  const {comps, modules, params, topo} = workParts(work);
  const net = rel._internal;
  const issues = [];
  const byId = id => net.compById(id);
  // 學生看得到的零件名稱：「名稱」(id)；沒有名稱時只有「id」。
  const label = id => { const c = byId(id), n = typeof c?.name === 'string' ? c.name.trim() : ''; return n && n !== id ? `「${n}」(${id})` : `「${id}」`; };
  const labels = ids => [...new Set(ids)].map(label).join('、');
  // ref（可選）：失效引用的種類與位置，供開檔提示（integrity-hints）挑選修復；不屬於一致性判斷。
  const add = (code, severity, parts, ids, message, ref) => issues.push({code, severity, parts: [...new Set(parts)], ids: [...new Set(ids)], message, ...(ref ? {ref} : {})});
  const first = (a, b) => a !== undefined && a !== null ? a : b;
  const snap = k => first(work?.[k], topo?.[k]);

  // ------------------------------------------------------------ I6 零件 id 唯一
  const seenComp = new Map();
  for (const c of comps) seenComp.set(c.id, (seenComp.get(c.id) || 0) + 1);
  for (const [id, n] of seenComp) if (n > 1) add('I6', 'contradiction', [id], [], `有 ${n} 個零件共用同一個零件編號 ${label(id)}；存檔、選取與復原會分不出是哪一個，請改名後再繼續。`);

  // ------------------------------------------------------------ I7 同一零件的兩個孔不共用 id
  for (const c of comps) {
    const seen = new Map(), dup = new Set();
    const note = (id, where) => { if (seen.has(id)) dup.add(id); else seen.set(id, where); };
    for (const k of pointKeysFor(c)) if (hasId(c[k])) note(c[k].id, k);
    for (const h of Array.isArray(c.holes) ? c.holes : []) if (hasId(h)) note(h.id, 'holes');
    for (const h of c.standardBlank?.mountHoles || []) if (hasId(h)) note(h.id, 'mountHoles');
    for (const id of dup) add('I7', 'contradiction', [c.id], [id], `${label(c.id)} 有兩個孔共用同一個孔編號 ${id}；它們會被當成同一個點，請把其中一個拆開。`);
  }

  // ------------------------------------------------------------ I1 同一 id 的幾何副本一致
  for (const id of net.copies().keys()) {
    const w = rel.worldOf(id);
    if (!w || !(w.spread > TOL_MM)) continue;
    const parts = w.copies.map(x => x.compId);
    if (new Set(parts).size < 2 && !w.copies.some(x => x.holeId) ) continue;
    const far = w.copies.filter(x => x.offset > TOL_MM);
    add('I1', 'contradiction', parts, [id], `孔 ${id} 在 ${labels(parts)} 上的位置不一致（最多相差 ${fix1(w.spread)} mm）；${labels(far.map(x => x.compId))} 的這個端點沒有落在孔的位置上，畫面與製作會對不起來。`);
  }

  // ------------------------------------------------------------ I2 強運動角色不衝突
  {
    const reported = new Set();
    for (const [id, list] of net.copies()) {
      const vals = new Map();
      for (const r of list) if (r.physicalMotor != null && r.physicalMotor !== '') vals.set(String(r.physicalMotor), [...(vals.get(String(r.physicalMotor)) || []), r.compId]);
      if (vals.size > 1) {
        reported.add(id);
        add('I2', 'contradiction', [...vals.values()].flat(), [id], `孔 ${id} 同時被標成不同的馬達（${[...vals.keys()].map(v => '馬達 ' + v).join('、')}），涉及 ${labels([...vals.values()].flat())}；請決定它由哪一顆馬達驅動。`);
      }
    }
    const byCenter = new Map();
    for (const m of net.motors()) if (m.centerId) byCenter.set(m.centerId, [...(byCenter.get(m.centerId) || []), m]);
    for (const [center, list] of byCenter) {
      if (reported.has(center) || new Set(list.map(m => m.motor)).size < 2) continue;
      add('I2', 'contradiction', list.map(m => m.ownerId), [center], `孔 ${center} 被 ${labels(list.map(m => m.ownerId))} 指向不同的馬達（${[...new Set(list.map(m => '馬達 ' + m.motor))].join('、')}）；請決定它由哪一顆馬達驅動。`);
    }
  }

  // ------------------------------------------------------------ I3 馬達引用可解析（frameBody／motorMountPoint；motorCarrier 的失效引用記在 I5）
  {
    const partIds = new Map();
    for (const c of comps) {
      const m = c.motorMount;
      if (!m || typeof m !== 'object') continue;
      const own = new Set([...pointKeysFor(c).map(k => c[k]?.id), ...(c.holes || []).map(h => h?.id)].filter(isStr));
      if (isStr(m.center) && !own.has(m.center)) add('I3', 'dangling', [c.id], [m.center], `${label(c.id)} 記錄的馬達軸心 ${m.center} 不是它自己的孔；請重新設定馬達安裝。`, {what: 'center', comp: c.id});
      if (isStr(m.frameBody) && m.frameBody !== 'world' && !byId(m.frameBody)) add('I3', 'dangling', [c.id], [m.center].filter(isStr), `${label(c.id)} 的馬達承載零件「${m.frameBody}」已不存在；請重新選擇馬達的承載零件。`, {what: 'frameBody', comp: c.id});
      if (isStr(m.frameBody) && isStr(c.motorCarrier) && m.frameBody !== c.motorCarrier && m.frameBody !== 'world') {
        add('I3', 'contradiction', [c.id, byId(m.frameBody) ? m.frameBody : null, byId(c.motorCarrier) ? c.motorCarrier : null].filter(Boolean), [m.center].filter(isStr), `${label(c.id)} 的馬達承載零件有兩種說法：motorCarrier 是「${c.motorCarrier}」、motorMount.frameBody 是「${m.frameBody}」；請決定馬達裝在哪個零件上。`, {what: 'carrierConflict', comp: c.id});
      }
      if (isStr(m.partId)) partIds.set(m.partId, [...(partIds.get(m.partId) || []), c]);
    }
    for (const c of comps) if (isStr(c.motorMountPoint)) {
      const own = new Set([...pointKeysFor(c).map(k => c[k]?.id), ...(c.holes || []).map(h => h?.id), ...(c.standardBlank?.mountHoles || []).map(h => h?.id)].filter(isStr));
      if (!own.has(c.motorMountPoint)) add('I3', 'dangling', [c.id], [c.motorMountPoint], `${label(c.id)} 記錄的馬達座孔 ${c.motorMountPoint} 已不在這個零件上；請重新設定馬達安裝。`, {what: 'motorMountPoint', comp: c.id});
    }
    for (const [partId, owners] of partIds) if (owners.length > 1) add('I3', 'contradiction', owners.map(c => c.id), owners.map(c => c.motorMount.center).filter(isStr), `${labels(owners.map(c => c.id))} 的馬達零件編號都是 ${partId}；馬達編號要各自獨立，請重新編號其中一個。`, {what: 'partIdDup'});
  }

  // ------------------------------------------------------------ I4 重開作品的姿態等於存檔姿態（條件同 alignSavedInputPhase）
  // C1 一律只標 notice：開檔流程本來就會用 alignSavedInputPhase 修正相位，未修正的舊檔不是壞檔。
  // 升級為 contradiction 要等 C3/C4 決定「哪些入口在對齊之前就會檢查」。
  {
    const active = String(first(snap('activeMotor'), '1')), frozen = snap('motorAngles') || {};
    for (const c of comps) {
      if (c.type !== 'bar' || !c.isInput || c.style === 'piston' || !c.p1 || !c.p2) continue;
      const center = c.motorMount?.center || [c.p1, c.p2].find(p => p?.physicalMotor)?.id, motor = String(c.physicalMotor || '1');
      if (motor !== active && frozen[motor] !== undefined) continue;     // 凍結的其他馬達：角度表另存，目前不比對
      const saved = Math.atan2(c.p2.y - c.p1.y, c.p2.x - c.p1.x) * 180 / Math.PI;
      if (c.motorCarrier) {
        // 相對承載件的角度：schema 刻意不處理，先只提示。
        const host = byId(c.motorCarrier);
        if (!host?.p1 || !host?.p2 || host.type !== 'bar') continue;
        const rel0 = saved - Math.atan2(host.p2.y - host.p1.y, host.p2.x - host.p1.x) * 180 / Math.PI;
        if (Math.abs(wrap360(rel0 - (c.phaseOffset || 0))) > PHASE_TOL_DEG) add('I4', 'notice', [c.id], [center].filter(isStr), `${label(c.id)} 掛在移動的承載件上，存檔時相對承載件的角度（${fix1(wrap360(rel0))}°）與相位（${fix1(c.phaseOffset || 0)}°）不同；重開時姿勢可能不是存檔的樣子。`);
        continue;
      }
      if (![c.p1, c.p2].some(p => p?.id === center && ['fixed', 'motor'].includes(p.type))) continue;   // 凍結輸入等：不比對
      if (Math.abs(wrap360(saved - (c.phaseOffset || 0))) > PHASE_TOL_DEG) add('I4', 'notice', [c.id], [center].filter(isStr), `${label(c.id)} 存檔的輸入桿角度是 ${fix1(wrap360(saved))}°，但相位是 ${fix1(c.phaseOffset || 0)}°；開檔時會依存檔姿勢調整相位（alignSavedInputPhase），目前只提示、不算矛盾。`);
    }
  }

  // ------------------------------------------------------------ I5 有寫的引用必須存在
  {
    for (const c of comps) {
      if (c.type === 'syringe') {
        for (const k of ['a', 'b']) {
          const ref = c[k];
          if (isStr(ref?.componentId) && !byId(ref.componentId)) add('I5', 'dangling', [c.id], [], `${label(c.id)} 的${k === 'a' ? '固定（管夾）' : '推桿'}端接在不存在的零件「${ref.componentId}」上；請重新選擇接合位置，或解除這一端。`, {what: 'syringeEnd', comp: c.id, end: k});
        }
        if (isStr(c.outputId) && !byId(c.outputId)) add('I5', 'dangling', [c.id], [], `${label(c.id)} 要推動的輸出零件「${c.outputId}」已不存在。`, {what: 'syringeOutput', comp: c.id});
      }
      if (isStr(c.motorCarrier) && !byId(c.motorCarrier)) add('I5', 'dangling', [c.id], [c.motorMount?.center].filter(isStr), `${label(c.id)} 的馬達承載零件「${c.motorCarrier}」已不存在；請重新選擇馬達的承載零件。`, {what: 'motorCarrier', comp: c.id});
      if (isStr(c.moduleId) && !modules.some(m => m?.id === c.moduleId)) add('I5', 'dangling', [c.id], [], `${label(c.id)} 屬於不存在的模組「${c.moduleId}」。`, {what: 'moduleId', comp: c.id});
    }
    for (const m of modules) {
      const to = m?.mount?.to?.module;
      if (isStr(to) && !modules.some(x => x?.id === to)) add('I5', 'dangling', [], [], `模組「${m.id}」安裝在不存在的模組「${to}」上。`);
    }
    // 模組接口（base／輸出端的點與本體／安裝目標）：讀的欄位與 relations.moduleEdges 同一份，引用的零件或點不在了就是失效。
    for (const x of net.moduleMissing()) {
      const mod = modules.find(m => m?.id === x.module), out = (mod?.outputs || []).find(o => o?.id === x.output);
      add('I5', 'dangling', [], [x.id], `模組「${mod?.name || x.module}」的${x.output ? `輸出端「${out?.name || x.output}」` : x.field === 'base' ? '基座' : '接合零件'}指向不存在的零件或點 ${x.id}；請重新設定輸出端，或解散模組。`,
        {what: 'moduleRef', id: x.id, module: x.module, field: x.field, role: x.field === 'base' ? 'base' : x.output ? 'output' : 'mount', moduleName: mod?.name || x.module, ...(x.output ? {outName: out?.name || x.output} : {})});
    }
    // topo 的追蹤／參考／負載／尺寸點：只要求引用存在，不讓孔變成「需加工」。
    const exists = id => net.copies().has(id) || !!byId(id);
    const pointRef = (id, what) => { if (isStr(id) && !exists(id)) add('I5', 'dangling', [], [id], `${what}指向不存在的點 ${id}；請重新選擇，或刪除這項設定。`, {what: 'topo'}); };
    const tp = new Set([...(snap('tracePoints') || []), ...(isStr(snap('tracePoint')) ? [snap('tracePoint')] : [])].filter(isStr));
    for (const id of tp) pointRef(id, '軌跡追蹤');
    pointRef(snap('referencePoint'), '參考點');
    for (const l of snap('loads') || []) { if (l?.at?.pointId) pointRef(l.at.pointId, `負載「${l.name || l.id}」`); else if (isStr(l?.at?.compId) && !byId(l.at.compId)) add('I5', 'dangling', [], [], `負載「${l.name || l.id}」放在不存在的零件「${l.at.compId}」上。`, {what: 'topo'}); }
    for (const d of snap('dimensions') || []) for (const r of [d?.a, d?.b]) {
      if (r?.pointId) pointRef(r.pointId, `量尺「${d.name || d.id}」`);
      else if (isStr(r?.compId) && !byId(r.compId)) add('I5', 'dangling', [], [], `量尺「${d.name || d.id}」量到不存在的零件「${r.compId}」。`, {what: 'topo'});
    }
  }

  // ------------------------------------------------------------ I8 合成件成員與共用孔符合凍結形狀（C6）
  // 兩種合成各自的凍結形狀：連桿合成（barFusion）成員存在、孔位與成員宣告的孔距一致；板件＋齒輪合成（fusedWith）仍共用軸心與定位孔。
  // 說明一律是「先解除合成，再修改」：不自動改形（SDD 3.3 I8）。
  {
    for (const root of comps.filter(c => c.barFusion)) {
      const f = inspectBarFusionData(comps, root, params);
      const members = (Array.isArray(root.barFusion.members) ? root.barFusion.members : []).filter(id => byId(id));
      if (!f.ok) { add('I8', 'contradiction', [root.id, ...members], [], `合成件 ${label(root.id)} 的資料不一致：${f.reason}`, {what: 'barFusion', comp: root.id, why: f.reason}); }
      // 孔位與成員的孔距由 inspectBarFusionData 核對（成員存在、孔 id 一致、孔距等於宣告尺寸）。成員存檔座標只是求解的起點、
      // 鄰桿改尺寸後會暫時偏離合成孔距（影子掃描證實會誤報），所以不拿它比對。
    }
    for (const c of comps.filter(c => isStr(c.barFusionRoot))) {
      const root = byId(c.barFusionRoot);
      if (!root?.barFusion || !root.barFusion.members?.includes(c.id)) add('I8', 'contradiction', [c.id, ...(root ? [root.id] : [])], [], `${label(c.id)} 記錄屬於合成件「${c.barFusionRoot}」，但那個合成件已不存在或不含它；請先解除合成。`, {what: 'barFusionRoot', comp: c.id});
    }
    for (const plate of comps.filter(c => isStr(c.fusedWith))) {
      const gear = byId(plate.fusedWith);
      if (!gear) { add('I8', 'dangling', [plate.id], [], `${label(plate.id)} 合成的齒輪「${plate.fusedWith}」已不存在；請先解除合成。`, {what: 'fusedWith', comp: plate.id}); continue; }
      const why = fusionPairReason(comps, plate, gear);
      if (why) add('I8', 'contradiction', [plate.id, gear.id], [], `${label(plate.id)} 和 ${label(gear.id)} 的合成不成立：${why}請先解除合成，再修改。`, {what: 'fusedPair', comp: plate.id, why});
    }
  }

  // ------------------------------------------------------------ I9 針筒端點可解析（承載零件存在的前提見 I5）
  for (const c of comps.filter(c => c.type === 'syringe')) {
    for (const k of ['a', 'b']) {
      const ref = c[k], host = byId(ref?.componentId);
      if (!host || !Number.isFinite(ref.u) || !Number.isFinite(ref.v)) continue;
      if (!attachmentFrame(host, params)) {
        add('I9', 'notice', [c.id, host.id], [], `${label(c.id)} 的${k === 'a' ? '固定' : '推桿'}端接在 ${label(host.id)} 上，但這個零件目前沒有可用的尺寸，算不出接合位置。`);
        continue;
      }
      // 圓盤的外形是以第一孔為圓心的圓；其他零件的外形規則由針筒放置流程負責（任意位置、新增固定孔都合法）。
      if (isDisk(host) && Math.hypot(ref.u, ref.v) > diskDiameter(host) / 2 + TOL_MM) {
        add('I9', 'contradiction', [c.id, host.id], [], `${label(c.id)} 的${k === 'a' ? '固定' : '推桿'}端落在 ${label(host.id)} 的外形之外（離圓心 ${fix1(Math.hypot(ref.u, ref.v))} mm，圓盤半徑 ${fix1(diskDiameter(host) / 2)} mm）；請把它移回零件上。`);
      }
    }
  }
  return issues;
}
