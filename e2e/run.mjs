#!/usr/bin/env node
/**
 * Gemeinsamer Testbefehl: `npm test` (bzw. `npm run test:e2e`).
 *
 *   npm test                      alle Tests (inkl. Produktions-Build mit TypeScript-Check)
 *   npm test -- furniture history nur Suiten, deren Dateiname einen der Begriffe enthält
 *   npm test -- --no-build        vorhandenen Build (dist/) verwenden
 *   npm test -- --verbose         alle Einzelergebnisse ausgeben (sonst nur Fehler)
 *
 * Browser: vorhandenes Chromium – E2E_CHROME=/pfad/zum/chrome, sonst automatische Suche
 * (Playwright-Cache, installiertes Chrome/Chromium). Screenshots: e2e/.output/<suite>/.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(E2E_DIR);
const OUTPUT_DIR = path.join(E2E_DIR, '.output');
const VITE = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const SUITE_TIMEOUT_MS = 10 * 60 * 1000;

/** Reihenfolge = Ausführungsreihenfolge. `server`: gegen welchen Server die Suite läuft. */
const SUITES = [
  { file: 'unit/collision-geometry.test.ts', name: 'Kollisionsgeometrie (Unit)', server: null },
  { file: 'suites/room-geometry.mjs', name: 'Raumgeometrie (Unit, Dev-Module)', server: 'dev' },
  { file: 'suites/room-views.mjs', name: 'Raum, 2D/3D (Produktions-Build)', server: 'preview' },
  { file: 'suites/openings.mjs', name: 'Türen & Fenster', server: 'dev' },
  { file: 'suites/openings-drag.mjs', name: 'Drag & Drop Türen/Fenster', server: 'dev' },
  { file: 'suites/furniture.mjs', name: 'Möbel', server: 'dev' },
  { file: 'suites/furniture-drag.mjs', name: 'Drag & Drop Möbel', server: 'dev' },
  { file: 'suites/collision.mjs', name: 'Kollisionen', server: 'dev' },
  { file: 'suites/walls-3d.mjs', name: 'Kameraabhängige Wände', server: 'dev' },
  { file: 'suites/history.mjs', name: 'Undo/Redo', server: 'dev' },
  { file: 'suites/projects.mjs', name: 'Lokale Projekte', server: 'dev' },
  { file: 'suites/design.mjs', name: 'Gestaltung', server: 'dev' },
  { file: 'suites/furniture-library.mjs', name: 'Möbelbibliothek', server: 'dev' },
  { file: 'suites/furniture-clearance.mjs', name: 'Abstandsmaße', server: 'dev' },
  { file: 'suites/editing.mjs', name: 'Bearbeiten, Mehrfachauswahl & Gruppen', server: 'dev' },
  { file: 'suites/room-objects.mjs', name: 'Raumobjekte, Türanschlag & Fensterarten', server: 'dev' },
  { file: 'suites/room-shapes.mjs', name: 'Freie Raumformen & Grundriss-Editor', server: 'dev' },
  { file: 'suites/appearance.mjs', name: 'Gestaltung, Decke, Licht & Vorschau', server: 'dev' },
  { file: 'suites/lamps.mjs', name: 'Lampen & Möbelfarben', server: 'dev' },
  { file: 'suites/visual-scenes.mjs', name: 'Visuelle Szenen', server: 'dev' },
  { file: 'suites/performance.mjs', name: 'Performance (Rerenders)', server: 'dev' },
  { file: 'suites/export.mjs', name: 'Export (PNG, PDF, Projektdatei)', server: 'dev' },
  { file: 'suites/mobile.mjs', name: 'Mobile, Tablet & Touch', server: 'dev' },
  { file: 'suites/robustness.mjs', name: 'Fehlerbehandlung & Robustheit', server: 'dev' },
  { file: 'suites/accessibility.mjs', name: 'Accessibility', server: 'dev' },
  { file: 'suites/migrations.mjs', name: 'Speicherkompatibilität (Format 1–5)', server: 'dev' },
  { file: 'suites/visual-final.mjs', name: 'Visuelle Endabnahme (5 Projekte × 3 Geräte)', server: 'dev' },
];

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const skipBuild = args.includes('--no-build');
const filters = args.filter((a) => !a.startsWith('--'));
const selected = SUITES.filter(
  (s) => fs.existsSync(path.join(E2E_DIR, s.file)) && (filters.length === 0 || filters.some((f) => s.file.includes(f))),
);

const children = new Set();
function run(command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, { cwd: ROOT, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}
function cleanup() {
  for (const child of children) child.kill('SIGTERM');
}
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { cleanup(); process.exit(130); });

