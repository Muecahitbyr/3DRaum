import { chromium } from 'playwright-core';
import { diningArea, livingRoom, lRoom, openScene } from '../lib/scenes.mjs';

/**
 * Rendern auf Anforderung (frameloop="demand"): Im Leerlauf entstehen keine Frames;
 * jede Interaktion rendert zuverlässig neu. Generische Prüfung nach jeder Aktion:
 * 1. Das Bild hat sich wie erwartet geändert,
 * 2. ein zusätzlich erzwungener Frame ändert nichts mehr (angezeigter Stand ist aktuell),
 * 3. danach ruht die Szene wieder (keine weiteren Frames).
 */
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(1200);
const settle = (ms = 300) => page.waitForTimeout(ms);
const CLIP = { x: 280, y: 0, width: 1160, height: 900 };
/** Nur das WebGL-Bild: Werkzeugleisten über der Szene (Undo/Redo-Zustand usw.) ausblenden. */
const canvasShot = async () => {
  await page.addStyleTag({ content: 'main > :not(:has(canvas)) { visibility: hidden !important; }' }).then((h) => h.evaluate((el) => { el.id = 'hide-overlays'; }));
  const shot = await page.screenshot({ clip: CLIP });
  await page.evaluate(() => document.getElementById('hide-overlays')?.remove());
  return shot;
};
const frames = () => page.evaluate(() => window.__PLANNER_R3F__().gl.info.render.frame);
const view = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const mode = async (label) => { await page.getByTestId('view-3d-mode').getByRole('button', { name: label }).click(); await settle(1200); };

/** Warten, bis keine Frames mehr entstehen (Dämpfung/Überblendung abgeklungen). */
async function rest(timeout = 8000) {
  const t0 = Date.now();
  let last = await frames();
  while (Date.now() - t0 < timeout) {
    await page.waitForTimeout(400);
    const now = await frames();
    if (now === last) return true;
    last = now;
  }
  return false;
}
/** Pixelabweichung zweier Bilder: Anteil abweichender Pixel und größte Kanalabweichung. */
const imageDiff = (a, b) => page.evaluate(async ([a, b]) => {
  const load = async (b64) => { const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; };
  const [x, y] = await Promise.all([load(a), load(b)]);
  let n = 0, max = 0;
  for (let i = 0; i < x.length; i += 4) {
    const d = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2]));
    if (d > 0) { n++; if (d > max) max = d; }
  }
  return { share: n / (x.length / 4), max };
}, [a.toString('base64'), b.toString('base64')]);
/**
 * Bild aktuell? Ein erzwungener Frame darf nichts Sichtbares mehr ändern. Toleriert wird nur
 * Rundungsrauschen des Software-Renderers (≤ 0,01 % der Pixel, höchstens 2/255).
 */
