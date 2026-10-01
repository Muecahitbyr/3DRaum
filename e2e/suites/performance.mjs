import { chromium } from 'playwright-core';
import { item, openScene, polygonWalls, project, rectangleWalls } from '../lib/scenes.mjs';

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
      s.invalidate();
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
    // Rendern auf Anforderung: jeden Frame anfordern, damit die echte Renderzeit gemessen wird.
    const step = (t) => { times.push(t - last); last = t; if (++n < 60) { window.__PLANNER_R3F__().invalidate(); requestAnimationFrame(step); } else { times.sort((a, b) => a - b); resolve(times[30]); } };
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
        s.invalidate();
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

// 5. V1-Szenario: komplexe freie Form mit schräger Wand, 50 Möbel, 10 Lampen, Türen/Fenster,
//    Heizkörper, Materialien und Lichtstimmung – Rerenders beim Ziehen, Leerlauf,
//    Speicherfreigabe (Geometrien/Texturen) nach Hinzufügen/Löschen und Ansichtswechseln.
{
  const corners = [[0, 0], [9, 0], [9, 4], [7, 6.5], [7, 8], [3, 8], [3, 6], [0, 6]];
  const walls = polygonWalls(corners, 2.6);
  const small = [['chair', [0.45, 0.52, 0.9]], ['nightstand', [0.45, 0.4, 0.55]], ['office-chair', [0.6, 0.6, 1.1]], ['dresser', [0.6, 0.45, 0.85]], ['table', [0.6, 0.6, 0.75]]];
  const furniture = [];
  for (let i = 0; i < 50; i++) {
    const [type, size] = small[i % small.length];
    furniture.push(item(type, `Objekt ${i + 1}`, 0.7 + (i % 10) * 0.75, 0.7 + Math.floor(i / 10) * 1.1, (i % 4) * 90, size, i % 3 === 0 ? { colors: { main: '#6b7f99' } } : {}));
  }
  const lampTypes = [['ceiling-light', [0.45, 0.45, 0.12]], ['pendant-light', [0.4, 0.4, 0.8]], ['floor-lamp', [0.4, 0.4, 1.6]]];
  for (let i = 0; i < 10; i++) {
    const [type, size] = lampTypes[i % 3];
    furniture.push(item(type, `Lampe ${i + 1}`, 3.5 + (i % 5) * 0.7, 6.3 + Math.floor(i / 5) * 0.9, 0, size, { light: { on: true, intensity: 1, temperature: 2700 + i * 200 } }));
  }
  const colors = Object.fromEntries(walls.map((w, i) => [w.id, i % 2 ? '#e9e2d6' : '#d7dde3']));
  await openScene(page, project('perf-v1', 'V1-Szenario', {
    shape: 'free',
    walls,
    furniture,
    openings: [
      { id: 'opening-1', type: 'door', wall: 'wall-6', offset: 1, width: 0.9, height: 2.1, hinge: 'left', swing: 'inward' },
      { id: 'opening-2', type: 'window', wall: 'wall-1', offset: 1.5, width: 1.6, height: 1.4, sillHeight: 0.8, sashes: 2 },
      { id: 'opening-3', type: 'window', wall: 'wall-1', offset: 5.5, width: 1.2, height: 1.4, sillHeight: 0.8, sashes: 1 },
      { id: 'opening-4', type: 'window', wall: 'wall-3', offset: 0.6, width: 1.2, height: 1.3, sillHeight: 0.9, sashes: 1 },
      { id: 'opening-5', type: 'door', wall: 'wall-8', offset: 2, width: 0.8, height: 2.1, hinge: 'right', swing: 'inward' },
    ],
    fixtures: [
      { id: 'fixture-1', type: 'radiator', wall: 'wall-1', offset: 1.8, width: 1, height: 0.5, depth: 0.1, elevation: 0.15 },
      { id: 'fixture-2', type: 'radiator', wall: 'wall-2', offset: 1, width: 1, height: 0.5, depth: 0.1, elevation: 0.15 },
      { id: 'fixture-3', type: 'radiator', wall: 'wall-5', offset: 0.5, width: 0.8, height: 0.5, depth: 0.1, elevation: 0.15 },
      { id: 'fixture-4', type: 'socket', wall: 'wall-8', offset: 0.5, width: 0.08, height: 0.08, depth: 0.012, elevation: 0.26 },
      { id: 'fixture-5', type: 'switch', wall: 'wall-6', offset: 2.2, width: 0.08, height: 0.08, depth: 0.012, elevation: 1.01 },
    ],
    design: {
      floor: 'herringbone',
      wallColors: colors,
      wallFinishes: Object.fromEntries(walls.map((w, i) => [w.id, ['matte', 'plaster', 'concrete'][i % 3]])),
      lighting: { preset: 'warm', brightness: 1.1 },
    },
  }));
  const counts = await page.evaluate(() => {
    const s = window.__PLANNER_R3F__();
    let furniture = 0, lights = 0;
    s.scene.traverse((o) => { if (o.userData?.furnitureId) furniture++; if (o.name === 'lamp-light') lights++; });
    return { furniture, lights };
  });
  check('V1-Szenario geladen: 60 Objekte, 8 Lichtquellen', counts.furniture === 60 && counts.lights === 8, JSON.stringify(counts));
  const memory = () => page.evaluate(() => { const m = window.__PLANNER_R3F__().gl.info.memory; return { geometries: m.geometries, textures: m.textures }; });

  // Vorschau mit Decke und Licht: Frame-Median
  await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Vorschau' }).click(); await settle(1200);
  const preview = await measureFrames();
  check('V1-Szenario Vorschau: Frame-Median im Rahmen (Software-Rendering)', preview.median < 400, JSON.stringify(preview));
  await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Bearbeiten' }).click(); await settle(900);

  // 2D: Möbel ziehen – Commits je Zeigerbewegung begrenzt, gehalten keine
  await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(900);
  const target = await page.evaluate((id) => {
    const s = window.__PLANNER_R3F__();
    const o = s.scene.getObjectByName(id);
    const v = o.getWorldPosition(s.camera.position.clone()).setY(0.05).project(s.camera);
    const r = s.gl.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, furniture[22].id);
  const c0 = await page.evaluate(() => window.__commits);
  await page.mouse.move(target.x, target.y); await page.mouse.down();
  const steps = 15;
  for (let i = 1; i <= steps; i++) await page.mouse.move(target.x + i * 2, target.y + i);
  await settle(800);
  const heldDrag = await page.evaluate(async () => { const s = window.__commits; await new Promise((r) => setTimeout(r, 800)); return window.__commits - s; });
  await page.mouse.up(); await settle(400);
  const dragTotal = (await page.evaluate(() => window.__commits)) - c0;
  check(`V1-Szenario, Möbel ziehen: Commits nur bei Bewegung (gehalten ${heldDrag}, ${steps} Bewegungen: ${dragTotal})`, heldDrag === 0 && dragTotal / steps < 12, String(dragTotal));
  check('V1-Szenario: Verschieben als ein Schritt rückgängig machbar', (await page.getByTestId('history-undo').getAttribute('title')).startsWith('Möbel verschieben'));
  const idle3 = await page.evaluate(async () => { const s = window.__commits; await new Promise((r) => setTimeout(r, 1200)); return window.__commits - s; });
  check('V1-Szenario, Leerlauf: keine Commits', idle3 === 0, String(idle3));

  // Speicherfreigabe: Ansichtswechsel und Hinzufügen/Löschen dürfen keine Geometrien/Texturen anhäufen
  await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(900);
  const toggleViews = async () => {
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Vorschau' }).click(); await settle(500);
      await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Bearbeiten' }).click(); await settle(500);
      await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(500);
      await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(500);
    }
  };
  await toggleViews(); // einmal alle Ansichten aufbauen (Caches füllen)
  const mem0 = await memory();
  await toggleViews();
  for (let i = 0; i < 8; i++) {
    await page.getByTestId('furniture-list-item').filter({ hasText: `Objekt ${i + 1}` }).first().click(); await settle(150);
    await page.keyboard.press('ControlOrMeta+d'); await settle(300);
    await page.keyboard.press('Delete'); await settle(300);
  }
  await page.keyboard.press('Escape'); await settle(1000);
  const mem1 = await memory();
  check('V1-Szenario: keine Speicherlecks (Geometrien/Texturen nach Wechseln, Duplizieren, Löschen)', mem1.geometries <= mem0.geometries + 2 && mem1.textures <= mem0.textures, JSON.stringify({ vorher: mem0, nachher: mem1 }));
  check('V1-Szenario: Möbelanzahl unverändert', (await page.getByTestId('furniture-list-item').count()) === 60);
}

