// Prove that failed, crashed and timed-out scripts cannot produce a green gate.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSuite, validateManifest } from '../tools/test-runner.mjs';

const root = mkdtempSync(join(tmpdir(), 'cadcam-runner-'));
try {
  mkdirSync(join(root, 'test'));
  const scripts = { pass: "console.log('ok');", fail: 'process.exit(1);', crash: "throw new Error('fixture crash');", timeout: 'setInterval(() => {}, 1000);' };
  for (const [name, code] of Object.entries(scripts)) writeFileSync(join(root, `test/${name}.mjs`), code);
  const manifest = { version: 1, timeoutMs: 1000, tests: Object.keys(scripts).map(name => `test/${name}.mjs`), excluded: [] };
  const report = runSuite({ root, manifest, outputDir: join(root, 'logs') });
  assert.deepEqual(report.results.map(r => r.status), ['pass', 'fail', 'fail', 'timeout']);
  assert.equal(report.passed, 1);
  assert.ok(readFileSync(join(root, 'logs/test_crash.mjs.log'), 'utf8').includes('fixture crash'));
  assert.equal(JSON.parse(readFileSync(join(root, 'logs/results.json'), 'utf8')).total, 4);
  writeFileSync(join(root, 'test/new.mjs'), '');
  assert.throws(() => validateManifest(root, manifest), /inventory mismatch/);
  assert.throws(() => validateManifest(root, { ...manifest, tests: [...manifest.tests, manifest.tests[0]] }), /Duplicate/);
  assert.throws(() => runSuite({ root, manifest: { ...manifest, tests: [...manifest.tests, 'test/new.mjs'] }, outputDir: join(root, 'logs'), selected: ['test/unknown.mjs'] }), /Unknown selected/);
} finally { rmSync(root, { recursive: true, force: true }); }
console.log('runner-contract: failed, crashed, timed out and unlisted scripts block the gate');
