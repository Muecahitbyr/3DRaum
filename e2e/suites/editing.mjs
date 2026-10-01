import { chromium } from 'playwright-core';
import { addFurniture as addFromLibrary } from '../lib/planner.mjs';

/**
 * Bearbeiten: Duplizieren, Kopieren/Einfügen, Tastatursteuerung, Mehrfachauswahl
 * (Shift+Klick, Auswahlrahmen), gemeinsames Verschieben, Gruppen, Ausrichten,
 * Undo/Redo und Speichern/Laden von Gruppen.
 */
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.0051) => Math.abs(a - b) <= tol;
const num = (s) => Number(String(s).replace(',', '.'));

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(1000);
const settle = (ms = 200) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const W = 5, L = 4;

const props = page.getByTestId('furniture-properties');
const multi = page.getByTestId('multi-selection');
const field = (label) => props.getByLabel(label, { exact: true });
const setField = async (label, text) => { const i = field(label); await i.click(); await i.fill(text); await i.press('Enter'); await settle(100); };
const place = async (x, z, r = '0') => { await setField('Rotation', r); await setField('X-Position', x); await setField('Z-Position', z); };
const addFurniture = async (type) => { await addFromLibrary(page, type); await settle(); };
const selectByName = async (name) => { await page.getByTestId('furniture-list-item').filter({ has: page.locator(`span[title="${name}"]`) }).click(); await settle(); };
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const key = async (combo) => { await page.keyboard.press(combo); await settle(); };
const clickEmpty = async () => { const p = await toScreen(W - 0.15, L - 0.15); await page.mouse.click(p.x, p.y); await settle(); };
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const undo = () => key('ControlOrMeta+z');
const redo = () => key('ControlOrMeta+Shift+z');

/** Alle Möbel: Name (Liste), ID, Position (Grundriss) und Auswahlzustand (Szene). */
const items = async () => {
  const names = await page.getByTestId('furniture-list-item').evaluateAll((els) => els.map((e) => e.querySelector('span[title]').title));
  const scene = await page.evaluate(({ W, L }) => {
    const out = [];
    window.__PLANNER_R3F__().scene.traverse((o) => {
      if (o.userData?.furnitureId) out.push({ id: o.userData.furnitureId, x: Math.round((o.position.x + W / 2) * 1000) / 1000, z: Math.round((o.position.z + L / 2) * 1000) / 1000, selected: !!o.userData.selected });
    });
    return out.sort((a, b) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]));
  }, { W, L });
  return scene.map((s, i) => ({ ...s, name: names[i] }));
};
const byName = async (name) => (await items()).find((i) => i.name === name);
const names = async () => (await items()).map((i) => i.name);
const selectedNames = async () => (await items()).filter((i) => i.selected).map((i) => i.name).sort();
const selectionCount = async () => ((await multi.count()) ? num((await page.getByTestId('multi-selection-count').textContent()).split(' ')[0]) : (await props.count()) ? 1 : 0);
const boundsCount = () => page.evaluate(() => { let n = 0; window.__PLANNER_R3F__().scene.traverse((o) => o.name === 'selection-bounds' && n++); return n; });
const clearanceCount = () => page.locator('[data-testid^="clearance-"]').count();

const toScreen = (x, z) => page.evaluate(({ x, z }) => {
  const s = window.__PLANNER_R3F__();
  const v = s.camera.position.clone().set(x, 0.02, z).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, { x: x - W / 2, z: z - L / 2 });
const clickAt = async (x, z, modifiers = []) => {
  const p = await toScreen(x, z);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.mouse.click(p.x, p.y);
  for (const m of modifiers) await page.keyboard.up(m);
  await settle();
};
async function drag(from, to, { shift = false } = {}) {
  const a = await toScreen(from.x, from.z);
  const b = await toScreen(to.x, to.z);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 6 });
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await settle(120);
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  await settle(200);
}

await toggle('2D');