// 6. Block B: 150 Möbel – 3D ziehen, 3D drehen, Gruppe drehen; Commits nur bei Bewegung,
//    danach Ruhe (0 Commits, 0 Frames); Kollisionsbericht bleibt schnell.
{
  const furniture = [];
  const kinds = [['chair', [0.45, 0.52, 0.9]], ['table', [0.9, 0.9, 0.75]], ['nightstand', [0.45, 0.4, 0.55]], ['office-chair', [0.6, 0.6, 1.1]], ['dresser', [0.7, 0.45, 0.85]]];
  for (let i = 0; i < 150; i++) {
    const [type, size] = kinds[i % kinds.length];
    furniture.push(item(type, `Objekt ${i + 1}`, 0.6 + (i % 15) * 0.95, 0.6 + Math.floor(i / 15) * 0.95, (i % 4) * 90, size));
  }
  await openScene(page, project('perf-150', 'Block B 150', { walls: rectangleWalls(15, 10), furniture }));
  await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(1200);
  const commitsDuring = async (action) => page.evaluate(() => window.__commits).then(async (c0) => { await action(); return (await page.evaluate(() => window.__commits)) - c0; });
  const held = () => page.evaluate(async () => { const s = window.__commits; await new Promise((r) => setTimeout(r, 800)); return window.__commits - s; });
  const framesIdle = () => page.evaluate(async () => { const s = window.__PLANNER_R3F__(); const f0 = s.gl.info.render.frame; await new Promise((r) => setTimeout(r, 1500)); return s.gl.info.render.frame - f0; });
  const screen = (id, y) => page.evaluate(({ id, y }) => {
    const s = window.__PLANNER_R3F__();
    const v = s.scene.getObjectByName(id).getWorldPosition(s.camera.position.clone()).setY(y).project(s.camera);
    const r = s.gl.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, { id, y });
  await page.getByTestId('furniture-list-item').filter({ hasText: 'Objekt 78' }).first().click(); await settle(400);
  const id = furniture[77].id;
  // 3D ziehen
  const p = await screen(id, 0.3);
  const steps = 15;
  let heldMove = 0;
  const moveCommits = await commitsDuring(async () => {
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    for (let i = 1; i <= steps; i++) await page.mouse.move(p.x + i * 3, p.y + i);
    await settle(300);
    heldMove = await held();
    await page.mouse.up(); await settle(400);
  });
  check(`150 Möbel, 3D ziehen: Commits nur bei Bewegung (gehalten ${heldMove}, ${steps} Bewegungen: ${moveCommits})`, heldMove === 0 && moveCommits / steps < 12, String(moveCommits));
  check('150 Möbel, 3D ziehen: ein Verlaufsschritt', (await page.getByTestId('history-undo').getAttribute('title')).startsWith('Möbel verschieben'));
  // 3D drehen am Ring
  const k = await page.getByTestId('rotation-handle-3d').boundingBox();
  const c = await screen(id, 0);
  const kc = { x: k.x + k.width / 2, y: k.y + k.height / 2 };
  const rotateCommits = await commitsDuring(async () => {
    await page.mouse.move(kc.x, kc.y); await page.mouse.down();
    for (let i = 1; i <= steps; i++) { const t = (i / steps) * (Math.PI / 2); await page.mouse.move(c.x + (kc.x - c.x) * Math.cos(t) - (kc.y - c.y) * Math.sin(t), c.y + (kc.x - c.x) * Math.sin(t) + (kc.y - c.y) * Math.cos(t)); }
    await page.mouse.up(); await settle(400);
  });
  check(`150 Möbel, 3D drehen: Commits je Bewegung begrenzt (${steps} Bewegungen: ${rotateCommits})`, rotateCommits / steps < 12, String(rotateCommits));
  // Gruppe (8 Möbel) gemeinsam drehen
  await page.keyboard.down('Shift');
  for (let i = 79; i <= 85; i++) await page.getByTestId('furniture-list-item').filter({ hasText: `Objekt ${i}` }).first().click();
  await page.keyboard.up('Shift'); await settle(400);
  const g = await page.getByTestId('formation-rotation-handle').boundingBox();
  const gc = { x: g.x + g.width / 2, y: g.y + g.height / 2 };
  const groupCommits = await commitsDuring(async () => {
    await page.mouse.move(gc.x, gc.y); await page.mouse.down();
    for (let i = 1; i <= steps; i++) await page.mouse.move(gc.x + i * 6, gc.y + i * 4);
    await page.mouse.up(); await settle(400);
  });
  check(`150 Möbel, Gruppe (8) drehen: Commits je Bewegung begrenzt (${steps} Bewegungen: ${groupCommits})`, groupCommits / steps < 12, String(groupCommits));
  check('150 Möbel, Gruppendrehung: ein Verlaufsschritt „Möbel drehen“', (await page.getByTestId('history-undo').getAttribute('title')).startsWith('Möbel drehen'));
  const idleCommits = await held();
  const idleFrames = await framesIdle();
  check(`150 Möbel, nach den Interaktionen: Ruhe (Commits ${idleCommits}, Frames ${idleFrames})`, idleCommits === 0 && idleFrames === 0);
  const timing = await page.evaluate(async () => {
    const c = await import('/src/collision/index.ts');
    const m = await import('/src/utils/room/model.ts');
    const p = await import('/src/utils/room/plan.ts');
    const room = m.roomModelOf(p.createRectangleRoom({ width: 15, length: 10, height: 2.5 }));
    const items = Array.from({ length: 150 }, (_, i) => ({ id: `f${i}`, type: ['chair', 'table', 'desk', 'office-chair', 'sofa'][i % 5], name: `${i}`, width: 0.6, depth: 0.6, height: 0.9, position: { x: 0.6 + (i % 15) * 0.95, z: 0.6 + Math.floor(i / 15) * 0.95 }, rotationDeg: (i % 4) * 90 }));
    c.computeCollisionReport(room, [], items);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) c.computeCollisionReport(room, [], items.map((f, j) => (j === 40 ? { ...f, position: { x: f.position.x + i * 0.01, z: f.position.z } } : f)));
    return (performance.now() - t0) / 20;
  });
  check(`150 Möbel: Kollisionsbericht bei einem bewegten Möbel < 10 ms (${timing.toFixed(2)} ms)`, timing < 10);
}

