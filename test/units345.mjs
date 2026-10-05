import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { getExample } from '../js/blocks/examples.js';
import { rackGuideTravel } from '../js/blocks/rack-limits.js';
let links=0;
for (const name of ['index.html','teaching.html','teaching-slider.html','teaching-gears.html','teaching-rack.html','teaching-assembly.html']) {
 const html=readFileSync(new URL('../'+name,import.meta.url),'utf8');
 for (const [,href] of html.matchAll(/href="([^"#]+)"/g)) {
  if (/^https?:/.test(href)) continue;
  const url=new URL(href,'http://local/');
  assert.ok(existsSync(new URL('..'+url.pathname,import.meta.url)),`${name}: missing ${href}`);
  if(url.searchParams.has('example')) assert.ok(getExample(url.searchParams.get('example')),`${name}: unknown example`);
  links++;
 }
}
assert.equal(getExample('gear-pair').snapshot.comps[0].teeth,15);
assert.equal(getExample('gear-pair').snapshot.comps[1].teeth,20);
const lift=getExample('competition-rack-lift').snapshot;
const rack=lift.comps.find(c=>c.type==='rack');
assert.equal(rack.slot.length,144);
assert.equal(rack.slot.width,3.4);
assert.ok(Math.abs(rackGuideTravel(144,3.4).travel-117.56)<1e-8);
assert.ok(Math.abs(rackGuideTravel(128,3.4).travel-104.12)<1e-8);
console.log(`units345: ${links} local links and example IDs valid`);
