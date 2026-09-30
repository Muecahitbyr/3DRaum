import { chromium } from 'playwright-core';
import { livingRoom, openScene } from '../lib/scenes.mjs';

/**
 * Accessibility: zugängliche Namen für alle Bedienelemente, Labels für alle Felder,
 * Dialog-Fokus (Einfangen, Escape, Rückgabe), Drawer-Fokus, Tastaturbedienung,
 * Tastenkürzel stören keine Texteingaben, Farbkontraste (WCAG AA) und sichtbarer Fokus.
 */
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(900);
const settle = (ms = 200) => page.waitForTimeout(ms);
await openScene(page, livingRoom('daylight'));
await page.getByTestId('furniture-list-item').filter({ hasText: 'Sofa' }).click(); await settle(300);

/** Sichtbare Bedienelemente ohne zugänglichen Namen bzw. Felder ohne Label. */
const unnamed = () => page.evaluate(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert], [aria-hidden="true"]'); };
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent || el.textContent || el.getAttribute('title') || '').trim();
  const buttons = [...document.querySelectorAll('button, [role="button"], a[href]')].filter(visible).filter((el) => !name(el)).map((el) => el.outerHTML.slice(0, 120));
  const fields = [...document.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea')].filter(visible)
    .filter((el) => !(el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'))).map((el) => el.outerHTML.slice(0, 120));
  return { buttons, fields };
});
let u = await unnamed();
check('Alle Buttons haben einen zugänglichen Namen', u.buttons.length === 0, u.buttons.slice(0, 3).join(' | '));
check('Alle Eingabefelder haben ein Label', u.fields.length === 0, u.fields.slice(0, 3).join(' | '));

// ---------- Kontraste (WCAG AA: 4,5:1 für normalen Text, 3:1 ab 18 px bzw. 14 px fett)
const contrast = () => page.evaluate(() => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [r, g, b, a]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const background = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
    let out = [255, 255, 255];
    for (const c of layers.reverse()) out = out.map((v, i) => v * (1 - c[3]) + c[i] * c[3]);
    return out;
  };
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!el || seen.has(el) || !walker.currentNode.textContent.trim()) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || el.closest('[inert], [aria-hidden="true"], button:disabled, canvas')) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || Number(style.opacity) < 0.5) continue;
    const fg = parse(style.color); if (!fg) continue;
    const bg = background(el);
    const blended = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
    const [a, b] = [lum(blended), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const size = parseFloat(style.fontSize);
    const large = size >= 18 || (size >= 14 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) bad.push(`${walker.currentNode.textContent.trim().slice(0, 30)} (${ratio.toFixed(2)})`);
  }
  return bad;
});
let lowContrast = await contrast();
check('Kontraste Seitenleiste/Werkzeugleisten (WCAG AA)', lowContrast.length === 0, lowContrast.slice(0, 6).join(' | '));

// ---------- Dialog-Fokus: Projekte
await page.getByTestId('projects-button').focus();
await page.keyboard.press('Enter'); await settle(300);
const inDialog = (id) => page.evaluate((id) => !!document.activeElement?.closest(`[data-testid="${id}"]`), id);
check('Dialog öffnet per Tastatur, Fokus im Dialog', await inDialog('projects-dialog'));
let trapped = true;
for (let i = 0; i < 25; i++) { await page.keyboard.press('Tab'); if (!(await inDialog('projects-dialog'))) { trapped = false; break; } }
for (let i = 0; i < 10; i++) { await page.keyboard.press('Shift+Tab'); if (!(await inDialog('projects-dialog'))) { trapped = false; break; } }
check('Dialog: Tab/Shift+Tab bleiben im Dialog', trapped);
lowContrast = await contrast();
check('Kontraste im Projekte-Dialog', lowContrast.length === 0, lowContrast.slice(0, 6).join(' | '));
u = await unnamed();
check('Projekte-Dialog: Namen und Labels vollständig', u.buttons.length === 0 && u.fields.length === 0, [...u.buttons, ...u.fields].slice(0, 3).join(' | '));
await page.keyboard.press('Escape'); await settle(300);
check('Escape schließt den Dialog, Fokus zurück am Auslöser', (await page.getByTestId('projects-dialog').count()) === 0 && (await page.evaluate(() => document.activeElement?.dataset.testid)) === 'projects-button');
// Export-Dialog
await page.getByTestId('export-button').focus(); await page.keyboard.press('Enter'); await settle(300);
check('Export-Dialog: Fokus auf erster Option', (await page.evaluate(() => document.activeElement?.dataset.testid)) === 'export-plan-png');
const dialogRole = await page.getByTestId('export-dialog').evaluate((el) => ({ role: el.getAttribute('role'), modal: el.getAttribute('aria-modal'), label: document.getElementById(el.getAttribute('aria-labelledby'))?.textContent }));
check('Export-Dialog: role=dialog, aria-modal, beschriftet', dialogRole.role === 'dialog' && dialogRole.modal === 'true' && dialogRole.label === 'Export', JSON.stringify(dialogRole));
check('Export-Dialog: Statusmeldung als Live-Region', ['status', 'alert'].includes(await page.getByTestId('export-message').getAttribute('role')));
await page.keyboard.press('Escape'); await settle(300);
check('Export-Dialog: Fokus zurück am Export-Button', (await page.evaluate(() => document.activeElement?.dataset.testid)) === 'export-button');

