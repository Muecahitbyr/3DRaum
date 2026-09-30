import { FURNITURE_CATALOG, FURNITURE_CATEGORIES, type FurnitureCategoryId } from '../../config/furniture';
import type { FurnitureType } from '../../types/furniture';

export type LibraryCategory = FurnitureCategoryId | 'all';

/** Vergleichsform: klein, ohne Akzente/Umlaute („Büro“ → „buro“), ß → ss. */
export function normalizeSearch(text: string): string {
  return text.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/** Typen einer Kategorie (bei „Alle“ jeder Typ nur einmal, in Kategorie-Reihenfolge). */
export function typesOf(category: LibraryCategory): FurnitureType[] {
  const lists = category === 'all' ? FURNITURE_CATEGORIES : FURNITURE_CATEGORIES.filter((c) => c.id === category);
  return [...new Set(lists.flatMap((c) => c.types))];
}

/** Suchtext eines Typs: Bezeichnung, Synonyme und Kategorienamen. */
function searchText(type: FurnitureType): string {
  const { label, keywords } = FURNITURE_CATALOG[type];
  const categories = FURNITURE_CATEGORIES.filter((c) => c.types.includes(type)).map((c) => c.label);
  return normalizeSearch([label, ...keywords, ...categories].join(' '));
}

/** Möbel der Kategorie, gefiltert nach allen Suchwörtern (jedes Wort muss vorkommen). */
export function filterLibrary(category: LibraryCategory, query: string): FurnitureType[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return typesOf(category).filter((type) => {
    const text = searchText(type);
    return words.every((word) => text.includes(word));
  });
}
