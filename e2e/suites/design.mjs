import { chromium } from 'playwright-core';

const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('dialog', (d) => d.accept());
const settle = (ms = 150) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const ready = async () => { await page.waitForFunction(() => !!window.__PLANNER_R3F__); await settle(600); };
await page.goto(process.env.E2E_DEV_URL); await ready();

const SIDES = ['north', 'east', 'south', 'west'];
const FLOORS = ['wood-light', 'wood-dark', 'tiles', 'concrete', 'carpet'];
const design = page.getByTestId('design-panel');
const colorInput = page.getByTestId('wall-color-input');
const undoTitle = async () => (await page.getByTestId('history-undo').getAttribute('title')).replace(/ \(.*\)$/, '');
const undo = async () => { await page.getByTestId('history-undo').click(); await settle(); };
const redo = async () => { await page.getByTestId('history-redo').click(); await settle(); };
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(700); };
const pickWall = async (side) => { await page.getByTestId(`wall-option-${side}`).click(); await settle(80); };
const setColor = async (value) => { await colorInput.fill(value); await settle(80); await page.mouse.click(1390, 880); await settle(80); };
const floorPressed = () => page.locator('[data-testid^="floor-option-"][aria-pressed="true"]').getAttribute('data-testid');

/** Zustand von Boden und Wänden in der Szene. */
const sceneDesign = () => page.evaluate(() => {
  const s = window.__PLANNER_R3F__();
  const floor = s.scene.getObjectByName('floor');
  const veil = s.scene.getObjectByName('floor-plan-veil');
  const walls = {};
  for (const side of ['north', 'east', 'south', 'west']) {
    const body = s.scene.getObjectByName(`wall-${side}-body`);
    const strip = s.scene.getObjectByName(`wall-${side}-plan-strip`);
    walls[side] = { color: body.material.color.getHexString(), opacity: body.material.opacity, strip: strip ? strip.material.color.getHexString() : null };
  }
  const m = floor.material;
  return {
    floor: {
      id: floor.userData.materialId, type: m.type,
      // Musterwiederholungen über die Bodenfläche = UV-Ausdehnung (m) × Wiederholung je Meter.
      map: m.map ? (() => {
        const uv = floor.geometry.getAttribute('uv');
        let u = 0, v = 0;
        for (let i = 0; i < uv.count; i++) { u = Math.max(u, uv.getX(i)); v = Math.max(v, uv.getY(i)); }
        return { w: m.map.image.width, uuid: m.map.uuid, repeat: [+(u * m.map.repeat.x).toFixed(4), +(v * m.map.repeat.y).toFixed(4)], wrap: m.map.wrapS };
      })() : null,
      bump: !!m.bumpMap, roughness: m.roughness,
    },
    veil: veil ? veil.material.opacity : null,
    walls,
  };
});
/** Wie stark variiert die gerenderte Bodenfläche? (Struktur sichtbar statt einfarbig) */
const floorVariation = () => page.evaluate(() => {
  const s = window.__PLANNER_R3F__();
  const tex = s.scene.getObjectByName('floor').material.map;
  const ctx = tex.image.getContext('2d');
  const { data } = ctx.getImageData(0, 0, tex.image.width, tex.image.height);
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 4 * 37) { const l = (data[i] + data[i + 1] + data[i + 2]) / 3; min = Math.min(min, l); max = Math.max(max, l); }
  // Nahtlos kachelbar: linke und rechte Randspalte ähnlich
  let edge = 0; const w = tex.image.width;
  for (let y = 0; y < w; y += 4) { const a = (y * w) * 4, b = (y * w + w - 1) * 4; edge += Math.abs(data[a] - data[b]); }
  return { contrast: max - min, edgeDiff: edge / (w / 4) };
});

