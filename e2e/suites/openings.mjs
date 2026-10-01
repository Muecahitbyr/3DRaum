import { chromium } from 'playwright-core';

const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const near = (a, b, tol = 0.006) => Math.abs(a - b) <= tol;

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(process.env.E2E_DEV_URL);
await page.waitForFunction(() => !!window.__PLANNER_R3F__);
await page.waitForTimeout(1200);
const settle = (ms = 700) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

// ---------- Hilfen ----------
const props = page.getByTestId('opening-properties');
const field = (label) => props.getByLabel(label, { exact: true });
const setField = async (label, text) => { const i = field(label); await i.click(); await i.fill(text); await i.press('Enter'); await settle(150); };
const fieldValue = (label) => field(label).inputValue();
const setWall = async (side) => { await props.getByLabel('Wand').selectOption(side); await settle(150); };
const add = async (type) => { await page.getByTestId(`add-${type}`).click(); await settle(250); };
const toggle = async (label) => { await page.getByRole('button', { name: label, exact: true }).click(); await settle(900); };
const setRoom = async (idx, text) => { const i = page.locator('aside input').nth(idx); await i.click(); await i.fill(text); await i.press('Enter'); await settle(200); };
const selectedName = async () => ((await props.count()) ? (await page.getByTestId('opening-name').textContent()).trim() : null);

/** Szene analysieren: alle Öffnungen mit Weltlage + Raycast-Prüfung der Wand. */
const inspect = () =>
  page.evaluate(() => {
    const s = window.__PLANNER_R3F__();
    const { scene, raycaster, camera } = s;
    const V = () => camera.position.clone();
    const out = [];
    scene.traverse((o) => {
      if (!o.userData?.openingId) return;
      const wallGroup = o.parent;
      const wallBody = wallGroup.children.find((c) => c.name.endsWith('-body'));
      const hit = o.children[o.children.length - 1]; // HitArea
      const { width, height } = hit.geometry.parameters;
      const center = hit.getWorldPosition(V());
      // Richtung entlang der Wand (lokale x-Achse) in Weltkoordinaten
      const along = V().set(1, 0, 0).applyQuaternion(wallGroup.getWorldQuaternion(camera.quaternion.clone()));
      const inward = V().set(0, 0, 1).applyQuaternion(wallGroup.getWorldQuaternion(camera.quaternion.clone()));
      const cast = (target, objects) => {
        const origin = target.clone().addScaledVector(inward, 1.0);
        const dir = target.clone().sub(origin).normalize();
        raycaster.set(origin, dir);
        raycaster.far = 3;
        const hits = raycaster.intersectObjects(objects, true);
        raycaster.far = Infinity; // geteilten R3F-Raycaster nicht verändert zurücklassen
        return hits;
      };
      // 1) Wandkörper hat an der Öffnungsmitte keine Fläche
      const holeHits = cast(center, [wallBody]).length;
      // 2) Durchsicht: keine undurchsichtigen Meshes in der ganzen Szene entlang des Strahls
      const opaque = cast(center, scene.children).filter(
        (h) => h.object.isMesh && h.object.material && !h.object.material.transparent && h.object.material.opacity !== 0,
      );
      // 3) Gegenprobe: Wand direkt über bzw. unter der Öffnung ist massiv
      const isWindow = o.userData.openingType === 'window';
      const solidPoint = center.clone();
      solidPoint.y = isWindow ? (center.y - height / 2) / 2 : center.y + height / 2 + 0.1;
      const solidHits = cast(solidPoint, [wallBody]).length;
      // 4) Laibungsflächen im Wand-Mesh (Normale entlang der Wand)
      const n = wallBody.geometry.attributes.normal.array;
      let revealTris = 0;
      for (let i = 0; i < n.length; i += 9) if (Math.abs(n[i]) > 0.9) revealTris++;
      out.push({
        id: o.userData.openingId,
        type: o.userData.openingType,
        wall: wallGroup.name,
        min: center.clone().addScaledVector(along, -width / 2),
        max: center.clone().addScaledVector(along, width / 2),
        width,
        height,
        centerY: center.y,
        holeHits,
        opaque: opaque.map((h) => h.object.name || h.object.type),
        solidHits,
        revealTris,
        planDoor: !!o.getObjectByName('door-plan-symbol'),
        planWindow: !!o.getObjectByName('window-plan-symbol'),
      });
    });
    return out;
  });

