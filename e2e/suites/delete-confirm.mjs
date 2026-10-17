import { chromium } from 'playwright-core';
import { livingRoom, openScene } from '../lib/scenes.mjs';

/**
 * Löschen nur nach Sicherheitsabfrage und Kontextmenü für Bauelemente: Rechtsklick auf Tür/Fenster
 * in der Liste, im Grundriss und in 3D öffnet ein Menü mit „Löschen …“; Abbrechen ändert nichts,
 * „Löschen“ löscht (ein Verlaufsschritt). Rechts ziehen verschiebt weiterhin die Ansicht. Abfragen
 * auch für Raumobjekte, Möbel, Zimmer und Etagen; Tastatur (Esc, Kontextmenü-Taste).
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
const settle = (ms = 250) => page.waitForTimeout(ms);
const view = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const menu = page.getByTestId('opening-context-menu');
const confirm = page.getByTestId('confirm-dialog');
const openings = () => page.getByTestId('opening-list-item').count();
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
/** Bildschirmposition einer Öffnung: Grundriss über der Wand, 3D Mitte der Klickfläche. */
const screenOf = (id) => page.evaluate((id) => {
  const s = window.__PLANNER_R3F__();
  const o = s.scene.getObjectByName('room').getObjectByName(id);
  const hit = o.children[o.children.length - 1];
  const v = hit.getWorldPosition(s.camera.position.clone()).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, id);
const labels = () => page.getByTestId('dimension-label').evaluateAll((els) => els.slice(0, 1).map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y]; }));

await openScene(page, livingRoom());
const total = await openings();

// ---------- 1. Liste „Bauelemente“: Rechtsklick → Menü → Abfrage
await page.getByTestId('opening-list-item').nth(2).click({ button: 'right' }); await settle();
check('Liste: Rechtsklick öffnet das Menü mit Namen und „Löschen …“', (await menu.count()) === 1 && (await menu.textContent()).includes('Tür 1') && (await menu.getByRole('menuitem').count()) === 1);
check('Liste: Rechtsklick wählt das Element aus (Eigenschaften offen)', (await page.getByTestId('opening-properties').count()) === 1);
check('Menü: Fokus auf dem ersten Eintrag', await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'context-delete'));
await page.screenshot({ path: `${OUT}/01-menu-liste.png` });
await page.keyboard.press('Escape'); await settle();
check('Esc schließt das Menü, nichts gelöscht', (await menu.count()) === 0 && (await openings()) === total);
await page.getByTestId('opening-list-item').nth(2).click({ button: 'right' }); await settle();
await page.getByTestId('context-delete').click(); await settle();
check('„Löschen …“ → Abfrage „Tür löschen?“ mit Namen und Hinweis auf Rückgängig', (await confirm.count()) === 1 && (await confirm.textContent()).includes('Tür löschen?') && (await confirm.textContent()).includes('„Tür 1“') && (await confirm.textContent()).includes('Rückgängig'));
await page.screenshot({ path: `${OUT}/02-abfrage.png` });
await page.getByTestId('confirm-cancel').click(); await settle();
check('Abbrechen: nichts gelöscht', (await confirm.count()) === 0 && (await openings()) === total);
await page.getByTestId('opening-list-item').nth(2).click({ button: 'right' }); await settle();
await page.getByTestId('context-delete').click(); await settle();
await page.getByTestId('confirm-accept').click(); await settle();
check('„Löschen“: Tür entfernt, ein Schritt „Tür löschen“', (await openings()) === total - 1 && (await undoTitle()) === 'Tür löschen rückgängig');
await page.keyboard.press('ControlOrMeta+z'); await settle();
check('Undo: Tür wieder da', (await openings()) === total);
const item = page.getByTestId('opening-list-item').nth(0);
await item.focus(); await page.keyboard.press('Shift+F10'); await settle();
check('Tastatur (Umschalt+F10): Menü am Eintrag', (await menu.count()) === 1);
await page.keyboard.press('Escape'); await settle();

