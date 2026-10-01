import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { analyzeImage, exportFile } from '../lib/images.mjs';
import { freeRoom, livingRoom, openScene } from '../lib/scenes.mjs';

/**
 * Export: 2D-Grundriss (PNG, ohne UI-Hilfselemente), 3D-Ansicht (PNG), Planungsbericht
 * (PDF), Projektdatei (.3draum) exportieren/importieren inkl. ungültiger Dateien,
 * unsicherer Zustände (ungespeicherte Änderungen) und fehlschlagender Exporte.
 */
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(1000);
const settle = (ms = 200) => page.waitForTimeout(ms);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'raum-export-'));
const openExport = async () => { await page.getByTestId('export-button').click(); await page.getByTestId('export-dialog').waitFor(); await settle(); };
const closeDialog = async () => { await page.keyboard.press('Escape'); await settle(); };
const exportMessage = () => page.getByTestId('export-message').textContent();
// Farben der Hilfselemente, die nie exportiert werden dürfen (Auswahl blau, Kollision rot)
const HELPERS = { selection: [37, 99, 235, 18], conflict: [217, 45, 32, 18] };

// ---------- Szene: Wohnzimmer mit Tür, Fenstern, Heizkörper, Möbeln und Lampen
await openScene(page, livingRoom('daylight'));
await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(900);
// Möbel auswählen (Auswahlrahmen, Abstandsmaße, Drehgriff sichtbar) – darf nicht im Export landen
await page.getByTestId('furniture-list-item').filter({ hasText: 'Sofa' }).click(); await settle(300);

// ---------- 1. Grundriss als PNG
await page.evaluate(() => {
  window.__texts = [];
  const original = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) { window.__texts.push(String(text)); return original.call(this, text, ...rest); };
});
await openExport();
check('Export-Dialog: vier Möglichkeiten', (await page.getByTestId('export-dialog').locator('[data-testid^="export-"][type="button"]').count()) === 4);
const planPng = await exportFile(page, 'export-plan-png');
check('Grundriss-PNG: Dateiname aus dem Projektnamen', planPng.name === 'Wohnzimmer daylight – Grundriss.png', planPng.name);
check('Rückmeldung nach dem Export', (await exportMessage()).includes('wurde heruntergeladen'));
const texts = await page.evaluate(() => window.__texts);
check('Grundriss-PNG: Möbelbezeichnungen und Wandmaße beschriftet', ['Sofa', 'Couchtisch', 'Sessel', 'TV-Board', 'Regal', 'Stehlampe', 'Deckenleuchte'].every((t) => texts.includes(t)) && texts.includes('5,50 m') && texts.includes('4,50 m'), JSON.stringify(texts.slice(0, 20)));
let img = await analyzeImage(page, planPng.path, { colors: HELPERS });
check('Grundriss-PNG: hochauflösend (≥ 2400 px), weißer Hintergrund', Math.max(img.width, img.height) >= 2400 && img.corners.every((c) => c.every((v) => v === 255)), JSON.stringify({ w: img.width, h: img.height, corners: img.corners }));
check('Grundriss-PNG: Raumkontur und Symbole vorhanden (dunkle Wand-/Linienanteile)', img.dark > 0.02 && img.white > 0.3, JSON.stringify({ dark: img.dark, white: img.white }));
check('Grundriss-PNG: keine Auswahl-/Kollisionsmarkierungen', img.counts.selection < 20 && img.counts.conflict < 20, JSON.stringify(img.counts));
fs.copyFileSync(planPng.path, `${OUT}/grundriss.png`);
await closeDialog();

