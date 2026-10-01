/**
 * Testszenen als Projektdateien (Format 5). Werden in den lokalen Speicher geschrieben
 * und über „Projekte“ geöffnet – deterministisch und schnell, ohne Klickstrecken.
 */

const wall = (id, start, end, height = 2.6, thickness = 0.15) => ({ id, start: { x: start[0], z: start[1] }, end: { x: end[0], z: end[1] }, height, thickness });

export function rectangleWalls(width, length, height = 2.6) {
  return [
    wall('north', [0, 0], [width, 0], height),
    wall('east', [width, 0], [width, length], height),
    wall('south', [width, length], [0, length], height),
    wall('west', [0, length], [0, 0], height),
  ];
}

export function polygonWalls(corners, height = 2.6) {
  return corners.map((c, i) => wall(`wall-${i + 1}`, c, corners[(i + 1) % corners.length], height));
}

let n = 0;
export const item = (type, name, x, z, rotationDeg, size, extra = {}) => ({
  id: `furniture-${++n}`,
  type,
  name,
  width: size[0],
  depth: size[1],
  height: size[2],
  position: { x, z },
  rotationDeg,
  ...extra,
});

export function project(id, name, { shape = 'rectangle', walls, height = 2.6, openings = [], furniture = [], fixtures = [], design }) {
  return {
    format: 'raumplaner-project',
    version: 5,
    id,
    name,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    plan: {
      room: { shape, height, walls },
      openings,
      furniture,
      fixtures,
      groups: [],
      design: {
        floor: 'oak',
        wallColors: Object.fromEntries(walls.map((w) => [w.id, '#f4f1ec'])),
        wallFinishes: {},
        ceilingColor: '#ffffff',
        lighting: { preset: 'daylight', brightness: 1 },
        ...design,
      },
    },
  };
}

/** Projekt speichern und öffnen (Projektübersicht). */
export async function openScene(page, data) {
  await page.evaluate((data) => localStorage.setItem(`raumplaner:project:${data.id}`, JSON.stringify(data)), data);
  await page.getByTestId('projects-button').click();
  await page.waitForTimeout(200);
  await page.locator(`[data-project-id="${data.id}"]`).getByTestId('project-open').click();
  await page.waitForTimeout(250);
  // Ungespeicherte Änderungen verwerfen (Testszenen ersetzen den Plan bewusst).
  if (await page.getByTestId('confirm-accept').count()) await page.getByTestId('confirm-accept').click();
  await page.waitForTimeout(900);
}

const lamp = (on = true, intensity = 1, temperature = 2700) => ({ light: { on, intensity, temperature } });

export function livingRoom(preset = 'daylight', brightness = 1) {
  n = 0;
  return project(`wohnzimmer-${preset}`, `Wohnzimmer ${preset}`, {
    walls: rectangleWalls(5.5, 4.5),
    openings: [
      { id: 'opening-1', type: 'window', wall: 'north', offset: 1.1, width: 1.6, height: 1.4, sillHeight: 0.8, sashes: 2 },
      { id: 'opening-2', type: 'window', wall: 'east', offset: 1.2, width: 1.2, height: 1.4, sillHeight: 0.8, sashes: 1 },
      { id: 'opening-3', type: 'door', wall: 'south', offset: 4.2, width: 0.9, height: 2.1, hinge: 'left', swing: 'inward' },
    ],
    furniture: [
      item('sofa', 'Sofa', 2.9, 3.95, 180, [2.2, 0.95, 0.85], { colors: { fabric: '#8c9097' } }),
      item('coffee-table', 'Couchtisch', 2.9, 2.75, 0, [1.1, 0.6, 0.42]),
      item('armchair', 'Sessel', 4.7, 2.9, 90, [0.85, 0.85, 0.85], { colors: { fabric: '#b88657' } }),
      item('tv-board', 'TV-Board', 2.9, 0.22, 0, [1.8, 0.42, 0.5], { colors: { main: '#e9e4dc' } }),
      item('shelf', 'Regal', 0.2, 1.4, 270, [0.8, 0.35, 1.8]),
      item('floor-lamp', 'Stehlampe', 1.58, 4.05, 0, [0.4, 0.4, 1.6], lamp(true, 1)),
      item('ceiling-light', 'Deckenleuchte', 2.75, 2.25, 0, [0.5, 0.5, 0.12], lamp(true, 1, 3000)),
    ],
    fixtures: [{ id: 'fixture-1', type: 'radiator', wall: 'east', offset: 1.3, width: 1, height: 0.5, depth: 0.1, elevation: 0.15 }],
    design: {
      floor: 'oak',
      wallColors: { north: '#f4f1ec', east: '#f4f1ec', south: '#f4f1ec', west: '#b8c6ae' },
      wallFinishes: { west: 'plaster' },
      lighting: { preset, brightness },
    },
  });
}

