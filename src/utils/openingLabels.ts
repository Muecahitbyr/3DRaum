import { OPENING_TYPE_LABELS } from '../config/openings';
import type { Opening } from '../types/opening';

/** Anzeigename wie „Tür 1“ oder „Fenster 2“ (fortlaufend je Typ). */
export function getOpeningDisplayName(opening: Opening, openings: readonly Opening[]): string {
  const index = openings.filter((o) => o.type === opening.type).findIndex((o) => o.id === opening.id);
  return `${OPENING_TYPE_LABELS[opening.type]} ${index + 1}`;
}
