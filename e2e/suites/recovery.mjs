import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { exportFile } from '../lib/images.mjs';
import { addFurniture } from '../lib/planner.mjs';
import { item, openScene, project, rectangleWalls } from '../lib/scenes.mjs';

/**
 * V1.1 Block C – Autosave, Wiederherstellung und „Speichern unter“ im Browser:
 * gedrosseltes Sichern (nie während einer Geste), Angebot nach dem Neuladen (Name, Zeit),
 * Wiederherstellen/Verwerfen für neue und gespeicherte Projekte, Speichern räumt den Entwurf
 * ab, „Speichern unter“ (neue ID, Original unverändert), beschädigte/zukünftige/veraltete
 * Entwürfe sowie Schreibfehler ohne Wiederholungsschleife (Projektdatei-Export bleibt möglich).
 */
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const KEY = 'raumplaner:recovery';

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
// Schreibzugriffe auf den Entwurf mitzählen; „e2e:fail-recovery“ simuliert einen vollen Speicher.
await context.addInitScript((KEY) => {
  window.__recoveryWrites = [];
  const setItem = Storage.prototype.setItem;
  const getItem = Storage.prototype.getItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === KEY) {
      window.__recoveryWrites.push(Date.now());
      if (getItem.call(this, 'e2e:fail-recovery')) throw new DOMException('Speicher voll (Test)', 'QuotaExceededError');
    }
    return setItem.call(this, key, value);
  };
}, KEY);
const page = await context.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
// Neuladen mit ungespeicherten Änderungen: die „Seite verlassen?“-Rückfrage bestätigen.
page.on('dialog', (d) => d.accept());
const settle = (ms = 250) => page.waitForTimeout(ms);
const ready = async () => { await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(800); };
await page.goto(process.env.E2E_DEV_URL); await ready();

const draft = () => page.evaluate((KEY) => { const raw = localStorage.getItem(KEY); try { return raw === null ? null : JSON.parse(raw); } catch { return raw; } }, KEY);
const writes = () => page.evaluate(() => window.__recoveryWrites.length);
const stored = (id) => page.evaluate((id) => JSON.parse(localStorage.getItem(`raumplaner:project:${id}`)), id);
const dialog = page.getByTestId('recovery-dialog');
const status = () => page.getByTestId('project-status').getAttribute('data-state');
const projectName = () => page.getByTestId('project-name').textContent();
const notice = () => page.getByTestId('project-notice').textContent().catch(() => '');
const furnitureCount = () => page.getByTestId('furniture-list-item').count();
const reload = async () => { await page.reload(); await ready(); };
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const screenOf = (id) => page.evaluate((id) => {
  const s = window.__PLANNER_R3F__();
  const v = s.scene.getObjectByName(id).getWorldPosition(s.camera.position.clone()).setY(0.02).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, id);
const firstFurnitureId = () => page.evaluate(() => { let id = null; window.__PLANNER_R3F__().scene.traverse((o) => !id && o.userData?.furnitureId && (id = o.userData.furnitureId)); return id; });

// ---------- Start ohne Entwurf
check('Start: kein Wiederherstellungsdialog, kein Entwurf', (await dialog.count()) === 0 && (await draft()) === null);
await settle(1200);
check('Unveränderter Plan: es wird nichts gesichert', (await writes()) === 0 && (await draft()) === null);

// ---------- 1. Neues, nie gespeichertes Projekt ändern → gedrosselter Entwurf
await addFurniture(page, 'chair'); await settle(100);
check('1 · Änderung: Entwurf nicht sofort (Ruhezeit)', (await draft()) === null);
await settle(1400);
let d = await draft();
check('1 · Nach der Ruhezeit: Entwurf mit vollständigem Plan, Name und Zeit, ohne Basisprojekt',
  d?.format === 'raumplaner-recovery' && d.base === null && d.project.name === 'Unbenanntes Projekt' && d.project.plan.furniture.length === 1 && d.project.plan.room.walls.length === 4 && !Number.isNaN(Date.parse(d.savedAt)),
  JSON.stringify(d)?.slice(0, 160));
check('1 · Entwurf ist kein Projekt (nicht in der Projektliste)', await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('raumplaner:project:')).length === 0));

