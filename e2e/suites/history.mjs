import { chromium } from 'playwright-core';
import { addFurniture } from '../lib/planner.mjs';

const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const num = (s) => Number(String(s).replace(',', '.'));
const near = (a, b, tol = 0.0105) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(800);
const settle = (ms = 150) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const W = 5, L = 4;

const undoBtn = page.getByTestId('history-undo');
const redoBtn = page.getByTestId('history-redo');
const hist = async () => ({
  canUndo: await undoBtn.isEnabled(), canRedo: await redoBtn.isEnabled(),
  undo: (await undoBtn.getAttribute('title')).replace(/ \(.*\)$/, ''), redo: (await redoBtn.getAttribute('title')).replace(/ \(.*\)$/, ''),
});
const undo = async () => { await undoBtn.click(); await settle(); };
const redo = async () => { await redoBtn.click(); await settle(); };
const fp = page.getByTestId('furniture-properties');
const op = page.getByTestId('opening-properties');
const setIn = async (panel, label, text) => { const i = panel.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(80); };
const val = (panel, label) => panel.getByLabel(label, { exact: true }).inputValue();
const pos = async () => ({ x: num(await val(fp, 'X-Position')), z: num(await val(fp, 'Z-Position')) });
const items = (kind) => page.getByTestId(`${kind}-list-item`);
const roomPanel = page.getByRole('region', { name: 'Raummaße' });
const roomWidth = async () => num(await page.locator('aside input').first().inputValue());
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(700); };
const toScreen = (x, z) => page.evaluate(({ x, z }) => {
  const s = window.__PLANNER_R3F__(); const v = s.camera.position.clone().set(x, 2.6, z).project(s.camera); const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, { x: x - W / 2, z: z - L / 2 });
async function drag(from, to, { steps = 12, during, escape } = {}) {
  const a = await toScreen(from.x, from.z); const b = await toScreen(to.x, to.z);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps }); await settle(100);
  if (during) await during();
  if (escape) { await page.keyboard.press('Escape'); await settle(80); }
  await page.mouse.up(); await settle(150);
}
const clickEmpty = async () => { await page.mouse.click(1390, 880); await settle(); };

// ---------- Ausgangszustand ----------
let h = await hist();
check('Start: Rückgängig und Wiederholen deaktiviert', !h.canUndo && !h.canRedo, JSON.stringify(h));
await toggle('2D');

// ---------- 1. Möbel verschieben → Undo → Redo (Drag = 1 Schritt) ----------
await addFurniture(page, 'bed'); await settle(200);
h = await hist();
check('Möbel hinzufügen → Tooltip „Möbel hinzufügen rückgängig“', h.canUndo && h.undo === 'Möbel hinzufügen rückgängig', h.undo);
await drag({ x: 2.5, z: 2 }, { x: 1.4, z: 1.2 }, { steps: 20 });
let p = await pos();
h = await hist();
check('Möbel ziehen (20 Mausbewegungen) → „Möbel verschieben rückgängig“', near(p.x, 1.4) && near(p.z, 1.2) && h.undo === 'Möbel verschieben rückgängig', `${p.x}/${p.z} · ${h.undo}`);
await undo();
p = await pos(); h = await hist();
check('Undo: Position zurück (2,50 / 2,00)', p.x === 2.5 && p.z === 2);
check('Drag war genau EIN Schritt (nächster Undo-Schritt: Hinzufügen)', h.undo === 'Möbel hinzufügen rückgängig' && h.canRedo && h.redo === 'Möbel verschieben wiederholen', `${h.undo} | ${h.redo}`);
await redo();
p = await pos(); h = await hist();
check('Redo: wieder verschoben, Redo danach deaktiviert', near(p.x, 1.4) && near(p.z, 1.2) && !h.canRedo);

// ---------- 2. Möbel drehen (Handle) ----------
{
  const hb = await page.getByTestId('rotation-handle').boundingBox();
  const hc = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }; const c = await toScreen(1.4, 1.2);
  const r = Math.hypot(hc.x - c.x, hc.y - c.y);
  await page.mouse.move(hc.x, hc.y); await page.mouse.down();
  for (let d = 5; d <= 90; d += 5) await page.mouse.move(c.x + r * Math.sin((d * Math.PI) / 180), c.y - r * Math.cos((d * Math.PI) / 180));
  await page.mouse.up(); await settle(150);
}
h = await hist();
check('Drehen über Handle (18 Schritte) → ein Schritt „Möbel drehen“', (await val(fp, 'Rotation')) === '90' && h.undo === 'Möbel drehen rückgängig', h.undo);
await undo();
check('Undo Drehen: 0°, Position unverändert', (await val(fp, 'Rotation')) === '0' && near((await pos()).x, 1.4));
await redo();
check('Redo Drehen: 90°', (await val(fp, 'Rotation')) === '90');

