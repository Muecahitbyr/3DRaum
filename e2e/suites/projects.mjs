import { chromium } from 'playwright-core';
import { addFurniture } from '../lib/planner.mjs';

const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const num = (s) => Number(String(s).replace(',', '.'));

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
const unloadPrompts = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', async (d) => { if (d.type() === 'beforeunload') unloadPrompts.push(Date.now()); await d.accept(); });
const settle = (ms = 150) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const ready = async () => { await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(600); };
await page.goto(process.env.E2E_DEV_URL); await ready();

const fp = page.getByTestId('furniture-properties');
const op = page.getByTestId('opening-properties');
const room = page.getByRole('region', { name: 'Raummaße' });
const setIn = async (panel, label, text) => { const i = panel.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(80); };
const val = (panel, label) => panel.getByLabel(label, { exact: true }).inputValue();
const status = async () => ({ state: await page.getByTestId('project-status').getAttribute('data-state'), text: (await page.getByTestId('project-status').textContent()).trim(), name: (await page.getByTestId('project-name').textContent()).trim() });
const notice = async () => ((await page.getByTestId('project-notice').count()) ? (await page.getByTestId('project-notice').textContent()).trim() : null);
const count = (kind) => page.getByTestId(`${kind}-list-item`).count();
const undoEnabled = () => page.getByTestId('history-undo').isEnabled();
const redoEnabled = () => page.getByTestId('history-redo').isEnabled();
const dialog = page.getByTestId('projects-dialog');
const openProjects = async () => { await page.getByTestId('projects-button').click(); await settle(); };
const closeDialog = async () => { await page.keyboard.press('Escape'); await settle(); };
const item = (name) => dialog.getByTestId('project-item').filter({ has: page.getByTestId('project-item-name').getByText(name, { exact: true }) });
const projectNames = () => dialog.getByTestId('project-item-name').allTextContents();
const confirmDialog = page.getByTestId('confirm-dialog');
const saveNew = async (name) => {
  await page.getByTestId('project-save').click(); await settle();
  const input = page.getByTestId('save-project-dialog').getByLabel('Projektname');
  await input.fill(name); await input.press('Enter'); await settle(200);
};
const cameraPos = () => page.evaluate(() => window.__PLANNER_R3F__().camera.position.toArray().map((v) => +v.toFixed(4)));
const storageKeys = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('raumplaner:project:')));

// ---------- 1. Ausgangszustand ----------
let s = await status();
check('Start: „Unbenanntes Projekt“, noch nicht gespeichert', s.state === 'new' && s.name === 'Unbenanntes Projekt' && s.text === 'Noch nicht gespeichert', JSON.stringify(s));
await openProjects();
check('Projektliste leer', (await dialog.getByText('Noch keine gespeicherten Projekte.').count()) === 1);
await closeDialog();
check('Esc schließt die Projektübersicht', (await dialog.count()) === 0);

// ---------- 2. Plan aufbauen → ungespeichert ----------
await setIn(room, 'Breite', '6'); await setIn(room, 'Länge', '4,5');
s = await status();
check('Nach Änderung: „Ungespeicherte Änderungen“', s.state === 'dirty' && s.text === 'Ungespeicherte Änderungen');
await page.getByTestId('add-door').click(); await settle(); await setIn(op, 'Abstand von links', '0,6');
await page.getByTestId('add-window').click(); await settle(); await setIn(op, 'Breite', '1,6');
await addFurniture(page, 'bed'); await settle(); await setIn(fp, 'X-Position', '1,4'); await setIn(fp, 'Z-Position', '1,2');
await addFurniture(page, 'sofa'); await settle();
await setIn(fp, 'Name', 'Couch'); await setIn(fp, 'Breite', '2,2'); await setIn(fp, 'Rotation', '90'); await setIn(fp, 'X-Position', '5,3'); await setIn(fp, 'Z-Position', '2,5');
await addFurniture(page, 'table'); await settle(); await setIn(fp, 'X-Position', '3'); await setIn(fp, 'Z-Position', '3,4');
const expectedCouch = { name: 'Couch', width: '2,20', rot: '90' };

