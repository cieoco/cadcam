// Generate static import maps from the actual Blocks ES module graph. No bundler.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://load.invalid/';
const BEGIN = '<!-- BEGIN GENERATED LOAD MAP -->', END = '<!-- END GENERATED LOAD MAP -->';
const read = (root, path) => readFileSync(resolve(root, path), 'utf8').replaceAll('\r\n', '\n');
const digest = s => createHash('sha256').update(s).digest('hex');

// Tokens suffice for literal import/export declarations and import(). Comments,
// quoted text and template text cannot manufacture fake imports.
export function tokensOf(source) {
  const tokens = []; let i = 0;
  function scan(stopAtBrace = false) {
  let braces = 0;
  while (i < source.length) {
    const start = i, c = source[i];
    if (stopAtBrace && c === '}' && braces === 0) { i++; return; }
    if (/\s/.test(c)) { i++; continue; }
    if (source.startsWith('//', i)) { i = source.indexOf('\n', i + 2); if (i < 0) break; continue; }
    if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); if (end < 0) throw new Error('Unclosed comment'); i = end + 2; continue; }
    if (c === '`') {
      const token = { type: 'string', value: '', start, end: 0 }; tokens.push(token); i++;
      while (i < source.length && source[i] !== '`') {
        if (source[i] === '\\') { i++; token.value += source[i++] || ''; }
        else if (source.startsWith('${', i)) { token.type = 'template'; i += 2; scan(true); }
        else token.value += source[i++];
      }
      if (i >= source.length) throw new Error(`Unclosed template at ${start}`);
      token.end = ++i; continue;
    }
    if (c === '"' || c === "'") {
      let value = ''; i++;
      while (i < source.length && source[i] !== c) {
        if (source[i] === '\\') { i++; value += source[i++] || ''; }
        else value += source[i++];
      }
      if (i >= source.length) throw new Error(`Unclosed string at ${start}`);
      i++; tokens.push({ type: 'string', value, start, end: i }); continue;
    }
    const prev = tokens.at(-1)?.value;
    if (c === '/' && (!prev || ['(', '[', '{', '=', ',', ':', ';', '!', '?', '>', 'return', 'throw', 'case', '&&', '||'].includes(prev))) {
      // Regex characters are data, including apostrophes and import-like words.
      i++; let inClass = false;
      while (i < source.length) {
        const r = source[i++];
        if (r === '\\') i++;
        else if (r === '[') inClass = true;
        else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) break;
      }
      while (/[a-z]/i.test(source[i] || '') && i < source.length) i++;
      tokens.push({ type: 'regex', value: '', start, end: i }); continue;
    }
    if (/[\w$]/.test(c)) { while (i < source.length && /[\w$]/.test(source[i])) i++; tokens.push({ type: 'word', value: source.slice(start, i), start, end: i }); continue; }
    if (c === '{') braces++; else if (c === '}') braces--;
    tokens.push({ type: 'punct', value: c, start, end: ++i });
  }
  }
  scan();
  return tokens;
}

