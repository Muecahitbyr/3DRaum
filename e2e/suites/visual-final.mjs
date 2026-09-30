import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { analyzeImage, exportFile } from '../lib/images.mjs';
import { bedroom, freeRoom, livingRoom, lRoom, office, openScene } from '../lib/scenes.mjs';

/**
 * Visuelle Endabnahme V1: fünf realistische Projekte (Schlafzimmer, Wohnzimmer,
 * L-förmiger Wohn-/Essbereich, Büro, freie Form mit schräger Wand) – je 2D, 3D Bearbeiten,
 * 3D Vorschau auf Desktop, Tablet und Smartphone sowie Grundriss-PNG, 3D-PNG und PDF.
 * Screenshots/Exporte: e2e/.output/visual-final/. Automatisch geprüft werden Kollisionsfreiheit,
 * Belichtung (weder schwarz noch überstrahlt) und gültige Exporte.
 */
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const DEVICES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, touch: false },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, touch: true },
  { name: 'mobile', viewport: { width: 390, height: 844 }, touch: true },
];
const PROJECTS = [
  ['schlafzimmer', bedroom],
  ['wohnzimmer', () => livingRoom('warm', 0.9)],
  ['l-wohn-essbereich', lRoom],
  ['buero', office],
  ['freie-form', freeRoom],
];

for (const device of DEVICES) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, acceptDownloads: true });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${device.name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${device.name}: ${e}`));
  await page.goto(process.env.E2E_DEV_URL);
  await page.waitForFunction(() => !!window.__PLANNER_R3F__);
  await page.waitForTimeout(900);
  const settle = (ms = 200) => page.waitForTimeout(ms);
  const shot = async (file) => {
    await page.screenshot({ path: `${OUT}/${file}.png` });
    return analyzeImage(page, `${OUT}/${file}.png`);
  };
  for (const [slug, build] of PROJECTS) {
    const data = build();
    await openScene(page, data);
    const label = `${data.name} (${device.name})`;
    if (device.name === 'desktop') {
      const collisions = await page.locator('[data-testid="furniture-list-item"] [data-severity], [data-testid="opening-list-item"] [data-severity]').count();
      check(`${data.name}: Szene ohne Kollisionen`, collisions === 0, String(collisions));
    }
    await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(900);
    const plan = await shot(`${slug}-${device.name}-2d`);
    // Regression: Kantenlinien nach Projektwechsel mit passender Segmentanzahl (sonst Streulinien)
    const stale = await page.evaluate(() => {
      const bad = [];
      window.__PLANNER_R3F__().scene.traverse((o) => {
        const g = o.geometry;
        if (o.isLineSegments2 && g._maxInstanceCount !== undefined && g._maxInstanceCount !== g.attributes.instanceStart.count) bad.push(o.parent?.name);
      });
      return bad;
    });
    check(`${label}: Kantenlinien konsistent (keine Streulinien)`, stale.length === 0, stale.join(', '));
    await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(900);
    const edit = await shot(`${slug}-${device.name}-3d`);
    await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Vorschau' }).click(); await settle(1300);
    const preview = await shot(`${slug}-${device.name}-vorschau`);
    const ok = (s) => s.mean > 70 && s.mean < 245 && s.std > 12;
    check(`${label}: 2D, 3D und Vorschau sichtbar und ausgewogen belichtet`, ok(plan) && ok(edit) && ok(preview), JSON.stringify([plan, edit, preview].map((s) => [Math.round(s.mean), Math.round(s.std)])));
    await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Bearbeiten' }).click(); await settle(600);

    if (device.name === 'desktop') {
      await page.getByTestId('export-button').click(); await settle(300);
      const png = await exportFile(page, 'export-plan-png');
      fs.copyFileSync(png.path, `${OUT}/${slug}-grundriss.png`);
      const png3d = await exportFile(page, 'export-3d-png');
      fs.copyFileSync(png3d.path, `${OUT}/${slug}-3d.png`);
      const pdf = await exportFile(page, 'export-pdf');
      fs.copyFileSync(pdf.path, `${OUT}/${slug}-bericht.pdf`);
      const a = await analyzeImage(page, png.path);
      const b = await analyzeImage(page, png3d.path);
      const text = fs.readFileSync(pdf.path).toString('latin1');
      check(`${data.name}: Exporte (Grundriss, 3D, PDF) gültig`, a.width >= 2400 && a.dark > 0.01 && b.std > 15 && text.startsWith('%PDF') && (text.match(/\/Subtype \/Image/g) ?? []).length === 2, JSON.stringify({ plan: [a.width, a.height], d3: Math.round(b.mean) }));
      await page.keyboard.press('Escape'); await settle(300);
    }
  }
  await context.close();
}

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
