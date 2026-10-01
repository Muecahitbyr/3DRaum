import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { exportFile } from '../lib/images.mjs';
import { item, livingRoom, openScene, project, rectangleWalls } from '../lib/scenes.mjs';

/**
 * Fehlerbehandlung & Robustheit: kein WebGL, kein lokaler Speicher, Speicher voll beim
 * Import, sehr kleine/große Räume, sehr viele Möbel, schnelles Undo/Redo und schnelles
 * Umschalten 2D/3D/Vorschau. Die App darf in keinem Fall weiß werden.
 */
const OUT = process.env.OUT;
const URL = process.env.E2E_DEV_URL;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

async function openPage({ init, viewport = { width: 1440, height: 900 }, waitScene = true } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  if (waitScene) await page.waitForFunction(() => !!window.__PLANNER_R3F__);
  else await page.getByTestId('sidebar').waitFor();
  await page.waitForTimeout(900);
  return { context, page, settle: (ms = 200) => page.waitForTimeout(ms) };
}
/** Die Oberfläche ist sichtbar (nicht „weiß“): Seitenleiste und Projektleiste gerendert. */
const alive = async (page) => (await page.getByTestId('sidebar').count()) === 1 && (await page.getByTestId('projects-button').isVisible()) && (await page.getByTestId('app-error').count()) === 0;
const roomInput = (page, label) => page.getByTestId('room-panel').getByLabel(label, { exact: true });
const setRoom = async (page, label, value) => { const i = roomInput(page, label); await i.click(); await i.fill(value); await i.press('Enter'); await page.waitForTimeout(250); };

// ---------- 1. Kein WebGL
{
  const { context, page, settle } = await openPage({
    waitScene: false,
    init: () => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        return /webgl/.test(String(type)) ? null : original.call(this, type, ...rest);
      };
    },
  });
  check('Ohne WebGL: verständlicher Hinweis statt 3D-Ansicht', (await page.getByTestId('webgl-missing').textContent()).includes('3D-Darstellung nicht verfügbar'));
  check('Ohne WebGL: App bleibt bedienbar', await alive(page));
  await setRoom(page, 'Breite', '6,2');
  check('Ohne WebGL: Raummaße änderbar', (await roomInput(page, 'Breite').inputValue()) === '6,20');
  await page.getByTestId('export-button').click(); await settle(300);
  check('Ohne WebGL: 3D-Bild deaktiviert, mit Begründung', !(await page.getByTestId('export-3d-png').isEnabled()) && (await page.getByTestId('export-3d-png').textContent()).includes('nicht verfügbar'));
  const png = await exportFile(page, 'export-plan-png');
  check('Ohne WebGL: Grundriss-PNG funktioniert', png.name.endsWith('Grundriss.png') && fs.statSync(png.path).size > 20_000);
  const pdf = await exportFile(page, 'export-pdf');
  const text = fs.readFileSync(pdf.path).toString('latin1');
  check('Ohne WebGL: PDF-Bericht ohne 3D-Bild', text.startsWith('%PDF') && (text.match(/\/Subtype \/Image/g) ?? []).length === 1);
  await page.screenshot({ path: `${OUT}/ohne-webgl.png` });
  await context.close();
}

// ---------- 2. Lokaler Speicher nicht verfügbar (z. B. gesperrt)
{
  const { context, page, settle } = await openPage({
    init: () => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('gesperrt', 'SecurityError'); } }); },
  });
  check('Ohne lokalen Speicher: App startet', await alive(page));
  await page.getByTestId('project-save').click(); await settle(300);
  if (await page.getByTestId('save-project-dialog').count()) {
    await page.getByTestId('save-project-dialog').getByLabel('Projektname').fill('Testprojekt');
    await page.getByTestId('save-project-submit').click(); await settle(300);
  }
  const notice = (await page.getByTestId('project-notice').textContent().catch(() => '')) || (await page.getByRole('alert').allTextContents()).join(' ');
  check('Ohne lokalen Speicher: Speichern meldet verständlichen Fehler', notice.includes('nicht verfügbar'), notice);
  await page.keyboard.press('Escape'); await settle();
  await page.getByTestId('projects-button').click(); await settle(300);
  check('Ohne lokalen Speicher: Projektliste zeigt Hinweis', (await page.getByTestId('projects-dialog').textContent()).includes('nicht verfügbar'));
  await page.keyboard.press('Escape'); await settle();
  check('Ohne lokalen Speicher: App bleibt bedienbar', await alive(page));
  await context.close();
}

