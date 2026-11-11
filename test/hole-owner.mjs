// Pack O3-D: selecting a hole / joint says whose it is (panel title) and marks the owning part(s) on the canvas (existing flash).
import {readFileSync} from 'node:fs';
import {check,report} from './_harness.mjs';
import {S} from '../js/blocks/state.js';
import {normalizeSnapshot} from '../js/blocks/schema.js';
import {readStoredProject} from '../js/blocks/project-envelope.js';
import {showHoleOwner} from '../js/blocks/hole-owner.js';
import {nodeLabel} from '../js/blocks/overlap-picker.js';

const w=normalizeSnapshot(readStoredProject(JSON.parse(readFileSync(new URL('./fixtures/delete-blocked.json',import.meta.url),'utf8'))));
Object.assign(S,{comps:w.comps,modules:[],topo:{...S.topo,params:w.params}});
const mkEditor=()=>{const title={textContent:'接點',dataset:{}};return {title,querySelector:s=>s==='.re-title'?title:null};};
const pick=(id,fresh=true)=>{S.selectedNodeId=id;const ed=mkEditor(),flashed=[];const r=showHoleOwner(S,ed,fresh,{flash:ids=>flashed.push(ids)});return {r,ed,flashed};};

let t=pick('Blank136.B');
check('共用接點：標題說明幾個零件共用',/^接點（2 個零件共用）$/.test(t.ed.title.textContent),t.ed.title.textContent);
check('共用接點：圖上標出全部共用的零件（閃示）',t.flashed.length===1&&t.flashed[0].length===2&&t.flashed[0].includes('Blank136')&&t.flashed[0].includes('Blank137'));
check('共用接點：滑過標題可看到是哪幾個零件，不含內部代號',/孔格桿件/.test(t.ed.title.title||'')&&!/Blank\d|P\d+s|_H\d/.test(t.ed.title.title+t.ed.title.textContent));
t=pick('Blank137_H8_0');
check('單一零件的孔：標題＝「零件名」第幾孔',t.ed.title.textContent===nodeLabel(S.comps,'Blank137_H8_0')&&/^「.+」/.test(t.ed.title.textContent)&&!/Blank\d|_H\d/.test(t.ed.title.textContent),t.ed.title.textContent);
check('單一零件的孔：圖上只標出所屬零件',t.flashed.length===1&&t.flashed[0].join()==='Blank137');
t=pick('Blank137_H8_0',false);
check('同一點重畫面板不重複閃示，但標題仍在',t.flashed.length===0&&!!t.ed.title.textContent);
t=pick('Blank133_H8_0');
check('板上的孔標出板件',t.flashed[0]?.join()==='Blank133'&&/^「.+」/.test(t.ed.title.textContent));
t=pick('no-such-point');
check('不屬於任何零件的點：不閃示、不壞',t.flashed.length===0&&t.ed.title.textContent==='接點');
report('hole-owner');
