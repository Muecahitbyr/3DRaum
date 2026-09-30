import { FURNITURE_CATALOG } from '../../config/furniture';
import type { FurnitureItem } from '../../types/furniture';
import type { CollisionSeverity } from '../../collision';
import { Button } from '../ui/Button';
import { FurnitureIcon } from './FurnitureIcon';
import styles from './OpeningsPanel.module.css';
import { SidebarSection } from './SidebarSection';

interface FurniturePanelProps {
  furniture: readonly FurnitureItem[];
  /** Alle ausgewählten Möbel. */
  selectedIds: readonly string[];
  severityById: ReadonlyMap<string, CollisionSeverity>;
  /** Öffnet die Möbelbibliothek. */
  onOpenLibrary: () => void;
  /** `toggle`: Shift+Klick ergänzt/entfernt, sonst Einzelauswahl. */
  onSelect: (id: string, toggle: boolean) => void;
}

export function FurniturePanel({ furniture, selectedIds, severityById, onOpenLibrary, onSelect }: FurniturePanelProps) {
  return (
    <SidebarSection title="Möbel" testId="furniture-panel">
      <Button variant="primary" block onClick={onOpenLibrary} data-testid="furniture-library-button">
        <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M7 2v10M2 7h10" />
        </svg>
        Möbel hinzufügen
      </Button>
      {furniture.length === 0 ? (
        <p className={styles.empty}>Noch keine Möbel im Raum.</p>
      ) : (
        <ul className={styles.list} aria-label="Platzierte Möbel">
          {furniture.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={styles.item}
                aria-pressed={selectedIds.includes(item.id)}
                onClick={(event) => onSelect(item.id, event.shiftKey)}
                data-testid="furniture-list-item"
              >
                <FurnitureIcon type={item.type} />
                <span className={styles.itemName} title={item.name}>
                  {item.name}
                </span>
                {severityById.has(item.id) && (
                  <span className={styles.status} data-severity={severityById.get(item.id)} aria-label="Kollision" />
                )}
                {/* Typ nur zeigen, wenn er nicht schon im Namen steht (z. B. „Couch“ → Sofa). */}
                {!item.name.toLowerCase().includes(FURNITURE_CATALOG[item.type].label.toLowerCase()) && (
                  <span className={styles.itemMeta}>{FURNITURE_CATALOG[item.type].label}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </SidebarSection>
  );
}
