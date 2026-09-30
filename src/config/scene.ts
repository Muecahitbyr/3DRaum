export const SCENE_COLORS = {
  background: '#eef0f3',
  floor: '#e9e4dc',
  wall: '#fbfbfa',
  wallEdge: '#b9c0ca',
  planWall: '#3d4450',
  dimensionLine: '#5b6472',
  selection: '#2563eb',
  selectionSoft: '#9dbbf5',
  doorFrame: '#dde1e6',
  doorLeaf: '#d9c19c',
  windowFrame: '#5b6472',
  glass: '#a8cde6',
  planOpeningFill: '#ffffff',
  planSelectionFill: '#dfe8fc',
  conflict: '#d92d20',
  planConflictFill: '#fde3e1',
  warning: '#c77c02',
  planWarningFill: '#fdf0d5',
  planSymbol: '#3d4450',
  gridCell: '#d3d8df',
  gridSection: '#aab3bf',
} as const;

export const CAMERA_CONFIG = {
  fov: 45,
  near: 0.05,
  far: 500,
  /** Blickrichtung der Startkamera (schräg von vorne rechts oben, ca. 42° Neigung). */
  viewDirection: [0.8, 1.25, 1.1] as const,
  /** Zusätzlicher Rand beim Einpassen des Raums in die Ansicht. */
  fitMargin: 1.12,
} as const;

export const CONTROLS_CONFIG = {
  minDistance: 1,
  maxDistance: 80,
  /** Verhindert, dass die Kamera unter den Boden schwenkt. */
  maxPolarAngle: Math.PI / 2 - 0.05,
} as const;

export const GRID_CONFIG = {
  cellSize: 0.5,
  sectionSize: 1,
  fadeDistance: 60,
} as const;

/** Orthografische Draufsicht (2D). */
export const PLAN_VIEW_CONFIG = {
  /** Kamerahöhe über dem Boden; muss über der maximalen Raumhöhe liegen. */
  cameraHeight: 50,
  near: 0.1,
  far: 200,
  /** Freiraum in Pixeln rund um den Raum beim Einpassen (Platz für Maßlinien und Ansichtsumschalter). */
  fitPaddingPx: 112,
  /** Zoom = Pixel pro Meter. */
  minZoom: 4,
  maxZoom: 1500,
} as const;

/** Maßlinien in der 2D-Ansicht; Werte in Bildschirmpixeln, damit sie zoomunabhängig lesbar bleiben. */
export const DIMENSION_CONFIG = {
  /** Abstand der Maßlinie von der Außenkante der Wand. */
  offsetPx: 30,
  /** Lücke zwischen Wand und Beginn der Hilfslinie. */
  extensionGapPx: 4,
  /** Überstand der Hilfslinie über die Maßlinie hinaus. */
  extensionOvershootPx: 6,
  /** Halbe Länge der schrägen Begrenzungsstriche. */
  tickHalfLengthPx: 5,
  lineWidthPx: 1.25,
} as const;

/** Grundriss-Symbole für Türen und Fenster (Linienstärken in Pixeln). */
export const PLAN_SYMBOL_CONFIG = {
  lineWidthPx: 1.25,
  doorLeafWidthPx: 2.5,
  arcSegments: 32,
  /** Höhen über der Wandoberkante, damit Symbole über den Wänden liegen. */
  fillElevation: 0.01,
  lineElevation: 0.06,
  hitElevation: 0.08,
  selectedHitLift: 0.01,
} as const;

/**
 * 3D: Wände zwischen Kamera und Raum werden ausgeblendet. Maßgeblich ist, wie weit
 * die Kamera außerhalb der Wandebene steht (in Metern, positiv = außen).
 */
export const WALL_FADE_CONFIG = {
  /** Übergangsband: ab hier beginnt das Ausblenden … */
  fadeStartDistance: -0.2,
  /** … und ab hier ist die Wand vollständig ausgeblendet. */
  fadeEndDistance: 0.8,
  /** Restdeckkraft ausgeblendeter Wandflächen – bleibt als Hauch sichtbar. */
  wallOpacity: 0.08,
  /** Kanten bleiben deutlicher sichtbar, damit der Raum lesbar bleibt. */
  edgeOpacity: 0.35,
  /** Türen/Fenster der ausgeblendeten Wand (relativ zu ihrer eigenen Deckkraft). */
  openingOpacity: 0.15,
  /** Zeitliche Glättung (1/s): höher = schneller. */
  smoothing: 9,
  /** Unterhalb dieser Sichtbarkeit nimmt die Wand keine Klicks mehr an und wirft keinen Schatten. */
  interactiveThreshold: 0.5,
} as const;