// ---------- 1. Duplizieren ----------
await addFurniture('chair');
await place('1', '1');
await key('ControlOrMeta+d');
let all = await items();
check('Strg/⌘+D: Kopie „Stuhl 2“ entsteht', JSON.stringify(all.map((i) => i.name)) === '["Stuhl 1","Stuhl 2"]', JSON.stringify(all));
check('Kopie leicht versetzt (+20 cm/+20 cm) und ausgewählt', near(all[1].x, 1.2) && near(all[1].z, 1.2) && (await field('Name').inputValue()) === 'Stuhl 2' && all[1].selected && !all[0].selected);
check('Verlauf: „Möbel duplizieren“', (await undoTitle()) === 'Möbel duplizieren rückgängig');
await props.getByTestId('duplicate-furniture').click(); await settle();
all = await items();
check('Button „Duplizieren“ im Eigenschaftenbereich: „Stuhl 3“', all.length === 3 && all[2].name === 'Stuhl 3' && near(all[2].x, 1.4) && near(all[2].z, 1.4), JSON.stringify(all));
await undo();
check('Undo entfernt die Kopie', (await names()).length === 2);
await redo();
check('Redo stellt sie wieder her', JSON.stringify(await names()) === '["Stuhl 1","Stuhl 2","Stuhl 3"]');

// ---------- 2. Kopieren / Einfügen ----------
await selectByName('Stuhl 1');
await key('ControlOrMeta+c');
check('Kopieren verändert den Plan nicht', (await names()).length === 3);
await key('ControlOrMeta+v');
all = await items();
check('Einfügen: „Stuhl 4“ versetzt neben dem Original', all.length === 4 && all[3].name === 'Stuhl 4' && near(all[3].x, 1.2) && near(all[3].z, 1.2), JSON.stringify(all.at(-1)));
await key('ControlOrMeta+v');
all = await items();
check('Erneut einfügen: weiter versetzt („Stuhl 5“ bei 1,40/1,40)', all.length === 5 && all[4].name === 'Stuhl 5' && near(all[4].x, 1.4) && near(all[4].z, 1.4), JSON.stringify(all.at(-1)));
check('Verlauf: „Möbel einfügen“', (await undoTitle()) === 'Möbel einfügen rückgängig');

// ---------- 3. Kürzel nicht in Eingabefeldern ----------
const nameInput = field('Name');
await nameInput.click(); await nameInput.press('End');
await page.keyboard.press('ControlOrMeta+d'); await page.keyboard.press('Backspace'); await settle();
// „Stuhl 5“ → „Stuhl “: genau ein Zeichen gelöscht (das Leerzeichen bleibt beim Tippen erhalten).
check('Im Textfeld: Strg/⌘+D dupliziert nicht, Rücktaste löscht nur ein Zeichen', (await names()).length === 5 && (await nameInput.inputValue()) === 'Stuhl ', JSON.stringify([await names(), await nameInput.inputValue()]));
await nameInput.fill('Stuhl 5'); await nameInput.press('Enter'); await settle();
const xInput = field('X-Position');
await xInput.click(); await page.keyboard.press('ArrowRight'); await settle();
check('Im Zahlenfeld: Pfeiltasten verschieben das Möbel nicht über die Szene', near((await byName('Stuhl 5')).x, 1.4));
await xInput.blur(); await settle();

// ---------- 4. Löschen per Tastatur ----------
await selectByName('Stuhl 5');
await key('Delete');
check('Entf löscht das ausgewählte Möbel', JSON.stringify(await names()) === '["Stuhl 1","Stuhl 2","Stuhl 3","Stuhl 4"]');
await selectByName('Stuhl 4');
await key('Backspace');
check('Rücktaste löscht ebenfalls', (await names()).length === 3);
await undo();
check('Undo stellt „Stuhl 4“ wieder her', (await names()).includes('Stuhl 4'));
await selectByName('Stuhl 4'); await key('Delete');

// ---------- 5. Pfeiltasten ----------
await selectByName('Stuhl 1');
await key('ArrowRight');
check('→ verschiebt um 1 cm', near((await byName('Stuhl 1')).x, 1.01));
await key('Shift+ArrowDown');
check('Shift+↓ verschiebt um 10 cm', near((await byName('Stuhl 1')).z, 1.1));
check('Sidebar zeigt die neue Position', (await field('X-Position').inputValue()) === '1,01' && (await field('Z-Position').inputValue()) === '1,10');
// Gedrückt halten = ein Verlaufsschritt
await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowLeft'); await page.keyboard.up('ArrowLeft'); await settle();
check('Gedrückt gehaltene Taste: 3 × 1 cm', near((await byName('Stuhl 1')).x, 0.98));
check('Verlauf: „Möbel verschieben“', (await undoTitle()) === 'Möbel verschieben rückgängig');
await undo();
check('Ein Undo macht die ganze Tastenfolge rückgängig', near((await byName('Stuhl 1')).x, 1.01) && near((await byName('Stuhl 1')).z, 1.1));
await place('0,23', '1');
await key('Shift+ArrowLeft');
check('An der Wand: Möbel bleibt im Raum (x = halbe Breite)', near((await byName('Stuhl 1')).x, 0.225));
await place('1', '1');

