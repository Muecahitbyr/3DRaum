import { chromium } from 'playwright-core';

const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.0105) => Math.abs(a - b) <= tol;
const num = (s) => Number(String(s).replace(',', '.'));

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(1000);
const settle = (ms = 400) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

let W = 5, L = 4, H = 2.5;
const T = 0.15;
const props = page.getByTestId('opening-properties');
const offsetField = () => props.getByLabel(/^Abstand von (links|oben)$/);
const offsetValue = async () => num(await offsetField().inputValue());
const wallValue = () => props.getByLabel('Wand').inputValue();
const setWall = async (side) => { await props.getByLabel('Wand').selectOption(side); await settle(150); };
const setField = async (label, text) => { const i = props.getByLabel(label, { exact: true }); await i.click(); await i.fill(text); await i.press('Enter'); await settle(150); };
const setRoom = async (idx, text) => { const i = page.locator('aside input').nth(idx); await i.click(); await i.fill(text); await i.press('Enter'); await settle(250); };
const add = async (type) => { await page.getByTestId(`add-${type}`).click(); await settle(250); };
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const selectedName = async () => ((await props.count()) ? (await page.getByTestId('opening-name').textContent()).trim() : null);

// Wandbezug (wie utils/roomGeometry#getWallFrame)
const frame = (side) => ({
  north: { s: [-W / 2, -L / 2], a: [1, 0], n: [0, 1], len: W },
  south: { s: [-W / 2, L / 2], a: [1, 0], n: [0, -1], len: W },
  east: { s: [W / 2, -L / 2], a: [0, 1], n: [-1, 0], len: L },
  west: { s: [-W / 2, -L / 2], a: [0, 1], n: [1, 0], len: L },
})[side];
/** Weltpunkt: `along` entlang der Wand, `into` Richtung Raum (−T/2 = Wandmitte). */
const wp = (side, along, into = -T / 2) => { const f = frame(side); return { x: f.s[0] + f.a[0] * along + f.n[0] * into, z: f.s[1] + f.a[1] * along + f.n[1] * into }; };
const toScreen = (p) => page.evaluate(({ x, z, y }) => {
  const s = window.__PLANNER_R3F__();
  const v = s.camera.position.clone().set(x, y, z).project(s.camera);
  const r = s.gl.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
}, { ...p, y: H + 0.1 });
const labels = () => page.getByTestId('dimension-label').evaluateAll((els) => els.map((e) => { const b = e.getBoundingClientRect(); return [b.x, b.y]; }));
const sceneInfo = (id) => page.evaluate((id) => {
  const s = window.__PLANNER_R3F__();
  const o = s.scene.getObjectByName(id);
  if (!o) return null;
  const fill = o.getObjectByName('door-plan-symbol') ?? o.getObjectByName('window-plan-symbol');
  const fillMesh = fill?.children.find((c) => c.isMesh);
  return { wall: o.parent.name, fill: fillMesh ? fillMesh.material.color.getHexString() : null, guide: !!s.scene.getObjectByName('snap-guide') };
}, id);
const currentId = async () => page.evaluate(() => {
  const s = window.__PLANNER_R3F__(); let id = null;
  s.scene.traverse((o) => { if (o.userData?.openingId) id = o.userData.openingId; });
  return id;
});

/** Zieht das ausgewählte Element (gegriffen in seiner Mitte) zu `along` auf `targetSide`. */
async function dragTo(side, width, targetSide, targetAlong, { into = -T / 2, during } = {}) {
  const from = await toScreen(wp(side, (await offsetValue()) + width / 2));
  const to = await toScreen(wp(targetSide, targetAlong, into));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await settle(120);
  const res = during ? await during() : undefined;
  await page.mouse.up();
  await settle(200);
  return res;
}

await toggle('2D');

// ---------- 1. Tür entlang jeder Wand ----------
await add('door');
const doorId = await currentId();
for (const side of ['north', 'east', 'south', 'west']) {
  await setWall(side);
  const labelsBefore = await labels();
  const live = await dragTo(side, 0.9, side, 1.0 + 0.45, { during: async () => ({ offset: await offsetValue(), wall: await wallValue() }) });
  const after = await offsetValue();
  check(`Tür entlang ${side}: Position 1,00 m`, (await wallValue()) === side && near(after, 1.0), `→ ${after.toFixed(2)}`);
  check(`Tür entlang ${side}: Sidebar live während des Ziehens`, live.wall === side && near(live.offset, 1.0), `live ${live.offset.toFixed(2)}`);
  const labelsAfter = await labels();
  check(`Tür entlang ${side}: Kamera hat nicht gepannt`, labelsBefore.every((p, i) => Math.abs(p[0] - labelsAfter[i][0]) < 0.5 && Math.abs(p[1] - labelsAfter[i][1]) < 0.5));
}
await page.getByTestId('delete-opening').click(); await settle(200);