// ---------- 3. Löschen und wiederherstellen ----------
await page.getByTestId('delete-furniture').click(); await settle(200);
h = await hist();
check('Löschen → „Möbel löschen rückgängig“', (await items('furniture').count()) === 0 && h.undo === 'Möbel löschen rückgängig');
await undo();
await items('furniture').first().click(); await settle();
p = await pos();
check('Undo: Möbel wieder da (Name, Position, Rotation)', (await items('furniture').count()) === 1 && (await val(fp, 'Name')) === 'Einzelbett 1' && near(p.x, 1.4) && (await val(fp, 'Rotation')) === '90');
await redo();
check('Redo: wieder gelöscht', (await items('furniture').count()) === 0);
await undo();
await items('furniture').first().click(); await settle();

// ---------- 4. Tür/Fenster ----------
await page.getByTestId('add-door').click(); await settle(200); // Südwand, 2,05
const doorOffset = async () => num(await val(op, 'Abstand von links'));
await drag({ x: 2.5, z: 4.075 }, { x: 3.9, z: 4.075 }, { steps: 15 });
h = await hist();
check('Tür ziehen → ein Schritt „Tür verschieben“', near(await doorOffset(), 3.45) && h.undo === 'Tür verschieben rückgängig', `${await doorOffset()} · ${h.undo}`);
await undo();
check('Undo: Tür zurück auf 2,05', (await doorOffset()) === 2.05 && (await hist()).undo === 'Tür hinzufügen rückgängig');
await redo();
await op.getByLabel('Breite', { exact: true }).click();
await op.getByLabel('Breite', { exact: true }).fill('1');
await op.getByLabel('Breite', { exact: true }).fill('1,1');
await op.getByLabel('Breite', { exact: true }).press('Enter'); await settle();
h = await hist();
check('Türbreite tippen (Zwischenwerte „1“ und „1,1“ live) → ein Schritt „Türmaße ändern“', (await val(op, 'Breite')) === '1,10' && h.undo === 'Türmaße ändern rückgängig', h.undo);
await undo();
check('Undo: Breite in EINEM Schritt zurück auf 0,90', (await val(op, 'Breite')) === '0,90' && (await hist()).undo === 'Tür verschieben rückgängig');
await page.getByTestId('add-window').click(); await settle(200);
await op.getByLabel('Wand').selectOption('east'); await settle();
check('Fenster auf andere Wand → „Fenster verschieben“', (await hist()).undo === 'Fenster verschieben rückgängig');
await undo();
check('Undo: Fenster wieder an der Nordwand', (await op.getByLabel('Wand').inputValue()) === 'north');
await page.getByTestId('delete-opening').click(); await settle();
check('Fenster löschen → „Fenster löschen“', (await hist()).undo === 'Fenster löschen rückgängig');
await undo();
check('Undo: Fenster wiederhergestellt', (await items('opening').count()) === 2);

// ---------- 5. Raumgröße ----------
await items('furniture').first().click(); await settle();
const bedBefore = await pos();
await setIn(roomPanel, 'Breite', '1,5'); // Bett (90°, 0,90 m breit) wird eingerückt, Tür/Fenster angepasst
h = await hist();
check('Raumbreite 1,50 m → „Raummaße ändern“, Möbel eingerückt', (await roomWidth()) === 1.5 && h.undo === 'Raummaße ändern rückgängig' && (await pos()).x !== bedBefore.x, `${(await pos()).x}`);
await undo();
p = await pos();
check('Undo: Breite 5,00 und Möbel/Öffnungen exakt wie vorher', (await roomWidth()) === 5 && p.x === bedBefore.x && p.z === bedBefore.z && (await items('opening').count()) === 2);

// ---------- 6. Mehrere Aktionen hintereinander ----------
await addFurniture(page, 'sofa'); await settle(200);
await setIn(fp, 'Name', 'Couch');
await setIn(fp, 'Höhe', '0,95');
await setIn(fp, 'Rotation', '90');
await setIn(fp, 'X-Position', '3');
const labels = [];
for (let i = 0; i < 5; i++) { labels.push((await hist()).undo); await undo(); }
check('Undo-Reihenfolge: Verschieben, Drehen, Maße, Name, Hinzufügen', labels.join(' | ') === ['Möbel verschieben', 'Möbel drehen', 'Möbelmaße ändern', 'Möbelname ändern', 'Möbel hinzufügen'].map((l) => l + ' rückgängig').join(' | '), labels.join(' | '));
check('Nach 5× Undo: Sofa entfernt, Bett vorhanden', (await items('furniture').count()) === 1);
for (let i = 0; i < 5; i++) await redo();
await items('furniture').nth(1).click(); await settle();
check('5× Redo: Couch, 0,95 m, 90°, X 3,00', (await val(fp, 'Name')) === 'Couch' && (await val(fp, 'Höhe')) === '0,95' && (await val(fp, 'Rotation')) === '90' && (await val(fp, 'X-Position')) === '3,00');

// ---------- 7. Neue Aktion nach Undo verwirft Redo ----------
await undo();
check('Nach Undo: Redo möglich', (await hist()).canRedo);
await setIn(fp, 'Z-Position', '3');
h = await hist();
check('Neue Änderung nach Undo: Redo-Verlauf verworfen', !h.canRedo && h.undo === 'Möbel verschieben rückgängig');