// ---------- 3. Speicher voll beim Import → geöffnet, aber als „nicht gespeichert“ gekennzeichnet
{
  const { context, page, settle } = await openPage();
  const data = livingRoom('warm');
  const file = `${OUT}/import-voll.3draum`;
  fs.writeFileSync(file, JSON.stringify({ ...data, name: 'Import bei vollem Speicher' }));
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('voll', 'QuotaExceededError'); }; });
  await page.getByTestId('projects-button').click(); await settle(300);
  await page.getByTestId('project-import-input').setInputFiles(file); await settle(800);
  const notice = await page.getByTestId('project-notice').textContent().catch(() => '');
  check('Speicher voll beim Import: Plan geöffnet', (await page.getByTestId('furniture-list-item').count()) === 7);
  check('Speicher voll beim Import: Hinweis „nicht lokal gespeichert“ + Grund', notice.includes('Nicht lokal gespeichert') && notice.includes('Speicher ist voll'), notice);
  check('Speicher voll beim Import: Status ungespeichert', (await page.getByTestId('project-status').getAttribute('data-state')) === 'dirty');
  fs.rmSync(file);
  await context.close();
}

// ---------- 4. Sehr kleine und sehr große Räume
{
  const { context, page, settle } = await openPage();
  for (const [w, l, label] of [['1', '1', 'klein'], ['30', '30', 'groß'], ['0,2', '99', 'außerhalb']]) {
    await setRoom(page, 'Breite', w); await setRoom(page, 'Länge', l);
    const values = [await roomInput(page, 'Breite').inputValue(), await roomInput(page, 'Länge').inputValue()];
    await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(800);
    const labels = await page.locator('[data-testid="dimension-label"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })).catch(() => []);
    const canvas = await page.locator('canvas').first().boundingBox();
    const inView = labels.every(([l, t, r, b]) => l >= canvas.x - 1 && r <= canvas.x + canvas.width + 1 && t >= canvas.y - 1 && b <= canvas.y + canvas.height + 1);
    check(`Raum ${label} (${w} × ${l}): gültig begrenzt, eingepasst`, (label !== 'außerhalb' || JSON.stringify(values) === JSON.stringify(['1,00', '30,00'])) && inView, `${values.join(' × ')}, ${labels.length} Maße`);
    await page.screenshot({ path: `${OUT}/raum-${label}-2d.png` });
    await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(800);
    check(`Raum ${label}: 3D ohne Fehler`, await alive(page));
  }
  await context.close();
}

// ---------- 5. Sehr viele Möbel (150)
{
  const { context, page, settle } = await openPage();
  const furniture = [];
  for (let i = 0; i < 150; i++) furniture.push(item('chair', `Stuhl ${i + 1}`, 0.6 + (i % 15) * 0.8, 0.6 + Math.floor(i / 15) * 0.9, 0, [0.45, 0.52, 0.9]));
  const many = project('viele-moebel', 'Viele Möbel', { walls: rectangleWalls(12.6, 9.6), furniture });
  const t0 = Date.now();
  await openScene(page, many);
  check('150 Möbel: Projekt öffnet', (await page.getByTestId('furniture-list-item').count()) === 150, `${Date.now() - t0} ms`);
  await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(900);
  await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(900);
  const frame = await page.evaluate(() => new Promise((resolve) => { const t = []; const step = (now) => { t.push(now); if (t.length < 31) { window.__PLANNER_R3F__().invalidate(); requestAnimationFrame(step); } else resolve((t[30] - t[0]) / 30); }; requestAnimationFrame(step); }));
  check('150 Möbel: 3D rendert flüssig genug (Software-Rendering)', frame < 250, `${frame.toFixed(1)} ms/Frame`);
  await page.getByTestId('furniture-list-item').filter({ hasText: 'Stuhl 150' }).click(); await settle(400);
  check('150 Möbel: Auswahl über die Liste', (await page.getByTestId('furniture-properties').getByLabel('Name', { exact: true }).inputValue()) === 'Stuhl 150');
  await page.keyboard.press('Escape'); await settle();
  await page.getByTestId('export-button').click(); await settle(300);
  const pdf = await exportFile(page, 'export-pdf');
  const text = fs.readFileSync(pdf.path).toString('latin1');
  const pages = (text.match(/\/Type \/Page /g) ?? []).length;
  check('150 Möbel: PDF mit Seitenumbrüchen, alle Möbel aufgeführt', pages >= 4 && text.includes('Stuhl 150') && text.includes('M\xF6bel und Lampen \\(150\\)'), `${pages} Seiten`);
  await page.keyboard.press('Escape'); await settle();
  await context.close();
}

// ---------- 6. Schnelles Undo/Redo und schnelles Umschalten
{
  const { context, page, settle } = await openPage();
  await openScene(page, livingRoom('daylight'));
  const widths = ['5,6', '5,7', '5,8', '5,9', '6', '6,1', '6,2', '6,3', '6,4', '6,5'];
  for (const w of widths) await setRoom(page, 'Breite', w);
  await page.locator('canvas').first().click({ position: { x: 40, y: 860 } }); await settle();
  for (let i = 0; i < 25; i++) await page.keyboard.press('ControlOrMeta+z');
  await settle(500);
  check('Schnelles Undo (25×): Ausgangszustand', (await roomInput(page, 'Breite').inputValue()) === '5,50' && (await page.getByTestId('project-status').getAttribute('data-state')) === 'saved');
  for (let i = 0; i < 25; i++) await page.keyboard.press('ControlOrMeta+Shift+z');
  await settle(500);
  check('Schnelles Redo (25×): Endzustand', (await roomInput(page, 'Breite').inputValue()) === '6,50');
  for (let i = 0; i < 12; i++) { await page.keyboard.press('ControlOrMeta+z'); await page.keyboard.press('ControlOrMeta+Shift+z'); }
  await settle(400);
  check('Undo/Redo im Wechsel: Zustand stabil', (await roomInput(page, 'Breite').inputValue()) === '6,50');

  const views = ['2D', '3D', 'Vorschau', 'Bearbeiten', '2D', 'Vorschau'];
  for (let i = 0; i < 30; i++) {
    const v = views[i % views.length];
    const target = v === 'Vorschau' || v === 'Bearbeiten' ? page.getByTestId('view-3d-mode').getByRole('button', { name: v }) : page.getByRole('button', { name: v, exact: true });
    if (await target.count()) await target.click({ timeout: 2000 }).catch(() => {});
  }
  await settle(1200);
  check('Schnelles Umschalten 2D/3D/Vorschau (30×): App intakt', await alive(page));
  await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(900);
  const cam = await page.evaluate(() => { const s = window.__PLANNER_R3F__(); return { ortho: !!s.camera.isOrthographicCamera, zoom: s.camera.zoom }; });
  check('Nach dem Umschalten: 2D-Ansicht korrekt', cam.ortho && cam.zoom > 20, JSON.stringify(cam));
  // Export während schneller Wechsel: Ansicht danach wiederhergestellt
  await page.getByTestId('export-button').click(); await settle(300);
  await exportFile(page, 'export-3d-png');
  await page.keyboard.press('Escape'); await settle(600);
  check('Nach 3D-Export aus 2D: wieder 2D', (await page.getByRole('button', { name: '2D', exact: true }).getAttribute('aria-pressed')) === 'true');
  await page.screenshot({ path: `${OUT}/nach-umschalten.png` });
  await context.close();
}

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