function findChrome() {
  const explicit = process.env.E2E_CHROME ?? process.env.CHROME;
  if (explicit) return explicit;
  const caches = [path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'), path.join(os.homedir(), '.cache', 'ms-playwright')];
  const relative = [
    ['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
    ['chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
    ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
    ['chrome-linux', 'chrome'],
    ['chrome-linux64', 'chrome'],
    ['chrome-win', 'chrome.exe'],
  ];
  for (const cache of caches) {
    if (!fs.existsSync(cache)) continue;
    const builds = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const build of builds) {
      for (const parts of relative) {
        const candidate = path.join(cache, build, ...parts);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  const system = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return system.find((p) => fs.existsSync(p)) ?? null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function startServer(kind) {
  const port = await freePort();
  const child = run(process.execPath, [VITE, ...(kind === 'preview' ? ['preview'] : []), '--port', String(port), '--strictPort', '--host', '127.0.0.1']);
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${kind}-Server beendet:\n${log}`);
    try {
      const res = await fetch(url);
      if (res.ok && (await res.text()).includes('Raumplaner')) return url;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${kind}-Server nicht erreichbar:\n${log}`);
}

function runProcess(command, commandArgs, env, onLine) {
  return new Promise((resolve) => {
    const child = run(command, commandArgs, { env });
    let buffer = '';
    const handle = (data) => {
      buffer += data;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(onLine);
    };
    child.stdout.on('data', handle);
    child.stderr.on('data', handle);
    const timer = setTimeout(() => child.kill('SIGTERM'), SUITE_TIMEOUT_MS);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (buffer) onLine(buffer);
      resolve(code ?? 1);
    });
  });
}

const started = Date.now();
if (selected.length === 0) {
  console.error('Keine passenden Test-Suiten gefunden.');
  process.exit(1);
}

const needsPreview = selected.some((s) => s.server === 'preview');
const needsDev = selected.some((s) => s.server === 'dev');
const chrome = needsPreview || needsDev ? findChrome() : null;
if ((needsPreview || needsDev) && !chrome) {
  console.error('Kein Chromium gefunden. Bitte E2E_CHROME=/pfad/zu/chrome setzen.');
  process.exit(1);
}

if (needsPreview && !skipBuild) {
  console.log('▸ Build (TypeScript + Vite) …');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const lines = [];
  const code = await runProcess(npm, ['run', 'build'], {}, (l) => lines.push(l));
  if (code !== 0) {
    console.error(lines.join('\n'));
    console.error('✗ Build fehlgeschlagen.');
    process.exit(1);
  }
  console.log('  ✓ Build erfolgreich');
}

const urls = {};
try {
  if (needsPreview) urls.preview = await startServer('preview');
  if (needsDev) urls.dev = await startServer('dev');
} catch (error) {
  console.error(String(error));
  process.exit(1);
}
if (chrome) console.log(`▸ Browser: ${chrome}`);

const summary = [];
for (const suite of selected) {
  const out = path.join(OUTPUT_DIR, path.basename(suite.file).replace(/\.(test\.ts|mjs)$/, ''));
  fs.mkdirSync(out, { recursive: true });
  console.log(`\n▸ ${suite.name}`);
  const failures = [];
  let tally = null;
  const suiteStart = Date.now();
  const nodeArgs = suite.file.endsWith('.ts') ? ['--experimental-strip-types', '--no-warnings'] : [];
  const code = await runProcess(
    process.execPath,
    [...nodeArgs, path.join(E2E_DIR, suite.file)],
    { OUT: out, CHROME: chrome ?? '', E2E_DEV_URL: urls.dev ?? '', E2E_PREVIEW_URL: urls.preview ?? '' },
    (line) => {
      const match = /(\d+)\/(\d+) (?:Tests )?bestanden/.exec(line);
      if (match) tally = { passed: Number(match[1]), total: Number(match[2]) };
      if (line.startsWith('FAIL') || /Error|TypeError/.test(line)) failures.push(line);
      if (verbose || line.startsWith('FAIL') || /Error/.test(line)) console.log(`  ${line}`);
    },
  );
  const ok = code === 0 && tally && tally.passed === tally.total;
  summary.push({ suite, ok, tally, seconds: (Date.now() - suiteStart) / 1000 });
  console.log(`  ${ok ? '✓' : '✗'} ${tally ? `${tally.passed}/${tally.total}` : 'abgebrochen'} (${((Date.now() - suiteStart) / 1000).toFixed(0)} s)`);
}

cleanup();
const passed = summary.reduce((n, s) => n + (s.tally?.passed ?? 0), 0);
const total = summary.reduce((n, s) => n + (s.tally?.total ?? 0), 0);
const failedSuites = summary.filter((s) => !s.ok);
console.log('\n──────────────────────────────────────────────');
for (const s of summary) console.log(`${s.ok ? '✓' : '✗'} ${s.suite.name.padEnd(36)} ${s.tally ? `${s.tally.passed}/${s.tally.total}` : '–'}`);
console.log('──────────────────────────────────────────────');
console.log(`${failedSuites.length ? '✗' : '✓'} ${passed}/${total} Tests bestanden in ${summary.length} Suiten (${((Date.now() - started) / 1000).toFixed(0)} s)`);
process.exit(failedSuites.length ? 1 : 0);
