import { chromium } from 'playwright-core';
import { addFurniture as addFromLibrary } from '../lib/planner.mjs';

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
const settle = (ms = 150) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const W = 5, L = 4;
const RED = 'fde3e1', AMBER = 'fdf0d5', BLUE = 'dfe8fc', WHITE = 'ffffff';

const fProps = page.getByTestId('furniture-properties');
const oProps = page.getByTestId('opening-properties');
const setIn = async (panel, label, text) => { const i = panel.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(); };
const place = async (x, z, r = '0') => { await setIn(fProps, 'Rotation', r); await setIn(fProps, 'X-Position', x); await setIn(fProps, 'Z-Position', z); };
const addFurniture = async (type) => { await addFromLibrary(page, type); await settle(200); };
const selectFurniture = async (name) => { await page.getByTestId('furniture-list-item').filter({ hasText: name }).click(); await settle(); };
const selectOpening = async (name) => { await page.getByTestId('opening-list-item').filter({ hasText: name }).click(); await settle(); };
const notices = async (panel = page) => panel.getByTestId('collision-notice').evaluateAll((els) => els.map((e) => ({ text: e.textContent.trim(), severity: e.dataset.severity, rule: e.dataset.rule })));
const listDot = (testid, name) => page.getByTestId(testid).filter({ hasText: name }).locator('[data-severity]').evaluateAll((els) => els[0]?.dataset.severity ?? null);
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };

/** Füllfarbe/Umrandung eines Objekts in der Szene (nach Name des Listeneintrags). */
const idByName = async (testid, name) => {
  const index = await page.getByTestId(testid).evaluateAll((els, n) => els.findIndex((e) => e.textContent.includes(n)), name);
  return page.evaluate(({ testid, index }) => {
    const ids = []; window.__PLANNER_R3F__().scene.traverse((o) => {
      if (testid === 'furniture-list-item' ? o.userData?.furnitureId : o.userData?.openingId) ids.push(o.name);
    });
    return ids.sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))[index];
  }, { testid, index });
};
const look = async (testid, name) => {
  const id = await idByName(testid, name);
  return page.evaluate((id) => {
    const g = window.__PLANNER_R3F__().scene.getObjectByName(id);
    const symbol = g.getObjectByName('furniture-plan-symbol') ?? g.getObjectByName('door-plan-symbol') ?? g.getObjectByName('window-plan-symbol');
    const fill = symbol?.children.find((c) => c.isMesh);
    const outline = g.getObjectByName('furniture-outline');
    return { fill: fill ? fill.material.color.getHexString() : null, outline: outline ? outline.userData.status : null };
  }, id);
};
const furnitureLook = (name) => look('furniture-list-item', name);
const openingLook = (name) => look('opening-list-item', name);

await toggle('2D');

// ---------- 1. Möbel ↔ Möbel bei 0° ----------
await addFurniture('table'); await place('1,5', '1,5');
await addFurniture('sofa'); await place('3,2', '1,5');
check('0°: Kante an Kante (Tisch bis 2,20 | Sofa ab 2,20) = keine Kollision', (await notices()).length === 0 && (await furnitureLook('Sofa 1')).fill === BLUE && (await furnitureLook('Esstisch 1')).fill === WHITE);
await setIn(fProps, 'X-Position', '3,19');
let n = await notices(fProps);
check('0°: 1 cm Überlappung → Warnung beim ausgewählten Sofa', n.length === 1 && n[0].text === 'Dieses Möbel überschneidet sich mit Esstisch 1.' && n[0].severity === 'error', JSON.stringify(n));
check('0°: beide Möbel in 2D rot markiert', (await furnitureLook('Sofa 1')).fill === RED && (await furnitureLook('Esstisch 1')).fill === RED);
check('0°: Markierung in der Möbelliste', (await listDot('furniture-list-item', 'Sofa 1')) === 'error' && (await listDot('furniture-list-item', 'Esstisch 1')) === 'error');
await selectFurniture('Esstisch 1');
n = await notices(fProps);
check('0°: Warnung auch aus Sicht des Tischs', n.length === 1 && n[0].text === 'Dieses Möbel überschneidet sich mit Sofa 1.', JSON.stringify(n));
await selectFurniture('Sofa 1'); await setIn(fProps, 'X-Position', '3,2');
check('0°: zurück auf Kante → Warnung und Markierung sofort weg', (await notices()).length === 0 && (await furnitureLook('Esstisch 1')).fill === WHITE && (await listDot('furniture-list-item', 'Esstisch 1')) === null);