// ---------- 1. Standard ----------
let d = await sceneDesign();
check('Standard: Holz hell ausgewählt und im 3D-Boden aktiv', (await floorPressed()) === 'floor-option-wood-light' && d.floor.id === 'wood-light' && d.floor.type === 'MeshStandardMaterial' && d.floor.bump, JSON.stringify(d.floor));
check('Boden-Textur im richtigen Maßstab (5 m / 2,4 m, 4 m / 2,4 m) und wiederholend', d.floor.map && d.floor.map.repeat[0] === +(5 / 2.4).toFixed(4) && d.floor.map.repeat[1] === +(4 / 2.4).toFixed(4) && d.floor.map.wrap === 1000);
check('Standard-Wandfarbe auf allen Wänden', SIDES.every((s) => d.walls[s].color === 'fbfbfa'));
await page.evaluate(() => (() => { const s = window.__PLANNER_R3F__(); s.camera.position.set(0.4, 6.2, 3.4); s.invalidate(); })()); await settle(900);

// ---------- 2. Alle Bodenarten ----------
const seen = {};
for (const id of FLOORS) {
  await design.getByTestId(`floor-option-${id}`).click(); await settle(300);
  d = await sceneDesign();
  const v = await floorVariation();
  seen[id] = d.floor.map.uuid;
  check(`Boden „${id}“: ausgewählt, Textur + Relief, Struktur sichtbar, nahtlos`, (await floorPressed()) === `floor-option-${id}` && d.floor.id === id && d.floor.bump && v.contrast > 25 && v.edgeDiff < 40, `Kontrast ${v.contrast.toFixed(0)}, Randabweichung ${v.edgeDiff.toFixed(1)}`);
  await shot(`floor-${id}`);
}
check('Jede Bodenart hat eine eigene Textur', new Set(Object.values(seen)).size === 5);
await design.getByTestId('floor-option-tiles').click(); await settle(200);
check('Texturen werden wiederverwendet (Cache)', (await sceneDesign()).floor.map.uuid === seen.tiles);
check('Bodenwechsel im Verlauf: „Bodenbelag ändern“', (await undoTitle()) === 'Bodenbelag ändern rückgängig');

// ---------- 3. Jede Wand einzeln ----------
const colors = { north: '#c98b6b', east: '#a8b8c8', south: '#b8c6ae', west: '#4b5057' };
for (const side of SIDES) {
  await pickWall(side);
  await setColor(colors[side]);
  d = await sceneDesign();
  check(`${side}: Wand einzeln gefärbt, übrige unverändert`, d.walls[side].color === colors[side].slice(1) && SIDES.filter((s) => SIDES.indexOf(s) > SIDES.indexOf(side)).every((s) => d.walls[s].color === 'fbfbfa'), JSON.stringify(Object.fromEntries(SIDES.map((s) => [s, d.walls[s].color]))));
}
check('Hex-Anzeige der gewählten Wand', (await page.getByTestId('wall-color-value').textContent()) === '#4B5057');
await shot('walls-colored-3d');
await pickWall('east');
await design.getByRole('button', { name: 'Sand', exact: true }).click(); await settle();
check('Farbvorschlag „Sand“ auf die Ostwand', (await sceneDesign()).walls.east.color === 'e3d3bb' && (await undoTitle()) === 'Wandfarbe ändern rückgängig');

// Color-Picker: mehrere Zwischenwerte beim Aufziehen = EIN Schritt
await pickWall('south');
await colorInput.fill('#111111'); await colorInput.fill('#222222'); await colorInput.fill('#333333'); await settle();
await page.mouse.click(1390, 880); await settle();
check('Color-Picker mit Zwischenwerten = ein Verlaufsschritt', (await undoTitle()) === 'Wandfarbe ändern rückgängig' && (await sceneDesign()).walls.south.color === '333333');
await undo();
check('… ein Undo stellt die vorherige Farbe wieder her', (await sceneDesign()).walls.south.color === colors.south.slice(1));

