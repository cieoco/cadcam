// 鏈輪＋鏈條的製作資料：購買清單、從動輪張緊長孔、製作包段落（純函式，不碰 DOM）。
// 鏈輪與鏈條都是買現成的 #25 金屬件：不輸出齒形加工檔，只列規格與機架板上的長孔。
import { CHAIN_25, pitchDiameter, outsideDiameter, chainTensionSlot } from '../core/chain-drive.js';
import { FABRICATION_DEFAULTS } from './fabrication-profile.js';

const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmt = (v, d = 2) => Number(Number(v).toFixed(d)).toString();
const chainsOf = comps => (comps || []).filter(c => c?.type === 'belt' && c.kind === 'chain');
const sprocketOf = (comps, id) => (comps || []).find(c => c?.type === 'pulley' && c.kind === 'sprocket' && c.id === id) || null;

// 每條鏈傳動：兩個鏈輪＋一條鏈條（偶數節加 1 個接頭；奇數節要再加 1 個過渡半節）。
export function chainBillOfMaterials(comps, params = {}) {
  const items = [];
  for (const chain of chainsOf(comps)) {
    const wheels = [sprocketOf(comps, chain.driver), sprocketOf(comps, chain.driven)].filter(Boolean);
    wheels.forEach(s => items.push({
      kind: 'sprocket', id: s.id, standard: CHAIN_25.id, teeth: s.teeth, qty: 1,
      pitchDiameterMm: pitchDiameter(s.teeth), outsideDiameterMm: outsideDiameter(s.teeth),
      label: `#25 鏈輪 ${s.teeth} 齒（金屬，現成品）`
    }));
    const links = Math.round(Number(chain.links) || 0);
    if (links >= 2) items.push({
      kind: 'chain', id: chain.id, standard: CHAIN_25.id, qty: 1, links,
      connectingLinks: 1, offsetLinks: links % 2 ? 1 : 0, lengthMm: links * CHAIN_25.pitch,
      label: `#25 滾子鏈條 ${links} 節（含接頭 1 個${links % 2 ? '、半節 1 個' : ''}）`
    });
  }
  return items;
}

// 從動鏈輪軸心在機架板上的張緊長孔；孔寬用機架固定孔徑（匯出設定的 frameHoleDiameterMm）。
export function chainAxleSlot(comps, params = {}, chainId, { holeDiameterMm = FABRICATION_DEFAULTS.export.frameHoleDiameterMm } = {}) {
  const slot = chainTensionSlot(comps || [], chainId);
  if (!slot) return null;
  return { ...slot, widthMm: holeDiameterMm, lengthMm: 2 * slot.travelMm + holeDiameterMm };
}

export function chainBuildPackSection(comps, params = {}, opts = {}) {
  const chains = chainsOf(comps);
  if (!chains.length) return '';
  const bom = chainBillOfMaterials(comps, params);
  const rows = bom.map(i => `<tr><td>${esc(i.label)}</td><td>${i.qty}</td><td>${i.kind === 'sprocket'
    ? `節圓 ${fmt(i.pitchDiameterMm)} mm、外徑 ${fmt(i.outsideDiameterMm)} mm（核對買到的實物）`
    : `長度約 ${fmt(i.lengthMm, 1)} mm（${fmt(CHAIN_25.pitch)} mm × ${i.links} 節）`}</td></tr>`).join('');
  const slots = chains.map(c => ({ chain: c, slot: chainAxleSlot(comps, params, c.id, opts) })).filter(x => x.slot);
  const slotItems = slots.map(({ chain, slot }) => `<li>${esc(chain.id)}：從動鏈輪軸（${esc(slot.pointId)}）在機架板開長孔，長 ${fmt(slot.lengthMm)} mm、寬 ${fmt(slot.widthMm)} mm（obround，圖層 AXLE_SLOT），沿兩輪連線可前後調整 ±${fmt(slot.travelMm, 3)} mm（約半節），用來張緊鏈條。</li>`).join('');
  return `<h2>鏈輪與鏈條</h2>
<p class="muted">鏈輪與鏈條都是買現成的 #25 金屬件（節距 ${fmt(CHAIN_25.pitch)} mm），不用切齒形，製作包只列購買規格。</p>
<table id="chainBom"><thead><tr><th>品項</th><th>數量</th><th>規格</th></tr></thead><tbody>${rows}</tbody></table>
<ul>
${slotItems}
<li>張緊：先把從動軸的螺絲放鬆，把軸往遠離主動輪的方向推到鏈條稍微繃緊（用手壓鏈條中段，約下沉 1～2 mm），再鎖緊；鏈條不要裝太緊。</li>
<li>軸孔與轉接：買到的鏈輪軸孔大小依商品而定，請依實際孔徑配軸（或另購、列印轉接環）；馬達軸要用轉接頭固定在主動鏈輪，兩個鏈輪也要與鏈條在同一個平面。</li>
</ul>
`;
}

// 把鏈條段落放進製作包 HTML（CNC 注意事項之前）；沒有鏈傳動就原樣回傳。
export function addChainToBuildPack(html, comps, params, opts) {
  const section = chainBuildPackSection(comps, params, opts);
  if (!section) return html;
  const marker = '<h2>CNC 注意事項</h2>';
  return html.includes(marker) ? html.replace(marker, section + marker) : html.replace('</body>', section + '</body>');
}