// Geste: während des Ziehens wird nicht gesichert, danach genau einmal
await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(900);
const chairId = await firstFurnitureId();
const from = await screenOf(chairId);
const beforeDrag = await writes();
await page.mouse.move(from.x, from.y); await page.mouse.down();
for (let i = 1; i <= 30; i++) { await page.mouse.move(from.x + i * 4, from.y + i * 2); await settle(60); }
const duringDrag = await writes();
await page.mouse.up(); await settle(1500);
const afterDrag = await writes();
check('1 · Ziehen (≈ 2 s, 30 Zeigerbewegungen): kein Schreiben während der Geste', duringDrag === beforeDrag, `${beforeDrag} → ${duringDrag}`);
check('1 · Nach dem Loslassen: genau ein Schreibvorgang', afterDrag === beforeDrag + 1, `${duringDrag} → ${afterDrag}`);
const draggedX = (await draft()).project.plan.furniture[0].position.x;

// ---------- 2. Neu laden → Angebot mit Name und Zeit
await reload();
check('2 · Neu laden: Dialog „Nicht gespeicherte Änderungen wiederherstellen?“', (await dialog.count()) === 1 && (await dialog.textContent()).includes('Nicht gespeicherte Änderungen wiederherstellen?'));
check('2 · Dialog nennt Projektname und Zeitpunkt', (await page.getByTestId('recovery-name').textContent()).includes('Unbenanntes Projekt') && /\d{2}:\d{2}/.test(await page.getByTestId('recovery-time').textContent()), await page.getByTestId('recovery-time').textContent());
check('2 · Nichts wird ungefragt geladen', (await furnitureCount()) === 0);
await page.keyboard.press('Escape'); await settle();
await page.mouse.click(5, 450); await settle();
check('2 · Esc und Klick daneben schließen den Dialog nicht, kein Schließen-Symbol', (await dialog.count()) === 1 && (await dialog.getByRole('button', { name: 'Schließen' }).count()) === 0);
await page.screenshot({ path: `${OUT}/01-recovery-dialog.png` });

// ---------- 3. Wiederherstellen
await page.getByTestId('recovery-restore').click(); await settle(600);
const restoredX = await page.evaluate(() => { let x = null; window.__PLANNER_R3F__().scene.traverse((o) => o.userData?.furnitureId && (x = o.position.x + 2.5)); return x; });
check('3 · Wiederherstellen: Plan exakt wie gesichert (Möbel samt gezogener Lage)', (await dialog.count()) === 0 && (await furnitureCount()) === 1 && Math.abs(restoredX - draggedX) < 0.001, `${restoredX} / ${draggedX}`);
check('3 · Projekt bleibt ungespeichert, Hinweis', (await status()) === 'dirty' && (await notice()).includes('wiederhergestellt'), `${await status()} ${await notice()}`);
await settle(1200);
check('3 · Entwurf bleibt erhalten (Änderungen weiter ungesichert)', (await draft())?.project.plan.furniture[0].position.x === draggedX);

// ---------- 4. Neu laden nach dem Wiederherstellen → erneutes Angebot; Verwerfen
await reload();
check('4 · Nach erneutem Neuladen: Angebot erneut (Änderungen sind noch nicht gespeichert)', (await dialog.count()) === 1);
await page.getByTestId('recovery-discard').click(); await settle(600);
check('4 · Verwerfen: Entwurf entfernt, leeres neues Projekt', (await dialog.count()) === 0 && (await draft()) === null && (await furnitureCount()) === 0 && (await status()) === 'new' && (await notice()).includes('verworfen'));
await settle(1200);
check('4 · Nach der Entscheidung: kein neuer Entwurf ohne Änderung', (await draft()) === null);
await reload();
check('4 · Neu laden nach dem Verwerfen: kein Dialog mehr', (await dialog.count()) === 0);