// ---------- 8. Tastenkürzel ----------
await clickEmpty();
const w0 = await roomWidth();
await setIn(roomPanel, 'Breite', '6');
await page.mouse.click(1390, 880);
await page.keyboard.press('Meta+z'); await settle();
check('Cmd+Z (macOS): rückgängig', (await roomWidth()) === w0);
await page.keyboard.press('Meta+Shift+z'); await settle();
check('Cmd+Shift+Z: wiederholen', (await roomWidth()) === 6);
await page.keyboard.press('Control+z'); await settle();
check('Strg+Z: rückgängig', (await roomWidth()) === w0);
await page.keyboard.press('Control+Shift+z'); await settle();
check('Strg+Shift+Z: wiederholen', (await roomWidth()) === 6);
await page.keyboard.press('Control+z'); await settle();
await page.keyboard.press('Control+y'); await settle();
check('Strg+Y: wiederholen', (await roomWidth()) === 6);
await page.keyboard.press('Control+z'); await settle();
// In Textfeldern gilt das native Rückgängig
await items('furniture').first().click(); await settle();
const before = await hist();
await fp.getByLabel('Name', { exact: true }).click();
await page.keyboard.press('Control+z'); await page.keyboard.press('Meta+z'); await settle();
check('Kürzel im Textfeld lösen keinen Planer-Undo aus', (await roomWidth()) === w0 && (await items('furniture').count()) === 2 && (await hist()).undo === before.undo);
await clickEmpty();

// ---------- 9. Nicht im Verlauf: Auswahl, Ansicht, Kamera, reines Anklicken, Esc ----------
const ref = await hist();
await items('furniture').first().click(); await settle(); await items('opening').first().click(); await settle(); await clickEmpty();
await toggle('3D'); await page.mouse.move(900, 450); await page.mouse.down(); await page.mouse.move(1050, 470, { steps: 8 }); await page.mouse.up(); await settle(300);
await page.mouse.wheel(0, -300); await settle(300);
await toggle('2D'); await page.mouse.move(1350, 250); await page.mouse.down(); await page.mouse.move(1320, 280, { steps: 5 }); await page.mouse.up(); await settle(300);
check('Auswahl, 2D/3D-Wechsel, Drehen/Zoomen/Pannen: kein Verlaufseintrag', JSON.stringify(await hist()) === JSON.stringify(ref), JSON.stringify(await hist()));
await items('furniture').first().click(); await settle();
p = await pos();
{ const c = await toScreen(p.x, p.z); await page.mouse.click(c.x, c.y); await settle(); }
check('Möbel im Grundriss nur anklicken: kein Verlaufseintrag', JSON.stringify(await hist()) === JSON.stringify(ref));
await drag(p, { x: p.x + 0.8, z: p.z }, { escape: true });
check('Ziehen mit Esc abgebrochen: kein Verlaufseintrag', JSON.stringify(await hist()) === JSON.stringify(ref) && (await pos()).x === p.x);

// ---------- 10. Undo während einer Geste / während einer Feldeingabe ----------
await drag(p, { x: p.x + 0.6, z: p.z }, { during: async () => { await page.keyboard.press('Control+z'); await settle(80); } });
h = await hist();
check('Strg+Z während des Ziehens wird ignoriert; Ziehen = ein Schritt', near((await pos()).x, p.x + 0.6) && h.undo === 'Möbel verschieben rückgängig');
await undo();
check('… und ist danach normal rückgängig zu machen', (await pos()).x === p.x);
const xField = fp.getByLabel('X-Position', { exact: true });
await xField.click(); await xField.fill('1,5'); await settle();
check('Während der Feldeingabe: Rückgängig aktiv mit passender Beschriftung', (await hist()).canUndo && (await hist()).undo === 'Möbel verschieben rückgängig');
await undo();
check('Klick auf Rückgängig bei fokussiertem Feld macht die Eingabe als Ganzes rückgängig', (await pos()).x === p.x, `${(await pos()).x}`);

// ---------- 11. Maximal 100 Schritte ----------
await clickEmpty();
const widths = Array.from({ length: 105 }, (_, i) => (5 + (i + 1) / 100).toFixed(2).replace('.', ','));
for (const w of widths) await setIn(roomPanel, 'Breite', w);
check('105 Änderungen ausgeführt', (await roomWidth()) === 6.05);
await page.mouse.click(1390, 880);
for (let i = 0; i < 100; i++) await page.keyboard.press('Control+z');
await settle(300);
h = await hist();
check('Nach 100× Undo: Limit erreicht, Rückgängig deaktiviert', !h.canUndo, JSON.stringify(h));
check('Stand = nach der 5. Änderung (ältere Schritte verworfen)', (await roomWidth()) === 5.05, `${await roomWidth()}`);
for (let i = 0; i < 100; i++) await page.keyboard.press('Control+Shift+z');
await settle(300);
check('100× Redo: wieder 6,05, Redo deaktiviert', (await roomWidth()) === 6.05 && !(await hist()).canRedo);
await shot('history-final');

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