// ---------- Tastaturbedienung der Ansichten
await page.getByRole('button', { name: '2D', exact: true }).focus(); await page.keyboard.press('Enter'); await settle(800);
check('Ansicht per Tastatur umschaltbar (2D)', (await page.getByRole('button', { name: '2D', exact: true }).getAttribute('aria-pressed')) === 'true');
const focusStyle = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow }; });
check('Sichtbarer Tastaturfokus', (focusStyle.outline !== 'none' && focusStyle.width !== '0px') || focusStyle.shadow !== 'none', JSON.stringify(focusStyle));
await page.getByRole('button', { name: '3D', exact: true }).focus(); await page.keyboard.press('Space'); await settle(800);
check('Ansicht per Tastatur umschaltbar (3D, Leertaste)', (await page.getByRole('button', { name: '3D', exact: true }).getAttribute('aria-pressed')) === 'true');

// ---------- Tastenkürzel stören Texteingaben nicht
await page.getByTestId('furniture-list-item').filter({ hasText: 'Sofa' }).click(); await settle(300);
const nameField = page.getByTestId('furniture-properties').getByLabel('Name', { exact: true });
await nameField.click(); await nameField.press('End');
const count = await page.getByTestId('furniture-list-item').count();
await page.keyboard.type(' dz');
await page.keyboard.press('Backspace'); await page.keyboard.press('Delete');
await page.keyboard.press('ControlOrMeta+d');
await page.keyboard.press('ControlOrMeta+a');
await page.keyboard.press('ArrowLeft');
await settle(300);
check('Tippen/Entf/Strg+D im Namensfeld: kein Möbel gelöscht/dupliziert', (await page.getByTestId('furniture-list-item').count()) === count && (await nameField.inputValue()) === 'Sofa d', await nameField.inputValue());
await page.keyboard.press('Escape'); await settle();

// ---------- Drawer (Smartphone): Fokus hinein, Escape, Fokus zurück, Arbeitsfläche inert
await page.setViewportSize({ width: 390, height: 844 }); await settle(600);
await page.getByTestId('menu-button').focus(); await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelector('[data-testid="sidebar"]').getBoundingClientRect().left >= 0, null, { timeout: 5000 }).catch(() => {});
check('Drawer: Fokus in der Seitenleiste', await page.evaluate(() => !!document.activeElement?.closest('[data-testid="sidebar"]')));
check('Drawer offen: Arbeitsfläche dahinter nicht bedienbar (inert)', await page.evaluate(() => document.querySelector('main').inert === true));
await page.keyboard.press('Escape'); await settle(500);
check('Drawer: Escape schließt, Fokus zurück am Menü-Button', (await page.evaluate(() => document.activeElement?.dataset.testid)) === 'menu-button' && (await page.getByTestId('sidebar').getAttribute('aria-hidden')) === 'true');
u = await unnamed();
check('Smartphone: Buttons (nur Symbole) haben zugängliche Namen', u.buttons.length === 0, u.buttons.slice(0, 3).join(' | '));
lowContrast = await contrast();
check('Smartphone: Kontraste', lowContrast.length === 0, lowContrast.slice(0, 6).join(' | '));

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