// ---------- 2. 90° ----------
await place('2,65', '1,5', '90'); // Sofa gedreht: 0,90 breit in x → 2,20–3,10
check('90°: gedreht Kante an Kante (2,65) = keine Kollision', (await notices()).length === 0, `${await fProps.getByLabel('X-Position').inputValue()}`);
await setIn(fProps, 'X-Position', '2,64');
n = await notices(fProps);
check('90°: 1 cm Überlappung = Kollision', n.length === 1 && n[0].severity === 'error', JSON.stringify(n));

// ---------- 3. 45° ----------
await place('2,78', '1,04', '45');
check('45°: umschließende Rechtecke überlappen, echte Grundflächen nicht → keine Kollision', (await notices()).length === 0 && (await furnitureLook('Sofa 1')).fill === BLUE, `pos ${await fProps.getByLabel('X-Position').inputValue()} / ${await fProps.getByLabel('Z-Position').inputValue()}`);
await place('2,6', '1,9', '45');
n = await notices(fProps);
check('45°: echte Überlappung → Kollision', n.length === 1 && n[0].text.includes('Esstisch 1'), JSON.stringify(n));
await shot('col-45');
await place('1,4', '2,6', '0'); // Sofa: x 0,40–2,40, z 2,15–3,05 – außerhalb des späteren Tür-Schwenkbereichs

// ---------- 4. Tür-Schwenkbereich ----------
await page.getByTestId('add-door').click(); await settle(200); // Südwand mittig: Anschlag bei x 2,05, Radius 0,90
check('Tür ohne Möbel im Schwenkbereich: keine Warnung', (await notices(oProps)).length === 0 && (await openingLook('Tür 1')).fill === BLUE);
await selectFurniture('Esstisch 1'); await place('2,5', '3,5');
n = await notices(fProps);
check('Möbel im Schwenkbereich → Warnung am Möbel', n.some((m) => m.text === 'Dieses Möbel steht im Schwenkbereich von Tür 1.' && m.severity === 'error'), JSON.stringify(n));
check('Tür bzw. Öffnungsbogen rot markiert', (await openingLook('Tür 1')).fill === RED && (await listDot('opening-list-item', 'Tür 1')) === 'error');
await selectOpening('Tür 1');
n = await notices(oProps);
check('Warnung aus Sicht der Tür', n.length === 1 && n[0].text === 'Der Schwenkbereich der Tür wird durch Esstisch 1 blockiert.', JSON.stringify(n));
await shot('col-door');
// Kleines Möbel in der Ecke des umschließenden Quadrats, aber außerhalb des Bogens
await selectFurniture('Esstisch 1');
await setIn(fProps, 'Breite', '0,4'); await setIn(fProps, 'Tiefe', '0,4'); await place('2,95', '3,05');
check('Möbel in der Ecke außerhalb des Bogens = keine Warnung (echte Kreisform)', (await notices(fProps)).length === 0 && (await openingLook('Tür 1')).fill === WHITE);
await place('2,6', '3,4');
check('Gleiches Möbel näher am Anschlag = Warnung', (await notices(fProps)).length === 1);
await place('1,2', '3,5');
check('Möbel neben der Tür (Anschlagseite) = keine Warnung', (await notices(fProps)).length === 0 && (await openingLook('Tür 1')).fill === WHITE);
await setIn(fProps, 'Breite', '1,4'); await setIn(fProps, 'Tiefe', '0,8'); await place('3,6', '2,9');

