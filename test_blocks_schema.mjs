/**
 * blocks schema / examples smoke test.
 * Run: node test_blocks_schema.mjs
 */
import { BLOCK_EXAMPLES } from './js/blocks/examples.js';
import { normalizeSnapshot, toSnapshot } from './js/blocks/schema.js';
import { compileTopology } from './js/core/topology.js';
import { solveTopology } from './js/multilink/solver.js';

let pass = 0;
let fail = 0;

const ok = (name, cond) => {
  if (cond) {
    pass += 1;
    console.log('  PASS', name);
  } else {
    fail += 1;
    console.log('  FAIL', name);
  }
};

for (const example of BLOCK_EXAMPLES) {
  const norm = normalizeSnapshot(example.snapshot);
  ok(`${example.id} normalizes`, !!norm);
  if (!norm || norm.comps.length === 0) continue;

  const compiled = compileTopology(norm.comps, { params: norm.params, tracePoint: '' }, new Set());
  const solved = solveTopology(compiled, { thetaDeg: 0 });
  ok(`${example.id} compiles to steps`, compiled.steps.length > 0);
  ok(`${example.id} solves at 0deg`, solved && solved.isValid !== false);
}

const messy = normalizeSnapshot({
  kind: 'blocks',
  v: 1,
  counter: 0,
  comps: [{
    type: 'bar',
    id: 'LinkX',
    color: 'bad',
    p1: { id: 'P1', x: 0, y: 0 },
    p2: { id: 'P2', x: 29, y: 0 },
    lenParam: 'LLX',
    fixedLen: true
  }],
  params: { LLX: 29 }
});
ok('schema accepts UI bar shape', messy && messy.comps.length === 1);
ok('schema snaps fixed link length to LEGO pitch', messy && messy.params.LLX === 32);
ok('schema repairs invalid color', messy && messy.comps[0].color === '#3498db');

const snap = toSnapshot(messy.comps, { params: messy.params }, messy.counter);
ok('toSnapshot writes blocks kind', snap.kind === 'blocks' && snap.v === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

