import { useEffect, useMemo, useState } from 'react';
import { FURNITURE_CATALOG, FURNITURE_CATEGORIES } from '../../config/furniture';
import type { FurnitureType } from '../../types/furniture';
import { formatMeters } from '../../utils/units';
import { FurnitureIcon } from '../sidebar/FurnitureIcon';
import { Dialog } from '../ui/Dialog';
import styles from './FurnitureLibrary.module.css';
import { renderFurnitureThumbnails } from './furnitureThumbnails';
import { filterLibrary, typesOf, type LibraryCategory } from './libraryFilter';

const TABS: readonly { id: LibraryCategory; label: string }[] = [
  { id: 'all', label: 'Alle' },
  ...FURNITURE_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
];

interface FurnitureLibraryProps {
  onAdd: (type: FurnitureType) => void;
  onClose: () => void;
}

/** Möbelbibliothek: Kategorien, Suche und Karten mit 3D-Vorschau. */
export function FurnitureLibrary({ onAdd, onClose }: FurnitureLibraryProps) {
  const [category, setCategory] = useState<LibraryCategory>('all');
  const [query, setQuery] = useState('');
  const [thumbnails, setThumbnails] = useState<ReadonlyMap<FurnitureType, string> | null>(null);
  const results = useMemo(() => filterLibrary(category, query), [category, query]);

  useEffect(() => {
    let active = true;
    renderFurnitureThumbnails()
      .then((map) => active && setThumbnails(new Map(map)))
      .catch(() => active && setThumbnails(new Map())); // ohne WebGL: Piktogramme
    return () => {
      active = false;
    };
  }, []);

  return (
    <Dialog title="Möbel hinzufügen" onClose={onClose} width={760} testId="furniture-library">
      <label className={styles.search}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          placeholder="Suchen, z. B. „Schrank“"
          aria-label="Möbel suchen"
          data-autofocus
          data-testid="library-search"
          onChange={(event) => {
            setQuery(event.target.value);
            // Beim Suchen immer in allen Kategorien suchen.
            if (event.target.value.trim()) setCategory('all');
          }}
        />
      </label>

      <div className={styles.tabs} role="tablist" aria-label="Kategorien">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={category === tab.id}
            onClick={() => setCategory(tab.id)}
            data-testid={`library-category-${tab.id}`}
          >
            {tab.label}
            <span className={styles.count}>{typesOf(tab.id).length}</span>
          </button>
        ))}
      </div>

      <div className={styles.grid} role="list" aria-label="Möbel">
        {results.length === 0 && (
          <p className={styles.empty} data-testid="library-empty">
            Keine Möbel gefunden für „{query.trim()}“.
          </p>
        )}
        {results.map((type) => {
          const { label, defaultSize: s } = FURNITURE_CATALOG[type];
          const thumbnail = thumbnails?.get(type);
          return (
            <button
              key={type}
              type="button"
              role="listitem"
              className={styles.card}
              onClick={() => onAdd(type)}
              data-testid={`library-item-${type}`}
              title={`${label} hinzufügen`}
            >
              <span className={styles.preview}>
                {thumbnail ? <img src={thumbnail} alt="" data-testid="library-thumbnail" /> : <FurnitureIcon type={type} size={48} />}
              </span>
              <span className={styles.info}>
                <span className={styles.name}>{label}</span>
                <span className={styles.meta} style={{ display: 'block' }}>
                  {formatMeters(s.width)} × {formatMeters(s.depth)} × {formatMeters(s.height)} m
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