// ---------- 2. Fenster entlang jeder Wand ----------
await add('window');
for (const side of ['north', 'east', 'south', 'west']) {
  await setWall(side);
  await dragTo(side, 1.2, side, 0.6 + 0.6);
  const after = await offsetValue();
  check(`Fenster entlang ${side}: Position 0,60 m`, (await wallValue()) === side && near(after, 0.6), `→ ${after.toFixed(2)}`);
}
await page.getByTestId('delete-opening').click(); await settle(200);

// ---------- 3. Wandwechsel ----------
await add('door'); await setWall('north'); await setField('Abstand von links', '2');
const door2 = await currentId();
await dragTo('north', 0.9, 'north', 2.45, { into: 0.3 });
check('Leicht in den Raum ziehen: bleibt auf der Nordwand', (await wallValue()) === 'north');
await dragTo('north', 0.9, 'east', 1.5);
let info = await sceneInfo(door2);
check('Nord → Ost: Wand gewechselt', (await wallValue()) === 'east' && info.wall === 'wall-east');
check('Nord → Ost: Position korrekt (1,50 − 0,45 = 1,05)', near(await offsetValue(), 1.05), `→ ${(await offsetValue()).toFixed(2)}`);
await shot('switch-east-2d');
await dragTo('east', 0.9, 'south', 3.0);
check('Ost → Süd (um die Ecke)', (await wallValue()) === 'south' && near(await offsetValue(), 2.55), `→ ${(await offsetValue()).toFixed(2)}`);
await dragTo('south', 0.9, 'west', 2.0);
check('Süd → West', (await wallValue()) === 'west' && near(await offsetValue(), 1.55), `→ ${(await offsetValue()).toFixed(2)}`);
await dragTo('west', 0.9, 'north', 3.0);
check('West → Nord', (await wallValue()) === 'north' && near(await offsetValue(), 2.55), `→ ${(await offsetValue()).toFixed(2)}`);
await shot('switch-back-north-2d');
// Wechsel über den Raum hinweg auf die gegenüberliegende Wand
await dragTo('north', 0.9, 'south', 1.0);
check('Nord → Süd über den Raum', (await wallValue()) === 'south' && near(await offsetValue(), 0.55));
await setWall('north');

// ---------- 4. Snap ----------
await dragTo('north', 0.9, 'north', 0.03 + 0.45);
check('Snap Ecke links: 0,03 → 0,00', (await offsetValue()) === 0, `→ ${(await offsetValue()).toFixed(2)}`);
await dragTo('north', 0.9, 'north', 4.07 + 0.45);
check('Snap Ecke rechts: 4,07 → 4,10', near(await offsetValue(), 4.1, 1e-9), `→ ${(await offsetValue()).toFixed(2)}`);
const guideSeen = await dragTo('north', 0.9, 'north', 2.08 + 0.45, { during: async () => (await sceneInfo(door2)).guide });
check('Snap Wandmitte: 2,08 → 2,05', near(await offsetValue(), 2.05, 1e-9), `→ ${(await offsetValue()).toFixed(2)}`);
check('Einrastlinie wird während des Snaps angezeigt', guideSeen === true);
await dragTo('north', 0.9, 'north', 0.15 + 0.45);
check('Kein Snap außerhalb der Reichweite: 0,15 bleibt 0,15', near(await offsetValue(), 0.15));
const noGuide = await dragTo('north', 0.9, 'north', 1.2 + 0.45, { during: async () => (await sceneInfo(door2)).guide });
check('Keine Einrastlinie ohne Snap', noGuide === false);
check('Position in 1-cm-Schritten', Math.abs((await offsetValue()) * 100 - Math.round((await offsetValue()) * 100)) < 1e-9);
// Nachbarelemente
await add('window'); await setWall('north'); await setField('Abstand von links', '3,5');
await add('window'); await setWall('north'); await setField('Abstand von links', '0,3');
await page.getByTestId('opening-list-item').nth(0).click(); await settle(150);
check('Tür wieder ausgewählt', (await selectedName()) === 'Tür 1');
await dragTo('north', 0.9, 'north', 2.57 + 0.45);
check('Snap an Fenster (rechts): 2,57 → 2,60 (Kante an Kante)', near(await offsetValue(), 2.6, 1e-9), `→ ${(await offsetValue()).toFixed(2)}`);
check('Kante an Kante ist keine Überschneidung', (await props.getByRole('status').count()) === 0);
await dragTo('north', 0.9, 'north', 1.53 + 0.45);
check('Snap an Fenster (links): 1,53 → 1,50', near(await offsetValue(), 1.5, 1e-9), `→ ${(await offsetValue()).toFixed(2)}`);