// ---------- 4. Alle Wände gleichzeitig ----------
await pickWall('north');
await page.getByTestId('wall-apply-all').click(); await settle();
d = await sceneDesign();
check('„Auf alle Wände anwenden“: alle Wände in Nordwand-Farbe', SIDES.every((s) => d.walls[s].color === colors.north.slice(1)));
check('Button danach deaktiviert, Verlauf „Alle Wände färben“', !(await page.getByTestId('wall-apply-all').isEnabled()) && (await undoTitle()) === 'Alle Wände färben rückgängig');

// ---------- 5. Undo/Redo ----------
await undo();
d = await sceneDesign();
check('Undo: individuelle Wandfarben zurück', d.walls.north.color === 'c98b6b' && d.walls.east.color === 'e3d3bb' && d.walls.west.color === '4b5057');
await undo(); // Sand → Taubenblau
check('Undo: Ostwand wieder Taubenblau', (await sceneDesign()).walls.east.color === 'a8b8c8');
for (let i = 0; i < 4; i++) await undo(); // vier Einzelfarben zurück
d = await sceneDesign();
check('Undo: alle Wände wieder Standardfarbe', SIDES.every((s) => d.walls[s].color === 'fbfbfa'), JSON.stringify(d.walls));
await undo();
check('Undo: Boden zurück auf den vorherigen Belag (Teppich)', (await sceneDesign()).floor.id === 'carpet');
for (let i = 0; i < 7; i++) await redo();
d = await sceneDesign();
check('Redo: kompletter Stand wiederhergestellt', d.floor.id === 'tiles' && SIDES.every((s) => d.walls[s].color === 'c98b6b'));
check('Sidebar folgt Undo/Redo (Auswahlzustand und Farbe)', (await floorPressed()) === 'floor-option-tiles' && (await colorInput.inputValue()) === '#c98b6b');

// individuelle Farben für die weiteren Tests
for (const side of SIDES) { await pickWall(side); await setColor(colors[side]); }
await design.getByTestId('floor-option-wood-dark').click(); await settle();

// ---------- 6. 2D und 3D ----------
await toggle('2D');
d = await sceneDesign();
check('2D: Boden dezent (Textur ohne Beleuchtung, 80 % aufgehellt)', d.floor.type === 'MeshBasicMaterial' && d.floor.map && d.veil === 0.8);
check('2D: Wände bleiben dunkel (Lesbarkeit), Wandfarbe als schmaler Streifen', SIDES.every((s) => d.walls[s].color === '3d4450' && d.walls[s].strip === colors[s].slice(1)));
await shot('design-2d');
await toggle('3D');
d = await sceneDesign();
check('3D: Wandfarben und Boden wieder aktiv, keine Streifen/Aufhellung', SIDES.every((s) => d.walls[s].color === colors[s].slice(1) && d.walls[s].strip === null) && d.veil === null && d.floor.type === 'MeshStandardMaterial');
check('3D: ausgeblendete Wände behalten ihre Farbe', d.walls.south.opacity < 0.1 && d.walls.south.color === colors.south.slice(1));

// ---------- 7. Speichern, neu laden, öffnen ----------
await page.getByTestId('project-save').click(); await settle();
await page.getByTestId('save-project-dialog').getByLabel('Projektname').fill('Farbig');
await page.getByTestId('save-project-dialog').getByLabel('Projektname').press('Enter'); await settle(200);
const stored = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('raumplaner:project:')); return JSON.parse(localStorage.getItem(k)); });
check('Gespeichert in aktueller Formatversion (5) mit Gestaltung', stored.version === 5 && stored.plan.design?.floor === 'wood-dark' && stored.plan.design.wallColors.west === '#4b5057', JSON.stringify(stored.plan.design));
await page.reload(); await ready();
check('Nach Neuladen: Standardgestaltung', (await sceneDesign()).floor.id === 'wood-light');
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Farbig' }).getByTestId('project-open').click(); await settle(500);
d = await sceneDesign();
check('Projekt geöffnet: Boden und alle Wandfarben wiederhergestellt', d.floor.id === 'wood-dark' && SIDES.every((s) => d.walls[s].color === colors[s].slice(1)), JSON.stringify(d.walls));
check('Sidebar zeigt geladene Gestaltung', (await floorPressed()) === 'floor-option-wood-dark');
check('Nach Öffnen: Status „Gespeichert“, Verlauf leer', (await page.getByTestId('project-status').getAttribute('data-state')) === 'saved' && !(await page.getByTestId('history-undo').isEnabled()));