export function bedroom() {
  n = 0;
  return project('schlafzimmer', 'Schlafzimmer', {
    walls: rectangleWalls(4.2, 4),
    openings: [
      { id: 'opening-1', type: 'window', wall: 'east', offset: 1.4, width: 1.2, height: 1.3, sillHeight: 0.9, sashes: 1 },
      { id: 'opening-2', type: 'door', wall: 'south', offset: 0.3, width: 0.85, height: 2.1, hinge: 'right', swing: 'inward' },
    ],
    furniture: [
      item('double-bed', 'Doppelbett', 2.1, 1.1, 90, [2.1, 1.8, 0.5], { colors: { fabric: '#d8cfc2', wood: '#8a6a4b' } }),
      item('nightstand', 'Nachttisch links', 0.85, 0.25, 0, [0.45, 0.4, 0.55]),
      item('nightstand', 'Nachttisch rechts', 3.35, 0.25, 0, [0.45, 0.4, 0.55]),
      item('table-lamp', 'Tischlampe links', 0.85, 0.25, 0, [0.28, 0.28, 0.45], { ...lamp(true, 1, 2700), elevation: 0.55 }),
      item('table-lamp', 'Tischlampe rechts', 3.35, 0.25, 0, [0.28, 0.28, 0.45], { ...lamp(true, 1, 2700), elevation: 0.55 }),
      item('pendant-light', 'Pendelleuchte', 2.1, 1.6, 0, [0.45, 0.45, 0.8], lamp(true, 0.8, 2700)),
      item('wardrobe', 'Schrank', 0.35, 3.1, 270, [1.6, 0.6, 2.1], { colors: { main: '#dfe3e6' } }),
    ],
    design: {
      floor: 'carpet-light',
      wallColors: { north: '#e7dccd', east: '#f4f1ec', south: '#f4f1ec', west: '#f4f1ec' },
      lighting: { preset: 'warm', brightness: 0.8 },
    },
  });
}

export function lRoom() {
  n = 0;
  return project('l-raum', 'L-Raum Essbereich', {
    shape: 'l-shape',
    walls: polygonWalls([[0, 0], [6, 0], [6, 3], [3.5, 3], [3.5, 5], [0, 5]]),
    openings: [{ id: 'opening-1', type: 'window', wall: 'wall-1', offset: 3.6, width: 1.6, height: 1.4, sillHeight: 0.8, sashes: 2 }],
    furniture: [
      item('table', 'Esstisch', 4.4, 1.5, 0, [1.6, 0.9, 0.75], { colors: { wood: '#a57c52' } }),
      item('chair', 'Stuhl 1', 4.0, 0.75, 0, [0.45, 0.52, 0.9]),
      item('chair', 'Stuhl 2', 4.8, 0.75, 0, [0.45, 0.52, 0.9]),
      item('chair', 'Stuhl 3', 4.0, 2.25, 180, [0.45, 0.52, 0.9]),
      item('chair', 'Stuhl 4', 4.8, 2.25, 180, [0.45, 0.52, 0.9]),
      item('pendant-light', 'Pendelleuchte', 4.4, 1.5, 0, [0.4, 0.4, 1.0], lamp(true, 1, 2700)),
      item('sofa', 'Sofa', 1.7, 4.4, 180, [2, 0.9, 0.85]),
      item('floor-lamp', 'Stehlampe', 0.35, 4.6, 0, [0.4, 0.4, 1.6], lamp(true, 1)),
    ],
    design: { floor: 'herringbone', lighting: { preset: 'neutral', brightness: 1 } },
  });
}

