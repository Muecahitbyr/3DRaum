import { chromium } from 'playwright-core';
import { livingRoom, openScene } from '../lib/scenes.mjs';

/**
 * Mobile & Tablet: Breakpoints 375/390/430/768/1024/1440 (keine Überlappungen, nichts
 * außerhalb des Bildschirms, keine horizontale Scrollleiste), Seitenleiste als Drawer,
 * Dialoge im Bildschirm, Touch-Zielgrößen sowie Touch-Gesten (CDP): 2D Pinch-Zoom,
 * Verschieben, Antippen zum Auswählen, Möbel ziehen; 3D Drehen, Zoomen, Antippen.
 */
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];

async function openPage(width, height, touch) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${width}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${width}: ${e}`));
  await page.goto(process.env.E2E_DEV_URL);
  await page.waitForFunction(() => !!window.__PLANNER_R3F__);
  await page.waitForTimeout(900);
  return { context, page };
}

const inside = (b, w, h) => b && b.x >= -0.5 && b.y >= -0.5 && b.x + b.width <= w + 0.5 && b.y + b.height <= h + 0.5;
const overlap = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

/** Sichtbare Bedienelemente der Arbeitsfläche (Bounding Boxes). */
async function controls(page) {
  const sel = {
    menu: '[data-testid="menu-button"]',
    history: '[data-testid="history-undo"]',
    redo: '[data-testid="history-redo"]',
    save: '[data-testid="project-save"]',
    projects: '[data-testid="projects-button"]',
    export: '[data-testid="export-button"]',
    status: '[data-testid="project-status"]',
    view: '[role="group"][aria-label="Ansicht"]',
    mode3d: '[data-testid="view-3d-mode"]',
    chip: '[data-testid="selection-chip"]',
    notice: '[data-testid="project-notice"]',
    feedback: '[data-testid="room-feedback"]',
  };
  const out = {};
  for (const [k, s] of Object.entries(sel)) {
    const l = page.locator(s).first();
    if ((await l.count()) && (await l.isVisible())) out[k] = await l.boundingBox();
  }
  return out;
}

async function layoutChecks(page, label, w, h, compact) {
  const c = await controls(page);
  const required = ['history', 'redo', 'save', 'projects', 'export', 'view', ...(compact ? ['menu'] : [])];
  const missing = required.filter((k) => !c[k]);
  check(`${label}: alle Bedienelemente sichtbar`, missing.length === 0, missing.join(', '));
  const outside = Object.entries(c).filter(([, b]) => !inside(b, w, h)).map(([k]) => k);
  check(`${label}: nichts außerhalb des Bildschirms`, outside.length === 0, outside.join(', '));
  const keys = Object.keys(c).filter((k) => k !== 'status');
  const pairs = [];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    // Undo/Redo und Speichern/Projekte/Export liegen in derselben Gruppe – dürfen sich trotzdem nicht überdecken.
    if (overlap(c[keys[i]], c[keys[j]])) pairs.push(`${keys[i]}×${keys[j]}`);
  }
  check(`${label}: keine Überlappungen`, pairs.length === 0, pairs.join(', '));
  const scroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight }));
  check(`${label}: keine Scrollleisten`, scroll.sw <= scroll.w && scroll.sh <= scroll.h, JSON.stringify(scroll));
  return c;
}

const VIEWPORTS = [
  { w: 375, h: 667, name: 'iPhone SE 375' },
  { w: 390, h: 844, name: 'iPhone 390' },
  { w: 430, h: 932, name: 'iPhone Plus 430' },
  { w: 768, h: 1024, name: 'Tablet 768' },
  { w: 1024, h: 768, name: 'Tablet quer 1024' },
  { w: 1440, h: 900, name: 'Desktop 1440' },
];

for (const vp of VIEWPORTS) {
  const compact = vp.w <= 900;
  const touch = vp.w < 1440;
  const { context, page } = await openPage(vp.w, vp.h, touch);
  const settle = (ms = 250) => page.waitForTimeout(ms);
  await openScene(page, livingRoom('daylight'));
  const slug = vp.name.replace(/\s+/g, '-').toLowerCase();

  // Seitenleiste: Drawer (kompakt) bzw. fest (Desktop/Tablet quer)
  const sidebar = page.getByTestId('sidebar');
  let sb = await sidebar.boundingBox();
  if (compact) {
    check(`${vp.name}: Seitenleiste geschlossen, Arbeitsfläche voll`, sb.x + sb.width <= 0 && (await sidebar.getAttribute('aria-hidden')) === 'true');
    const canvas = await page.locator('canvas').first().boundingBox();
    check(`${vp.name}: Zeichenfläche nutzt die volle Breite`, canvas.x <= 0.5 && canvas.width >= vp.w - 1, JSON.stringify(canvas));
  } else {
    check(`${vp.name}: Seitenleiste fest sichtbar`, sb.x >= 0 && sb.width >= 220 && (await page.getByTestId('menu-button').count()) === 0);
  }

  await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(800);
  await layoutChecks(page, `${vp.name} 2D`, vp.w, vp.h, compact);
  await page.screenshot({ path: `${OUT}/${slug}-2d.png` });
  await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(800);
  const c3 = await layoutChecks(page, `${vp.name} 3D`, vp.w, vp.h, compact);
  check(`${vp.name} 3D: Bearbeiten/Vorschau sichtbar`, !!c3.mode3d);
  await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Vorschau' }).click(); await settle(900);
  await layoutChecks(page, `${vp.name} Vorschau`, vp.w, vp.h, compact);
  await page.screenshot({ path: `${OUT}/${slug}-vorschau.png` });
  await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Bearbeiten' }).click(); await settle(600);

  if (touch) {
    const small = [];
    for (const [k, b] of Object.entries(await controls(page))) if (k !== 'status' && k !== 'view' && k !== 'mode3d' && (b.width < 40 || b.height < 40)) small.push(`${k} ${Math.round(b.width)}×${Math.round(b.height)}`);
    const segs = await page.locator('[role="group"][aria-label="Ansicht"] button, [data-testid="view-3d-mode"] button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    check(`${vp.name}: Touch-Ziele ≥ 40 px`, small.length === 0 && segs.every((hgt) => hgt >= 36), `${small.join(', ')} seg ${segs.join('/')}`);
  }

  // Drawer-Animation abwarten (Software-WebGL verlangsamt Transitionen)
  const drawerAt = (open) => page.waitForFunction((open) => {
    const r = document.querySelector('[data-testid="sidebar"]').getBoundingClientRect();
    return open ? r.left >= 0 : r.right <= 0;
  }, open, { timeout: 5000 }).catch(() => {});
  if (compact) {
    // Drawer öffnen/schließen: Menü, Scrim, Escape, Schließen-Button
    await page.getByTestId('menu-button').click(); await drawerAt(true);
    sb = await sidebar.boundingBox();
    check(`${vp.name}: Drawer öffnet im Bildschirm`, inside(sb, vp.w, vp.h) && sb.x >= 0 && (await sidebar.getAttribute('aria-hidden')) === null && (await page.getByTestId('menu-button').getAttribute('aria-expanded')) === 'true');
    const fonts = await sidebar.locator('input[type="text"], input:not([type])').evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    check(`${vp.name}: Eingabefelder ≥ 16 px (kein Auto-Zoom auf iOS)`, fonts.length > 0 && fonts.every((f) => f >= 16), fonts.join('/'));
    check(`${vp.name}: Drawer zeigt Projekt und Status`, (await page.getByTestId('sidebar-project').textContent()).includes('Wohnzimmer daylight'));
    check(`${vp.name}: Scrim über der Arbeitsfläche`, await page.getByTestId('drawer-scrim').isVisible());
    await page.keyboard.press('Escape'); await drawerAt(false);
    check(`${vp.name}: Escape schließt den Drawer`, (await sidebar.boundingBox()).x + sb.width <= 0 && (await sidebar.getAttribute('aria-hidden')) === 'true');
    await page.getByTestId('menu-button').click(); await drawerAt(true);
    const scrim = await page.getByTestId('drawer-scrim').boundingBox();
    await page.mouse.click(scrim.x + scrim.width - 10, scrim.y + scrim.height / 2); await settle(400);
    check(`${vp.name}: Tippen neben den Drawer schließt ihn`, (await sidebar.getAttribute('aria-hidden')) === 'true');
    await page.getByTestId('menu-button').click(); await drawerAt(true);
    await page.getByTestId('drawer-close').click(); await drawerAt(false);
    check(`${vp.name}: Schließen-Button im Drawer`, (await sidebar.getAttribute('aria-hidden')) === 'true');
    check(`${vp.name}: geschlossener Drawer nicht fokussierbar (inert)`, await sidebar.evaluate((el) => el.inert === true));
  }

  // Dialoge bleiben im Bildschirm
  for (const [button, dialog] of [['projects-button', 'projects-dialog'], ['export-button', 'export-dialog']]) {
    await page.getByTestId(button).click(); await settle(400);
    const b = await page.getByTestId(dialog).boundingBox();
    const scrollable = await page.getByTestId(dialog).evaluate((el) => el.scrollHeight <= el.clientHeight + 1 || getComputedStyle(el).overflowY !== 'visible' || [...el.querySelectorAll('*')].some((c) => ['auto', 'scroll'].includes(getComputedStyle(c).overflowY)));
    check(`${vp.name}: Dialog „${dialog}“ im Bildschirm`, inside(b, vp.w, vp.h) && scrollable, JSON.stringify(b));
    if (vp.w === 375) await page.screenshot({ path: `${OUT}/${slug}-${dialog}.png` });
    await page.keyboard.press('Escape'); await settle(300);
  }
  await context.close();
}

// ---------- Touch-Gesten (Smartphone 390 × 844)
{
  const { context, page } = await openPage(390, 844, true);
  const settle = (ms = 250) => page.waitForTimeout(ms);
  await openScene(page, livingRoom('daylight'));
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
  const gesture = async (from, to, steps = 10) => {
    await touch('touchStart', from);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await touch('touchMove', from.map(([x, y], k) => [x + (to[k][0] - x) * t, y + (to[k][1] - y) * t]));
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', []);
    await settle(400);
  };
  const tap = async (x, y) => { await touch('touchStart', [[x, y]]); await page.waitForTimeout(60); await touch('touchEnd', []); await settle(400); };
  const cam = () => page.evaluate(() => { const s = window.__PLANNER_R3F__(); return { zoom: s.camera.zoom, x: s.camera.position.x, y: s.camera.position.y, z: s.camera.position.z }; });
  const screenOf = (name) => page.evaluate((name) => {
    const s = window.__PLANNER_R3F__();
    let obj = null;
    s.scene.traverse((o) => { if (!obj && o.userData?.furnitureId && o.name && o.parent && o.userData.furnitureId === o.name && o.userData.furnitureType && window.__names?.[o.name] === name) obj = o; });
    if (!obj) return null;
    // 3D: Mitte des Möbelkörpers (sichtbar), 2D: Bodenpunkt
    const body = obj.getObjectByName('furniture-bounds');
    const v = (s.camera.isPerspectiveCamera && body ? body.getWorldPosition(s.camera.position.clone()) : obj.getWorldPosition(s.camera.position.clone()).setY(0.05)).project(s.camera);
    const r = s.gl.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, world: obj.getWorldPosition(s.camera.position.clone()).toArray() };
  }, name);
  await page.evaluate(() => { window.__names = { 'furniture-1': 'Sofa', 'furniture-2': 'Couchtisch', 'furniture-3': 'Sessel' }; });

  await page.getByRole('button', { name: '2D', exact: true }).click(); await settle(900);
  let before = await cam();
  // Pinch-Zoom: zwei Finger auseinander
  await gesture([[150, 420], [240, 420]], [[80, 420], [310, 420]]);
  let after = await cam();
  check('Touch 2D: Pinch vergrößert', after.zoom > before.zoom * 1.3, `${before.zoom.toFixed(1)} → ${after.zoom.toFixed(1)}`);
  before = after;
  await gesture([[310, 420], [80, 420]], [[240, 420], [150, 420]]);
  after = await cam();
  check('Touch 2D: Pinch verkleinert', after.zoom < before.zoom * 0.8, `${before.zoom.toFixed(1)} → ${after.zoom.toFixed(1)}`);
  // Ein Finger auf freier Fläche: Ansicht verschieben (Auswahl bleibt unberührt)
  before = await cam();
  await gesture([[195, 330]], [[255, 390]]);
  after = await cam();
  check('Touch 2D: ein Finger verschiebt die Ansicht', Math.hypot(after.x - before.x, after.z - before.z) > 0.2, JSON.stringify({ dx: after.x - before.x, dz: after.z - before.z }));
  await page.screenshot({ path: `${OUT}/touch-2d.png` });

  // Antippen wählt ein Möbel aus → „Eigenschaften bearbeiten“
  let sessel = await screenOf('Sessel');
  await tap(sessel.x, sessel.y);
  check('Touch 2D: Antippen wählt Möbel aus', (await page.getByTestId('selection-chip').count()) === 1 && (await page.getByTestId('selection-chip').textContent()).includes('Sessel'), await page.getByTestId('selection-chip').textContent().catch(() => '—'));
  const chip = await page.getByTestId('selection-chip').boundingBox();
  check('Auswahl-Chip im Bildschirm, Touch-Ziel ≥ 40 px', inside(chip, 390, 844) && chip.height >= 40);
  // Möbel mit dem Finger ziehen
  const start = sessel.world;
  await gesture([[sessel.x, sessel.y]], [[sessel.x - 60, sessel.y - 40]], 12);
  sessel = await screenOf('Sessel');
  const moved = Math.hypot(sessel.world[0] - start[0], sessel.world[2] - start[2]);
  check('Touch 2D: Möbel per Finger verschoben', moved > 0.3, `${moved.toFixed(2)} m`);
  check('Touch 2D: Verschieben ist rückgängig machbar', (await page.getByTestId('history-undo').getAttribute('title')).startsWith('Möbel verschieben'), await page.getByTestId('history-undo').getAttribute('title'));
  await page.getByTestId('selection-chip').click(); await settle(500);
  const props = await page.getByTestId('furniture-properties').boundingBox();
  check('Chip öffnet den Drawer direkt bei den Eigenschaften', (await page.getByTestId('sidebar').getAttribute('aria-hidden')) === null && props.y >= -1 && props.y < 200, JSON.stringify(props));
  await page.screenshot({ path: `${OUT}/touch-eigenschaften.png` });
  await page.getByTestId('drawer-close').click(); await settle(400);
  // Tippen ins Leere hebt die Auswahl auf
  await tap(40, 780);
  check('Touch 2D: Tippen ins Leere hebt Auswahl auf', (await page.getByTestId('selection-chip').count()) === 0);

  // 3D: ein Finger dreht, zwei Finger zoomen, Antippen wählt
  await page.getByRole('button', { name: '3D', exact: true }).click(); await settle(900);
  const view3d = () => page.evaluate(() => { const s = window.__PLANNER_R3F__(); const d = s.camera.getWorldDirection(s.camera.position.clone()); return { p: s.camera.position.toArray(), d: d.toArray() }; });
  let v0 = await view3d();
  await gesture([[195, 470]], [[295, 470]]);
  let v1 = await view3d();
  const yaw = (v) => Math.atan2(v.d[0], v.d[2]);
  check('Touch 3D: ein Finger dreht die Kamera', Math.abs(yaw(v1) - yaw(v0)) > 0.2, `${yaw(v0).toFixed(2)} → ${yaw(v1).toFixed(2)}`);
  v0 = await view3d();
  await gesture([[150, 470], [240, 470]], [[70, 470], [320, 470]]);
  v1 = await view3d();
  const forward = (v1.p[0] - v0.p[0]) * v0.d[0] + (v1.p[1] - v0.p[1]) * v0.d[1] + (v1.p[2] - v0.p[2]) * v0.d[2];
  check('Touch 3D: Pinch zoomt heran', forward > 0.3, `${forward.toFixed(2)} m nach vorn`);
  // Vorschau im Hochformat: breiteres Sichtfeld (horizontal ≥ ~50°), zurück in „Bearbeiten“ wieder 45°
  await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Vorschau' }).click(); await settle(1000);
  const fov = await page.evaluate(() => { const c = window.__PLANNER_R3F__().camera; return { v: c.fov, h: (2 * Math.atan(Math.tan((c.fov * Math.PI) / 360) * c.aspect) * 180) / Math.PI }; });
  const outlines = await page.evaluate(() => { let n = 0; window.__PLANNER_R3F__().scene.traverse((o) => { if (o.name === 'furniture-outline' && o.userData.status !== 'selected') n++; }); return n; });
  check('Vorschau: keine Kollisionsrahmen (Sessel überschneidet Couchtisch)', outlines === 0, String(outlines));
  check('Vorschau im Hochformat: breiteres Sichtfeld', fov.v > 60 && fov.v <= 90 && fov.h >= 48, JSON.stringify(fov));
  await page.screenshot({ path: `${OUT}/touch-vorschau.png` });
  await page.getByTestId('view-3d-mode').getByRole('button', { name: 'Bearbeiten' }).click(); await settle(800);
  check('Zurück in „Bearbeiten“: Standard-Sichtfeld', (await page.evaluate(() => window.__PLANNER_R3F__().camera.fov)) === 45);
  const couch = await screenOf('Couchtisch');
  await tap(couch.x, couch.y);
  const chipFits = await page.getByTestId('selection-chip').evaluate((el) => { const n = el.querySelector('.selection-chip-name'); return n.scrollWidth <= n.clientWidth; }).catch(() => false);
  check('Auswahl-Chip: Name vollständig lesbar (nicht vorzeitig gekürzt)', chipFits);
  check('Touch 3D: Antippen wählt Möbel aus', (await page.getByTestId('selection-chip').textContent().catch(() => '')).includes('Couchtisch'));
  await page.screenshot({ path: `${OUT}/touch-3d.png` });
  await context.close();
}

check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} bestanden`);
await browser.close();
process.exit(failed ? 1 : 0);