// ---------- 3. Speichern mit Namen ----------
await page.getByTestId('project-save').click(); await settle();
const saveDialog = page.getByTestId('save-project-dialog');
check('Neues Projekt speichern fragt nach dem Namen', (await saveDialog.count()) === 1);
check('Ohne Namen kein Speichern möglich', !(await page.getByTestId('save-project-submit').isEnabled()));
await saveDialog.getByLabel('Projektname').fill('Wohnzimmer'); await saveDialog.getByLabel('Projektname').press('Enter'); await settle(200);
s = await status();
check('Gespeichert: Name „Wohnzimmer“, Status „Gespeichert“', s.state === 'saved' && s.name === 'Wohnzimmer' && s.text === 'Gespeichert', JSON.stringify(s));
check('Rückmeldung „„Wohnzimmer“ gespeichert.“', (await notice()) === '„Wohnzimmer“ gespeichert.');
const stored = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('raumplaner:project:')); return JSON.parse(localStorage.getItem(k)); });
check('Gespeichertes Format: versioniert, nur Plan (keine UI-/Kamera-Zustände)',
  stored.format === 'raumplaner-project' && stored.version === 7 &&
  JSON.stringify(Object.keys(stored).sort()) === JSON.stringify(['createdAt', 'format', 'id', 'name', 'plan', 'updatedAt', 'version']) &&
  JSON.stringify(Object.keys(stored.plan).sort()) === JSON.stringify(['design', 'fixtures', 'furniture', 'groups', 'openings', 'room']),
  Object.keys(stored).join(','));
check('Gespeichert: Raum (4 Wände, 6 m breit), 2 Öffnungen, 3 Möbel inkl. Name/Rotation', stored.plan.room.walls.length === 4 && stored.plan.room.walls.find((w) => w.id === 'north').end.x - stored.plan.room.walls.find((w) => w.id === 'north').start.x === 6 && stored.plan.openings.length === 2 && stored.plan.furniture.length === 3 && stored.plan.furniture.some((f) => f.name === 'Couch' && f.rotationDeg === 90));

// ---------- 4. Ungespeicherte Änderungen erkennen ----------
await setIn(fp, 'Höhe', '0,9');
check('Änderung nach dem Speichern → ungespeichert', (await status()).state === 'dirty');
await page.getByTestId('history-undo').click(); await settle();
check('Rückgängig bis zum gespeicherten Stand → wieder „Gespeichert“', (await status()).state === 'saved');
await setIn(fp, 'Höhe', '0,9');
await page.mouse.click(1390, 880); await settle();
await page.keyboard.press('Control+s'); await settle(200);
check('Strg+S speichert bestehendes Projekt direkt (ohne Dialog)', (await status()).state === 'saved' && (await saveDialog.count()) === 0);
await setIn(room, 'Höhe', '2,6');
await page.keyboard.press('Meta+s'); await settle(200);
check('Cmd+S speichert ebenfalls', (await status()).state === 'saved');

// ---------- 5. Neu laden und wieder öffnen ----------
await setIn(room, 'Höhe', '2,7'); // ungespeichert → Warnung beim Neuladen
await page.mouse.click(1390, 880);
await page.reload(); await ready();
check('Neuladen mit ungespeicherten Änderungen: Browser-Warnung', unloadPrompts.length === 1);
s = await status();
check('Nach Neuladen: Standardraum, neues Projekt', s.state === 'new' && num(await val(room, 'Breite')) === 5 && (await count('furniture')) === 0);
await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(500);
await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(500);
const cam5x4 = await cameraPos();
await openProjects();
check('Übersicht: Name und „Zuletzt geändert“', (await item('Wohnzimmer').count()) === 1 && /Zuletzt geändert: \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}/.test(await item('Wohnzimmer').textContent()));
await item('Wohnzimmer').getByTestId('project-open').click(); await settle(500);
check('Öffnen: Dialog schließt, Rückmeldung', (await dialog.count()) === 0 && (await notice()) === '„Wohnzimmer“ geöffnet.');
check('Raummaße wiederhergestellt (6,00 × 4,50 × 2,60)', (await val(room, 'Breite')) === '6,00' && (await val(room, 'Länge')) === '4,50' && (await val(room, 'Höhe')) === '2,60');
check('Türen/Fenster und Möbel wiederhergestellt', (await count('opening')) === 2 && (await count('furniture')) === 3);
await page.getByTestId('furniture-list-item').filter({ hasText: 'Couch' }).click(); await settle();
{ const got = { name: await val(fp, 'Name'), w: await val(fp, 'Breite'), r: await val(fp, 'Rotation'), x: await val(fp, 'X-Position'), z: await val(fp, 'Z-Position'), h: await val(fp, 'Höhe') };
  check('Möbel inkl. Name, Maße, Rotation, Position', got.name === expectedCouch.name && got.w === expectedCouch.width && got.r === '90' && got.x === '5,30' && got.z === '2,50' && got.h === '0,85', JSON.stringify(got) + ' erwartet Breite ' + expectedCouch.width); }
