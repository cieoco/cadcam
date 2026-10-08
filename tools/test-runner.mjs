// Zero-npm acceptance runner. Every script gets its own process and file log.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export function validateManifest(root, manifest) {
  if (manifest.version !== 1 || !Array.isArray(manifest.tests) || !manifest.tests.length
    || !Number.isInteger(manifest.timeoutMs) || manifest.timeoutMs < 1) throw new Error('Invalid test manifest');
  const paths = [...manifest.tests, ...(manifest.excluded || []).map(e => e.path)];
  if (new Set(paths).size !== paths.length) throw new Error('Duplicate manifest entry');
  for (const path of paths) {
    if (!/^(test\/[^/]+\.mjs|test_[^/]+\.(mjs|js))$/.test(path) || !existsSync(resolve(root, path)))
      throw new Error(`Invalid or missing entry: ${path}`);
  }
  if ((manifest.excluded || []).some(e => !e.reason || !e.path.startsWith('test/_')))
    throw new Error('Only imported underscore helpers may be excluded, with a reason');
  if (manifest.tests.some(p => p.startsWith('test/_'))) throw new Error('Helper listed as executable test');
  const inventory = [
    ...readdirSync(resolve(root, 'test')).filter(p => p.endsWith('.mjs')).map(p => `test/${p}`),
    ...readdirSync(root).filter(p => /^test_[^/]+\.(mjs|js)$/.test(p))
  ].sort();
  if (JSON.stringify([...paths].sort()) !== JSON.stringify(inventory))
    throw new Error(`Manifest inventory mismatch: ${inventory.filter(p => !paths.includes(p)).join(', ') || 'stale entry'}`);
}

export function runSuite({ root, manifest, outputDir, selected = manifest.tests }) {
  validateManifest(root, manifest);
  if (selected.some(p => !manifest.tests.includes(p))) throw new Error('Unknown selected test');
  mkdirSync(outputDir, { recursive: true });
  const nodeArgs = process.allowedNodeEnvironmentFlags.has('--no-experimental-webstorage') ? ['--no-experimental-webstorage'] : [];
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim() || null;
  const dirty = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).stdout?.trim() || '';
  const results = [];
  for (const path of selected) {
    const start = Date.now();
    const result = spawnSync(process.execPath, [...nodeArgs, path], {
      cwd: root, encoding: 'utf8', timeout: manifest.timeoutMs, maxBuffer: 32 * 1024 * 1024
    });
    const log = `${path.replaceAll('/', '_')}.log`;
    writeFileSync(resolve(outputDir, log), (result.stdout || '') + (result.stderr || '') + (result.error ? `\n${result.error.message}\n` : ''));
    const status = result.error?.code === 'ETIMEDOUT' ? 'timeout' : result.status === 0 && !result.error ? 'pass' : 'fail';
    results.push({ path, status, exitCode: result.status, signal: result.signal, durationMs: Date.now() - start, log });
    if (status !== 'pass') console.error(`${status.toUpperCase()} ${path} — ${log}`);
  }
  const report = {
    version: 1, commit, trackedChanges: !!dirty, node: process.version, platform: process.platform,
    nodeArgs, manifestSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
    command: [process.execPath, ...process.argv.slice(1)], total: results.length,
    passed: results.filter(r => r.status === 'pass').length, results
  };
  writeFileSync(resolve(outputDir, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Acceptance: ${report.passed}/${report.total} passed (${process.version}); results: ${relative(root, resolve(outputDir, 'results.json'))}`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const manifest = JSON.parse(readFileSync(resolve(root, 'test/manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
    let outputDir = resolve(root, 'output/acceptance'), selected = [];
    for (let i = 2; i < process.argv.length; i++) {
      if (process.argv[i] === '--output' && process.argv[i + 1]) outputDir = resolve(root, process.argv[++i]);
      else if (process.argv[i] === '--test' && process.argv[i + 1]) selected.push(process.argv[++i]);
      else throw new Error(`Unknown or incomplete argument: ${process.argv[i]}`);
    }
    if (selected.some(p => !manifest.tests.includes(p))) throw new Error('Unknown selected test');
    const report = runSuite({ root, manifest, outputDir, selected: selected.length ? manifest.tests.filter(p => selected.includes(p)) : manifest.tests });
    process.exitCode = report.passed === report.total ? 0 : 1;
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