let lastDiff = null;
async function current() {
  const before = await canvasShot();
  await page.evaluate(() => window.__PLANNER_R3F__().invalidate());
  await settle(400);
  const after = await canvasShot();
  if (Buffer.compare(before, after) === 0) { lastDiff = { share: 0, max: 0 }; return true; }
  lastDiff = await imageDiff(before, after);
  return lastDiff.share <= 1e-4 && lastDiff.max <= 2;
}
/** Leerlauf: keine Frames über `ms`. */
async function idleFrames(ms = 2000) {
  const f0 = await frames();
  await page.waitForTimeout(ms);
  return (await frames()) - f0;
}
/** Aktion ausführen und die drei Standardprüfungen durchführen. */
async function interaction(name, action, { expectChange = true } = {}) {
  await rest();
  const before = await canvasShot();
  const f0 = await frames();
  await action();
  const rested = await rest();
  const rendered = (await frames()) - f0;
  const changed = Buffer.compare(before, await canvasShot()) !== 0;
  const fresh = await current();
  const quiet = await idleFrames(1500);
  check(`${name}: neu gerendert${expectChange ? ' und Bild geändert' : ''}`, rendered > 0 && (!expectChange || changed), `${rendered} Frames`);
  check(`${name}: angezeigter Stand aktuell, danach Ruhe`, rested && fresh && quiet === 0, JSON.stringify({ rested, fresh, quiet, diff: lastDiff }));
}
const screenOf = (id, y = 0.05) => page.evaluate(({ id, y }) => {
  const s = window.__PLANNER_R3F__();
  let obj = null;
  s.scene.traverse((o) => { if (!obj && (o.userData?.furnitureId === id && o.name === id || o.userData?.openingId === id)) obj = o; });
  const v = obj.getWorldPosition(s.camera.position.clone()).setY(y).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, { id, y });
const drag = async (from, to, steps = 12) => {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await page.mouse.up();
};

await openScene(page, livingRoom('daylight'));
await view('3D');

// ---------- Leerlauf
await rest();
check('Leerlauf 3D: keine Frames über 3 s', (await idleFrames(3000)) === 0);
check('Leerlauf 3D: angezeigter Stand aktuell', await current());

// ---------- Kamera (OrbitControls): Drehen mit Dämpfung, Zoomen, Verschieben
const cx = 860, cy = 450;
let wallsBefore = null;
await interaction('Kamera drehen (Maus)', async () => {
  wallsBefore = await page.evaluate(() => { const v = {}; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.name?.startsWith('wall-') && o.userData.visibility !== undefined) v[o.name] = o.userData.visibility; }); return v; });
  await drag({ x: cx, y: cy }, { x: cx + 320, y: cy }, 16);
});
// Wand-Ausblenden: nach dem Loslassen läuft die Überblendung ohne weitere Eingabe bis zum Ziel
const fade = await page.evaluate(() => {
  const s = window.__PLANNER_R3F__();
  const out = {};
  s.scene.traverse((o) => { if (o.name?.startsWith('wall-') && o.userData.visibility !== undefined) out[o.name] = +o.userData.visibility.toFixed(3); });
  return out;
});
const changedWalls = Object.keys(fade).filter((k) => Math.abs(fade[k] - (wallsBefore[k] ?? 1)) > 0.01);
check('Wand-Ausblenden: Überblendung läuft nach dem Loslassen vollständig zu Ende', changedWalls.length > 0 && Object.values(fade).every((v) => v === 1 || v < 0.35 || v > 0.999), JSON.stringify({ vorher: wallsBefore, nachher: fade }));
await page.screenshot({ path: `${OUT}/01-gedreht.png` });
await interaction('Kamera zoomen (Mausrad)', async () => { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -400); });
await interaction('Kamera verschieben (rechte Maustaste)', async () => {
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' }); await page.mouse.move(cx + 80, cy + 40, { steps: 8 }); await page.mouse.up({ button: 'right' });
});
// Weiche Dämpfung: nach dem Loslassen werden weitere Frames gerendert (kein abruptes Stehenbleiben)
{
  await rest();
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(cx - i * 30, cy);
  const atRelease = await frames();
  await page.mouse.up();
  await rest();
  check('Dämpfung: nach dem Loslassen wird weitergerendert, bis die Bewegung ausklingt', (await frames()) - atRelease >= 2, String((await frames()) - atRelease));
}

// ---------- Ansichten
await interaction('Wechsel 3D → 2D', () => view('2D'));
await interaction('Wechsel 2D → 3D', () => view('3D'));
await interaction('Bearbeiten → Vorschau', () => mode('Vorschau'));
check('Leerlauf Vorschau: keine Frames', (await idleFrames(2000)) === 0);
await interaction('Vorschau → Bearbeiten', () => mode('Bearbeiten'));

// ---------- Auswahl und Kollisionen (3D)
await interaction('Möbel auswählen (Umrandung)', async () => { await page.getByTestId('furniture-list-item').filter({ hasText: 'Couchtisch' }).click(); await settle(); });
const fp = page.getByTestId('furniture-properties');
const setField = async (label, text) => { const i = fp.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(400); };
await interaction('Kollision (Couchtisch auf das Sofa)', () => setField('Z-Position', '3,6'));
const red = await page.evaluate(() => { let n = 0; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.name === 'furniture-outline' && o.userData.status === 'error') n++; }); return n; });
check('Kollisionsrahmen sichtbar', red > 0);
await interaction('Möbel drehen (Eigenschaften)', () => setField('Rotation', '45'));

// ---------- Undo/Redo: Bild exakt wie vorher
await rest();
const beforeUndo = await canvasShot();
await interaction('Farbe/Material: Boden wechseln', async () => { await page.getByTestId('floor-option-tiles').click(); await settle(400); });
// Fokus aus dem Bodenbelag-Button nehmen (ein Klick in die Szene würde die Auswahl aufheben)
await page.evaluate(() => document.activeElement?.blur());
await interaction('Rückgängig (Strg+Z)', async () => { await page.keyboard.press('ControlOrMeta+z'); await settle(400); });
{
  const d = await imageDiff(beforeUndo, await canvasShot());
  check('Rückgängig: Bild wie vor der Änderung', d.share <= 1e-4 && d.max <= 2, JSON.stringify(d));
}
await interaction('Wiederholen (Strg+Umschalt+Z)', async () => { await page.keyboard.press('ControlOrMeta+Shift+z'); await settle(400); });

