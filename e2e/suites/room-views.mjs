import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = process.env.OUT;
const exe = process.env.CHROME;
const WALL = 0.15, OFFSET = 30, PAD = 112, SIDEBAR = 280;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(process.env.E2E_PREVIEW_URL);
await page.waitForSelector('canvas');
await page.waitForTimeout(1500);
const settle = () => page.waitForTimeout(1200);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const canvasShot = () => page.locator('canvas').screenshot();

const labels = async () => {
  const els = await page.getByTestId('dimension-label').all();
  const out = [];
  for (const el of els) {
    const b = await el.boundingBox();
    out.push({ text: (await el.textContent()).trim(), cx: b.x + b.width / 2, cy: b.y + b.height / 2 });
  }
  return out;
};
// Reihenfolge der Labels: north, east, south, west
const spans = (l) => ({ ns: l[2].cy - l[0].cy, ew: l[1].cx - l[3].cx });
const expectedFit = (w, l, vw, vh) => {
  const z = Math.min((vw - SIDEBAR - 2 * PAD) / (w + 2 * WALL), (vh - 2 * PAD) / (l + 2 * WALL));
  return { z, ns: (l + 2 * WALL) * z + 2 * OFFSET, ew: (w + 2 * WALL) * z + 2 * OFFSET };
};
// Eingabefelder der Raummaße (seit „Gestaltung“ enthält die Sidebar weitere Felder).
const inputs = () => page.getByRole('region', { name: 'Raummaße' }).locator('input');
const inputValues = async () => (await inputs().all()).length && Promise.all((await inputs().all()).map((i) => i.inputValue()));
const setInput = async (idx, text) => { const i = inputs().nth(idx); await i.click(); await i.fill(text); await i.press('Enter'); };
const toggle = (label) => page.getByRole('button', { name: label, exact: true }).click();

// ---------- 5 × 4 m ----------
await shot('01-3d-5x4');
const initial3d = await canvasShot();
check('3D: keine Maßlabels', (await labels()).length === 0);

await toggle('2D'); await settle(); await shot('02-2d-5x4');
let l = await labels();
check('2D 5×4: vier Labels', l.length === 4, l.map((x) => x.text).join(' | '));
check('2D 5×4: Texte korrekt', JSON.stringify(l.map((x) => x.text)) === JSON.stringify(['5,00 m', '4,00 m', '5,00 m', '4,00 m']));
let exp = expectedFit(5, 4, 1440, 900), s = spans(l);
check('2D 5×4: Raum exakt eingepasst (Label-Abstände)', near(s.ns, exp.ns) && near(s.ew, exp.ew), `ns ${s.ns.toFixed(1)}/${exp.ns.toFixed(1)}, ew ${s.ew.toFixed(1)}/${exp.ew.toFixed(1)}`);
check('2D 5×4: Raum zentriert', near((l[1].cx + l[3].cx) / 2, SIDEBAR + (1440 - SIDEBAR) / 2) && near((l[0].cy + l[2].cy) / 2, 450));
check('2D: Toggle-Zustand', (await page.getByRole('button', { name: '2D', exact: true }).getAttribute('aria-pressed')) === 'true');

// Zoom (Mausrad in der Raummitte)
const cx = SIDEBAR + (1440 - SIDEBAR) / 2, cy = 450;
await page.mouse.move(cx, cy);
for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -200);
await settle(); await shot('03-2d-zoom-in');
l = await labels(); s = spans(l);
const zNs = (s.ns - 2 * OFFSET) / (4 + 2 * WALL), zEw = (s.ew - 2 * OFFSET) / (5 + 2 * WALL);
check('Zoom-in vergrößert', zNs > exp.z * 1.2, `zoom ${exp.z.toFixed(1)} → ${zNs.toFixed(1)} px/m`);
check('Maßlinien-Abstand bleibt 30 px (zoomunabhängig)', near(zNs, zEw, 1), `z(ns) ${zNs.toFixed(2)} vs z(ew) ${zEw.toFixed(2)}`);
for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 300);
await settle(); await shot('04-2d-zoom-out');
l = await labels(); s = spans(l);
const zOut = (s.ns - 2 * OFFSET) / (4 + 2 * WALL);
check('Zoom-out verkleinert, Labels bleiben lesbar', zOut < exp.z && l.every((x) => x.text.endsWith(' m')), `zoom ${zOut.toFixed(1)} px/m`);