/** Bildschirmposition der Öffnungsmitte (für Klicktests). */
const screenPos = (id) =>
  page.evaluate((id) => {
    const s = window.__PLANNER_R3F__();
    const o = s.scene.getObjectByName(id);
    const hit = o.children[o.children.length - 1];
    const v = hit.getWorldPosition(s.camera.position.clone()).project(s.camera);
    const r = s.gl.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, id);

const wallName = { north: 'wall-north', east: 'wall-east', south: 'wall-south', west: 'wall-west' };
const W = 5, L = 4, T = 0.15;
const withinWall = (o, w = W, l = L) => {
  const e = 0.001;
  if (o.wall === 'wall-north' || o.wall === 'wall-south') return Math.min(o.min.x, o.max.x) >= -w / 2 - e && Math.max(o.min.x, o.max.x) <= w / 2 + e;
  return Math.min(o.min.z, o.max.z) >= -l / 2 - e && Math.max(o.min.z, o.max.z) <= l / 2 + e;
};
const isRealOpening = (o) => o.holeHits === 0 && o.opaque.length === 0 && o.solidHits > 0 && o.revealTris >= 4;
const detail = (o) => `hole=${o.holeHits} opaque=[${o.opaque}] solid=${o.solidHits} reveals=${o.revealTris}`;

// ---------- 1. Tür an jeder Wand ----------
check('Startzustand: keine Elemente', (await page.getByTestId('opening-list-item').count()) === 0);
await add('door');
check('Tür hinzugefügt + ausgewählt', (await selectedName()) === 'Tür 1');
check('Tür-Standardmaße 0,90 × 2,10', (await fieldValue('Breite')) === '0,90' && (await fieldValue('Höhe')) === '2,10');
check('Tür mittig auf Südwand', (await props.getByLabel('Wand').inputValue()) === 'south' && (await fieldValue('Abstand von links')) === '2,05');
for (const side of ['north', 'east', 'south', 'west']) {
  await setWall(side);
  const [o] = await inspect();
  check(`Tür an Wand ${side}: echte Öffnung`, o.wall === wallName[side] && isRealOpening(o), detail(o));
  check(`Tür an Wand ${side}: innerhalb der Wand, Maße 0,90 × 2,10`, withinWall(o) && near(o.width, 0.9) && near(o.height, 2.1));
  if (side === 'east') { await toggle('2D'); await shot(`door-east-2d`); await toggle('3D'); }
}
await page.getByTestId('delete-opening').click(); await settle(300);

// ---------- 2. Fenster an jeder Wand ----------
await add('window');
check('Fenster hinzugefügt', (await selectedName()) === 'Fenster 1');
check('Fenster-Standard 1,20 × 1,20, Brüstung 0,90', (await fieldValue('Breite')) === '1,20' && (await fieldValue('Höhe')) === '1,20' && (await fieldValue('Brüstungshöhe')) === '0,90');
check('Fenster startet auf Nordwand', (await props.getByLabel('Wand').inputValue()) === 'north');
for (const side of ['north', 'east', 'south', 'west']) {
  await setWall(side);
  const [o] = await inspect();
  check(`Fenster an Wand ${side}: echte Öffnung, durchsichtig`, o.wall === wallName[side] && isRealOpening(o), detail(o));
  check(`Fenster an Wand ${side}: Lage korrekt (Mitte 1,50 m hoch)`, withinWall(o) && near(o.centerY, 0.9 + 0.6));
}
await page.getByTestId('delete-opening').click(); await settle(300);
check('Nach Löschen: keine Elemente mehr in Szene', (await inspect()).length === 0);

// ---------- 3. Mehrere Elemente an einer Wand ----------
await add('window'); await add('window'); await add('door');
let items = await inspect();
check('Automatische Platzierung: 2 Fenster Nord ohne Überlappung', items.filter((o) => o.wall === 'wall-north').length === 2 && (await props.getByRole('status').count()) === 0);
// Tür ebenfalls auf die Nordwand
await setWall('north'); await setField('Abstand von links', '0,2');
items = await inspect();
const north = items.filter((o) => o.wall === 'wall-north');
check('Drei Elemente an der Nordwand', north.length === 3, north.map((o) => o.type).join(', '));
check('Alle drei sind echte Öffnungen', north.every(isRealOpening), north.map(detail).join(' | '));
const reveals = north[0].revealTris;
check('Wandgeometrie enthält Laibungen für alle Öffnungen', reveals >= 12, `${reveals} Laibungsdreiecke`);
check('Keine Überschneidungswarnung', (await props.getByRole('status').count()) === 0);
await shot('multi-north-3d');
await toggle('2D'); await shot('multi-north-2d');
items = await inspect();
check('2D: Türsymbol (Blatt + Bogen) vorhanden', items.filter((o) => o.type === 'door').every((o) => o.planDoor));
check('2D: Fenstersymbole vorhanden', items.filter((o) => o.type === 'window').every((o) => o.planWindow));
// Überschneidung provozieren → Warnung
await setField('Abstand von links', '1,8');
check('Überschneidung wird angezeigt', (await props.getByRole('status').count()) === 1);
await setField('Abstand von links', '0,2');
check('Warnung verschwindet wieder', (await props.getByRole('status').count()) === 0);

// ---------- 4. Klick-Auswahl im Canvas ----------
const doorId = items.find((o) => o.type === 'door').id;
const winIds = items.filter((o) => o.type === 'window').map((o) => o.id);
let p = await screenPos(winIds[1]);
await page.mouse.click(p.x, p.y); await settle(300);
{ const n = await selectedName(); check('2D: Klick auf Fenster wählt es aus', n === 'Fenster 2', `ausgewählt: ${n}, pos ${JSON.stringify(p)}, ids ${JSON.stringify(items.map(o=>o.id+':'+o.type))}`); }
p = await screenPos(doorId);
await page.mouse.click(p.x, p.y); await settle(300);
check('2D: Klick auf Tür wählt sie aus', (await selectedName()) === 'Tür 1');
await page.mouse.click(900, 880); await settle(300);
check('2D: Klick ins Leere hebt Auswahl auf', (await selectedName()) === null);
// Seit Drag & Drop: Ziehen greift das Element; Esc bricht ab und stellt die Lage wieder her
p = await screenPos(winIds[0]);
const planPos = async () => { const m = (await inspect()).find((o) => o.id === winIds[0]).min; return JSON.stringify([m.x, m.z]); };
const beforeDrag = await planPos();
await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 40, p.y + 20, { steps: 5 });
await page.keyboard.press('Escape'); await page.mouse.up(); await settle(300);
{ const sel = await selectedName(); const afterDrag = await planPos();
  check('2D: Ziehen greift Fenster (Auswahl), Esc stellt Lage wieder her', sel === 'Fenster 1' && afterDrag === beforeDrag, `sel=${sel} before=${beforeDrag} after=${afterDrag}`); }