// Dialog offen → keine Kürzel
await page.getByTestId('furniture-library-button').click(); await settle();
await page.keyboard.press('Delete'); await page.keyboard.press('ControlOrMeta+d'); await settle();
check('Bei offenem Dialog: keine Kürzel', (await names()).length === 3);
await page.keyboard.press('Escape'); await page.getByTestId('furniture-library').waitFor({ state: 'detached' }); await settle();

// ---------- 6. Mehrfachauswahl per Shift+Klick ----------
await selectByName('Stuhl 2'); await place('2', '1');
await selectByName('Stuhl 3'); await place('3,5', '3');
await clickEmpty();
await clickAt(1, 1);
check('Klick wählt ein Möbel (mit Abstandsmaßen)', JSON.stringify(await selectedNames()) === '["Stuhl 1"]' && (await clearanceCount()) > 0);
await clickAt(2, 1, ['Shift']);
check('Shift+Klick ergänzt die Auswahl', JSON.stringify(await selectedNames()) === '["Stuhl 1","Stuhl 2"]' && (await selectionCount()) === 2);
check('Mehrfachauswahl: Rahmen sichtbar, Abstandsmaße ausgeblendet, Bereich „Mehrfachauswahl“', (await boundsCount()) === 1 && (await clearanceCount()) === 0 && (await multi.count()) === 1);
check('Möbelliste markiert beide', (await page.getByTestId('furniture-list-item').evaluateAll((els) => els.filter((e) => e.getAttribute('aria-pressed') === 'true').length)) === 2);
await clickAt(2, 1, ['Shift']);
check('Erneuter Shift+Klick entfernt wieder', JSON.stringify(await selectedNames()) === '["Stuhl 1"]');
await clickAt(2, 1, ['Shift']);

// Gemeinsam verschieben
await drag({ x: 1, z: 1 }, { x: 1.5, z: 1.8 });
let s1 = await byName('Stuhl 1'), s2 = await byName('Stuhl 2'), s3 = await byName('Stuhl 3');
check('Ziehen verschiebt die ganze Auswahl um denselben Versatz', near(s2.x - s1.x, 1) && near(s2.z - s1.z, 0) && near(s1.x, 1.5, 0.03) && near(s1.z, 1.8, 0.03), JSON.stringify([s1, s2]));
check('Nicht ausgewählte Möbel bleiben stehen', near(s3.x, 3.5) && near(s3.z, 3));
check('Auswahl bleibt nach dem Ziehen erhalten', (await selectionCount()) === 2);
check('Verlauf: ein Schritt „Möbel verschieben“', (await undoTitle()) === 'Möbel verschieben rückgängig');
await undo();
s1 = await byName('Stuhl 1'); s2 = await byName('Stuhl 2');
check('Undo setzt beide zurück', near(s1.x, 1) && near(s1.z, 1) && near(s2.x, 2) && near(s2.z, 1));
// An die Wand: Formation bleibt vollständig im Raum
await drag({ x: 1, z: 1 }, { x: -2, z: 1 });
s1 = await byName('Stuhl 1'); s2 = await byName('Stuhl 2');
check('Formation an der Wand begrenzt, Abstand bleibt', near(s1.x, 0.225) && near(s2.x - s1.x, 1), JSON.stringify([s1.x, s2.x]));
await undo();

// Mehrfach: Pfeiltasten, Duplizieren
await key('Shift+ArrowRight');
s1 = await byName('Stuhl 1'); s2 = await byName('Stuhl 2');
check('Pfeiltasten verschieben alle ausgewählten', near(s1.x, 1.1) && near(s2.x, 2.1));
await undo();
await key('ControlOrMeta+d');
all = await items();
check('Mehrfach duplizieren: zwei Kopien, beide ausgewählt', all.length === 5 && JSON.stringify(await selectedNames()) === '["Stuhl 4","Stuhl 5"]', JSON.stringify(all.map((i) => i.name)));
await multi.getByTestId('delete-selection').click(); await settle();
check('„Löschen“ im Mehrfachbereich entfernt alle ausgewählten', (await names()).length === 3 && (await selectionCount()) === 0);

