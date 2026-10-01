import type { FloorMaterialId, HexColor, LightingPreset, LightingSettings, RoomDesign, WallFinish } from '../types/design';
import type { Meters } from '../types/room';

export interface FloorMaterialDefinition {
  id: FloorMaterialId;
  label: string;
  /** Kantenlänge (m), nach der sich die prozedurale Textur wiederholt – bestimmt den Maßstab. */
  repeatSize: Meters;
  roughness: number;
  /** Stärke des Reliefs (Fugen, Maserung). */
  bumpScale: number;
  /** CSS-Hintergrund der Vorschau-Kachel in der Sidebar. */
  swatch: string;
}

export const FLOOR_MATERIALS: Record<FloorMaterialId, FloorMaterialDefinition> = {
  'wood-light': {
    id: 'wood-light',
    label: 'Holz hell',
    repeatSize: 2.4,
    roughness: 0.62,
    bumpScale: 0.6,
    swatch: 'repeating-linear-gradient(0deg, #d8b98e 0 10px, #b99467 10px 11px), #d8b98e',
  },
  'wood-dark': {
    id: 'wood-dark',
    label: 'Holz dunkel',
    repeatSize: 2.4,
    roughness: 0.55,
    bumpScale: 0.6,
    swatch: 'repeating-linear-gradient(0deg, #6e4a2d 0 10px, #4a2f1a 10px 11px), #6e4a2d',
  },
  tiles: {
    id: 'tiles',
    label: 'Fliesen',
    repeatSize: 2.4,
    roughness: 0.35,
    bumpScale: 0.8,
    swatch:
      'repeating-linear-gradient(0deg, #bdb7ad 0 2px, transparent 2px 16px), repeating-linear-gradient(90deg, #bdb7ad 0 2px, transparent 2px 16px), #e7e3dc',
  },
  concrete: {
    id: 'concrete',
    label: 'Beton',
    repeatSize: 3,
    roughness: 0.9,
    bumpScale: 0.35,
    swatch: 'radial-gradient(circle at 30% 35%, #b6b5b0 0 20%, transparent 45%), radial-gradient(circle at 75% 70%, #9d9c97 0 18%, transparent 40%), #aaa9a4',
  },
  carpet: {
    id: 'carpet',
    label: 'Teppich',
    repeatSize: 1,
    roughness: 1,
    bumpScale: 0.25,
    swatch: 'repeating-linear-gradient(45deg, #b7ab9b 0 2px, #aa9e8d 2px 4px), #b4a898',
  },
  oak: {
    id: 'oak',
    label: 'Eiche',
    repeatSize: 2.4,
    roughness: 0.6,
    bumpScale: 0.6,
    swatch: 'repeating-linear-gradient(0deg, #c3a07a 0 12px, #a4845f 12px 13px), #c3a07a',
  },
  'parquet-dark': {
    id: 'parquet-dark',
    label: 'Parkett dunkel',
    repeatSize: 1.2,
    roughness: 0.5,
    bumpScale: 0.55,
    swatch: 'repeating-linear-gradient(0deg, #5a3d28 0 6px, #3d2819 6px 7px), #5a3d28',
  },
  herringbone: {
    id: 'herringbone',
    label: 'Fischgrät',
    repeatSize: 0.8,
    roughness: 0.58,
    bumpScale: 0.55,
    swatch:
      'repeating-linear-gradient(45deg, #b98c5c 0 6px, #a47a4d 6px 7px), repeating-linear-gradient(-45deg, #c79a69 0 6px, #a47a4d 6px 7px), #b98c5c',
  },
  'tiles-large-light': {
    id: 'tiles-large-light',
    label: 'Fliesen groß hell',
    repeatSize: 2.4,
    roughness: 0.3,
    bumpScale: 0.7,
    swatch: 'repeating-linear-gradient(0deg, #c9c4bb 0 1px, transparent 1px 26px), repeating-linear-gradient(90deg, #c9c4bb 0 1px, transparent 1px 26px), #eeebe6',
  },
  'tiles-large-dark': {
    id: 'tiles-large-dark',
    label: 'Fliesen groß dunkel',
    repeatSize: 2.4,
    roughness: 0.35,
    bumpScale: 0.7,
    swatch: 'repeating-linear-gradient(0deg, #2d2f33 0 1px, transparent 1px 26px), repeating-linear-gradient(90deg, #2d2f33 0 1px, transparent 1px 26px), #55585d',
  },
  'carpet-light': {
    id: 'carpet-light',
    label: 'Teppich hell',
    repeatSize: 1,
    roughness: 1,
    bumpScale: 0.25,
    swatch: 'repeating-linear-gradient(45deg, #ddd6ca 0 2px, #d2cabd 2px 4px), #d9d2c6',
  },
  'carpet-dark': {
    id: 'carpet-dark',
    label: 'Teppich dunkel',
    repeatSize: 1,
    roughness: 1,
    bumpScale: 0.25,
    swatch: 'repeating-linear-gradient(45deg, #4f5358 0 2px, #45494e 2px 4px), #4b4f54',
  },
};

export const FLOOR_MATERIAL_IDS = Object.keys(FLOOR_MATERIALS) as FloorMaterialId[];

export const DEFAULT_WALL_COLOR: HexColor = '#fbfbfa';
export const DEFAULT_CEILING_COLOR: HexColor = '#ffffff';
export const DEFAULT_WALL_FINISH: WallFinish = 'matte';