// ---------- 5. Gespeichertes Projekt ändern → wiederherstellen → speichern
const W = 5, L = 4;
const home = { ...project('wohnung', 'Wohnung', { walls: rectangleWalls(W, L, 2.5), furniture: [item('sofa', 'Sofa', 2.5, 3.4, 180, [2, 0.9, 0.85])] }), version: 7 };
await openScene(page, home);
check('5 · Gespeichertes Projekt geöffnet: kein Entwurf', (await status()) === 'saved' && (await draft()) === null);
await addFurniture(page, 'armchair'); await settle(1500);
d = await draft();
check('5 · Entwurf verweist auf das gespeicherte Projekt (ID, Speicherzeit)', d?.base?.id === 'wohnung' && d.base.updatedAt === home.updatedAt && d.project.name === 'Wohnung' && d.project.plan.furniture.length === 2, JSON.stringify(d?.base));
await reload();
check('5 · Neu laden: Angebot für „Wohnung“', (await dialog.count()) === 1 && (await page.getByTestId('recovery-name').textContent()).includes('Wohnung'));
await page.getByTestId('recovery-restore').click(); await settle(600);
check('5 · Wiederhergestellt: Projekt „Wohnung“ mit beiden Möbeln, ungespeichert', (await projectName()) === 'Wohnung' && (await furnitureCount()) === 2 && (await status()) === 'dirty');
check('5 · Gespeichertes Projekt selbst unverändert', (await stored('wohnung')).plan.furniture.length === 1);
await page.getByTestId('project-save').click(); await settle(400);
check('5 · Speichern: in dasselbe Projekt, Entwurf entfernt', (await stored('wohnung')).plan.furniture.length === 2 && (await status()) === 'saved' && (await draft()) === null);
await settle(1200);
check('5 · Gespeichert: kein neuer Entwurf', (await draft()) === null);
await reload();
check('5 · Neu laden nach dem Speichern: kein Dialog', (await dialog.count()) === 0);

// ---------- 6. Gespeichertes Projekt: Verwerfen öffnet den gespeicherten Stand
await page.getByTestId('projects-button').click(); await settle(300);
await page.locator('[data-project-id="wohnung"]').getByTestId('project-open').click(); await settle(900);
await addFurniture(page, 'plant'); await settle(1500);
await reload();
await page.getByTestId('recovery-discard').click(); await settle(900);
check('6 · Verwerfen: gespeicherter Stand von „Wohnung“ geöffnet (2 Möbel), gespeichert', (await projectName()) === 'Wohnung' && (await furnitureCount()) === 2 && (await status()) === 'saved' && (await draft()) === null);

// ---------- 7. „Speichern unter“: neue ID, Original unverändert, Entwurf zeigt auf das neue Projekt
await addFurniture(page, 'rug'); await settle(200);
await page.keyboard.press('ControlOrMeta+Shift+s'); await settle(300);
const saveDialog = page.getByTestId('save-project-dialog');
check('7 · Strg/⌘+Umschalt+S öffnet „Speichern unter“ mit Vorschlag „Wohnung Variante 2“', (await saveDialog.count()) === 1 && (await saveDialog.textContent()).includes('Speichern unter') && (await saveDialog.getByRole('textbox').inputValue()) === 'Wohnung Variante 2');
await page.getByTestId('save-project-submit').click(); await settle(400);
const ids = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('raumplaner:project:')).map((k) => k.slice('raumplaner:project:'.length)));
const copyId = ids.find((id) => id !== 'wohnung');
const copy = await stored(copyId);
const original = await stored('wohnung');
check('7 · Neues Projekt mit neuer ID und eigenen Zeitstempeln', ids.length === 2 && copy.name === 'Wohnung Variante 2' && copy.plan.furniture.length === 3 && copy.createdAt !== original.createdAt, JSON.stringify(ids));
check('7 · Original unverändert (2 Möbel, ohne Teppich)', original.plan.furniture.length === 2 && !original.plan.furniture.some((f) => f.type === 'rug'));
check('7 · Weiterarbeit im neuen Projekt: Name, gespeichert, kein Entwurf', (await projectName()) === 'Wohnung Variante 2' && (await status()) === 'saved' && (await draft()) === null && (await notice()).includes('bleibt unverändert'));
check('7 · Verlauf bleibt nutzbar (Undo „Möbel hinzufügen“)', (await undoTitle()) === 'Möbel hinzufügen rückgängig');
await page.keyboard.press('ControlOrMeta+z'); await settle(1500);
d = await draft();
check('7 · Undo nach „Speichern unter“: ungespeichert, Entwurf verweist auf das neue Projekt', (await status()) === 'dirty' && d?.base?.id === copyId && d.project.name === 'Wohnung Variante 2', JSON.stringify(d?.base));
await page.getByTestId('project-save').click(); await settle(400);
check('7 · Speichern schreibt in die Kopie, das Original bleibt', (await stored(copyId)).plan.furniture.length === 2 && (await stored('wohnung')).plan.furniture.length === 2 && (await draft()) === null);