// ---------- 7. Auswahlrahmen ----------
await clickEmpty();
await drag({ x: 0.5, z: 0.5 }, { x: 2.5, z: 1.5 }, { shift: true });
check('Shift+Ziehen auf freier Fläche: Rahmen wählt Stuhl 1 und 2', JSON.stringify(await selectedNames()) === '["Stuhl 1","Stuhl 2"]');
s1 = await byName('Stuhl 1');
check('Auswahlrahmen verschiebt nichts', near(s1.x, 1) && near(s1.z, 1));
await drag({ x: 3, z: 2.5 }, { x: 4, z: 3.5 }, { shift: true });
check('Weiterer Rahmen ergänzt (Stuhl 3)', JSON.stringify(await selectedNames()) === '["Stuhl 1","Stuhl 2","Stuhl 3"]');
await clickEmpty();
check('Klick ins Leere hebt die Auswahl auf', (await selectionCount()) === 0);
const cam0 = await page.evaluate(() => window.__PLANNER_R3F__().camera.position.toArray());
await drag({ x: 4.5, z: 0.5 }, { x: 4, z: 1 });
const cam1 = await page.evaluate(() => window.__PLANNER_R3F__().camera.position.toArray());
check('Ziehen ohne Shift verschiebt weiterhin die Ansicht', Math.abs(cam0[0] - cam1[0]) > 0.1, JSON.stringify([cam0, cam1]));
await toggle('3D'); await toggle('2D');
await shot('01-marquee');

// ---------- 8. Gruppen ----------
await clickAt(1, 1); await clickAt(2, 1, ['Shift']);
await multi.getByTestId('group-furniture').click(); await settle();
check('Gruppieren: Bereich heißt „Gruppe 1“, Verlauf „Möbel gruppieren“', (await multi.locator('h2').textContent()) === 'Gruppe 1' && (await undoTitle()) === 'Möbel gruppieren rückgängig');
await clickEmpty();
await clickAt(2, 1);
check('Klick auf ein Gruppenmitglied wählt die ganze Gruppe', JSON.stringify(await selectedNames()) === '["Stuhl 1","Stuhl 2"]');
await drag({ x: 2, z: 1 }, { x: 2, z: 2 });
s1 = await byName('Stuhl 1'); s2 = await byName('Stuhl 2');
check('Gruppe wird gemeinsam verschoben', near(s1.z, 2, 0.03) && near(s2.z, 2, 0.03) && near(s2.x - s1.x, 1));
await clickEmpty();
await drag({ x: 1, z: s1.z }, { x: 1, z: s1.z - 1 });
s1 = await byName('Stuhl 1'); s2 = await byName('Stuhl 2');
check('Direkt ein Mitglied greifen (ohne Vorauswahl) zieht die ganze Gruppe', near(s1.z, 1, 0.03) && near(s2.z, 1, 0.03));
await selectByName('Stuhl 1');
check('Listen-Klick wählt einzelnes Mitglied (Eigenschaften mit Gruppenhinweis)', (await selectionCount()) === 1 && (await props.getByTestId('furniture-group-info').count()) === 1);
await setField('Breite', '0,5');
check('Mitglieder bleiben normale Möbel (Maße einzeln bearbeitbar)', (await field('Breite').inputValue()) === '0,50');
await clickAt(1, 1);
const beforeDup = { selected: await selectedNames(), active: await page.evaluate(() => document.activeElement?.tagName + ':' + (document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.id)) };
await key('ControlOrMeta+d');
all = await items();
check('Gruppe duplizieren: 2 Kopien', all.length === 5, JSON.stringify({ names: all.map((i) => i.name), beforeDup }));
await clickEmpty();
const copy = all.find((i) => i.name === 'Stuhl 4');
// Kopie liegt teilweise über Stuhl 1 → Punkt nur auf der Kopie wählen.
const clickCopy = () => clickAt(copy.x + 0.15, copy.z + 0.15);
await clickCopy();
check('Kopie ist wieder eine Gruppe (Klick wählt beide Kopien)', JSON.stringify(await selectedNames()) === '["Stuhl 4","Stuhl 5"]' && (await multi.locator('h2').textContent()) === 'Gruppe 2');
await multi.getByTestId('ungroup-furniture').click(); await settle();
check('Gruppe auflösen', (await undoTitle()) === 'Gruppe auflösen rückgängig' && (await multi.getByTestId('group-furniture').count()) === 1);
await clickEmpty(); await clickCopy();
check('Nach dem Auflösen: Klick wählt nur ein Möbel', JSON.stringify(await selectedNames()) === '["Stuhl 4"]');
await undo();
await clickEmpty(); await clickCopy();
check('Undo stellt die Gruppe wieder her', (await selectionCount()) === 2);
await multi.getByTestId('delete-selection').click(); await settle();
check('Gelöschte Gruppe verschwindet samt Mitgliedern', (await names()).length === 3);