// 7. Block C: 150 gemischte Objekte (Küche, Bad, Teppiche, Pflanzen, Möbel) + 10 Lampen –
//    Vorschau, 2D ziehen, 3D drehen; Commits nur bei Bewegung, kein Autosave-Schreiben während
//    der Geste, danach Ruhe (0 Commits, 0 Frames – auch nach Ablauf der Autosave-Ruhezeit).
{
  const kinds = [
    ['kitchen-base', [0.6, 0.6, 0.9]], ['kitchen-sink', [0.8, 0.6, 0.9]], ['kitchen-stove', [0.6, 0.6, 0.9]], ['kitchen-wall', [0.6, 0.35, 0.7], { elevation: 1.45 }],
    ['kitchen-tall', [0.6, 0.6, 2]], ['fridge', [0.6, 0.65, 2]], ['toilet', [0.4, 0.7, 0.8]], ['washbasin', [0.8, 0.5, 0.85]], ['shower', [0.8, 0.8, 2]],
    ['plant', [0.45, 0.45, 1.2]], ['rug', [0.8, 0.6, 0.01]], ['chair', [0.45, 0.52, 0.9]],
  ];
  const furniture = [];
  for (let i = 0; i < 150; i++) {
    const [type, size, extra = {}] = kinds[i % kinds.length];
    furniture.push(item(type, `Objekt ${i + 1}`, 0.6 + (i % 15) * 0.95, 0.6 + Math.floor(i / 15) * 0.95, (i % 4) * 90, size, extra));
  }
  for (let i = 0; i < 10; i++) {
    furniture.push(item(['ceiling-light', 'pendant-light'][i % 2], `Lampe ${i + 1}`, 1 + i * 1.4, 9.7, 0, i % 2 ? [0.4, 0.4, 0.8] : [0.45, 0.45, 0.12], { light: { on: true, intensity: 1, temperature: 3000 } }));
  }
  await openScene(page, { ...project('perf-kueche-bad', 'Block C 150', { walls: rectangleWalls(15, 10), furniture, design: { wallFinishes: { north: 'tiles', east: 'tiles' } } }), version: 7 });
  await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(1200);
  const counts = await page.evaluate(() => {
    let furniture = 0, lights = 0;
    window.__PLANNER_R3F__().scene.traverse((o) => { if (o.userData?.furnitureId) furniture++; if (o.name === 'lamp-light') lights++; });
    return { furniture, lights };
  });
  check('Block C: 160 Objekte (Küche, Bad, Teppich, Pflanze, Lampen) geladen, 8 Lichtquellen', counts.furniture === 160 && counts.lights === 8, JSON.stringify(counts));
  const held = () => page.evaluate(async () => { const s = window.__commits; await new Promise((r) => setTimeout(r, 800)); return window.__commits - s; });
  const framesIdle = () => page.evaluate(async () => { const s = window.__PLANNER_R3F__(); const f0 = s.gl.info.render.frame; await new Promise((r) => setTimeout(r, 1500)); return s.gl.info.render.frame - f0; });
  const commitsDuring = async (action) => page.evaluate(() => window.__commits).then(async (c0) => { await action(); return (await page.evaluate(() => window.__commits)) - c0; });
  const screen = (id, y) => page.evaluate(({ id, y }) => {
    const s = window.__PLANNER_R3F__();
    const v = s.scene.getObjectByName(id).getWorldPosition(s.camera.position.clone()).setY(y).project(s.camera);
    const r = s.gl.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, { id, y });
  // Autosave-Schreibvorgänge mitzählen (Zeitpunkte)
  await page.evaluate(() => {
    window.__recoveryWrites = [];
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === 'raumplaner:recovery') window.__recoveryWrites.push(performance.now()); return setItem.call(this, key, value); };
  });
  const writes = () => page.evaluate(() => window.__recoveryWrites.length);

  await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Vorschau' }).click(); await settle(1200);
  const preview = await measureFrames();
  check('Block C, Vorschau: Frame-Median im Rahmen (Software-Rendering)', preview.median < 400, JSON.stringify(preview));
  await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Bearbeiten' }).click(); await settle(900);

  // 2D: Spülenschrank ziehen
  await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(900);
  const sink = furniture[61];
  await page.getByTestId('furniture-list-item').filter({ hasText: sink.name }).first().click(); await settle(400);
  const p = await screen(sink.id, 0.05);
  const steps = 15;
  let heldMove = 0, writesDuring = 0;
  const w0 = await writes();
  const moveCommits = await commitsDuring(async () => {
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    for (let i = 1; i <= steps; i++) await page.mouse.move(p.x + i * 3, p.y + i);
    await settle(300);
    heldMove = await held();
    writesDuring = (await writes()) - w0;
    await page.mouse.up(); await settle(400);
  });
  check(`Block C, 2D ziehen: Commits nur bei Bewegung (gehalten ${heldMove}, ${steps} Bewegungen: ${moveCommits})`, heldMove === 0 && moveCommits / steps < 12, String(moveCommits));
  check('Block C, 2D ziehen: kein Autosave während der Geste, ein Verlaufsschritt', writesDuring === 0 && (await page.getByTestId('history-undo').getAttribute('title')).startsWith('Möbel verschieben'), String(writesDuring));
  await settle(1500);
  check('Block C: nach dem Loslassen genau ein Autosave', (await writes()) - w0 === 1, String((await writes()) - w0));

  // 3D: Kühlschrank am Ring drehen
  await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(1200);
  const fridge = furniture[65];
  await page.getByTestId('furniture-list-item').filter({ hasText: fridge.name }).first().click(); await settle(400);
  const k = await page.getByTestId('rotation-handle-3d').boundingBox();
  const c = await screen(fridge.id, 0);
  const kc = { x: k.x + k.width / 2, y: k.y + k.height / 2 };
  const w1 = await writes();
  const rotateCommits = await commitsDuring(async () => {
    await page.mouse.move(kc.x, kc.y); await page.mouse.down();
    for (let i = 1; i <= steps; i++) { const t = (i / steps) * (Math.PI / 2); await page.mouse.move(c.x + (kc.x - c.x) * Math.cos(t) - (kc.y - c.y) * Math.sin(t), c.y + (kc.x - c.x) * Math.sin(t) + (kc.y - c.y) * Math.cos(t)); }
    writesDuring = (await writes()) - w1;
    await page.mouse.up(); await settle(400);
  });
  check(`Block C, 3D drehen: Commits je Bewegung begrenzt (${steps} Bewegungen: ${rotateCommits}), kein Autosave währenddessen`, rotateCommits / steps < 12 && writesDuring === 0, `${rotateCommits} / ${writesDuring}`);
  await settle(1200); // Autosave-Ruhezeit abwarten
  const idleCommits = await held();
  const idleFrames = await framesIdle();
  const w2 = await writes();
  await settle(1500);
  check(`Block C, danach Ruhe (Commits ${idleCommits}, Frames ${idleFrames}, keine weiteren Autosaves)`, idleCommits === 0 && idleFrames === 0 && (await writes()) === w2);
  const timing = await page.evaluate(async (items) => {
    const col = await import('/src/collision/index.ts');
    const m = await import('/src/utils/room/model.ts');
    const pl = await import('/src/utils/room/plan.ts');
    const room = m.roomModelOf(pl.createRectangleRoom({ width: 15, length: 10, height: 2.6 }));
    col.computeCollisionReport(room, [], items);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) col.computeCollisionReport(room, [], items.map((f, j) => (j === 40 ? { ...f, position: { x: f.position.x + i * 0.01, z: f.position.z } } : f)));
    return (performance.now() - t0) / 20;
  }, furniture);
  check(`Block C: Kollisionsbericht (160 gemischte Objekte) < 10 ms (${timing.toFixed(2)} ms)`, timing < 10);
}

check('Keine Laufzeitfehler', errors.length === 0, errors.join(' | '));

const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