// ---------- 5. Fenster ----------
await page.getByTestId('add-window').click(); await settle(200); // Nordwand mittig: 1,90–3,10, Brüstung 0,90
await selectFurniture('Sofa 1'); await place('2,5', '0,45', '180'); // Höhe 0,85 direkt vor dem Fenster
check('Sofa (0,85 m) unter der Fensterbank (0,90 m) = keine Warnung', (await notices(fProps)).length === 0 && (await openingLook('Fenster 1')).fill === WHITE);
await setIn(fProps, 'Höhe', '0,95');
n = await notices(fProps);
check('Sofa auf 0,95 m erhöht → verdeckt Fenster (Hinweis, live)', n.length === 1 && n[0].severity === 'warning' && n[0].text === 'Dieses Möbel verdeckt Fenster 1 – es ist höher als die Brüstung.', JSON.stringify(n));
check('Hinweis-Markierung (bernstein) an Möbel und Fenster', (await furnitureLook('Sofa 1')).fill === AMBER && (await openingLook('Fenster 1')).fill === AMBER);
await selectOpening('Fenster 1');
await setIn(oProps, 'Brüstungshöhe', '1');
check('Brüstung auf 1,00 m angehoben → Hinweis sofort weg', (await notices(oProps)).length === 0 && (await furnitureLook('Sofa 1')).fill === WHITE);
await selectFurniture('Sofa 1'); await setIn(fProps, 'Höhe', '0,85');
await addFurniture('wardrobe'); await place('2,5', '0,3');
n = await notices(fProps);
check('Hoher Schrank (2,00 m) vor dem Fenster → Hinweis', n.some((m) => m.rule === 'window-blocked' && m.severity === 'warning'), JSON.stringify(n));
await selectOpening('Fenster 1');
check('Hinweis aus Sicht des Fensters', (await notices(oProps)).some((m) => m.text === 'Das Fenster wird durch Kleiderschrank 1 verdeckt.'));
await shot('col-window');
await selectFurniture('Kleiderschrank 1');
await place('1', '0,3');
check('Schrank neben dem Fenster (bis 1,75 m) = kein Fenster-Hinweis', !(await notices(fProps)).some((m) => m.rule === 'window-blocked'));
await place('2,5', '1,5');
check('Kleiderschrank 1,2 m vor der Wand (außerhalb der 0,40-m-Zone) = kein Fenster-Hinweis', !(await notices(fProps)).some((m) => m.rule === 'window-blocked'));

// Mehrere Gegenüber in einer Meldung: Tisch überlappt Sofa (vor dem Fenster) und Schrank
await place('3,9', '1'); // Schrank: x 3,15–4,65, z 0,70–1,30
await selectFurniture('Esstisch 1'); await place('2,5', '1'); // Tisch: x 1,80–3,20, z 0,60–1,40
n = await notices(fProps);
check('Mehrere Überschneidungen in einer Meldung zusammengefasst', n.length === 1 && /überschneidet sich mit (Sofa 1 und Kleiderschrank 1|Kleiderschrank 1 und Sofa 1)\./.test(n[0].text), JSON.stringify(n));
await place('3,6', '2,9');
await selectFurniture('Kleiderschrank 1'); await place('4,2', '3,6');

