#!/usr/bin/env node
// Reference-integrity checker for the denier-game repo.
//
// Walks the static dependency graph starting from index.html and reports:
//   1. BROKEN   — a reference (import / <script> / <link> / url() / asset
//                 string / getElementById) whose target does not exist
//   2. DEAD     — a file under js|css|assets|vendor that nothing reachable
//                 references (excludes intentional entry points + docs)
//   3. DOM-GAP  — an id passed to getElementById/requireEl in JS that has no
//                 matching id="..." in index.html (or vice-versa)
//
// No dependencies; run with:  node tools/check-references.mjs
// Exit code 0 = clean, 1 = problems found. Safe/read-only.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => relative(ROOT, p) || '.';

// --- Files that are legitimately unreferenced by the static graph ---
const ENTRY_HTML = 'index.html';
// Reachable-but-dynamic or intentionally-standalone; never flag as dead.
const DEAD_ALLOWLIST = new Set([
  'js/renderer.js',      // classic fallback, dynamically imported
  'js/dom-ui.js',        // imported by main.js (static) — belt & suspenders
]);
// Directories whose contents participate in the graph.
const GRAPH_DIRS = ['js', 'css', 'assets', 'vendor'];
// Extensions we treat as graph nodes.
const CODE_EXT = /\.(m?js|css)$/;
const ASSET_EXT = /\.(png|jpe?g|svg|webp|gif|avif|mp3|ogg|wav|woff2?|ttf|otf)$/i;

let importmap = {}; // bare specifier -> path

function read(p) { return readFileSync(p, 'utf8'); }

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

// --- Reference extraction ---------------------------------------------------