await page.getByTestId('furniture-list-item').filter({ hasText: 'Tisch' }).click(); await settle();
check('Später gespeicherte Änderung (Tischhöhe 0,90) ebenfalls wiederhergestellt', (await val(fp, 'Höhe')) === '0,90');
await page.getByTestId('opening-list-item').first().click(); await settle();
check('Tür an alter Position (0,60)', (await val(op, 'Abstand von links')) === '0,60');
s = await status();
check('Nach Öffnen: „Gespeichert“, Name „Wohnzimmer“', s.state === 'saved' && s.name === 'Wohnzimmer');
const camOpened = await cameraPos();
check('Kamera auf größeren Raum neu eingepasst', JSON.stringify(camOpened) !== JSON.stringify(cam5x4) && Math.hypot(...camOpened) > Math.hypot(...cam5x4), `${cam5x4} → ${camOpened}`);
await shot('p-opened');

// ---------- 6. Undo/Redo und Auswahl nach Projektwechsel ----------
check('Verlauf nach Öffnen leer (Undo/Redo deaktiviert)', !(await undoEnabled()) && !(await redoEnabled()));
await page.mouse.move(900, 450); await page.mouse.down(); await page.mouse.move(1100, 420, { steps: 8 }); await page.mouse.up(); await settle(300); // Kamera drehen
await page.getByTestId('furniture-list-item').first().click(); await settle();
await setIn(fp, 'Höhe', '0,6'); // Änderung (Undo möglich)
check('Änderung im geöffneten Projekt: Undo möglich', await undoEnabled());

// ---------- 7. Mehrere Projekte / Neues Projekt mit Warnung ----------
await openProjects(); await dialog.getByTestId('project-new').click(); await settle();
check('Neues Projekt bei ungespeicherten Änderungen: Warnung', (await confirmDialog.count()) === 1 && (await confirmDialog.textContent()).includes('„Wohnzimmer“ hat ungespeicherte Änderungen'));
await page.getByTestId('confirm-cancel').click(); await settle();
check('Abbrechen: Plan unverändert, Übersicht noch offen', (await count('furniture')) === 3 && (await dialog.count()) === 1);
await dialog.getByTestId('project-new').click(); await settle();
await page.getByTestId('confirm-accept').click(); await settle(400);
s = await status();
check('„Verwerfen und neu beginnen“: Standardraum, neues Projekt', s.state === 'new' && (await val(room, 'Breite')) === '5,00' && (await count('furniture')) === 0 && (await count('opening')) === 0);
check('Neues Projekt: Verlauf leer, Auswahl leer', !(await undoEnabled()) && !(await redoEnabled()) && (await fp.count()) === 0);
check('Kamera beim neuen Projekt wieder auf Standardraum eingepasst', JSON.stringify(await cameraPos()) === JSON.stringify(cam5x4));
await addFurniture(page, 'bed'); await settle();
await saveNew('Schlafzimmer');
await openProjects();
check('Zwei Projekte, zuletzt geändertes zuerst', JSON.stringify(await projectNames()) === JSON.stringify(['Schlafzimmer', 'Wohnzimmer']), (await projectNames()).join(', '));
check('Geöffnetes Projekt markiert', (await item('Schlafzimmer').textContent()).includes('Geöffnet') && !(await item('Wohnzimmer').textContent()).includes('Geöffnet'));
await item('Wohnzimmer').getByTestId('project-open').click(); await settle(500);
check('Ohne Änderungen: Öffnen ohne Rückfrage', (await confirmDialog.count()) === 0 && (await status()).name === 'Wohnzimmer' && (await count('furniture')) === 3);
check('Wohnzimmer = gespeicherter Stand (Höhe-Änderung verworfen)', await (async () => { await page.getByTestId('furniture-list-item').first().click(); await settle(); return (await val(fp, 'Höhe')) === '0,50'; })());
check('Auswahl beim Projektwechsel zurückgesetzt', await (async () => { await openProjects(); await item('Schlafzimmer').getByTestId('project-open').click(); await settle(400); return (await fp.count()) === 0; })());
check('Undo nach Wechsel greift nicht ins vorherige Projekt', !(await undoEnabled()));
await setIn(room, 'Breite', '3,5');
await page.getByTestId('history-undo').click(); await settle();
check('Undo nur innerhalb des Projekts, dann Ende', (await val(room, 'Breite')) === '5,00' && !(await undoEnabled()) && (await count('furniture')) === 1);
// Öffnen bei ungespeicherten Änderungen
await setIn(room, 'Breite', '4');
await openProjects(); await item('Wohnzimmer').getByTestId('project-open').click(); await settle();
check('Öffnen bei ungespeicherten Änderungen: Warnung', (await confirmDialog.count()) === 1 && (await page.getByTestId('confirm-accept').textContent()) === 'Verwerfen und öffnen');
await page.keyboard.press('Escape'); await settle();
check('Esc schließt nur die Rückfrage, Übersicht bleibt', (await confirmDialog.count()) === 0 && (await dialog.count()) === 1 && (await val(room, 'Breite')) === '4,00');
await item('Wohnzimmer').getByTestId('project-open').click(); await settle(); await page.getByTestId('confirm-accept').click(); await settle(400);
check('Bestätigt: Wohnzimmer geöffnet', (await status()).name === 'Wohnzimmer' && (await val(room, 'Breite')) === '6,00');
// Kamera deterministisch neu eingepasst (auch nach Drehen)
await page.mouse.move(900, 450); await page.mouse.down(); await page.mouse.move(700, 480, { steps: 8 }); await page.mouse.up(); await settle(300);
await openProjects(); await item('Wohnzimmer').getByTestId('project-open').click(); await settle(500);
check('Erneutes Öffnen passt Kamera identisch ein', JSON.stringify(await cameraPos()) === JSON.stringify(camOpened));

