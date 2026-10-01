import { useId } from 'react';
import { FURNITURE_CATALOG, isCeilingMounted, LAMP_INTENSITY, LAMP_TEMPERATURE } from '../../config/furniture';
import type { FurnitureColorSlot, FurnitureItem, FurniturePatch } from '../../types/furniture';
import { furnitureColor, kelvinToHex } from '../../utils/furniture';
import { formatMeters } from '../../utils/units';
import { MeasurementInput } from '../ui/MeasurementInput';
import styles from './FurnitureAppearance.module.css';

interface FurnitureAppearanceProps {
  item: FurnitureItem;
  roomHeight: number;
  /** Tischlampe auf einem Träger: dessen Name und Oberkante. */
  support?: { name: string; height: number } | null;
  onChange: (patch: FurniturePatch) => void;
}

/**
 * Farben (je sinnvollem Bereich, nicht jedes Bauteil) und – bei Lampen – Licht:
 * Ein/Aus, Helligkeit und Farbtemperatur. Tischlampen zusätzlich mit Standhöhe.
 */
export function FurnitureAppearance({ item, roomHeight, support = null, onChange }: FurnitureAppearanceProps) {
  const definition = FURNITURE_CATALOG[item.type];
  const slots = definition.colorSlots ?? [];
  const lamp = definition.lamp;
  const light = item.light ?? lamp?.light;
  const intensityId = useId();
  const temperatureId = useId();
  const colorIds = useId();

  const setColor = (slot: FurnitureColorSlot, value: string | null) => {
    const colors = { ...(item.colors ?? {}) };
    if (value === null) delete colors[slot];
    else colors[slot] = value;
    onChange({ colors: Object.keys(colors).length ? colors : undefined });
  };

  return (
    <div className={styles.appearance}>
      {slots.length > 0 && (
        <div className={styles.colors} data-testid="furniture-colors">
          {slots.map(({ slot, label }) => {
            const custom = item.colors?.[slot] !== undefined;
            return (
              <div key={slot} className={styles.colorRow}>
                <input
                  id={`${colorIds}-${slot}`}
                  type="color"
                  className={styles.color}
                  value={furnitureColor(item, slot)}
                  aria-label={`Farbe ${label}`}
                  onChange={(event) => setColor(slot, event.target.value)}
                  data-testid={`furniture-color-${slot}`}
                />
                <label htmlFor={`${colorIds}-${slot}`}>{label}</label>
                {custom && (
                  <button type="button" className={styles.reset} onClick={() => setColor(slot, null)} data-testid={`furniture-color-reset-${slot}`}>
                    Standard
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {lamp && light && (
        <div className={styles.lamp} data-testid="lamp-settings">
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={light.on}
            onClick={() => onChange({ light: { ...light, on: !light.on } })}
            data-testid="lamp-toggle"
          >
            <span className={styles.bulb} style={{ background: light.on ? kelvinToHex(light.temperature) : 'transparent' }} aria-hidden="true" />
            {light.on ? 'Licht an' : 'Licht aus'}
          </button>
          <div className={styles.slider}>
            <label htmlFor={intensityId}>Helligkeit</label>
            <input
              id={intensityId}
              type="range"
              min={LAMP_INTENSITY.min}
              max={LAMP_INTENSITY.max}
              step={LAMP_INTENSITY.step}
              value={light.intensity}
              onChange={(event) => onChange({ light: { ...light, intensity: Number(event.target.value) } })}
              data-testid="lamp-intensity"
            />
            <span>{Math.round(light.intensity * 100)} %</span>
          </div>
          <div className={styles.slider}>
            <label htmlFor={temperatureId}>Lichtfarbe</label>
            <input
              id={temperatureId}
              type="range"
              className={styles.temperature}
              min={LAMP_TEMPERATURE.min}
              max={LAMP_TEMPERATURE.max}
              step={LAMP_TEMPERATURE.step}
              value={light.temperature}
              onChange={(event) => onChange({ light: { ...light, temperature: Number(event.target.value) } })}
              data-testid="lamp-temperature"
            />
            <span>{light.temperature} K</span>
          </div>
        </div>
      )}

      {definition.elevation && support && (
        <p className={styles.hint} data-testid="lamp-support">
          Steht auf „{support.name}“ ({formatMeters(support.height)} m) – Standhöhe automatisch. Ohne Unterlage gilt wieder die eigene Standhöhe.
        </p>
      )}
      {definition.elevation && !support && (
        <MeasurementInput
          label="Standhöhe"
          value={item.elevation ?? definition.elevation.default}
          min={definition.elevation.limits[0]}
          max={Math.min(definition.elevation.limits[1], roomHeight - item.height)}
          step={0.05}
          onChange={(elevation) => onChange({ elevation })}
        />
      )}
      {isCeilingMounted(item.type) && <p className={styles.hint}>Hängt an der Decke – „Höhe“ ist die Abhängung und folgt der Raumhöhe.</p>}
    </div>
  );
}
