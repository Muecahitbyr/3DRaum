import { chromium } from 'playwright-core';
import { bedroom, freeRoom, livingRoom, lRoom, openScene } from '../lib/scenes.mjs';

/**
 * Visuelle Testszenen (Screenshots in e2e/.output/visual-scenes/):
 * 1. Wohnzimmer Tageslicht, 2. Wohnzimmer warm, 3. Schlafzimmer mit Pendel-/Tischlampen,
 * 4. L-förmiger Raum, 5. freie Form mit schräger Wand, 6. 2D-Grundriss mit neuen Objekten.
 * Zusätzlich automatische Plausibilitätsprüfungen: keine überstrahlten oder schwarzen
 * Bilder, Decke/Wände in der Vorschau, Lampenlicht, keine Kollisionen in den Szenen.
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
await page.waitForTimeout(1000);
const settle = (ms = 200) => page.waitForTimeout(ms);
const mode = async (label) => { await page.getByTestId('view-3d-mode').getByRole('button', { name: label }).click(); await settle(1200); };
const view = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };

/** Helligkeitsstatistik der Arbeitsfläche (ohne Sidebar). */
const stats = async (buffer) => page.evaluate(async (b64) => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let sum = 0, black = 0, white = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += l; if (l < 12) black++; if (l > 252) white++; }
  return { mean: sum / n, black: black / n, white: white / n };
}, buffer.toString('base64'));
const capture = async (name) => {
  const buffer = await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 280, y: 0, width: 1160, height: 900 } });
  return stats(buffer);
};
const sceneState = () => page.evaluate(() => {
  const s = window.__PLANNER_R3F__().scene;
  const walls = [];
  s.traverse((o) => { if (o.userData?.wallId) walls.push(o.material.opacity); });
  const lights = [];
  s.traverse((o) => { if (o.name === 'lamp-light') lights.push(o.intensity); });
  return { ceiling: s.getObjectByName('ceiling').visible, walls, lights: lights.filter((i) => i > 0).length };
});

const SCENES = [
  ['1-wohnzimmer-tageslicht', livingRoom('daylight'), 2],
  ['2-wohnzimmer-warm', livingRoom('warm', 0.85), 2],
  ['3-schlafzimmer', bedroom(), 3],
  ['4-l-raum', lRoom(), 2],
  ['5-freie-form', freeRoom(), 2],
];
for (const [name, data, lamps] of SCENES) {
  await openScene(page, data);
  const collisions = await page.locator('[data-testid="furniture-list-item"] [data-severity], [data-testid="opening-list-item"] [data-severity]').count();
  check(`${name}: Szene ohne Kollisionen`, collisions === 0, String(collisions));
  const edit = await capture(`${name}-bearbeiten`);
  check(`${name}: Bearbeiten – ausgewogen belichtet (keine schwarzen/überstrahlten Flächen)`, edit.mean > 120 && edit.mean < 245 && edit.black < 0.01 && edit.white < 0.35, JSON.stringify(edit));
  let st = await sceneState();
  check(`${name}: ${lamps} Lampen leuchten`, st.lights === lamps, String(st.lights));
  await mode('Vorschau');
  const preview = await capture(`${name}-vorschau`);
  st = await sceneState();
  check(`${name}: Vorschau – Decke sichtbar, alle Wände deckend`, st.ceiling && st.walls.every((o) => o === 1));
  check(`${name}: Vorschau – ausgewogen belichtet`, preview.mean > 90 && preview.mean < 240 && preview.black < 0.02 && preview.white < 0.2, JSON.stringify(preview));
  await mode('Bearbeiten');
  if (name.startsWith('1') || name.startsWith('5')) {
    await view('2D');
    const plan = await capture(`${name.startsWith('1') ? '6-grundriss-wohnzimmer' : '6-grundriss-freie-form'}`);
    st = await sceneState();
    check(`${name}: 2D – hell und lesbar, ohne Licht und Decke`, plan.mean > 180 && !st.ceiling && st.lights === 0, JSON.stringify(plan));
    await view('3D');
  }
}

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
