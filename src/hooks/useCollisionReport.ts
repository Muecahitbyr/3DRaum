import { useMemo } from 'react';
import { computeCollisionReport } from '../collision';
import type { PlannerState } from '../state/plannerState';
import type { Opening } from '../types/opening';
import { roomModelOf } from '../utils/room/model';

const NO_OPENINGS: readonly Opening[] = [];

/**
 * Kollisionsbericht, abgeleitet aus dem Planungszustand – aktualisiert sich live mit jeder Änderung.
 * `foreignOpenings`: Türen/Fenster der Nachbarzimmer in gemeinsamen Wänden (z. B. Türschwenk ins Zimmer).
 */
export function useCollisionReport({ room, openings, furniture, fixtures }: PlannerState, foreignOpenings: readonly Opening[] = NO_OPENINGS) {
  return useMemo(
    () => computeCollisionReport(roomModelOf(room), foreignOpenings.length ? [...openings, ...foreignOpenings] : openings, furniture, fixtures),
    [room, openings, furniture, fixtures, foreignOpenings],
  );
}