export function freeRoom() {
  n = 0;
  return project('freie-form', 'Freie Form', {
    shape: 'free',
    walls: polygonWalls([[0, 0], [5, 0], [5, 2.5], [3.5, 4], [0, 4]]),
    openings: [{ id: 'opening-1', type: 'window', wall: 'wall-3', offset: 0.4, width: 1.2, height: 1.3, sillHeight: 0.9, sashes: 1 }],
    furniture: [
      item('desk', 'Schreibtisch', 1.2, 0.4, 0, [1.4, 0.7, 0.75]),
      item('office-chair', 'Bürostuhl', 1.2, 1.1, 180, [0.65, 0.65, 1.1], { colors: { fabric: '#9b4a3c' } }),
      item('shelf', 'Regal', 4.8, 1.2, 90, [0.8, 0.35, 1.8]),
      item('floor-lamp', 'Stehlampe', 3.2, 3.4, 0, [0.4, 0.4, 1.6], lamp(true, 1.2, 3500)),
      item('ceiling-light', 'Deckenleuchte', 2.4, 2, 0, [0.6, 0.6, 0.1], lamp(true, 1, 4000)),
    ],
    design: {
      floor: 'tiles-large-dark',
      wallColors: { 'wall-1': '#d7d5d0', 'wall-2': '#d7d5d0', 'wall-3': '#d7d5d0', 'wall-4': '#d7d5d0', 'wall-5': '#d7d5d0' },
      wallFinishes: { 'wall-1': 'concrete', 'wall-2': 'concrete', 'wall-3': 'concrete', 'wall-4': 'concrete', 'wall-5': 'concrete' },
      lighting: { preset: 'cool', brightness: 1 },
    },
  });
}

export function office() {
  n = 0;
  return project('buero', 'Büro', {
    walls: rectangleWalls(4.5, 3.6, 2.7),
    height: 2.7,
    openings: [
      { id: 'opening-1', type: 'window', wall: 'north', offset: 0.9, width: 2, height: 1.5, sillHeight: 0.8, sashes: 2 },
      { id: 'opening-2', type: 'door', wall: 'south', offset: 0.35, width: 0.9, height: 2.1, hinge: 'right', swing: 'inward' },
    ],
    furniture: [
      item('desk', 'Schreibtisch', 1.9, 0.6, 0, [1.6, 0.8, 0.75], { colors: { main: '#f2f0ec', wood: '#8a6a4b' } }),
      item('office-chair', 'Bürostuhl', 1.9, 1.45, 180, [0.65, 0.65, 1.1], { colors: { fabric: '#2f3540' } }),
      item('shelf', 'Aktenregal', 4.3, 1.5, 90, [0.8, 0.35, 1.8]),
      item('dresser', 'Rollcontainer', 3.05, 0.5, 0, [0.45, 0.55, 0.6], { colors: { main: '#dfe3e6' } }),
      item('armchair', 'Lesesessel', 0.75, 2.85, 45, [0.85, 0.85, 0.85], { colors: { fabric: '#4f7a6a' } }),
      item('floor-lamp', 'Leselampe', 0.3, 2.0, 0, [0.4, 0.4, 1.6], lamp(true, 1, 3000)),
      item('ceiling-light', 'Deckenleuchte', 2.25, 1.8, 0, [0.6, 0.6, 0.1], lamp(true, 1.1, 4000)),
    ],
    fixtures: [
      { id: 'fixture-1', type: 'radiator', wall: 'north', offset: 1.4, width: 1, height: 0.5, depth: 0.1, elevation: 0.15 },
      { id: 'fixture-2', type: 'socket', wall: 'west', offset: 0.8, width: 0.08, height: 0.08, depth: 0.012, elevation: 0.3 },
    ],
    design: {
      floor: 'oak',
      wallColors: { north: '#f4f1ec', east: '#dfe6ea', south: '#f4f1ec', west: '#f4f1ec' },
      lighting: { preset: 'neutral', brightness: 1 },
    },
  });
}