// ---------- 5. Konflikte ----------
const conflictLive = await dragTo('north', 0.9, 'north', 3.9 + 0.45, {
  during: async () => ({ warning: await props.getByRole('status').count(), fill: (await sceneInfo(door2)).fill }),
});
check('Überschneidung wird während des Ziehens angezeigt (Sidebar)', conflictLive.warning === 1);
check('Überschneidung im Grundriss rot markiert', conflictLive.fill === 'fde3e1', `fill #${conflictLive.fill}`);
await shot('conflict-2d');
await dragTo('north', 0.9, 'north', 2.2 + 0.45);
info = await sceneInfo(door2);
check('Nach Auflösen: keine Warnung, dezente Auswahlfarbe', (await props.getByRole('status').count()) === 0 && info.fill === 'dfe8fc', `fill #${info.fill}`);

// ---------- 6. Grenzfälle an Wandenden ----------
await dragTo('north', 0.9, 'north', 6.0); // Zeiger 1,5 m hinter dem Wandende (Bildrand)
check('Weit über rechtes Wandende: 4,10 m, bleibt Nord', (await wallValue()) === 'north' && near(await offsetValue(), 4.1, 1e-9));
await dragTo('north', 0.9, 'north', -1.4);
check('Weit über linkes Wandende (über Sidebar): 0,00 m, bleibt Nord', (await wallValue()) === 'north' && (await offsetValue()) === 0);
await dragTo('north', 0.9, 'north', 2.3, { into: -0.8 }); // Zeiger 0,8 m außerhalb (oberer Bildrand)
check('Weit außerhalb des Raums: bleibt auf Wand (1,85 m, kein Snap in Reichweite)', (await wallValue()) === 'north' && near(await offsetValue(), 1.85), `${await wallValue()} ${(await offsetValue()).toFixed(2)}`);
// Element breiter als Zielwand → kein Wechsel
await setRoom(1, '1,2'); L = 1.2;
await page.getByTestId('opening-list-item').nth(1).click(); await settle(150);
await setField('Breite', '1,5');
await dragTo('north', 1.5, 'east', 0.6);
check('Fenster 1,50 m: kein Wechsel auf 1,20 m kurze Ostwand', (await wallValue()) === 'north' && (await props.getByLabel('Breite', { exact: true }).inputValue()) === '1,50');
await setField('Breite', '1,2');
await setRoom(1, '4'); L = 4;

// ---------- 7. Pan & Auswahl ----------
let before = await labels();
await page.mouse.move(700, 820); await page.mouse.down(); await page.mouse.move(760, 850, { steps: 6 }); await page.mouse.up(); await settle(700);
let after = await labels();
check('2D-Pan im leeren Bereich funktioniert weiterhin', Math.abs(after[0][0] - before[0][0] - 60) < 3 && Math.abs(after[0][1] - before[0][1] - 30) < 3, `Δ ${(after[0][0] - before[0][0]).toFixed(1)}, ${(after[0][1] - before[0][1]).toFixed(1)}`);
await page.mouse.click(1300, 860); await settle(250);
check('Klick ins Leere hebt Auswahl auf', (await selectedName()) === null);
await page.getByTestId('opening-list-item').nth(0).click(); await settle(150);
const p0 = await offsetValue();
before = await labels();
const r = await toScreen(wp('north', p0 + 0.45));
await page.mouse.move(r.x, r.y); await page.mouse.down({ button: 'right' }); await page.mouse.move(r.x + 50, r.y + 40, { steps: 6 }); await page.mouse.up({ button: 'right' }); await settle(700);
after = await labels();
check('Rechte Maustaste auf Element: pannt, verschiebt nicht', near(await offsetValue(), p0, 1e-9) && Math.abs(after[0][0] - before[0][0] - 50) < 3);

// ---------- 8. 3D unverändert ----------
await toggle('3D');
const cam0 = await page.evaluate(() => window.__PLANNER_R3F__().camera.position.toArray());
const scr3d = await page.evaluate((id) => {
  const s = window.__PLANNER_R3F__(); const o = s.scene.getObjectByName(id); const hit = o.children[o.children.length - 1];
  const v = hit.getWorldPosition(s.camera.position.clone()).project(s.camera); const rr = s.gl.domElement.getBoundingClientRect();
  return { x: rr.left + ((v.x + 1) / 2) * rr.width, y: rr.top + ((1 - v.y) / 2) * rr.height };
}, door2);
await page.mouse.move(scr3d.x, scr3d.y); await page.mouse.down(); await page.mouse.move(scr3d.x + 120, scr3d.y, { steps: 8 }); await page.mouse.up(); await settle(800);
const cam1 = await page.evaluate(() => window.__PLANNER_R3F__().camera.position.toArray());
check('3D: Ziehen auf Element dreht Kamera, verschiebt Element nicht', near(await offsetValue(), p0, 1e-9) && cam0.some((v, i) => Math.abs(v - cam1[i]) > 0.05));
await shot('3d-after-drag');
await toggle('2D'); await shot('final-2d');

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