// ---------- 8. Migration Version 1 → 2 ----------
await page.evaluate(() => {
  localStorage.setItem('raumplaner:project:alt-v1', JSON.stringify({
    format: 'raumplaner-project', version: 1, id: 'alt-v1', name: 'Altes Projekt', createdAt: '2026-01-02T08:00:00.000Z', updatedAt: '2026-01-02T08:00:00.000Z',
    plan: {
      dimensions: { width: 4, length: 3.5, height: 2.4 },
      openings: [{ id: 'opening-1', type: 'window', wall: 'north', offset: 1, width: 1.2, height: 1.2, sillHeight: 0.9 }],
      furniture: [{ id: 'furniture-1', type: 'sofa', name: 'Altes Sofa', width: 2, depth: 0.9, height: 0.85, position: { x: 2, z: 2.5 }, rotationDeg: 0 }],
    },
  }));
  localStorage.setItem('raumplaner:project:kaputte-gestaltung', JSON.stringify({
    format: 'raumplaner-project', version: 2, id: 'kaputte-gestaltung', name: 'Kaputte Gestaltung', createdAt: '2026-01-03T08:00:00.000Z', updatedAt: '2026-01-03T08:00:00.000Z',
    plan: { dimensions: { width: 5, length: 4, height: 2.5 }, openings: [], furniture: [], design: { floor: 'lava', wallColors: { north: '#123456', east: 'rot', south: 42 } } },
  }));
});
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Altes Projekt' }).getByTestId('project-open').click(); await settle(500);
d = await sceneDesign();
check('Version-1-Projekt öffnet ohne Warnung', (await page.getByTestId('project-notice').textContent()) === '„Altes Projekt“ geöffnet.');
check('Version 1: Plan vollständig (Raum, Fenster, Sofa)', (await page.locator('aside input').first().inputValue()) === '4,00' && (await page.getByTestId('opening-list-item').count()) === 1 && (await page.getByTestId('furniture-list-item').filter({ hasText: 'Altes Sofa' }).count()) === 1);
check('Version 1: Standardgestaltung ergänzt', d.floor.id === 'wood-light' && SIDES.every((s) => d.walls[s].color === 'fbfbfa'));
check('Version 1: unverändert geöffnet gilt als gespeichert', (await page.getByTestId('project-status').getAttribute('data-state')) === 'saved');
await design.getByTestId('floor-option-concrete').click(); await settle();
await page.mouse.click(1390, 880); await page.keyboard.press('Control+s'); await settle(200);
const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('raumplaner:project:alt-v1')));
check('Beim Speichern auf aktuelle Version (5) aktualisiert (inkl. Gestaltung)', migrated.version === 5 && migrated.plan.design.floor === 'concrete' && migrated.plan.furniture[0].name === 'Altes Sofa');
await page.getByTestId('projects-button').click(); await settle();
await page.getByTestId('project-item').filter({ hasText: 'Kaputte Gestaltung' }).getByTestId('project-open').click(); await settle(500);
d = await sceneDesign();
check('Ungültige Gestaltung: öffnet mit Hinweis, ungültige Werte durch Standard ersetzt', (await page.getByTestId('project-notice').textContent()).includes('Gestaltung') && d.floor.id === 'wood-light' && d.walls.north.color === '123456' && d.walls.east.color === 'fbfbfa' && d.walls.south.color === 'fbfbfa', await page.getByTestId('project-notice').textContent());

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