/**
 * V1.1 Block B – realistische Anordnungen (Format 6):
 * Essbereich mit sechs teilweise unter den Tisch geschobenen Stühlen (keine Kollision),
 * Büro mit Bürostuhl unter dem Schreibtisch und Tischlampe auf der Platte,
 * Wohnzimmer mit Sofa, Couchtisch, Sessel und einer echten Kollision (Sessel im Couchtisch).
 */
export function diningArea() {
  n = 0;
  const chair = (name, x, z, rot) => item('chair', name, x, z, rot, [0.45, 0.52, 0.9], { colors: { fabric: '#c9b79c', wood: '#8a6a4b' } });
  // Tisch 1,80 × 0,90 bei (3; 2,5): z 2,05–2,95. Stühle 15 cm unter der Platte (z-Mitte 1,94 bzw. 3,06).
  return { ...project('essbereich', 'Essbereich', {
    walls: rectangleWalls(6, 5, 2.6),
    openings: [{ id: 'opening-1', type: 'window', wall: 'north', offset: 2.2, width: 1.6, height: 1.4, sillHeight: 0.85, sashes: 2 }],
    furniture: [
      item('table', 'Esstisch', 3, 2.5, 0, [1.8, 0.9, 0.75], { colors: { wood: '#a57c52' } }),
      chair('Stuhl 1', 2.45, 1.94, 0), chair('Stuhl 2', 3.0, 1.94, 0), chair('Stuhl 3', 3.55, 1.94, 0),
      chair('Stuhl 4', 2.45, 3.06, 180), chair('Stuhl 5', 3.0, 3.06, 180), chair('Stuhl 6', 3.55, 3.06, 180),
      item('pendant-light', 'Pendelleuchte', 3, 2.5, 0, [0.5, 0.5, 0.9], { light: { on: true, intensity: 1.1, temperature: 2700 } }),
      item('sideboard', 'Sideboard', 3, 4.7, 180, [1.6, 0.45, 0.8]),
    ],
    design: { floor: 'oak', lighting: { preset: 'warm', brightness: 1 } },
  }), version: 6 };
}

export function officeDesk() {
  n = 0;
  return { ...project('arbeitsplatz', 'Arbeitsplatz', {
    walls: rectangleWalls(4, 3.5, 2.6),
    openings: [
      // Fenster rechts neben dem Schreibtisch, Tür rechts in der Südwand (Ablage links frei).
      { id: 'opening-1', type: 'window', wall: 'north', offset: 2.85, width: 1.0, height: 1.4, sillHeight: 0.9, sashes: 1 },
      { id: 'opening-2', type: 'door', wall: 'south', offset: 0.3, width: 0.9, height: 2.1, hinge: 'right', swing: 'inward' },
    ],
    furniture: [
      // Schreibtisch an der Nordwand (Vorderseite +z), Bürostuhl 20 cm darunter, Tischlampe auf der Platte.
      item('desk', 'Schreibtisch', 2, 0.35, 0, [1.4, 0.7, 0.75], { colors: { wood: '#b08a62' } }),
      item('office-chair', 'Bürostuhl', 1.85, 0.835, 180, [0.65, 0.65, 1.1]),
      item('table-lamp', 'Schreibtischlampe', 1.45, 0.3, 0, [0.28, 0.28, 0.45], { elevation: 0, light: { on: true, intensity: 1, temperature: 3000 } }),
      item('shelf', 'Regal', 3.8, 1.8, 90, [0.8, 0.35, 1.8]),
      item('nightstand', 'Ablage', 0.3, 2.6, 90, [0.45, 0.4, 0.55]),
      item('table-lamp', 'Leselampe', 0.3, 2.6, 0, [0.25, 0.25, 0.4], { elevation: 0.75, light: { on: true, intensity: 0.8, temperature: 2700 } }),
    ],
    design: { floor: 'wood-light', lighting: { preset: 'neutral', brightness: 1 } },
  }), version: 6 };
}

