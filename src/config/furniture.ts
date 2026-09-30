import type { FurnitureColorSlot, FurnitureSize, FurnitureType, LampLight } from '../types/furniture';
import type { Meters } from '../types/room';

/**
 * Herkunft des 3D-Modells. Aktuell nur prozedurale Modelle; echte Modelle werden
 * später als weitere Variante ergänzt, z. B. `{ kind: 'glb'; url: string }`,
 * und in `FurnitureModel` verzweigt.
 */
export type FurnitureModelSource = { kind: 'procedural' };

export interface FurnitureDefinition {
  type: FurnitureType;
  label: string;
  /** Zusätzliche Suchbegriffe für die Bibliothek (Synonyme, Oberbegriffe). */
  keywords: readonly string[];
  defaultSize: FurnitureSize;
  limits: Record<keyof FurnitureSize, [min: Meters, max: Meters]>;
  model: FurnitureModelSource;
  /** Einstellbare Farbbereiche mit Bezeichnung und Standardfarbe (= bisherige Modellfarbe). */
  colorSlots?: readonly { slot: FurnitureColorSlot; label: string; default: string }[];
  /** Befestigung: am Boden (Standard) oder an der Decke (Höhe = Abhängung). */
  mount?: 'floor' | 'ceiling';
  /** Lampen: Standardlicht und Grundhelligkeit (Candela bei Faktor 1). */
  lamp?: { light: LampLight; candela: number; /** Lage der Lichtquelle als Anteil der Höhe (von unten). */ sourceAt: number };
  /** Tischlampe: Standardstandhöhe und Grenzen. */
  elevation?: { default: Meters; limits: [Meters, Meters] };
}

export type FurnitureCategoryId = 'living' | 'bedroom' | 'dining' | 'office' | 'lamps';

export interface FurnitureCategory {
  id: FurnitureCategoryId;
  label: string;
  /** Ein Typ darf in mehreren Kategorien vorkommen (z. B. Regal). */
  types: readonly FurnitureType[];
}

/** Kategorien der Möbelbibliothek – Reihenfolge = Anzeige. Neue Kategorien hier ergänzen. */
export const FURNITURE_CATEGORIES: readonly FurnitureCategory[] = [
  { id: 'living', label: 'Wohnzimmer', types: ['sofa', 'armchair', 'coffee-table', 'tv-board', 'shelf'] },
  { id: 'bedroom', label: 'Schlafzimmer', types: ['bed', 'double-bed', 'wardrobe', 'dresser', 'nightstand'] },
  { id: 'dining', label: 'Esszimmer', types: ['table', 'chair', 'sideboard'] },
  { id: 'office', label: 'Büro', types: ['desk', 'office-chair', 'shelf'] },
  { id: 'lamps', label: 'Lampen', types: ['ceiling-light', 'pendant-light', 'floor-lamp', 'table-lamp'] },
];

const procedural: FurnitureModelSource = { kind: 'procedural' };

/**
 * Möbelkatalog – neue Typen werden hier ergänzt (plus Modell und Grundriss-Symbol).
 * Maße: Breite × Tiefe × Höhe als Außenmaße; Grenzen realistisch für den Typ.
 * Die vier Typen der ersten Version behalten Maße und Grenzen (gespeicherte Projekte).
 */
