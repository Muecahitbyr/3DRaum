import type { FurnitureGroup, FurnitureItem } from '../../types/furniture';
import type { AlignMode } from '../../utils/furnitureFormation';
import { Button } from '../ui/Button';
import { AlignmentTools } from './AlignmentTools';
import styles from './FurniturePropertiesPanel.module.css';
import { SidebarSection } from './SidebarSection';

interface MultiSelectionPanelProps {
  items: readonly FurnitureItem[];
  groups: readonly FurnitureGroup[];
  onGroup: (ids: string[]) => void;
  onUngroup: (groupId: string) => void;
  onDuplicate: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  onAlign: (ids: string[], mode: AlignMode) => void;
  onClose: () => void;
}

/** Aktionen für mehrere ausgewählte Möbel: gruppieren, duplizieren, löschen, ausrichten. */
export function MultiSelectionPanel({ items, groups, onGroup, onUngroup, onDuplicate, onDelete, onAlign, onClose }: MultiSelectionPanelProps) {
  const ids = items.map((item) => item.id);
  // Genau eine vollständige Gruppe ausgewählt → „Gruppe auflösen“, sonst „Gruppieren“.
  const containedGroups = groups.filter((g) => g.memberIds.some((id) => ids.includes(id)));
  const exactGroup =
    containedGroups.length === 1 && containedGroups[0].memberIds.length === ids.length ? containedGroups[0] : null;

  return (
    <SidebarSection
      title={exactGroup ? exactGroup.name : 'Mehrfachauswahl'}
      testId="multi-selection"
      action={
        <Button variant="icon" onClick={onClose} aria-label="Auswahl aufheben" title="Auswahl aufheben">
          <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="m3 3 8 8M11 3l-8 8" />
          </svg>
        </Button>
      }
    >
      <p className={styles.type} data-testid="multi-selection-count">
        {items.length} Möbel ausgewählt
      </p>
      <p className={styles.hint} title={items.map((i) => i.name).join(', ')}>
        {items.map((i) => i.name).join(', ')}
      </p>

      {exactGroup ? (
        <Button block onClick={() => onUngroup(exactGroup.id)} data-testid="ungroup-furniture">
          Gruppe auflösen
        </Button>
      ) : (
        <Button block onClick={() => onGroup(ids)} data-testid="group-furniture">
          Gruppieren
        </Button>
      )}

      <AlignmentTools onAlign={(mode) => onAlign(ids, mode)} />

      <div className={styles.footerRow}>
        <Button onClick={() => onDuplicate(ids)} title="Duplizieren (Strg/⌘ + D)" data-testid="duplicate-selection">
          Duplizieren
        </Button>
        <Button variant="danger" onClick={() => onDelete(ids)} title="Löschen (Entf)" data-testid="delete-selection">
          Löschen
        </Button>
      </div>
      <p className={styles.hint}>Verschieben: im Grundriss ziehen oder Pfeiltasten (Shift = 10 cm).</p>
    </SidebarSection>
  );
}
