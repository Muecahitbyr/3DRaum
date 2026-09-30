import { useMemo } from 'react';
import { computeCollisionReport } from '../collision';
import type { PlannerState } from '../state/plannerState';
import { roomModelOf } from '../utils/room/model';

/** Kollisionsbericht, abgeleitet aus dem Planungszustand – aktualisiert sich live mit jeder Änderung. */
export function useCollisionReport({ room, openings, furniture, fixtures }: PlannerState) {
  return useMemo(
    () => computeCollisionReport(roomModelOf(room), openings, furniture, fixtures),
    [room, openings, furniture, fixtures],
  );
}