// ---------- 8. Beschädigter, zukünftiger und veralteter Entwurf
await page.evaluate((KEY) => localStorage.setItem(KEY, '{kaputt'), KEY);
await reload();
check('8 · Beschädigter Entwurf: kein Dialog, verständlicher Hinweis, entfernt', (await dialog.count()) === 0 && (await notice()).includes('beschädigter') && (await draft()) === null, await notice());
const valid = { format: 'raumplaner-recovery', savedAt: new Date().toISOString(), base: null, project: { ...home, id: 'entwurf', version: 99 } };
await page.evaluate(({ KEY, valid }) => localStorage.setItem(KEY, JSON.stringify(valid)), { KEY, valid });
await reload();
check('8 · Entwurf aus einer neueren Version: kein Dialog, Hinweis, entfernt', (await dialog.count()) === 0 && (await notice()).includes('neueren Version') && (await draft()) === null, await notice());
const stale = { format: 'raumplaner-recovery', savedAt: '2020-01-01T10:00:00.000Z', base: { id: copyId, updatedAt: '2020-01-01T09:00:00.000Z' }, project: { ...copy, plan: { ...copy.plan, furniture: [] } } };
await page.evaluate(({ KEY, stale }) => localStorage.setItem(KEY, JSON.stringify(stale)), { KEY, stale });
await reload();
check('8 · Entwurf älter als die letzte Speicherung (z. B. anderer Tab): kein Dialog, entfernt', (await dialog.count()) === 0 && (await draft()) === null);

// ---------- 9. Schreibfehler (Speicher voll): ein Hinweis, keine Wiederholungsschleife, Export bleibt möglich
await page.getByTestId('projects-button').click(); await settle(300);
await page.locator(`[data-project-id="${copyId}"]`).getByTestId('project-open').click(); await settle(900);
await page.evaluate(() => localStorage.setItem('e2e:fail-recovery', '1'));
const beforeFail = await writes();
await addFurniture(page, 'chair'); await settle(1500);
check('9 · Speicher voll: verständlicher Hinweis „Automatische Sicherung nicht möglich“', (await notice()).includes('Automatische Sicherung nicht möglich') && (await notice()).includes('voll'), await notice());
check('9 · Genau ein Schreibversuch', (await writes()) === beforeFail + 1, `${beforeFail} → ${await writes()}`);
await addFurniture(page, 'chair'); await settle(300);
await addFurniture(page, 'chair'); await settle(2000);
check('9 · Weitere Änderungen: keine weiteren Versuche (keine Schleife), App bedienbar', (await writes()) === beforeFail + 1 && (await furnitureCount()) === 5);
await page.getByTestId('export-button').click(); await page.getByTestId('export-dialog').waitFor(); await settle(200);
const file = await exportFile(page, 'export-project');
const json = JSON.parse(fs.readFileSync(file.path, 'utf8'));
check('9 · Projektdatei-Export trotzdem möglich (aktueller Stand, ohne Entwurfsdaten)', json.format === 'raumplaner-project' && json.plan.furniture.length === 5 && !fs.readFileSync(file.path, 'utf8').includes('raumplaner-recovery'));
await page.keyboard.press('Escape'); await settle();
await page.evaluate(() => localStorage.removeItem('e2e:fail-recovery'));
await page.getByTestId('project-save').click(); await settle(400);
await addFurniture(page, 'plant'); await settle(1500);
check('9 · Nach erfolgreichem Speichern: Autosave arbeitet wieder', (await draft())?.project.plan.furniture.length === 6 && (await writes()) === beforeFail + 2);

// ---------- 10. Kein Schreiben im Leerlauf
const idle = await writes();
await settle(3000);
check('10 · Leerlauf (3 s): keine weiteren Schreibvorgänge', (await writes()) === idle);

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