function parseImportmap(html) {
  const m = html.match(/<script[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return {};
  try { return JSON.parse(m[1]).imports || {}; }
  catch (e) { console.error('  ! importmap is not valid JSON:', e.message); return {}; }
}

// Resolve a specifier -> absolute path. Resolution base depends on ref kind:
//   - JS import        : relative (./,../,/) is module-relative; bare -> importmap
//   - HTML src/href    : document-relative (fromFile dir = ROOT for index.html)
//   - CSS url()        : relative to the stylesheet file
//   - JS asset literal : document-relative to ROOT (as the browser loads them)
function resolveSpecifier(spec, fromFile, kind) {
  const abs = (base, s) => resolve(base, s.replace(/^\//, ''));

  if (kind === 'import' || kind === 'dynamic-import') {
    if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) {
      return abs(spec.startsWith('/') ? ROOT : dirname(fromFile), spec);
    }
    if (importmap[spec]) return abs(ROOT, importmap[spec].replace(/^\.\//, ''));
    for (const [key, val] of Object.entries(importmap)) {
      if (key.endsWith('/') && spec.startsWith(key)) {
        return abs(ROOT, val.replace(/^\.\//, '') + spec.slice(key.length));
      }
    }
    return null; // unresolved bare specifier (a real npm dep — none expected here)
  }

  if (kind === 'asset') return abs(ROOT, spec.replace(/^\.\.?\//, ''));
  // html / css-url: relative to the referencing file's directory
  if (spec.startsWith('/')) return abs(ROOT, spec);
  return resolve(dirname(fromFile), spec);
}

function extractHtmlRefs(html, fromFile) {
  const refs = [];
  for (const m of html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/gi)) refs.push(m[1]);
  for (const m of html.matchAll(/<link[^>]*\shref=["']([^"']+)["']/gi)) refs.push(m[1]);
  return refs
    .filter((s) => !/^https?:\/\//.test(s))
    .map((s) => ({ spec: s, target: resolveSpecifier(s, fromFile, 'html'), kind: 'html' }));
}

function extractJsRefs(src, fromFile) {
  const refs = [];
  const add = (spec, kind) => {
    if (/^https?:\/\//.test(spec)) return;
    refs.push({ spec, target: resolveSpecifier(spec, fromFile, kind), kind });
  };
  // static + dynamic imports, export-from
  for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']/g)) add(m[1], 'import');
  for (const m of src.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) add(m[1], 'dynamic-import');
  // asset string literals (any path that looks like a repo asset)
  for (const m of src.matchAll(/["'`]((?:\.\.\/|\.\/|\/)?assets\/[^"'`]+?\.[a-z0-9]{2,5})["'`]/gi)) {
    add(m[1], 'asset');
  }
  return refs;
}

function extractCssRefs(src, fromFile) {
  const refs = [];
  for (const m of src.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/g)) {
    const s = m[1].trim();
    if (/^(https?:|data:)/.test(s)) continue;
    // Skip fragment refs / url-encoded fragments nested inside data-URI SVGs
    // (e.g. filter='url(%23n)' inside the film-grain data URI).
    if (/^(#|%23)/.test(s)) continue;
    refs.push({ spec: s, target: resolveSpecifier(s, fromFile, 'css-url'), kind: 'css-url' });
  }
  return refs;
}

function extractRefs(file) {
  const src = read(file);
  if (file.endsWith('.html')) return extractHtmlRefs(src, file);
  if (file.endsWith('.css')) return extractCssRefs(src, file);
  if (/\.m?js$/.test(file)) return extractJsRefs(src, file);
  return [];
}

// --- DOM id cross-check -----------------------------------------------------

function checkDomIds(problems) {
  const html = read(join(ROOT, ENTRY_HTML));
  const htmlIds = new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]));
  const jsFiles = listFiles(join(ROOT, 'js'));
  const referenced = new Map(); // id -> file
  for (const f of jsFiles) {
    const src = read(f);
    for (const m of src.matchAll(/(?:getElementById|requireEl)\(\s*["']([^"']+)["']\s*\)/g)) {
      if (!referenced.has(m[1])) referenced.set(m[1], f);
    }
  }
  for (const [id, file] of referenced) {
    if (!htmlIds.has(id)) {
      problems.push(`DOM-GAP  #${id} used in ${r(file)} but no id="${id}" in ${ENTRY_HTML}`);
    }
  }
}

// --- Graph walk -------------------------------------------------------------

function main() {
  const html = read(join(ROOT, ENTRY_HTML));
  importmap = parseImportmap(html);

  const problems = [];
  const reachable = new Set();
  const queue = [join(ROOT, ENTRY_HTML)];

  while (queue.length) {
    const file = queue.shift();
    if (reachable.has(file)) continue;
    if (!existsSync(file)) continue;
    if (statSync(file).isDirectory()) continue;
    reachable.add(file);

    // Only code/html files have outgoing refs worth following.
    if (!/\.(m?js|css|html)$/.test(file)) continue;

    for (const { spec, target, kind } of extractRefs(file)) {
      if (target === null) {
        problems.push(`BROKEN   ${r(file)} -> "${spec}" (${kind}) unresolved specifier`);
        continue;
      }
      if (!existsSync(target)) {
        problems.push(`BROKEN   ${r(file)} -> "${spec}" (${kind}) => missing ${r(target)}`);
        continue;
      }
      queue.push(target);
    }
  }

  // Dead-file detection
  const allGraphFiles = [];
  for (const d of GRAPH_DIRS) allGraphFiles.push(...listFiles(join(ROOT, d)));
  const dead = [];
  for (const f of allGraphFiles) {
    if (!CODE_EXT.test(f) && !ASSET_EXT.test(f)) continue;
    if (reachable.has(f)) continue;
    if (DEAD_ALLOWLIST.has(r(f))) continue;
    dead.push(r(f));
  }

  checkDomIds(problems);

  // --- Report ---
  console.log(`\n=== reference check: ${r(join(ROOT, ENTRY_HTML))} graph ===`);
  console.log(`reachable files: ${reachable.size}`);

  if (problems.length) {
    console.log(`\n✗ ${problems.length} PROBLEM(S):`);
    for (const p of problems.sort()) console.log('  ' + p);
  } else {
    console.log('\n✓ no broken references or DOM gaps');
  }

  if (dead.length) {
    console.log(`\n⚠ ${dead.length} DEAD FILE(S) (present but unreachable from ${ENTRY_HTML}):`);
    for (const d of dead.sort()) console.log('  ' + d);
  } else {
    console.log('✓ no dead files');
  }

  console.log('');
  const fatal = problems.length; // dead files are warnings, not failures
  process.exit(fatal ? 1 : 0);
}

main();