// Pan (linke Maustaste ziehen)
const before = await labels();
await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 60, cy + 30, { steps: 5 }); await page.mouse.move(cx + 120, cy + 60, { steps: 5 }); await page.mouse.up();
await settle(); await shot('05-2d-pan');
const after = await labels();
const dx = after[0].cx - before[0].cx, dy = after[0].cy - before[0].cy;
check('Pan (links) folgt der Maus 1:1', near(dx, 120, 4) && near(dy, 60, 4), `Δ ${dx.toFixed(1)}, ${dy.toFixed(1)}`);
// Rechte Maustaste: ebenfalls Pan, keine Rotation
await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' }); await page.mouse.move(cx - 80, cy + 40, { steps: 8 }); await page.mouse.up({ button: 'right' });
await settle();
l = await labels();
check('Keine Rotation in 2D (N/S vertikal, O/W horizontal ausgerichtet)', near(l[0].cx, l[2].cx, 1) && near(l[1].cy, l[3].cy, 1));
check('Rechts-Ziehen = Pan', near(l[0].cx - after[0].cx, -80, 4) && near(l[0].cy - after[0].cy, 40, 4));

// Zurück zu 3D: Kamera unverändert
await toggle('3D'); await settle(); await shot('06-3d-after-2d');
check('3D: Labels ausgeblendet', (await labels()).length === 0);
const back3d = await canvasShot();
check('3D-Ansicht nach Wechsel identisch mit Startansicht', Buffer.compare(initial3d, back3d) === 0);

// Wieder 2D: automatisch neu eingepasst
await toggle('2D'); await settle();
l = await labels(); s = spans(l);
check('2D erneut: Raum neu eingepasst', near(s.ns, exp.ns) && near(s.ew, exp.ew));

// ---------- 8 × 3,5 m ----------
await setInput(0, '8'); await setInput(1, '3,5');
await settle(); await shot('07-2d-8x3.5');
l = await labels();
check('2D 8×3,5: Texte korrekt', JSON.stringify(l.map((x) => x.text)) === JSON.stringify(['8,00 m', '3,50 m', '8,00 m', '3,50 m']), l.map((x) => x.text).join(' | '));
exp = expectedFit(8, 3.5, 1440, 900); s = spans(l);
check('2D 8×3,5: Raum exakt eingepasst', near(s.ns, exp.ns) && near(s.ew, exp.ew), `ns ${s.ns.toFixed(1)}/${exp.ns.toFixed(1)}, ew ${s.ew.toFixed(1)}/${exp.ew.toFixed(1)}`);
await toggle('3D'); await settle(); await shot('08-3d-8x3.5');

// Mehrfach wechseln
for (let i = 0; i < 6; i++) { await toggle(i % 2 === 0 ? '2D' : '3D'); await page.waitForTimeout(150); }
await settle();
const vals = await inputValues();
check('Maße nach 6× Umschalten erhalten', JSON.stringify(vals) === JSON.stringify(['8,00', '3,50', '2,50']), vals.join(', '));
check('Nach 6× Umschalten 3D aktiv, keine Labels', (await labels()).length === 0);
await toggle('2D'); await settle();
l = await labels(); s = spans(l);
check('2D nach Mehrfachwechsel korrekt', l.length === 4 && near(s.ns, exp.ns) && near(s.ew, exp.ew));

// 3D-Controls weiterhin funktionsfähig (Drehen ändert Bild)
await toggle('3D'); await settle();
const pre = await canvasShot();
await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 150, cy, { steps: 8 }); await page.mouse.up();
await settle(); await shot('09-3d-rotated');
check('3D: Drehen funktioniert weiterhin', Buffer.compare(pre, await canvasShot()) !== 0);

// Tablet
await page.setViewportSize({ width: 820, height: 1180 }); await toggle('2D'); await settle(); await shot('10-tablet-2d');
l = await labels();
const tabExp = expectedFit(8, 3.5, 820 + 40, 1180); // Sidebar auf Tablet 240 statt 280 px
s = spans(l);
check('Tablet 2D: Labels im sichtbaren Bereich', l.every((x) => x.cx > 240 && x.cx < 820 && x.cy > 0 && x.cy < 1180));

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