// ---------- 9. Ausrichten ----------
await clickEmpty();
await addFurniture('table'); // Esstisch 1: 1,40 × 0,80
await place('2,5', '3');
await props.getByTestId('align-left').click(); await settle();
check('Links ausrichten: Grundfläche an linker Wand', near((await byName('Esstisch 1')).x, 0.7));
await props.getByTestId('align-bottom').click(); await settle();
check('Unten ausrichten', near((await byName('Esstisch 1')).z, L - 0.4));
await setField('Rotation', '90');
await props.getByTestId('align-right').click(); await settle();
check('Gedreht (90°): rechts mit tatsächlicher Grundfläche (0,80 breit)', near((await byName('Esstisch 1')).x, W - 0.4));
await props.getByTestId('align-top').click(); await settle();
check('Gedreht (90°): oben (1,40 tief)', near((await byName('Esstisch 1')).z, 0.7));
await props.getByTestId('align-center-x').click(); await settle();
await props.getByTestId('align-center-z').click(); await settle();
check('Horizontal und vertikal zentriert', near((await byName('Esstisch 1')).x, W / 2) && near((await byName('Esstisch 1')).z, L / 2));
await setField('Rotation', '0'); await place('1', '1');
await props.getByTestId('align-center').click(); await settle();
check('„Im Raum zentrieren“', near((await byName('Esstisch 1')).x, W / 2) && near((await byName('Esstisch 1')).z, L / 2));
check('Verlauf: „Möbel ausrichten“', (await undoTitle()) === 'Möbel ausrichten rückgängig');
// Mehrere: Formation bleibt erhalten
await clickEmpty();
await clickAt(1, 1);
check('Gruppe (Stuhl 1 + 2) per Klick ausgewählt', (await selectionCount()) === 2);
await multi.getByTestId('align-bottom').click(); await settle();
s1 = await byName('Stuhl 1'); s2 = await byName('Stuhl 2');
check('Mehrere unten ausrichten: gemeinsame Unterkante an der Wand, Anordnung bleibt', near(s1.z + 0.26, L) && near(s2.z - s1.z, 0) && near(s2.x - s1.x, 1), JSON.stringify([s1, s2]));
await multi.getByTestId('align-left').click(); await settle();
s1 = await byName('Stuhl 1'); s2 = await byName('Stuhl 2');
check('Mehrere links ausrichten: linkes Möbel an der Wand, Abstand bleibt', near(s1.x - 0.25, 0) && near(s2.x - s1.x, 1), JSON.stringify([s1.x, s2.x]));
await undo(); await undo();

// ---------- 10. 3D: Auswahl und Shift ----------
await toggle('3D');
check('3D: Mehrfachauswahl bleibt beim Ansichtswechsel erhalten', (await selectionCount()) === 2);
await toggle('2D');

// ---------- 11. Speichern / Laden mit Gruppe ----------
await page.getByTestId('project-save').click(); await settle();
await page.getByTestId('save-project-dialog').getByLabel('Projektname').fill('Gruppen');
await page.getByTestId('save-project-dialog').getByLabel('Projektname').press('Enter'); await settle(200);
const stored = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('raumplaner:project:')); return JSON.parse(localStorage.getItem(k)); });
check('Gruppe gespeichert (Version 6)', stored.version === 6 && stored.plan.groups.length === 1 && stored.plan.groups[0].memberIds.length === 2, JSON.stringify(stored.plan.groups));
await page.reload(); await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(800);
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Gruppen' }).getByTestId('project-open').click(); await settle(600);
await toggle('2D');
s1 = await byName('Stuhl 1');
await clickAt(s1.x, s1.z);
check('Nach dem Laden: Gruppe intakt (Klick wählt beide)', JSON.stringify(await selectedNames()) === '["Stuhl 1","Stuhl 2"]');
await key('ControlOrMeta+d');
check('Nach dem Laden: neue IDs kollidieren nicht', new Set((await items()).map((i) => i.id)).size === (await items()).length && (await names()).length === 6);
await shot('02-group');

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
