import type { Meters } from '../types/room';

/** Interne Genauigkeit: Zentimeter. Vermeidet Gleitkomma-Rauschen wie 2.4999999. */
const PRECISION = 100;

export function roundToPrecision(value: Meters): Meters {
  return Math.round(value * PRECISION) / PRECISION;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Parst Benutzereingaben in Metern; akzeptiert Komma und Punkt als Dezimaltrennzeichen. */
export function parseMeters(input: string): Meters | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '' || !/^-?\d*\.?\d*$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const meterFormatter = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMeters(value: Meters): string {
  return meterFormatter.format(value);
}

/** Rundet auf die angegebene Anzahl Nachkommastellen. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const numberFormatters = new Map<number, Intl.NumberFormat>();

/** Formatiert Zahlen im deutschen Format mit fester Anzahl Nachkommastellen. */
export function formatNumber(value: number, decimals: number): string {
  let formatter = numberFormatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    numberFormatters.set(decimals, formatter);
  }
  return formatter.format(value);
}