export function livingCollision() {
  n = 0;
  return { ...project('wohnen-kollision', 'Wohnzimmer Kollision', {
    walls: rectangleWalls(5.5, 4.5, 2.6),
    openings: [{ id: 'opening-1', type: 'door', wall: 'south', offset: 0.4, width: 0.9, height: 2.1, hinge: 'right', swing: 'inward' }],
    furniture: [
      item('sofa', 'Sofa', 2.75, 3.9, 180, [2.2, 0.95, 0.85], { colors: { fabric: '#6b7f99' } }),
      item('coffee-table', 'Couchtisch', 2.75, 2.7, 0, [1.1, 0.6, 0.45]),
      // Sessel ragt 20 cm in den Couchtisch: echte Kollision, muss sichtbar bleiben.
      item('armchair', 'Sessel', 1.95, 2.7, 90, [0.85, 0.85, 0.85], { colors: { fabric: '#b88657' } }),
      item('tv-board', 'TV-Board', 2.75, 0.25, 0, [1.8, 0.4, 0.5]),
      item('table-lamp', 'Tischlampe', 3.4, 0.25, 0, [0.28, 0.28, 0.45], { light: { on: true, intensity: 1, temperature: 2700 } }),
    ],
    design: { floor: 'herringbone', lighting: { preset: 'daylight', brightness: 1 } },
  }), version: 6 };
}

/**
 * V1.1 Block C – Küche, Bad, Wohnzimmer mit Teppich (Format 7).
 * Küche: Zeile an der Nordwand (Unterschränke, Spüle, Herd, Hochschrank, Kühlschrank),
 * Oberschränke darüber, Kücheninsel. Bad: WC, Waschtisch, Dusche, Badewanne, Wandfliesen.
 */
export function kitchenScene() {
  n = 0;
  const walls = rectangleWalls(4.2, 3.6, 2.6);
  return { ...project('kueche', 'Küche', {
    walls,
    openings: [
      { id: 'opening-1', type: 'window', wall: 'east', offset: 1.2, width: 1.2, height: 1.2, sillHeight: 1.0, sashes: 1 },
      { id: 'opening-2', type: 'door', wall: 'south', offset: 0.4, width: 0.9, height: 2.1, hinge: 'left', swing: 'inward' },
    ],
    furniture: [
      item('fridge', 'Kühlschrank', 0.3, 0.33, 0, [0.6, 0.65, 2.0]),
      item('kitchen-tall', 'Hochschrank', 0.9, 0.3, 0, [0.6, 0.6, 2.0]),
      item('kitchen-base', 'Unterschrank 1', 1.5, 0.3, 0, [0.6, 0.6, 0.9]),
      item('kitchen-sink', 'Spüle', 2.2, 0.3, 0, [0.8, 0.6, 0.9]),
      item('kitchen-stove', 'Herd', 2.9, 0.3, 0, [0.6, 0.6, 0.9]),
      item('kitchen-base', 'Unterschrank 2', 3.6, 0.3, 0, [0.6, 0.6, 0.9]),
      item('kitchen-wall', 'Oberschrank 1', 1.5, 0.18, 0, [0.6, 0.35, 0.7], { elevation: 1.45 }),
      item('kitchen-wall', 'Oberschrank 2', 2.2, 0.18, 0, [0.8, 0.35, 0.7], { elevation: 1.45 }),
      item('kitchen-wall', 'Oberschrank 3', 3.6, 0.18, 0, [0.6, 0.35, 0.7], { elevation: 1.45 }),
      item('kitchen-island', 'Kücheninsel', 2.3, 2.1, 0, [1.8, 0.9, 0.92]),
      item('pendant-light', 'Pendelleuchte', 2.3, 2.1, 0, [0.35, 0.35, 0.8], { light: { on: true, intensity: 1, temperature: 3000 } }),
    ],
    design: {
      floor: 'tiles-large-light',
      wallFinishes: { north: 'tiles' },
      lighting: { preset: 'neutral', brightness: 1 },
    },
  }), version: 7 };
}