// ---------- 2. 3D-Ansicht als PNG (aus der Bearbeitungsansicht → Vorschau wird kurz geöffnet)
await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(900);
const camBefore = await page.evaluate(() => window.__PLANNER_R3F__().camera.position.toArray().map((v) => +v.toFixed(3)));
await openExport();
const png3d = await exportFile(page, 'export-3d-png');
img = await analyzeImage(page, png3d.path, { colors: HELPERS });
check('3D-PNG: hochauflösend (≥ 2400 px)', Math.max(img.width, img.height) >= 2400, `${img.width}×${img.height}`);
check('3D-PNG: Bildinhalt (nicht leer, ausgewogen belichtet)', img.std > 20 && img.mean > 90 && img.mean < 245, JSON.stringify({ mean: img.mean, std: img.std }));
check('3D-PNG: keine Auswahlumrandung', img.counts.selection < 50, JSON.stringify(img.counts));
fs.copyFileSync(png3d.path, `${OUT}/3d.png`);
await closeDialog();
check('Nach dem 3D-Export: wieder „Bearbeiten“, Kamera unverändert', (await page.getByTestId('view-3d-mode').locator('[aria-pressed="true"]').textContent()) === 'Bearbeiten' && JSON.stringify(await page.evaluate(() => window.__PLANNER_R3F__().camera.position.toArray().map((v) => +v.toFixed(3)))) === JSON.stringify(camBefore));
// In der Vorschau: genau diese Ansicht
await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Vorschau' }).click(); await settle(1200);
const previewScreen = await page.screenshot({ clip: { x: 280, y: 0, width: 1160, height: 900 } });
fs.writeFileSync(path.join(tmp, 'screen.png'), previewScreen);
const screenStats = await analyzeImage(page, path.join(tmp, 'screen.png'));
await openExport();
const pngPreview = await exportFile(page, 'export-3d-png');
const exportStats = await analyzeImage(page, pngPreview.path);
check('3D-PNG in der Vorschau: entspricht der Ansicht (Seitenverhältnis, Helligkeit)', Math.abs(exportStats.width / exportStats.height - 1160 / 900) < 0.01 && Math.abs(exportStats.mean - screenStats.mean) < 12, JSON.stringify({ screen: screenStats.mean, export: exportStats.mean }));
await closeDialog();
await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Bearbeiten' }).click(); await settle(800);

// ---------- 3. Planungsbericht (PDF)
await openExport();
const pdf = await exportFile(page, 'export-pdf');
const bytes = fs.readFileSync(pdf.path);
const text = bytes.toString('latin1');
check('PDF: gültiger Kopf und Abschluss', text.startsWith('%PDF-1.4') && text.trimEnd().endsWith('%%EOF'));
const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
check('PDF: Querverweistabelle an der angegebenen Stelle', text.slice(startxref, startxref + 4) === 'xref');
const offsets = [...text.matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
check('PDF: alle Objekt-Offsets zeigen auf Objekte', offsets.length > 5 && offsets.every((o, i) => text.slice(o).startsWith(`${i + 1} 0 obj`)), `${offsets.length} Objekte`);
check('PDF: mindestens zwei Seiten, zwei Bilder (Grundriss + 3D-Vorschau)', (text.match(/\/Type \/Page /g) ?? []).length >= 2 && (text.match(/\/Subtype \/Image/g) ?? []).length === 2);
check('PDF: Projektname, Datum, Raumdaten, Möbelübersicht mit Maßen', ['Wohnzimmer daylight', 'Planungsbericht', 'Datum:', 'Raumdaten', 'Grundfl', 'Couchtisch', '110 \\327 60 \\327 42'.replace(/\\327/g, '×')].every((s) => text.includes(s.replace('×', '\xD7'))), '');
fs.copyFileSync(pdf.path, `${OUT}/bericht.pdf`);
await closeDialog();
check('PDF-Export ändert die Ansicht nicht', (await page.getByTestId('view-3d-mode').locator('[aria-pressed="true"]').textContent()) === 'Bearbeiten');

// ---------- 4. Projektdatei exportieren / importieren
await openExport();
const file = await exportFile(page, 'export-project');
const json = JSON.parse(fs.readFileSync(file.path, 'utf8'));
check('Projektdatei: .3draum, versioniert, vollständiger Plan', file.name === 'Wohnzimmer daylight.3draum' && json.format === 'raumplaner-project' && json.version === 7 && json.plan.furniture.length === 7 && json.plan.openings.length === 3 && json.plan.fixtures.length === 1 && json.plan.room.walls.length === 4 && !('origin' in json.plan.room), file.name);
await closeDialog();
const storedBefore = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('raumplaner:project:')).length);
// Datei für ein „anderes Gerät“: Namen ändern
json.name = 'Vom Tablet';
const importFile = path.join(tmp, 'vom-tablet.3draum');
fs.writeFileSync(importFile, JSON.stringify(json));
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-import-input').setInputFiles(importFile); await settle(800);
check('Import: als neues Projekt gespeichert und geöffnet', (await page.getByTestId('project-name').textContent()) === 'Vom Tablet' && (await page.getByTestId('project-status').getAttribute('data-state')) === 'saved' && (await page.getByTestId('furniture-list-item').count()) === 7);
check('Import: bestehendes Projekt nicht überschrieben (ein Projekt mehr)', (await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('raumplaner:project:')).length)) === storedBefore + 1);
check('Import: Meldung', (await page.getByTestId('project-notice').textContent()).includes('„Vom Tablet“ importiert'));