// ---------- 6. Live beim Verschieben und Drehen ----------
const toScreen = (x, z) => page.evaluate(({ x, z }) => {
  const s = window.__PLANNER_R3F__(); const v = s.camera.position.clone().set(x, 0.02, z).project(s.camera); const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, { x: x - W / 2, z: z - L / 2 });
await selectFurniture('Sofa 1'); await place('1,4', '2,6', '0'); // frei
check('Ausgangslage frei', (await notices(fProps)).length === 0);
{
  const a = await toScreen(1.4, 2.6); const b = await toScreen(3.3, 2.9); const c = await toScreen(1.4, 2.6);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 10 }); await settle(150);
  const during = { notices: await notices(fProps), sofa: (await furnitureLook('Sofa 1')).fill, table: (await furnitureLook('Esstisch 1')).fill };
  await page.mouse.move(c.x, c.y, { steps: 10 }); await settle(150);
  const back = await notices(fProps);
  await page.mouse.up(); await settle(150);
  check('Drag: Warnung erscheint live beim Überfahren des Tischs', during.notices.some((m) => m.text.includes('Esstisch 1')) && during.sofa === RED && during.table === RED, JSON.stringify(during.notices.map((m) => m.rule)));
  check('Drag: Warnung verschwindet live beim Wegziehen', back.length === 0);
}
await place('2,7', '2,05', '0'); // Sofa-Ende 3,70 knapp neben Tisch (2,90–4,30 × 2,50–3,30)? z bis 2,50 → berührt
check('Vor der Rotation: Sofa berührt den Tisch nur', (await notices(fProps)).length === 0);
{
  const h = await page.getByTestId('rotation-handle').boundingBox();
  const hc = { x: h.x + h.width / 2, y: h.y + h.height / 2 }; const c = await toScreen(2.7, 2.05);
  const r = Math.hypot(hc.x - c.x, hc.y - c.y);
  const at = (deg) => ({ x: c.x + r * Math.sin((deg * Math.PI) / 180), y: c.y - r * Math.cos((deg * Math.PI) / 180) });
  await page.mouse.move(hc.x, hc.y); await page.mouse.down();
  for (let d = 5; d <= 30; d += 5) { const q = at(d); await page.mouse.move(q.x, q.y); }
  await settle(150);
  const rotated = await notices(fProps);
  for (let d = 25; d >= 0; d -= 5) { const q = at(d); await page.mouse.move(q.x, q.y); }
  await settle(150);
  const back = await notices(fProps);
  await page.mouse.up(); await settle(150);
  check('Rotation: Warnung erscheint live beim Drehen (30°)', rotated.length === 1 && rotated[0].text.includes('Esstisch 1'), JSON.stringify(rotated));
  check('Rotation: Warnung verschwindet live beim Zurückdrehen', back.length === 0);
}
check('Kollisionen blockieren nicht: Möbel frei in Kollision platzierbar', await (async () => { await setIn(fProps, 'X-Position', '3,6'); await setIn(fProps, 'Z-Position', '2,9'); return (await fProps.getByLabel('X-Position').inputValue()) === '3,60'; })());
await shot('col-2d');

// ---------- 7. 3D-Darstellung ----------
await toggle('3D');
const sofa3d = await furnitureLook('Sofa 1'); const table3d = await furnitureLook('Esstisch 1');
check('3D: kollidierende Möbel mit roter Umrandung', sofa3d.outline === 'error' && table3d.outline === 'error', `${sofa3d.outline}/${table3d.outline}`);
await selectFurniture('Sofa 1'); await place('1,4', '2,6');
check('3D: nach Auflösen ausgewähltes Sofa blau, Tisch ohne Umrandung', (await furnitureLook('Sofa 1')).outline === 'selected' && (await furnitureLook('Esstisch 1')).outline === null);
await selectFurniture('Kleiderschrank 1'); await place('2,5', '0,3');
await selectFurniture('Esstisch 1');
check('3D: Fenster-Hinweis als bernsteinfarbene Umrandung am Schrank', (await furnitureLook('Kleiderschrank 1')).outline === 'warning');
await page.evaluate(() => (() => { const s = window.__PLANNER_R3F__(); s.camera.position.set(0.5, 6.5, 3.5); s.invalidate(); })()); await settle(900);
await shot('col-3d');

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