// ---------- 8. Umbenennen und Löschen ----------
await openProjects();
await item('Schlafzimmer').getByTestId('project-rename').click(); await settle();
const renameInput = dialog.getByTestId('project-rename-input');
await renameInput.fill('Gästezimmer'); await renameInput.press('Escape'); await settle();
check('Esc beim Umbenennen bricht nur das Umbenennen ab', (await dialog.count()) === 1 && (await item('Schlafzimmer').count()) === 1);
await item('Schlafzimmer').getByTestId('project-rename').click(); await settle();
await dialog.getByTestId('project-rename-input').fill('Kinderzimmer'); await dialog.getByTestId('project-rename-input').press('Enter'); await settle();
check('Umbenennen übernommen', (await item('Kinderzimmer').count()) === 1 && (await item('Schlafzimmer').count()) === 0);
await item('Wohnzimmer').getByTestId('project-rename').click(); await settle();
await dialog.getByTestId('project-rename-input').fill('Wohnzimmer groß'); await dialog.getByTestId('project-rename-save').click(); await settle();
check('Offenes Projekt umbenannt → Anzeige oben aktualisiert', (await status()).name === 'Wohnzimmer groß' && (await status()).state === 'saved');
await item('Kinderzimmer').getByTestId('project-delete').click(); await settle();
check('Löschen fragt nach', (await confirmDialog.count()) === 1 && (await confirmDialog.textContent()).includes('„Kinderzimmer“ wird dauerhaft'));
await page.getByTestId('confirm-cancel').click(); await settle();
check('Löschen abgebrochen: Projekt bleibt', (await item('Kinderzimmer').count()) === 1);
await item('Kinderzimmer').getByTestId('project-delete').click(); await settle(); await page.getByTestId('confirm-accept').click(); await settle();
check('Gelöscht: aus Liste und Speicher entfernt', (await item('Kinderzimmer').count()) === 0 && (await storageKeys()).length === 1);
await item('Wohnzimmer groß').getByTestId('project-delete').click(); await settle(); await page.getByTestId('confirm-accept').click(); await settle();
s = await status();
check('Offenes Projekt gelöscht: Plan bleibt, gilt als ungespeichert', (await count('furniture')) === 3 && s.state === 'dirty' && s.name === 'Unbenanntes Projekt');
await closeDialog();
await saveNew('Wohnzimmer');