// Ungültige Dateien: verständlich abgelehnt, Plan bleibt unverändert
await page.getByTestId('furniture-list-item').first().click(); await settle();
await page.getByTestId('furniture-properties').getByLabel('Name', { exact: true }).fill('Geändert'); await page.keyboard.press('Enter'); await settle();
const invalid = [
  ['kaputt.3draum', '{"format":"raumplaner-project", "version": 5, ', 'kein gültiges JSON'],
  ['fremd.3draum', JSON.stringify({ hello: 'world' }), 'Unbekanntes Datenformat'],
  ['zukunft.3draum', JSON.stringify({ ...json, version: 99 }), 'neueren Version'],
  ['geometrie.3draum', JSON.stringify({ ...json, plan: { ...json.plan, room: { shape: 'free', height: 2.5, walls: [
    { id: 'a', start: { x: 0, z: 0 }, end: { x: 4, z: 4 }, height: 2.5, thickness: 0.15 },
    { id: 'b', start: { x: 4, z: 4 }, end: { x: 4, z: 0 }, height: 2.5, thickness: 0.15 },
    { id: 'c', start: { x: 4, z: 0 }, end: { x: 0, z: 4 }, height: 2.5, thickness: 0.15 },
    { id: 'd', start: { x: 0, z: 4 }, end: { x: 0, z: 0 }, height: 2.5, thickness: 0.15 },
  ] } } }), 'Grundriss ist ungültig'],
];
for (const [name, content, expected] of invalid) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, content);
  await page.getByTestId('projects-button').click(); await settle();
  await page.getByTestId('project-import-input').setInputFiles(p); await settle(400);
  const alert = await page.getByTestId('projects-dialog').getByRole('alert').textContent().catch(() => '');
  check(`Ungültige Datei „${name}“: verständlich abgelehnt`, alert.includes(expected) && alert.includes('kann nicht importiert werden'), alert);
  await closeDialog();
}
check('Nach abgelehnten Importen: Plan unverändert (inkl. ungespeicherter Änderung)', (await page.getByTestId('furniture-list-item').first().textContent()).includes('Geändert') && (await page.getByTestId('project-status').getAttribute('data-state')) === 'dirty');
const big = path.join(tmp, 'gross.3draum');
fs.writeFileSync(big, 'x'.repeat(6 * 1024 * 1024));
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-import-input').setInputFiles(big); await settle(400);
check('Zu große Datei: abgelehnt', (await page.getByTestId('projects-dialog').getByRole('alert').textContent()).includes('zu groß'));
// Gültige Datei bei ungespeicherten Änderungen → Rückfrage, Abbrechen lässt alles unverändert
await page.getByTestId('project-import-input').setInputFiles(importFile); await settle(400);
check('Import bei ungespeicherten Änderungen: Rückfrage', (await page.getByTestId('confirm-dialog').count()) === 1);
await page.getByTestId('confirm-cancel').click(); await settle();
await closeDialog();
check('Abgebrochen: Plan unverändert', (await page.getByTestId('furniture-list-item').first().textContent()).includes('Geändert'));

// ---------- 5. Export schlägt fehl → verständliche Meldung, App läuft weiter
await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); }; });
await openExport();
await page.getByTestId('export-plan-png').click(); await settle(600);
check('Fehlgeschlagener Export: Meldung', (await exportMessage()).startsWith('Export fehlgeschlagen'), await exportMessage());
check('Nach Fehler: Export-Buttons wieder bedienbar', await page.getByTestId('export-plan-png').isEnabled());
await closeDialog();

// ---------- 6. Freie Form: Grundriss-Export mit schräger Wand
await page.reload(); await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(800);
// V1.1: Die Änderung „Geändert“ ist ungespeichert → Wiederherstellungsangebot; hier bewusst verwerfen.
check('Neu laden mit ungespeicherten Änderungen: Wiederherstellungsangebot', (await page.getByTestId('recovery-dialog').count()) === 1);
await page.getByTestId('recovery-discard').click(); await settle(400);
await openScene(page, freeRoom());
await openExport();
const freePng = await exportFile(page, 'export-plan-png');
img = await analyzeImage(page, freePng.path);
check('Freie Form: Grundriss-PNG erzeugt', img.width > 2000 && img.dark > 0.02);
fs.copyFileSync(freePng.path, `${OUT}/grundriss-freie-form.png`);
await closeDialog();

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
