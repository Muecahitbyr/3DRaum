import { chromium } from 'playwright-core';
import { item, openScene, project, rectangleWalls } from '../lib/scenes.mjs';

/**
 * Performance: keine React-Rerenders pro Frame. Gezählt werden React-Commits über den
 * DevTools-Hook (react-dom und R3F-Renderer), während sich die 3D-Kamera bewegt
 * (kameraabhängiges Ausblenden läuft je Frame ohne React) und beim Ziehen einer Ecke.
 */
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  window.__commits = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer) { const id = this.renderers.size + 1; this.renderers.set(id, renderer); return id; },
    onCommitFiberRoot() { window.__commits++; },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  };
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(1200);
const settle = (ms = 200) => page.waitForTimeout(ms);

await page.getByTestId('room-panel').getByTestId('room-shape').getByRole('button', { name: 'L-Form', exact: true }).click(); await settle(1000);

// 1. 3D: Kamera kreist 90 Frames um den Raum – Wände blenden aus/ein.
const orbit = await page.evaluate(async () => {
  const s = window.__PLANNER_R3F__();
  const start = window.__commits;
  let frames = 0;
  const t0 = performance.now();
  await new Promise((resolve) => {
    const step = () => {
      const a = (frames / 90) * Math.PI * 2;
      s.camera.position.set(Math.cos(a) * 9, 4, Math.sin(a) * 9);
      s.camera.lookAt(0, 0, 0);
      if (++frames < 90) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  return { commits: window.__commits - start, frames, ms: performance.now() - t0 };
});
// Erlaubt: je Wand ein Wechsel der Klickbarkeit hin und zurück (6 Wände × 2) plus Kleinigkeiten –
// weit unter einem Commit pro Frame.
check('3D-Kamerafahrt (90 Frames): keine React-Commits pro Frame', orbit.commits <= 16 && orbit.commits < orbit.frames / 4, JSON.stringify(orbit));

// 2. Leerlauf: keine Commits ohne Eingaben
const idle = await page.evaluate(async () => {
  const start = window.__commits;
  await new Promise((r) => setTimeout(r, 1500));
  return window.__commits - start;
});
check('Leerlauf (1,5 s): keine React-Commits', idle === 0, String(idle));

// 3. 2D-Editor: Ecke ziehen – Commits wachsen mit den Zeigerbewegungen, nicht mit den Frames.
await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(900);
// Grundlinie im selben Lauf (gleiche Rechnerlast): Grundriss ohne Editor.
const baseline = await measureFrames();
await page.getByTestId('room-edit-toggle').click(); await settle(400);
const handle = page.locator('[data-testid="room-corner"][data-wall-id="wall-4"]');
const box = await handle.boundingBox();
const before = await page.evaluate(() => window.__commits);
await page.mouse.move(box.x + 7, box.y + 7); await page.mouse.down();
const moves = 20;
for (let i = 1; i <= moves; i++) await page.mouse.move(box.x + 7 + i * 3, box.y + 7 + i * 2);
// Zeiger ruhig halten: Während der Geste darf ohne Bewegung nichts neu gerendert werden
// (kurz warten, bis die letzten Bewegungen verarbeitet sind – Software-Rendering ist langsam).
await settle(800);
const held = await page.evaluate(async () => { const s = window.__commits; await new Promise((r) => setTimeout(r, 1000)); return window.__commits - s; });
await page.mouse.up(); await settle(300);
const dragCommits = (await page.evaluate(() => window.__commits)) - before;
// Je Bewegung ein Planstand; jedes DOM-Overlay (Eckgriffe, Maßtexte) hat einen eigenen React-Root.
check(`Ecke ziehen: Commits nur bei Bewegung (gehalten: ${held}, ${moves} Bewegungen: ${dragCommits})`, held === 0 && dragCommits / moves < 20, String(dragCommits));
const frame = await measureFrames();
check('Grundriss mit Editor: kein Mehraufwand gegenüber dem Grundriss ohne Editor (± ein Bildwechsel)', frame.median <= baseline.median + 17, JSON.stringify({ editor: frame, baseline }));
async function measureFrames() {
  // Drei Messfenster, das beste zählt: Software-Rendering ist auf das Bildwiederholraster
  // quantisiert (16,7 / 33,3 / 50 ms) und schwankt mit der Rechnerlast.
  return page.evaluate(async () => {
  const window60 = () => new Promise((resolve) => {
    const times = [];
    let last = performance.now();
    let n = 0;
    const step = (t) => { times.push(t - last); last = t; if (++n < 60) requestAnimationFrame(step); else { times.sort((a, b) => a - b); resolve(times[30]); } };
    requestAnimationFrame(step);
  });
  const medians = [];
  for (let i = 0; i < 3; i++) medians.push(await window60());
  return { median: +Math.min(...medians).toFixed(1), windows: medians.map((m) => +m.toFixed(1)) };
  });
}
// 4. Großes Szenario: 30 Möbel, 10 Lampen, mehrere Raumobjekte.
{
  const furniture = [];
  const types = [['sofa', [2, 0.9, 0.85]], ['armchair', [0.85, 0.85, 0.85]], ['table', [1.4, 0.8, 0.75]], ['chair', [0.45, 0.52, 0.9]], ['shelf', [0.8, 0.35, 1.8]], ['dresser', [1, 0.45, 0.85]]];
  for (let i = 0; i < 30; i++) {
    const [type, size] = types[i % types.length];
    furniture.push(item(type, `${type} ${i}`, 1.4 + (i % 6) * 2.1, 1.2 + Math.floor(i / 6) * 1.6, 0, size));
  }
  const lampTypes = [['ceiling-light', [0.45, 0.45, 0.12]], ['pendant-light', [0.4, 0.4, 0.8]], ['floor-lamp', [0.4, 0.4, 1.6]], ['table-lamp', [0.28, 0.28, 0.45]]];
  for (let i = 0; i < 10; i++) {
    const [type, size] = lampTypes[i % 4];
    furniture.push(item(type, `Lampe ${i}`, 1 + i * 1.15, 0.5 + (i % 2) * 7, 0, size, { light: { on: true, intensity: 1, temperature: 2700 + i * 300 } }));
  }
  await openScene(page, project('perf', 'Performance', {
    walls: rectangleWalls(13, 8.5),
    furniture,
    fixtures: [
      { id: 'fixture-1', type: 'radiator', wall: 'north', offset: 1, width: 1.2, height: 0.6, depth: 0.1, elevation: 0.1 },
      { id: 'fixture-2', type: 'radiator', wall: 'south', offset: 1, width: 1.2, height: 0.6, depth: 0.1, elevation: 0.1 },
      { id: 'fixture-3', type: 'socket', wall: 'east', offset: 2, width: 0.08, height: 0.08, depth: 0.012, elevation: 0.26 },
      { id: 'fixture-4', type: 'switch', wall: 'west', offset: 1, width: 0.08, height: 0.08, depth: 0.012, elevation: 1.01 },
    ],
  }));
  await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(900);
  const info = await page.evaluate(() => {
    const s = window.__PLANNER_R3F__();
    let furniture = 0, lights = 0;
    s.scene.traverse((o) => { if (o.userData?.furnitureId) furniture++; if (o.name === 'lamp-light') lights++; });
    return { furniture, lights, programs: s.gl.info.programs?.length ?? 0 };
  });
  check('Großes Szenario geladen: 40 Objekte, 8 Lichtquellen (Vorrat), Shader-Programme begrenzt', info.furniture === 40 && info.lights === 8 && info.programs < 40, JSON.stringify(info));
  const run = await page.evaluate(async () => {
    const s = window.__PLANNER_R3F__();
    const start = window.__commits;
    const times = [];
    let last = performance.now();
    await new Promise((resolve) => {
      let frames = 0;
      const step = (t) => {
        const a = (frames / 60) * Math.PI * 2;
        s.camera.position.set(Math.cos(a) * 14, 7, Math.sin(a) * 14);
        s.camera.lookAt(0, 0, 0);
        times.push(t - last); last = t;
        if (++frames < 60) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    times.sort((a, b) => a - b);
    return { commits: window.__commits - start, median: +times[30].toFixed(1) };
  });
  check('Großes Szenario, Kamerafahrt: keine Commits pro Frame', run.commits <= 16, JSON.stringify(run));
  // Software-Rendering (SwiftShader) ist ~10× langsamer als eine GPU; Grenze entsprechend großzügig.
  check('Großes Szenario: Frame-Median im Rahmen (Software-Rendering)', run.median < 400, JSON.stringify(run));
  const idle2 = await page.evaluate(async () => { const s = window.__commits; await new Promise((r) => setTimeout(r, 1200)); return window.__commits - s; });
  check('Großes Szenario, Leerlauf: keine Commits', idle2 === 0, String(idle2));
  // Lampe schalten: keine neuen Shader (fester Lichtvorrat)
  const programsBefore = await page.evaluate(() => window.__PLANNER_R3F__().gl.info.programs?.length ?? 0);
  await page.getByTestId('furniture-list-item').filter({ hasText: 'Lampe 0' }).click(); await settle();
  await page.getByTestId('lamp-toggle').click(); await settle(500);
  await page.getByTestId('lamp-toggle').click(); await settle(500);
  const programsAfter = await page.evaluate(() => window.__PLANNER_R3F__().gl.info.programs?.length ?? 0);
  check('Lampe aus/an: keine neuen Shader-Programme', programsAfter === programsBefore, `${programsBefore} → ${programsAfter}`);
}

check('Keine Laufzeitfehler', errors.length === 0, errors.join(' | '));

const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