export function bathScene() {
  n = 0;
  const walls = rectangleWalls(2.8, 2.4, 2.5);
  return { ...project('bad', 'Bad', {
    walls,
    height: 2.5,
    openings: [
      { id: 'opening-1', type: 'door', wall: 'south', offset: 1.2, width: 0.8, height: 2.0, hinge: 'right', swing: 'inward' },
      { id: 'opening-2', type: 'window', wall: 'north', offset: 1.0, width: 0.8, height: 0.9, sillHeight: 1.4, sashes: 1 },
    ],
    furniture: [
      item('bathtub', 'Badewanne', 0.88, 0.38, 0, [1.7, 0.75, 0.6]),
      item('shower', 'Dusche', 2.35, 0.45, 0, [0.9, 0.9, 2.0]),
      item('toilet', 'WC', 0.35, 1.6, 90, [0.4, 0.7, 0.8]),
      item('washbasin', 'Waschtisch', 2.55, 1.6, 270, [0.8, 0.5, 0.85]),
      item('rug', 'Badvorleger', 1.4, 1.6, 0, [0.8, 0.5, 0.01], { colors: { fabric: '#9fb3c8' } }),
      item('plant', 'Pflanze', 2.55, 2.2, 0, [0.3, 0.3, 0.5]),
    ],
    design: {
      floor: 'tiles',
      wallColors: Object.fromEntries(walls.map((w) => [w.id, '#f3f4f2'])),
      wallFinishes: Object.fromEntries(walls.map((w) => [w.id, 'tiles'])),
      lighting: { preset: 'daylight', brightness: 1 },
    },
  }), version: 7 };
}

export function livingRug() {
  n = 0;
  return { ...project('wohnen-teppich', 'Wohnzimmer Teppich', {
    walls: rectangleWalls(5, 4.2, 2.6),
    openings: [{ id: 'opening-1', type: 'window', wall: 'north', offset: 1.6, width: 1.8, height: 1.4, sillHeight: 0.8, sashes: 2 }],
    furniture: [
      item('rug', 'Teppich', 2.5, 2.6, 0, [2.4, 1.7, 0.01], { colors: { fabric: '#c9a77c' } }),
      item('sofa', 'Sofa', 2.5, 3.6, 180, [2.2, 0.95, 0.85], { colors: { fabric: '#6b7f99' } }),
      item('coffee-table', 'Couchtisch', 2.5, 2.5, 0, [1.1, 0.6, 0.45]),
      item('armchair', 'Sessel', 0.9, 2.3, 90, [0.85, 0.85, 0.85]),
      item('plant', 'Pflanze', 4.6, 3.8, 0, [0.5, 0.5, 1.3]),
      item('floor-lamp', 'Stehlampe', 0.45, 3.75, 0, [0.4, 0.4, 1.6], { light: { on: true, intensity: 1, temperature: 2700 } }),
      item('tv-board', 'TV-Board', 2.5, 0.25, 0, [1.8, 0.4, 0.5]),
    ],
    design: { floor: 'oak', lighting: { preset: 'warm', brightness: 1 } },
  }), version: 7 };
}
