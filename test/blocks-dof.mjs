import { analyzeDof } from '../js/blocks/dof.js';
import { BLOCK_EXAMPLES } from '../js/blocks/examples.js';

const exampleDof = id => {
  const example = BLOCK_EXAMPLES.find(item => item.id === id);
  if (!example) throw new Error(`Missing example: ${id}`);
  return analyzeDof(example.snapshot.comps).dof;
};

const cases = [
  ['fourbar-crank-rocker', 1],
  ['chebyshev-linkage', 1],
  ['slider-crank', 1],
  ['quick-return', 1],
  ['gear-pair', 1],
  ['rack-pinion', 1],
  ['gear-gripper', 1],
  ['cam-follower', 1],
  ['pulley-belt', 1],
  ['jansen-leg', 1],
  ['pantograph', 2],
];

cases.forEach(([id, expected]) => {
  const actual = exampleDof(id);
  if (actual !== expected) throw new Error(`${id}: expected DOF ${expected}, got ${actual}`);
});

const freeBar = [{ type: 'bar', id: 'Free', p1: { id: 'A', type: 'floating' }, p2: { id: 'B', type: 'floating' } }];
const fixedBar = [{ type: 'bar', id: 'Crank', p1: { id: 'O', type: 'fixed' }, p2: { id: 'A', type: 'floating' } }];
if (analyzeDof(freeBar).dof !== 3) throw new Error('A free bar should have DOF 3');
if (analyzeDof(fixedBar).dof !== 1) throw new Error('A grounded crank should have DOF 1');

console.log('blocks DOF checks passed');