export const FURNITURE_CATALOG: Record<FurnitureType, FurnitureDefinition> = {
  // ---------- Wohnzimmer
  sofa: {
    type: 'sofa',
    label: 'Sofa',
    keywords: ['Couch', 'Sitzgarnitur'],
    defaultSize: { width: 2, depth: 0.9, height: 0.85 },
    limits: { width: [0.8, 4], depth: [0.6, 1.8], height: [0.5, 1.3] },
    model: procedural,
    colorSlots: [{ slot: 'fabric', label: 'Stoff', default: '#7d8ea3' }],
  },
  armchair: {
    type: 'armchair',
    label: 'Sessel',
    keywords: ['Ohrensessel', 'Lounge', 'Polstersessel'],
    defaultSize: { width: 0.85, depth: 0.85, height: 0.85 },
    limits: { width: [0.6, 1.3], depth: [0.6, 1.1], height: [0.6, 1.2] },
    model: procedural,
    colorSlots: [{ slot: 'fabric', label: 'Stoff', default: '#b58a5a' }],
  },
  'coffee-table': {
    type: 'coffee-table',
    label: 'Couchtisch',
    keywords: ['Tisch', 'Wohnzimmertisch', 'Beistelltisch'],
    defaultSize: { width: 1.1, depth: 0.6, height: 0.45 },
    limits: { width: [0.4, 1.8], depth: [0.4, 1.2], height: [0.3, 0.6] },
    model: procedural,
    colorSlots: [{ slot: 'wood', label: 'Oberfläche', default: '#c09468' }],
  },
  'tv-board': {
    type: 'tv-board',
    label: 'TV-Board',
    keywords: ['Lowboard', 'Fernseher', 'Fernsehschrank', 'Medienmöbel', 'Schrank'],
    defaultSize: { width: 1.8, depth: 0.4, height: 0.5 },
    limits: { width: [0.8, 3], depth: [0.3, 0.6], height: [0.3, 0.8] },
    model: procedural,
    colorSlots: [{ slot: 'main', label: 'Korpus', default: '#f2efea' }],
  },
  shelf: {
    type: 'shelf',
    label: 'Regal',
    keywords: ['Bücherregal', 'Bücher', 'Standregal'],
    defaultSize: { width: 0.8, depth: 0.35, height: 1.8 },
    limits: { width: [0.4, 3], depth: [0.25, 0.6], height: [0.6, 2.5] },
    model: procedural,
    colorSlots: [{ slot: 'wood', label: 'Holz', default: '#c09468' }],
  },
  // ---------- Schlafzimmer
  bed: {
    type: 'bed',
    label: 'Einzelbett',
    keywords: ['Bett', 'Gästebett'],
    defaultSize: { width: 2, depth: 0.9, height: 0.5 },
    limits: { width: [0.8, 3], depth: [0.6, 2.4], height: [0.2, 1.4] },
    model: procedural,
    colorSlots: [{ slot: 'fabric', label: 'Bettwäsche', default: '#9fb3c8' }, { slot: 'wood', label: 'Gestell', default: '#c29b6d' }],
  },
  'double-bed': {
    type: 'double-bed',
    label: 'Doppelbett',
    keywords: ['Bett', 'Ehebett', 'Boxspringbett'],
    defaultSize: { width: 2.1, depth: 1.8, height: 0.5 },
    limits: { width: [1.9, 2.4], depth: [1.2, 2.2], height: [0.25, 1.2] },
    model: procedural,
    colorSlots: [{ slot: 'fabric', label: 'Bettwäsche', default: '#9fb3c8' }, { slot: 'wood', label: 'Gestell', default: '#c29b6d' }],
  },
  wardrobe: {
    type: 'wardrobe',
    label: 'Kleiderschrank',
    keywords: ['Schrank', 'Garderobe'],
    defaultSize: { width: 1.5, depth: 0.6, height: 2 },
    limits: { width: [0.3, 5], depth: [0.3, 1.2], height: [0.5, 3] },
    model: procedural,
    colorSlots: [{ slot: 'main', label: 'Korpus', default: '#e8e3da' }],
  },
  dresser: {
    type: 'dresser',
    label: 'Kommode',
    keywords: ['Schubladen', 'Schubladenkommode', 'Schrank'],
    defaultSize: { width: 1, depth: 0.45, height: 0.85 },
    limits: { width: [0.4, 2.2], depth: [0.3, 0.6], height: [0.5, 1.3] },
    model: procedural,
    colorSlots: [{ slot: 'main', label: 'Korpus', default: '#f2efea' }, { slot: 'wood', label: 'Deckplatte', default: '#c09468' }],
  },
  nightstand: {
    type: 'nightstand',
    label: 'Nachttisch',
    keywords: ['Nachtschrank', 'Nachtkästchen', 'Schrank'],
    defaultSize: { width: 0.45, depth: 0.4, height: 0.55 },
    limits: { width: [0.3, 0.7], depth: [0.3, 0.55], height: [0.35, 0.8] },
    model: procedural,
    colorSlots: [{ slot: 'wood', label: 'Korpus', default: '#c09468' }],
  },
  // ---------- Esszimmer
  table: {
    type: 'table',
    label: 'Esstisch',
    keywords: ['Tisch', 'Küchentisch'],
    defaultSize: { width: 1.4, depth: 0.8, height: 0.75 },
    limits: { width: [0.4, 4], depth: [0.4, 2], height: [0.4, 1.2] },
    model: procedural,
    colorSlots: [{ slot: 'wood', label: 'Oberfläche', default: '#c7a078' }],
  },
  chair: {
    type: 'chair',
    label: 'Stuhl',
    keywords: ['Esszimmerstuhl', 'Sitz'],
    defaultSize: { width: 0.45, depth: 0.52, height: 0.9 },
    limits: { width: [0.38, 0.6], depth: [0.4, 0.65], height: [0.75, 1.1] },
    model: procedural,
    colorSlots: [{ slot: 'fabric', label: 'Sitz', default: '#d9cbb5' }, { slot: 'wood', label: 'Gestell', default: '#c09468' }],
  },
  sideboard: {
    type: 'sideboard',
    label: 'Sideboard',
    keywords: ['Anrichte', 'Kommode', 'Schrank'],
    defaultSize: { width: 1.6, depth: 0.45, height: 0.8 },
    limits: { width: [0.8, 2.6], depth: [0.35, 0.6], height: [0.6, 1.1] },
    model: procedural,
    colorSlots: [{ slot: 'wood', label: 'Korpus', default: '#c09468' }],
  },
  // ---------- Büro
  desk: {
    type: 'desk',
    label: 'Schreibtisch',
    keywords: ['Tisch', 'Arbeitsplatz', 'Bürotisch'],
    defaultSize: { width: 1.4, depth: 0.7, height: 0.75 },
    limits: { width: [0.8, 2.4], depth: [0.5, 1], height: [0.6, 0.9] },
    model: procedural,
    colorSlots: [{ slot: 'wood', label: 'Platte', default: '#c09468' }, { slot: 'main', label: 'Korpus', default: '#f2efea' }],
  },
  'office-chair': {
    type: 'office-chair',
    label: 'Bürostuhl',
    keywords: ['Drehstuhl', 'Schreibtischstuhl', 'Stuhl'],
    defaultSize: { width: 0.65, depth: 0.65, height: 1.1 },
    limits: { width: [0.5, 0.8], depth: [0.5, 0.8], height: [0.85, 1.35] },
    model: procedural,
    colorSlots: [{ slot: 'fabric', label: 'Bezug', default: '#3e4a5b' }],
  },
  // ---------- Lampen
  'ceiling-light': {
    type: 'ceiling-light',
    label: 'Deckenleuchte',
    keywords: ['Lampe', 'Licht', 'Deckenlampe', 'Leuchte', 'Beleuchtung'],
    defaultSize: { width: 0.45, depth: 0.45, height: 0.12 },
    limits: { width: [0.2, 1.2], depth: [0.2, 1.2], height: [0.05, 0.4] },
    model: procedural,
    colorSlots: [{ slot: 'main', label: 'Leuchte', default: '#f7f5f0' }],
    mount: 'ceiling',
    lamp: { light: { on: true, intensity: 1, temperature: 3000 }, candela: 5, sourceAt: 0.1 },
  },
  'pendant-light': {
    type: 'pendant-light',
    label: 'Pendelleuchte',
    keywords: ['Lampe', 'Licht', 'Hängelampe', 'Hängeleuchte', 'Esstischlampe', 'Beleuchtung'],
    defaultSize: { width: 0.4, depth: 0.4, height: 0.9 },
    limits: { width: [0.15, 1.2], depth: [0.15, 1.2], height: [0.3, 1.8] },
    model: procedural,
    colorSlots: [{ slot: 'main', label: 'Schirm', default: '#2f3237' }],
    mount: 'ceiling',
    lamp: { light: { on: true, intensity: 1, temperature: 2700 }, candela: 3.5, sourceAt: 0.12 },
  },
  'floor-lamp': {
    type: 'floor-lamp',
    label: 'Stehlampe',
    keywords: ['Lampe', 'Licht', 'Stehleuchte', 'Leselampe', 'Beleuchtung'],
    defaultSize: { width: 0.4, depth: 0.4, height: 1.6 },
    limits: { width: [0.25, 0.8], depth: [0.25, 0.8], height: [1, 2.1] },
    model: procedural,
    colorSlots: [{ slot: 'main', label: 'Schirm', default: '#e3d3b6' }],
    lamp: { light: { on: true, intensity: 1, temperature: 2700 }, candela: 2.5, sourceAt: 0.88 },
  },
  'table-lamp': {
    type: 'table-lamp',
    label: 'Tischlampe',
    keywords: ['Lampe', 'Licht', 'Nachttischlampe', 'Leselampe', 'Beleuchtung'],
    defaultSize: { width: 0.28, depth: 0.28, height: 0.45 },
    limits: { width: [0.15, 0.5], depth: [0.15, 0.5], height: [0.25, 0.8] },
    model: procedural,
    colorSlots: [{ slot: 'main', label: 'Schirm', default: '#efe7d8' }],
    lamp: { light: { on: true, intensity: 1, temperature: 2700 }, candela: 1, sourceAt: 0.72 },
    elevation: { default: 0.75, limits: [0, 1.5] },
  },
};