/**
 * Lichtstimmung ohne Angabe (alte Projekte): „Neutral“ entspricht exakt der früheren
 * festen Szenenbeleuchtung – migrierte Projekte sehen daher unverändert aus.
 */
export const LEGACY_LIGHTING: LightingSettings = { preset: 'neutral', brightness: 1 };
export const DEFAULT_LIGHTING: LightingSettings = { preset: 'daylight', brightness: 1 };
export const LIGHTING_BRIGHTNESS = { min: 0.4, max: 1.6, step: 0.05 } as const;

export const DEFAULT_DESIGN: RoomDesign = {
  floor: 'wood-light',
  wallColors: { north: DEFAULT_WALL_COLOR, east: DEFAULT_WALL_COLOR, south: DEFAULT_WALL_COLOR, west: DEFAULT_WALL_COLOR },
  wallFinishes: {},
  ceilingColor: DEFAULT_CEILING_COLOR,
  lighting: DEFAULT_LIGHTING,
};

/** Oberflächen der Wände. Rauheit/Relief bewusst zurückhaltend – die Farbe bleibt maßgeblich. */
export const WALL_FINISHES: Record<WallFinish, { label: string; roughness: number; bumpScale: number; repeatSize: Meters }> = {
  matte: { label: 'Matt', roughness: 0.9, bumpScale: 0, repeatSize: 1 },
  plaster: { label: 'Feinputz', roughness: 0.95, bumpScale: 0.25, repeatSize: 0.5 },
  concrete: { label: 'Betonoptik', roughness: 0.85, bumpScale: 0.3, repeatSize: 2 },
  // Wandfliesen 20 × 20 cm (Küche, Bad): 4 × 4 Fliesen je Texturkachel, glänzender, vertiefte Fugen.
  tiles: { label: 'Fliesen', roughness: 0.35, bumpScale: 0.6, repeatSize: 0.8 },
};
export const WALL_FINISH_IDS = Object.keys(WALL_FINISHES) as WallFinish[];
export const wallFinishOf = (design: RoomDesign, wallId: string): WallFinish => design.wallFinishes[wallId] ?? DEFAULT_WALL_FINISH;

export interface LightingPresetDefinition {
  label: string;
  /** Himmel/Boden des Umgebungslichts (weich, keine schwarzen Bereiche). */
  sky: HexColor;
  ground: HexColor;
  ambient: number;
  /** Hauptlicht (Sonne bzw. Raumlicht) mit dezentem Schatten. */
  sun: HexColor;
  sunIntensity: number;
  sunPosition: [number, number, number];
}

export const LIGHTING_PRESETS: Record<LightingPreset, LightingPresetDefinition> = {
  daylight: { label: 'Tageslicht', sky: '#f3f7ff', ground: '#e9e3d9', ambient: 2.45, sun: '#fff7ec', sunIntensity: 2.1, sunPosition: [7, 14, 9] },
  warm: { label: 'Warm', sky: '#fff1e0', ground: '#ebdfcf', ambient: 2.15, sun: '#ffe0bd', sunIntensity: 1.6, sunPosition: [10, 9, 5] },
  // Entspricht der bisherigen Beleuchtung.
  neutral: { label: 'Neutral', sky: '#ffffff', ground: '#e6e1d9', ambient: 2.6, sun: '#ffffff', sunIntensity: 1.8, sunPosition: [8, 14, 6] },
  cool: { label: 'Kühl', sky: '#eaf1ff', ground: '#e1e6ee', ambient: 2.45, sun: '#e8efff', sunIntensity: 1.75, sunPosition: [6, 15, 7] },
};
export const LIGHTING_PRESET_IDS = Object.keys(LIGHTING_PRESETS) as LightingPreset[];

/** Schnellauswahl in der Sidebar (freie Wahl über den Color-Picker). */
export const WALL_COLOR_PRESETS: readonly { label: string; color: HexColor }[] = [
  { label: 'Weiß', color: '#fbfbfa' },
  { label: 'Warmweiß', color: '#f3ede3' },
  { label: 'Hellgrau', color: '#dcdfe3' },
  { label: 'Sand', color: '#e3d3bb' },
  { label: 'Salbei', color: '#b8c6ae' },
  { label: 'Taubenblau', color: '#a8b8c8' },
  { label: 'Terrakotta', color: '#c98b6b' },
  { label: 'Anthrazit', color: '#4b5057' },
];

/** Grundriss: Gestaltung nur dezent – Boden stark aufgehellt, Wandfarbe als schmaler Streifen. */
export const PLAN_DESIGN_CONFIG = {
  /** Deckkraft der weißen Aufhellung über der Bodentextur. */
  floorVeilOpacity: 0.8,
  /** Breite des Wandfarb-Streifens an der Wand-Innenkante. */
  wallStripWidth: 0.035 as Meters,
} as const;

/** Farbe einer Wand (Standardfarbe, falls noch keine gesetzt wurde). */
export const wallColorOf = (design: RoomDesign, wallId: string): HexColor => design.wallColors[wallId] ?? DEFAULT_WALL_COLOR;

export const isHexColor = (value: unknown): value is HexColor => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export const normalizeHexColor = (value: HexColor): HexColor => value.toLowerCase();