// ---------- Wandfarbe, Licht und Lampen (Vorschau)
await interaction('Wandfarbe ändern', async () => { await page.getByTestId('wall-preset').nth(4).click(); await settle(400); });
await mode('Vorschau');
await interaction('Lichtstimmung ändern', async () => { await page.getByTestId('lighting-preset').getByRole('button', { name: 'Kühl' }).click(); await settle(400); });
await interaction('Lampe ausschalten', async () => {
  await page.getByTestId('furniture-list-item').filter({ hasText: 'Stehlampe' }).click(); await settle();
  await page.getByTestId('lamp-toggle').click(); await settle(400);
});
await page.screenshot({ path: `${OUT}/02-vorschau.png` });
await mode('Bearbeiten');

// ---------- 2D: Möbel ziehen, Tür/Fenster ziehen
await view('2D');
await page.keyboard.press('Escape'); await settle();
await interaction('Möbel ziehen (2D)', async () => {
  const p = await screenOf('furniture-3');
  await drag(p, { x: p.x - 90, y: p.y - 60 });
  await settle(300);
});
await interaction('Fenster ziehen (2D, Drag & Drop)', async () => {
  const p = await screenOf('opening-1', 2.7);
  await drag(p, { x: p.x + 70, y: p.y });
  await settle(300);
});
await page.screenshot({ path: `${OUT}/03-2d.png` });

// ---------- Projektwechsel und Wandbearbeitung (L-Form)
await interaction('Projektwechsel', () => openScene(page, lRoom()));
await interaction('Grundriss-Editor: Ecke ziehen', async () => {
  await page.getByTestId('room-edit-toggle').click(); await settle(500);
  const box = await page.locator('[data-testid="room-corner"][data-wall-id="wall-4"]').boundingBox();
  await drag({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: box.x + box.width / 2 + 60, y: box.y + box.height / 2 + 40 });
  await settle(300);
});
await page.getByTestId('room-edit-toggle').click(); await settle(400);
await interaction('Nach Wandbearbeitung zurück in 3D', () => view('3D'));

// ---------- 3D Bearbeiten: Möbel ziehen, drehen, Gruppe drehen, Kollision live (Block B)
await openScene(page, diningArea());
await view('3D');
await rest();
const knobCenter = async (testId) => { const b = await page.getByTestId(testId).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
await interaction('3D: Möbel auswählen (Grundfläche, Drehring)', async () => { await page.getByTestId('furniture-list-item').filter({ hasText: 'Stuhl 5' }).click(); await settle(); });
await interaction('3D: Möbel ziehen (Bodenebene)', async () => {
  const p = await screenOf('furniture-6', 0.45);
  await drag(p, { x: p.x + 90, y: p.y + 20 });
  await settle(300);
});
await interaction('3D: Möbel drehen (Ring)', async () => {
  const k = await knobCenter('rotation-handle-3d');
  const c = await screenOf('furniture-6', 0);
  await drag(k, { x: c.x + (c.y - k.y), y: c.y - (c.x - k.x) }, 16);
  await settle(300);
});
await interaction('3D: Kollision live (Stuhl in den Tisch ziehen)', async () => {
  const p = await screenOf('furniture-6', 0.45);
  const t = await screenOf('furniture-1', 0.45);
  await drag(p, t, 16);
  await settle(300);
});
const live = await page.evaluate(() => { let n = 0; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.name === 'furniture-footprint' || (o.name === 'furniture-outline' && o.userData.status === 'error')) n++; }); return n; });
check('3D: Kollisionsrahmen und Grundfläche nach dem Ziehen sichtbar', live >= 2, String(live));
await interaction('3D: Rückgängig nach dem Ziehen', async () => { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('ControlOrMeta+z'); await settle(400); });
await interaction('3D: Mehrfachauswahl (Tisch + Stühle)', async () => {
  await page.keyboard.down('Shift');
  for (const name of ['Esstisch', 'Stuhl 1', 'Stuhl 2']) await page.getByTestId('furniture-list-item').filter({ hasText: name }).click();
  await page.keyboard.up('Shift'); await settle(400);
});
await interaction('3D: Auswahl gemeinsam drehen (Ring)', async () => {
  const k = await knobCenter('formation-rotation-handle');
  const c = await screenOf('furniture-1', 0);
  await drag(k, { x: c.x + (c.y - k.y), y: c.y - (c.x - k.x) }, 16);
  await settle(300);
});
check('Leerlauf nach 3D-Bearbeitung: keine Frames über 2 s', (await idleFrames(2000)) === 0);
await page.screenshot({ path: `${OUT}/05-3d-bearbeiten.png` });

// ---------- Fenstergröße (z. B. Gerät drehen)
await interaction('Fenstergröße ändern', async () => { await page.setViewportSize({ width: 1200, height: 800 }); await settle(800); }, { expectChange: false });
await page.setViewportSize({ width: 1440, height: 900 }); await settle(800);

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