export const FURNITURE_TYPES = Object.keys(FURNITURE_CATALOG) as FurnitureType[];

/** Lampe? (Licht, Einstellungen, Plansymbol) */
export const isLamp = (type: FurnitureType) => !!FURNITURE_CATALOG[type].lamp;
/** An der Decke befestigt (Decken- und Pendelleuchte)? */
export const isCeilingMounted = (type: FurnitureType) => FURNITURE_CATALOG[type].mount === 'ceiling';

/** Farbtemperatur: Grenzen und typische Werte. */
export const LAMP_TEMPERATURE = { min: 2200, max: 6500, step: 100 } as const;
export const LAMP_INTENSITY = { min: 0.1, max: 2, step: 0.05 } as const;

export const FURNITURE_INPUT_STEP: Meters = 0.05;
export const FURNITURE_ROTATION_STEP = 15;

/** Farben der prozeduralen Modelle. */
export const FURNITURE_COLORS = {
  wood: '#c29b6d',
  woodDark: '#8d6a45',
  linen: '#f4f1ea',
  blanket: '#9fb3c8',
  pillow: '#ffffff',
  cabinet: '#e8e3da',
  cabinetFront: '#f6f3ee',
  plinth: '#b3aca1',
  handle: '#7f848c',
  fabric: '#7d8ea3',
  cushion: '#8fa0b5',
  leg: '#3b3f45',
  tableTop: '#c7a078',
  tableLeg: '#6b5540',
  oak: '#c09468',
  walnut: '#6f4d35',
  lacquer: '#f2efea',
  lacquerFront: '#faf8f5',
  recess: '#4a4540',
  metal: '#33363b',
  chrome: '#a3a9b0',
  armchairFabric: '#b58a5a',
  armchairCushion: '#c49a69',
  officeFabric: '#3e4a5b',
  chairSeat: '#d9cbb5',
  books: ['#8a4f3d', '#3f5c78', '#c7a24a', '#5f7a5a', '#b5b0a6', '#7a5f8a', '#2f3e4d'],
} as const;

/** Direktes Bearbeiten im Grundriss. Pixelwerte werden mit dem aktuellen Zoom umgerechnet. */
export const FURNITURE_DRAG_CONFIG = {
  /** Bewegung, ab der ein Klick zum Ziehen wird. */
  dragStartTolerancePx: 3,
  /** Einrastabstand für Wände, Raummitte und andere Möbel – bewusst klein. */
  snapDistancePx: 8,
  /** Rotation: Standardraster … */
  rotationStepDeg: 5,
  /** … und stärkeres Einrasten in dieser Nähe zu 0°, 90°, 180°, 270°. */
  rotationCardinalSnapDeg: 6,
  /** Abstand des Rotations-Handles von der Rückseite des Möbels. */
  rotationHandleOffsetPx: 28,
} as const;