export function moduleReferences(source, label = 'source') {
  const tokens = tokensOf(source), refs = [];
  const add = (t, kind) => refs.push({ specifier: t.value, start: t.start, end: t.end, kind });
  const fromClause = start => {
    let depth=0;
    for (let j=start;j<tokens.length;j++) {
      if (tokens[j].value===';') break;
      if (tokens[j].value==='{') depth++;
      else if (tokens[j].value==='}') depth--;
      else if (tokens[j].value==='from' && depth===0 && tokens[j+1]?.type==='string') return tokens[j+1];
    }
    return null;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i], next = tokens[i + 1];
    if (t.type !== 'word') continue;
    if (t.value === 'import' && tokens[i - 1]?.value !== '.') {
      if (next?.value === '.') continue; // import.meta
      if (next?.value === '(') {
        if (tokens[i + 2]?.type !== 'string') throw new Error(`${label}: computed import requires an explicit literal entry`);
        if (tokens[i + 3]?.value !== ')') {
          if (tokens[i + 3]?.value !== ',' || tokens[i + 4]?.value !== '{') throw new Error(`${label}: computed import requires an explicit literal entry`);
          let depth = 0, j = i + 4;
          for (; j < tokens.length; j++) {
            if (tokens[j].value === '{') depth++;
            else if (tokens[j].value === '}' && --depth === 0) break;
          }
          if (tokens[j + 1]?.value !== ')') throw new Error(`${label}: invalid import options`);
        }
        add(tokens[i + 2], 'import');
      } else if (next?.type === 'string') add(next, 'import');
      else if (next?.value === '{' || next?.value === '*' || next?.type === 'word') {
        const path=fromClause(i+1); if(path) add(path,'import');
      }
    } else if (t.value === 'export' && ['{', '*'].includes(next?.value)) {
      const path=fromClause(i+1); if(path) add(path,'import');
    } else if (t.value === 'moduleEntryUrl' && next?.value === '(' && tokens[i + 2]?.type === 'string') add(tokens[i + 2], 'helper-entry');
    else if (t.value === 'src' && tokens[i - 1]?.value === '.' && next?.value === '=') {
      let j = i + 2;
      if (tokens[j]?.value === 'new' && tokens[j + 1]?.value === 'URL' && tokens[j + 2]?.value === '(') j += 3;
      if (tokens[j]?.type === 'string' && /\.m?js(?:[?#]|$)/.test(tokens[j].value)) add(tokens[j], 'entry');
    }
  }
  return refs;
}

function localUrl(specifier, importer) {
  if (specifier === 'three') return new URL('js/vendor/three.module.js', BASE);
  if (!specifier.startsWith('.')) throw new Error(`${importer}: unsupported bare or external module ${specifier}`);
  const url = new URL(specifier, new URL(importer, BASE));
  if (url.origin !== new URL(BASE).origin || !url.pathname.endsWith('.js') && !url.pathname.endsWith('.mjs')) throw new Error(`${importer}: invalid module ${specifier}`);
  return url;
}
const pathOf = url => decodeURIComponent(url.pathname.slice(1));
const withoutVersion = url => { const out = new URL(url); out.searchParams.delete('v'); return out; };
function relativeUrl(url, page) {
  const path = posix.relative(posix.dirname(page), pathOf(url));
  return (path.startsWith('.') ? path : './' + path) + url.search + url.hash;
}

function scriptBlocks(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map(m => ({ attrs: m[1], body: m[2], index: m.index, full: m[0] }));
}
function plainPage(html, label) {
  const begin = html.split(BEGIN).length - 1, end = html.split(END).length - 1;
  if (begin !== end || begin > 1) throw new Error(`${label}: duplicate or broken generated load map`);
  let plain = html.replace(new RegExp(`${BEGIN}[\\s\\S]*?${END}\\n?`, 'g'), '');
  const maps = scriptBlocks(plain).filter(s => /\btype\s*=\s*["']importmap["']/i.test(s.attrs));
  if (begin && maps.length || maps.length > 1) throw new Error(`${label}: conflicting import maps`);
  // Initial adoption removes the single manually maintained map; no aliases are
  // copied from it. All aliases below come from real imports in actual sources.
  for (const map of maps) plain = plain.replace(map.full, '');
  return plain;
}
function pageRefs(html, page) {
  const refs = [];
  for (const script of scriptBlocks(html)) {
    if (!/\btype\s*=\s*["']module["']/i.test(script.attrs)) continue;
    const src = script.attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (src) refs.push({ specifier: src[1].startsWith('.') ? src[1] : './' + src[1], kind: 'entry' });
    else refs.push(...moduleReferences(script.body, page));
  }
  return refs;
}
function rewriteEntrySource(source, page, token) {
  const entries = moduleReferences(source, page).filter(r => r.kind === 'entry');
  for (const ref of entries.reverse()) {
    const url = withoutVersion(localUrl(ref.specifier, page));
    if (token) url.searchParams.set('v', token);
    source = source.slice(0, ref.start) + JSON.stringify(relativeUrl(url, page)) + source.slice(ref.end);
  }
  return source;
}
function rewriteEntries(html, page, token) {
  // Entry src is not redirected by import maps. Strip only the generated cache
  // parameter for hashing; other query parameters and anchors are preserved.
  for (const script of scriptBlocks(html).reverse()) {
    if (!/\btype\s*=\s*["']module["']/i.test(script.attrs)) continue;
    const attrs = script.attrs.replace(/(\bsrc\s*=\s*)(["'])([^"']+)\2/i, (_, prefix, quote, src) => {
      const url = withoutVersion(localUrl(src.startsWith('.') ? src : './' + src, page));
      if (token) url.searchParams.set('v', token);
      return prefix + quote + relativeUrl(url, page) + quote;
    });
    const body = rewriteEntrySource(script.body, page, token);
    const replacement = `<script${attrs}>${body}</script>`;
    html = html.slice(0, script.index) + replacement + html.slice(script.index + script.full.length);
  }
  return html;
}

export function buildLoadGraph(root = ROOT) {
  const pages = new Map(), sources = new Map(), aliases = new Set(), pending = [];
  const rootPages = readdirSync(root).filter(p => p.endsWith('.html') && p !== 'mechanism.html');
  const testPages = readdirSync(resolve(root, 'test')).filter(p => p.endsWith('.html')).map(p => `test/${p}`);
  for (const page of [...rootPages, ...testPages].sort()) {
    const raw = read(root, page), plain = plainPage(raw, page);
    if (!scriptBlocks(plain).some(s => /\btype\s*=\s*["']module["']/i.test(s.attrs))) continue;
    // Blocks pages, current teaching/version pages, and HTTP acceptance pages.
    if (!page.startsWith('test/') && !/js\/(blocks\/|version-info\.js)/.test(plain)) continue;
    const normalized = rewriteEntries(plain, page);
    pages.set(page, normalized);
    for (const ref of pageRefs(normalized, page)) pending.push({ ...ref, importer: page });
  }
  for (const dir of ['js/blocks', 'js/blocks3d']) {
    for (const name of readdirSync(resolve(root, dir)).filter(p => p.endsWith('.js')).sort()) pending.push({ specifier: './' + name, importer: `${dir}/_root.js`, kind: 'import' });
  }
  pending.push({ specifier: './js/load-graph.js', importer: '_root.js', kind: 'import' });
  while (pending.length) {
    const ref = pending.shift(), url = localUrl(ref.specifier, ref.importer), path = pathOf(url);
    if (ref.kind === 'import' && ([...url.searchParams.keys()].some(k => k !== 'v') || url.hash))
      throw new Error(`${ref.importer}: semantic query/fragment cannot share a module identity: ${ref.specifier}`);
    if (!existsSync(resolve(root, path)) && path !== 'js/load-graph.js') throw new Error(`${ref.importer}: missing module ${path}`);
    // Both queryless and every actual literal query alias resolve to one URL.
    aliases.add(new URL(path, BASE).href); aliases.add(url.href);
    if (sources.has(path)) continue;
    const source = path === 'js/load-graph.js' ? '// generated graph token\n' : rewriteEntrySource(read(root, path), path);
    sources.set(path, source);
    try { for (const dependency of moduleReferences(source, path)) pending.push({ ...dependency, importer: path }); }
    catch(error) { throw new Error(`${path}: ${error.message}`); }
  }
  const generator = read(root, 'tools/load-graph.mjs');
  const hashInput = [...sources, ...pages].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([p, text]) => [p, text]);
  const token = digest(JSON.stringify([generator, hashInput])).slice(0, 20);
  const imports = {};
  for (const href of [...aliases].sort()) {
    const key = new URL(href), target = withoutVersion(key); target.searchParams.set('v', token);
    imports[href] = target.href;
  }
  imports.three = new URL(`js/vendor/three.module.js?v=${token}`, BASE).href;
  const outputs = new Map();
  for (const [page, html] of pages) {
    const mapped = Object.fromEntries(Object.entries(imports).map(([key, value]) => [key === 'three' ? key : relativeUrl(new URL(key), page), relativeUrl(new URL(value), page)]));
    const region = `${BEGIN}\n<script type="importmap" data-load-graph="${token}">\n${JSON.stringify({ imports: mapped }, null, 2)}\n</script>\n${END}\n`;
    const scripts = scriptBlocks(html), firstModule = scripts.find(s => /\btype\s*=\s*["']module["']/i.test(s.attrs));
    let result = html.slice(0, firstModule.index) + region + html.slice(firstModule.index);
    result = rewriteEntries(result, page, token);
    outputs.set(page, result);
  }
  for (const [path, source] of sources) if (path !== 'js/load-graph.js' && moduleReferences(source, path).some(r=>r.kind==='entry'))
    outputs.set(path, rewriteEntrySource(source,path,token));
  outputs.set('js/load-graph.js', `// Generated by node tools/load-graph.mjs; do not edit.\nexport const LOAD_GRAPH_TOKEN = '${token}';\n`);
  outputs.set('js/load-graph.json', JSON.stringify({ version: 1, token, modules: [...sources.keys()].sort(), pages: [...pages.keys()], imports }, null, 2) + '\n');
  return { token, sources, pages, imports, outputs };
}

export function syncLoadGraph(root = ROOT, check = false) {
  const graph = buildLoadGraph(root), stale = [];
  for (const [path, content] of graph.outputs) {
    if (!existsSync(resolve(root, path)) || read(root, path) !== content) {
      if (check) stale.push(path); else writeFileSync(resolve(root, path), content);
    }
  }
  if (stale.length) throw new Error(`Stale generated load graph: ${stale.join(', ')}. Run node tools/load-graph.mjs`);
  return graph;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2); if (args.some(a => a !== '--check')) throw new Error('Usage: node tools/load-graph.mjs [--check]');
    const graph = syncLoadGraph(ROOT, args.includes('--check'));
    console.log(`Load graph ${graph.token}: ${graph.sources.size} modules, ${graph.pages.size} pages (${args.length ? 'checked' : 'generated'})`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
