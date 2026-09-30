import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { FloorPoint } from '../../../types/room';

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);

/** Minimale Schnittstelle der Kamerasteuerung, die während einer Bearbeitung pausiert. */
interface PausableControls {
  enabled: boolean;
}

export interface PointerStart {
  pointerId: number;
  clientX: number;
  clientY: number;
}

export interface PlanPointerSessionOptions extends PointerStart {
  /** Bewegung in Pixeln, ab der die Bearbeitung beginnt (Klicks bleiben Klicks). */
  startTolerancePx: number;
  /** Zeigerposition auf dem Boden (Weltkoordinaten) und aktueller Maßstab. */
  onMove: (floor: FloorPoint, metersPerPixel: number) => void;
  /** Esc: vorherigen Zustand wiederherstellen. */
  onCancel: () => void;
  /** Wird immer am Ende aufgerufen (Loslassen, Esc, Abbruch). */
  onEnd?: () => void;
}

interface ActiveSession {
  options: PlanPointerSessionOptions;
  moved: boolean;
  captureTarget: HTMLElement;
  detach: () => void;
}

/**
 * Gemeinsame Mechanik für direkte Bearbeitung im Grundriss: pausiert die
 * Kamerasteuerung synchron (sie erhält dasselbe pointerdown direkt danach),
 * hält den Zeiger fest (auch außerhalb der Zeichenfläche), rechnet Bildschirm-
 * in Bodenkoordinaten um und unterstützt Esc zum Abbrechen. Nach einer echten
 * Bearbeitung wird der folgende Klick verschluckt, damit er nicht die Auswahl aufhebt.
 */
export function usePlanPointerSession() {
  const get = useThree((state) => state.get);
  const session = useRef<ActiveSession | null>(null);
  const tools = useMemo(() => ({ raycaster: new Raycaster(), ndc: new Vector2(), hit: new Vector3() }), []);

  const setControlsEnabled = useCallback(
    (value: boolean) => {
      const controls = get().controls as PausableControls | null;
      if (controls) controls.enabled = value;
    },
    [get],
  );

  const pointerToFloor = useCallback(
    (clientX: number, clientY: number): FloorPoint | null => {
      const state = get();
      const rect = state.gl.domElement.getBoundingClientRect();
      tools.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      tools.raycaster.setFromCamera(tools.ndc, state.camera);
      const hit = tools.raycaster.ray.intersectPlane(FLOOR_PLANE, tools.hit);
      return hit ? { x: hit.x, z: hit.z } : null;
    },
    [get, tools],
  );

  const end = useCallback(() => {
    const current = session.current;
    if (!current) return;
    session.current = null;
    current.detach();
    if (current.captureTarget.hasPointerCapture(current.options.pointerId)) {
      current.captureTarget.releasePointerCapture(current.options.pointerId);
    }
    setControlsEnabled(true);
    document.body.style.cursor = '';
    if (current.moved) {
      // Den Klick, den der Browser nach dem Loslassen auslöst, einmalig verschlucken.
      const swallow = (e: MouseEvent) => e.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    }
    current.options.onEnd?.();
  }, [setControlsEnabled]);

  const begin = useCallback(
    (options: PlanPointerSessionOptions, cursor: string) => {
      end();
      setControlsEnabled(false);
      const captureTarget = get().gl.domElement;
      captureTarget.setPointerCapture(options.pointerId);

      const onPointerMove = (e: PointerEvent) => {
        const s = session.current;
        if (!s || e.pointerId !== s.options.pointerId) return;
        if (!s.moved) {
          if (Math.hypot(e.clientX - s.options.clientX, e.clientY - s.options.clientY) < s.options.startTolerancePx) return;
          s.moved = true;
        }
        const floor = pointerToFloor(e.clientX, e.clientY);
        if (!floor) return;
        document.body.style.cursor = cursor;
        s.options.onMove(floor, 1 / Math.max(get().camera.zoom, 1e-6));
      };
      const onPointerUp = (e: PointerEvent) => {
        if (session.current && e.pointerId === session.current.options.pointerId) end();
      };
      const onKeyDown = (e: KeyboardEvent) => {
        const s = session.current;
        if (e.key !== 'Escape' || !s) return;
        s.options.onCancel();
        end();
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      window.addEventListener('keydown', onKeyDown);
      session.current = {
        options,
        moved: false,
        captureTarget,
        detach: () => {
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
          window.removeEventListener('pointercancel', onPointerUp);
          window.removeEventListener('keydown', onKeyDown);
        },
      };
    },
    [end, get, pointerToFloor, setControlsEnabled],
  );

  useEffect(() => end, [end]);

  return { begin, end, pointerToFloor };
}