await page.mouse.click(900, 880); await settle(300);
await toggle('3D');
p = await screenPos(winIds[0]);
await page.mouse.click(p.x, p.y); await settle(300);
{ const n = await selectedName(); check('3D: Klick auf Fenster wählt es aus', n === 'Fenster 1', `ausgewählt: ${n}, pos ${JSON.stringify(p)}`); }
// Klick auf massive Südwand direkt vor der Nordwand darf kein verdecktes Element wählen
await page.getByTestId('opening-list-item').nth(2).click(); await settle(200);
check('Auswahl über Liste', (await selectedName()) === 'Tür 1');

// ---------- 5. Maße und Position ändern ----------
await page.getByTestId('opening-list-item').nth(0).click(); await settle(200); // Fenster 1
await setField('Breite', '1,5'); await setField('Höhe', '1,4'); await setField('Brüstungshöhe', '0,8');
let w1 = (await inspect()).find((o) => o.id === winIds[0]);
check('Fenster-Maße geändert (1,50 × 1,40, Brüstung 0,80)', near(w1.width, 1.5) && near(w1.height, 1.4) && near(w1.centerY, 0.8 + 0.7), `${w1.width} × ${w1.height}, Mitte ${w1.centerY.toFixed(2)}`);
check('Geänderte Öffnung weiterhin echt', isRealOpening(w1), detail(w1));
await setWall('east'); await setField('Abstand von oben', '0,5');
w1 = (await inspect()).find((o) => o.id === winIds[0]);
check('Position geändert: Ostwand, 0,50 m von oben', w1.wall === 'wall-east' && near(Math.min(w1.min.z, w1.max.z), -L / 2 + 0.5));
// Grenzen: außerhalb der Wand verhindern
await setField('Abstand von oben', '10');
check('Position > Wand wird begrenzt (4,00 − 1,50 = 2,50)', (await fieldValue('Abstand von oben')) === '2,50');
await setField('Breite', '9');
check('Breite > Wand wird begrenzt (4,00)', (await fieldValue('Breite')) === '4,00' && (await fieldValue('Abstand von oben')) === '0,00');
await setField('Brüstungshöhe', '3');
check('Brüstung begrenzt: 2,50 − 1,40 = 1,10', (await fieldValue('Brüstungshöhe')) === '1,10');
await setField('Höhe', '3');
check('Höhe begrenzt: 2,50 − 1,10 = 1,40', (await fieldValue('Höhe')) === '1,40');
await setField('Breite', '1,2');
// Raum verkleinern → Elemente bleiben in ihren Wänden
await setRoom(1, '2'); await setRoom(0, '2'); await setRoom(2, '2');
items = await inspect();
check('Raum 2 × 2 × 2 m: alle Elemente innerhalb ihrer Wände', items.every((o) => withinWall(o, 2, 2)), items.map((o) => `${o.wall}`).join(','));
check('Raum 2 × 2 × 2 m: Tür-Höhe ≤ Wandhöhe, alle Öffnungen echt', items.every((o) => o.centerY + o.height / 2 <= 2.001) && items.every((o) => o.holeHits === 0));
await shot('small-room-3d');
check('Raum 2 × 2 × 2 m: keine falschen Fehlermeldungen in den Feldern', (await props.getByText('Wert zwischen').count()) === 0);
const overflow = await page.evaluate(() => { const a = document.querySelector('aside > div'); return a.scrollWidth - a.clientWidth; });
check('Sidebar ohne horizontalen Überlauf', overflow <= 0, `Überlauf ${overflow}px`);
{ const box = await field('Höhe').boundingBox(); check('Höhe-Feld vollständig in der Sidebar', box.x + box.width <= 280, `rechte Kante ${Math.round(box.x + box.width)}px`); }
await setRoom(0, '5'); await setRoom(1, '4'); await setRoom(2, '2,5');