// ---------- 9. Beschädigte Daten ----------
await page.evaluate(() => {
  const v1 = (id, plan, extra = {}) => JSON.stringify({ format: 'raumplaner-project', version: 1, id, name: id, createdAt: '2026-01-01T10:00:00.000Z', updatedAt: '2026-01-01T10:00:00.000Z', plan, ...extra });
  localStorage.setItem('raumplaner:project:kaputt', '{"format":"raumplaner-project", nicht json');
  localStorage.setItem('raumplaner:project:zukunft', JSON.stringify({ format: 'raumplaner-project', version: 99, id: 'zukunft', name: 'Aus der Zukunft', plan: {} }));
  localStorage.setItem('raumplaner:project:fremd', '[1,2,3]');
  localStorage.setItem('raumplaner:project:ohne-masse', v1('Ohne Maße', { dimensions: { width: 'breit' }, openings: [], furniture: [] }));
  localStorage.setItem('raumplaner:project:teilweise', v1('Teilweise', {
    dimensions: { width: 500, length: 4, height: 2.5 },
    openings: [
      { id: 'opening-1', type: 'door', wall: 'south', offset: 1, width: 0.9, height: 2.1 },
      { id: 'opening-2', type: 'window', wall: 'nirgendwo', offset: 1, width: 1, height: 1, sillHeight: 1 },
    ],
    furniture: [
      { id: 'furniture-1', type: 'bed', name: 'Gästebett', width: 2, depth: 0.9, height: 0.5, position: { x: 99, z: 1 }, rotationDeg: 450 },
      { id: 'furniture-2', type: 'rakete', width: 1, depth: 1, height: 1, position: { x: 1, z: 1 } },
      { id: 'furniture-1', type: 'table', width: 1, depth: 1, height: 1, position: { x: 1, z: 1 } },
    ],
  }));
});
await page.reload(); await ready();
check('App startet trotz beschädigter Daten', (await page.getByTestId('projects-button').count()) === 1);
await openProjects();
const itemText = async (id) => page.locator(`[data-project-id="${id}"]`).textContent();
check('Kaputtes JSON: markiert, Öffnen gesperrt', (await itemText('kaputt')).includes('Nicht lesbar: Die gespeicherten Daten sind beschädigt') && !(await page.locator('[data-project-id="kaputt"]').getByTestId('project-open').isEnabled()));
check('Neuere Formatversion: markiert', (await itemText('zukunft')).includes('neueren Version') && (await itemText('zukunft')).includes('Aus der Zukunft'));
check('Fremdes Format und fehlende Maße: markiert', (await itemText('fremd')).includes('Unbekanntes Datenformat') && (await itemText('ohne-masse')).includes('Raummaße sind ungültig'));
await page.locator('[data-project-id="teilweise"]').getByTestId('project-open').click(); await settle(500);
check('Teilweise beschädigt: öffnet mit Hinweis auf übersprungene Elemente', (await notice())?.includes('3 Elemente konnten nicht gelesen werden'), await notice());
check('Gültige Teile geladen, Werte normalisiert (Breite 500 → 30,00)', (await val(room, 'Breite')) === '30,00' && (await count('opening')) === 1 && (await count('furniture')) === 1);
await page.getByTestId('furniture-list-item').first().click(); await settle();
check('Möbel normalisiert: Rotation 450° → 90°, Position im Raum', (await val(fp, 'Name')) === 'Gästebett' && (await val(fp, 'Rotation')) === '90' && num(await val(fp, 'X-Position')) <= 30);
await openProjects();
await page.locator('[data-project-id="kaputt"]').getByTestId('project-delete').click(); await settle(); await page.getByTestId('confirm-accept').click(); await settle();
check('Beschädigtes Projekt löschbar', (await page.locator('[data-project-id="kaputt"]').count()) === 0);
await closeDialog();

// ---------- 10. Speicher voll ----------
await setIn(room, 'Breite', '7');
await page.evaluate(() => { Storage.prototype._setItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('voll', 'QuotaExceededError'); }; });
await page.mouse.click(1390, 880); await page.keyboard.press('Control+s'); await settle(200);
check('Speicher voll: verständliche Fehlermeldung, App läuft weiter', (await notice())?.includes('Der lokale Speicher ist voll') && (await status()).state === 'dirty');
await page.evaluate(() => { Storage.prototype.setItem = Storage.prototype._setItem; });
await page.keyboard.press('Control+s'); await settle(200);
check('Danach erfolgreich gespeichert', (await status()).state === 'saved');
await shot('p-final');

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
