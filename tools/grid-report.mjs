// 內建範例的 8 mm 孔格離格報告（docs/SDD-GRID-BLOCKS.md G1）。只讀，不改範例。
// 跑法：node tools/grid-report.mjs [輸出資料夾，預設 output/grid-blocks]
import { mkdirSync, writeFileSync } from 'node:fs';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';
import { normalizeSnapshot } from '../js/blocks/schema.js';
import { gridIssues, GRID_PITCH_MM } from '../js/blocks/grid-rule.js';

const outDir = process.argv[2] || 'output/grid-blocks';
const rows = BLOCK_EXAMPLES.map(ex => {
  const norm = normalizeSnapshot(ex.snapshot);
  const issues = norm ? gridIssues(norm.comps, norm.params, norm.modules ? { modules: norm.modules } : undefined) : null;
  return { id: ex.id, title: ex.title || ex.name || ex.label || '', parts: norm?.comps.length || 0, issues };
});
const byRule = {};
rows.forEach(r => (r.issues || []).forEach(i => { byRule[i.rule] = (byRule[i.rule] || 0) + 1; }));
const clean = rows.filter(r => r.issues && !r.issues.length);
const md = [
  `# 內建範例 ${GRID_PITCH_MM} mm 孔格報告`, '',
  `範例 ${rows.length} 個；全部在格上 ${clean.length} 個；有離格項目 ${rows.length - clean.length} 個。`,
  `離格項目依規則：${Object.entries(byRule).map(([k, v]) => `${k} ${v}`).join('、') || '無'}。`, '',
  '| 範例 | 零件數 | 離格項目 |', '| --- | --- | --- |',
  ...rows.map(r => `| ${r.id}${r.title ? ` ${r.title}` : ''} | ${r.parts} | ${r.issues === null ? '無法正規化' : r.issues.length ? r.issues.map(i => `${i.componentId || i.type}（${i.rule}）${i.message}`).join('<br>') : '—'} |`), ''
].join('\n');
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/report.md`, md);
writeFileSync(`${outDir}/report.json`, JSON.stringify(rows, null, 2));
console.log(md.split('\n').slice(0, 4).join('\n'));