// ---------- 2. Grundriss: Rechtsklick auf das Fenster, rechts ziehen pannt weiterhin
await view('2D');
let p = await screenOf('opening-1');
await page.mouse.click(p.x, p.y, { button: 'right' }); await settle();
check('Grundriss: Rechtsklick auf Fenster öffnet das Menü', (await menu.count()) === 1 && (await menu.textContent()).includes('Fenster'));
await page.mouse.click(1350, 860); await settle();
check('Klick daneben schließt das Menü', (await menu.count()) === 0);
const before = await labels();
p = await screenOf('opening-1');
await page.mouse.move(p.x, p.y); await page.mouse.down({ button: 'right' }); await page.mouse.move(p.x + 60, p.y + 40, { steps: 6 }); await page.mouse.up({ button: 'right' }); await settle(700);
const after = await labels();
check('Rechts ziehen auf dem Fenster: Ansicht verschoben, kein Menü', (await menu.count()) === 0 && Math.abs(after[0][0] - before[0][0] - 60) < 4, JSON.stringify([before, after]));
p = await screenOf('opening-1');
await page.mouse.click(p.x, p.y, { button: 'right' }); await settle();
await page.getByTestId('context-delete').click(); await settle();
check('Abfrage „Fenster löschen?“', (await confirm.textContent()).includes('Fenster löschen?'));
await page.getByTestId('confirm-accept').click(); await settle();
check('Grundriss: Fenster gelöscht', (await openings()) === total - 1);
await page.keyboard.press('ControlOrMeta+z'); await settle();

// ---------- 3. 3D: Rechtsklick auf eine sichtbare Öffnung (Nordwand)
await view('3D');
p = await screenOf('opening-1');
await page.mouse.click(p.x, p.y, { button: 'right' }); await settle();
check('3D: Rechtsklick auf das Fenster öffnet das Menü', (await menu.count()) === 1);
await page.keyboard.press('Escape'); await settle();
await view('2D');

// ---------- 4. Abfragen überall: Raumobjekt, Möbel (Entf), Zimmer, Etage
await page.getByTestId('fixture-list-item').first().click(); await settle();
await page.getByTestId('delete-fixture').click(); await settle();
check('Raumobjekt: Abfrage „Heizkörper löschen?“', (await confirm.textContent()).includes('Heizkörper löschen?'));
await page.getByTestId('confirm-cancel').click(); await settle();
check('Raumobjekt: Abbrechen behält es', (await page.getByTestId('fixture-list-item').count()) === 1);
await page.getByTestId('furniture-list-item').filter({ hasText: 'Sofa' }).click(); await settle();
await page.mouse.move(1300, 700);
await page.keyboard.press('Delete'); await settle();
check('Möbel (Entf): Abfrage „Möbel löschen?“ mit „Sofa“', (await confirm.textContent()).includes('Möbel löschen?') && (await confirm.textContent()).includes('„Sofa“'));
await page.keyboard.press('Escape'); await settle();
check('Esc in der Abfrage: Sofa bleibt', (await page.getByTestId('furniture-list-item').filter({ hasText: 'Sofa' }).count()) === 1);
await page.getByTestId('furniture-list-item').filter({ hasText: 'Stehlampe' }).click(); await settle();
await page.getByTestId('delete-furniture').click(); await settle();
check('Lampe: Abfrage „Lampe löschen?“', (await confirm.textContent()).includes('Lampe löschen?'));
await page.getByTestId('confirm-cancel').click(); await settle();

const panel = page.getByTestId('building-panel');
await panel.getByTestId('add-room').click(); await settle(600);
await panel.getByTestId('remove-room').click(); await settle();
check('Zimmer löschen: Abfrage mit Hinweis auf den Inhalt', (await confirm.textContent()).includes('Zimmer löschen?') && (await confirm.textContent()).includes('mit allen Möbeln'));
await page.getByTestId('confirm-cancel').click(); await settle();
check('Abbrechen: zwei Zimmer', (await panel.getByTestId('room-list-item').count()) === 2);
await panel.getByTestId('remove-room').click(); await settle();
await page.getByTestId('confirm-accept').click(); await settle(500);
check('Bestätigt: Zimmer gelöscht', (await panel.getByTestId('room-list-item').count()) === 0 && (await undoTitle()) === 'Zimmer löschen rückgängig');
await panel.getByTestId('add-floor').click(); await settle(600);
await panel.getByTestId('remove-floor').click(); await settle();
check('Etage löschen: Abfrage „Etage löschen?“', (await confirm.textContent()).includes('Etage löschen?'));
await page.getByTestId('confirm-accept').click(); await settle(500);
check('Bestätigt: wieder eine Etage', (await page.getByTestId('floor-select').count()) === 0);

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} bestanden`);
process.exit(passed === results.length ? 0 : 1);