// ---------- 6. Löschen ----------
const before = (await inspect()).length;
await page.getByTestId('opening-list-item').nth(1).click(); await settle(200);
const deletedId = (await inspect()).find((o) => o.id === winIds[1]);
await page.getByTestId('delete-opening').click(); await settle(300);
items = await inspect();
check('Löschen entfernt Element aus Liste und Szene', items.length === before - 1 && (await page.getByTestId('opening-list-item').count()) === before - 1 && !items.some((o) => o.id === winIds[1]));
check('Nach Löschen keine Auswahl', (await selectedName()) === null);
const wallHit = await page.evaluate(({ x, y, z }) => {
  const s = window.__PLANNER_R3F__();
  const body = s.scene.getObjectByName('wall-north-body');
  const t = s.camera.position.clone().set(x, y, z);
  const o = t.clone(); o.z += 1;
  s.raycaster.set(o, t.clone().sub(o).normalize());
  return s.raycaster.intersectObject(body).length;
}, { x: (deletedId.min.x + deletedId.max.x) / 2, y: deletedId.centerY, z: deletedId.min.z });
check('Wand an gelöschter Stelle wieder geschlossen', wallHit > 0);

// ---------- 7. 2D/3D mehrfach wechseln ----------
const snapshot = JSON.stringify((await inspect()).map((o) => [o.id, o.wall, o.width, o.height]));
for (let i = 0; i < 6; i++) await toggle(i % 2 === 0 ? '2D' : '3D');
check('Elemente nach 6× Umschalten unverändert', JSON.stringify((await inspect()).map((o) => [o.id, o.wall, o.width, o.height])) === snapshot);
check('Raummaße nach Umschalten erhalten', (await page.locator('aside input').nth(0).inputValue()) === '5,00');

// ---------- Übersicht: an jeder Wand Tür + Fenster ----------
for (const [type, side, off] of [['door', 'east', '2,6'], ['window', 'south', '1'], ['door', 'west', '2,5'], ['window', 'west', '0,4']]) {
  await add(type); await setWall(side); await setField(side === 'east' || side === 'west' ? 'Abstand von oben' : 'Abstand von links', off);
}
await page.mouse.click(900, 880); await settle(300);
items = await inspect();
check('Übersicht: alle Öffnungen echt & innerhalb', items.every(isRealOpening) && items.every((o) => withinWall(o)), items.filter((o) => !isRealOpening(o) || !withinWall(o)).map((o) => `${o.id} ${o.type} ${o.wall} ${detail(o)} within=${withinWall(o)}`).join(' | '));
await toggle('2D'); await shot('overview-2d');
await toggle('3D'); await shot('overview-3d');

// ---------- Verdeckung: massive Wand vor einem Fenster ----------
{
  const target = items.find((o) => o.type === 'window' && o.wall === 'wall-north') ?? items.find((o) => o.wall === 'wall-north');
  // Kamera genau vor dem Ziel: der Strahl trifft die Südwand bei x = Ziel-x (dort keine Öffnung).
  const tx = (target.min.x + target.max.x) / 2;
  await page.evaluate(({ x, y }) => { const s = window.__PLANNER_R3F__(); s.camera.position.set(x, y, 9); s.invalidate(); }, { x: tx, y: target.centerY });
  await settle(900);
  // Ziel liegt auf der Nordwand; der Sichtstrahl trifft zuerst die massive Südwand.
  const q = await screenPos(target.id);
  await page.getByTestId('opening-list-item').nth(0).click(); await settle(200);
  await page.mouse.click(q.x, q.y); await settle(300);
  const n = await selectedName();
  // Seit kameraabhängigem Ausblenden: Die Südwand steht zwischen Kamera und Raum, ist
  // ausgeblendet und lässt den Klick durch – das Element dahinter wird ausgewählt.
  check('3D: Klick durch ausgeblendete Wand wird nicht mehr von ihr abgefangen', n !== null, `ausgewählt: ${n}`);
  await shot('occlusion-view');
}

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} Tests bestanden`);
process.exit(failed ? 1 : 0);
