import { DEFAULT_PLAN, nextVariantName, PROJECT_FORMAT_VERSION, serializeProject } from '../../src/projects/format.ts';
import {
  clearRecovery,
  createRecoveryDraft,
  hasRecovery,
  parseRecovery,
  readRecovery,
  recoveryIsRelevant,
  serializeRecovery,
  writeRecovery,
} from '../../src/projects/recovery.ts';
import { loadProject, saveProject } from '../../src/projects/storage.ts';
import { createSuite } from './harness.ts';

/** Autosave/Recovery: Serialisierung, Gültigkeit, Zeitvergleich, Projektzuordnung, Speicherfehler; „Speichern unter“. */
const { check, done } = createSuite();

// localStorage für Node nachbilden (inkl. „Speicher voll“ auf Wunsch).
const data = new Map<string, string>();
let full = false;
const fakeStorage = {
  get length() { return data.size; },
  key: (i: number) => [...data.keys()][i] ?? null,
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (full) throw Object.assign(new DOMException('voll', 'QuotaExceededError'));
    data.set(k, v);
  },
  removeItem: (k: string) => void data.delete(k),
  clear: () => data.clear(),
};
(globalThis as { window?: unknown }).window = { localStorage: fakeStorage };

const changed = { ...DEFAULT_PLAN, furniture: [{ id: 'furniture-1', type: 'sofa', name: 'Sofa', width: 2, depth: 0.9, height: 0.85, position: { x: 2.5, z: 2 }, rotationDeg: 0 }] } as typeof DEFAULT_PLAN;

// ---------- Serialisierung und Prüfung
const draft = createRecoveryDraft(changed, 'Wohnzimmer', null, new Date('2026-05-01T10:00:00.000Z'));
const parsed = parseRecovery(serializeRecovery(draft));
check('Entwurf: Serialisieren → Lesen ergibt denselben Plan, Namen und Zeitpunkt', parsed.ok && parsed.draft.project.name === 'Wohnzimmer' && parsed.draft.savedAt === '2026-05-01T10:00:00.000Z' && JSON.stringify(parsed.draft.project.plan.furniture) === JSON.stringify(changed.furniture), parsed);
check('Entwurf: aktuelles Projektformat, ohne Basis (nie gespeichert)', parsed.ok && parsed.draft.project.version === PROJECT_FORMAT_VERSION && parsed.draft.base === null);
check('Entwurf enthält keinen Ursprung (wie Projektdateien)', !serializeRecovery(draft).includes('"origin"'));
check('Leer: kein Entwurf', !parseRecovery(null).ok && (parseRecovery(null) as { reason: string }).reason === 'empty');
check('Kein JSON → beschädigt', (parseRecovery('{kaputt') as { reason: string }).reason === 'corrupt');
check('Fremdes Format → beschädigt', (parseRecovery(JSON.stringify({ format: 'anders' })) as { reason: string }).reason === 'corrupt');
check('Ungültiger Zeitpunkt → beschädigt', (parseRecovery(serializeRecovery({ ...draft, savedAt: 'gestern' })) as { reason: string }).reason === 'corrupt');
check('Ungültige Basis → beschädigt', (parseRecovery(serializeRecovery({ ...draft, base: { id: 'x', updatedAt: 'nie' } })) as { reason: string }).reason === 'corrupt');
const raw = JSON.parse(serializeRecovery(draft));
raw.project.plan.room.walls = [];
check('Unlesbarer Grundriss im Entwurf → beschädigt', (parseRecovery(JSON.stringify(raw)) as { reason: string }).reason === 'corrupt');
const future = JSON.parse(serializeRecovery(draft));
future.project.version = PROJECT_FORMAT_VERSION + 1;
check('Entwurf aus einer neueren Version → „future“', (parseRecovery(JSON.stringify(future)) as { reason: string }).reason === 'future');
const old = JSON.parse(serializeRecovery(draft));
old.project.version = 5;
const oldParsed = parseRecovery(JSON.stringify(old));
check('Entwurf aus älterer Projektversion (5) → migriert und lesbar', oldParsed.ok && oldParsed.draft.project.version === PROJECT_FORMAT_VERSION && oldParsed.draft.project.plan.furniture.length === 1);

// ---------- Relevanz: Zeitvergleich und Projektzuordnung
check('Nie gespeichert, Plan geändert → anbieten', recoveryIsRelevant(draft, null));
check('Nie gespeichert, leerer Standardplan → nicht anbieten', !recoveryIsRelevant(createRecoveryDraft(DEFAULT_PLAN, 'X', null), null));
const savedFile = { format: 'raumplaner-project', version: PROJECT_FORMAT_VERSION, id: 'p1', name: 'Wohnzimmer', createdAt: '2026-05-01T09:00:00.000Z', updatedAt: '2026-05-01T09:30:00.000Z', plan: DEFAULT_PLAN } as const;
const basedDraft = createRecoveryDraft(changed, 'Wohnzimmer', { id: 'p1', updatedAt: savedFile.updatedAt }, new Date('2026-05-01T10:00:00.000Z'));
check('Gespeichertes Projekt, Entwurf neuer und anders → anbieten', recoveryIsRelevant(basedDraft, savedFile as never));
check('Projekt später gespeichert als der Entwurf (z. B. anderer Tab) → nicht anbieten', !recoveryIsRelevant(basedDraft, { ...savedFile, updatedAt: '2026-05-01T11:00:00.000Z' } as never));
check('Entwurf gleich dem gespeicherten Stand → nicht anbieten', !recoveryIsRelevant(createRecoveryDraft(DEFAULT_PLAN, 'Wohnzimmer', { id: 'p1', updatedAt: savedFile.updatedAt }, new Date('2026-05-01T10:00:00.000Z')), savedFile as never));
check('Basisprojekt gelöscht, Entwurf geändert → anbieten (als ungespeichertes Projekt)', recoveryIsRelevant(basedDraft, null));

// ---------- Speicher: schreiben, lesen, verwerfen, Fehler
check('Speicher leer: kein Entwurf', !hasRecovery() && !readRecovery().ok);
check('Schreiben: erfolgreich', writeRecovery(basedDraft).ok && hasRecovery());
const back = readRecovery();
check('Lesen: Entwurf mit Basisprojekt p1', back.ok && back.draft.base?.id === 'p1' && back.draft.project.name === 'Wohnzimmer');
check('Entwurf erscheint nicht als Projekt (eigener Schlüssel)', [...data.keys()].every((k) => !k.startsWith('raumplaner:project:')));
clearRecovery();
check('Verwerfen: entfernt', !hasRecovery());
full = true;
const failed = writeRecovery(basedDraft);
check('Speicher voll: verständlicher Fehler statt Absturz', !failed.ok && failed.error.includes('voll'), failed);
full = false;
(globalThis as { window?: unknown }).window = { get localStorage() { throw new Error('gesperrt'); } };
check('Speicher gesperrt: Lesen/Schreiben/Verwerfen ohne Absturz', !readRecovery().ok && !writeRecovery(basedDraft).ok && (clearRecovery(), true) && !hasRecovery());
(globalThis as { window?: unknown }).window = { localStorage: fakeStorage };

// ---------- „Speichern unter“
check('Namensvorschlag: „Wohnzimmer“ → „Wohnzimmer Variante 2“', nextVariantName('Wohnzimmer') === 'Wohnzimmer Variante 2');
check('Namensvorschlag: „… Variante 2“ → „… Variante 3“', nextVariantName('Wohnzimmer Variante 2') === 'Wohnzimmer Variante 3');
check('Namensvorschlag: höchstens 60 Zeichen', nextVariantName('x'.repeat(60)).length === 60);
const original = saveProject({ name: 'Wohnzimmer', plan: DEFAULT_PLAN });
const copy = saveProject({ name: 'Wohnzimmer Variante 2', plan: changed });
check('Speichern unter: neue Projekt-ID, Original unverändert', original.ok && copy.ok && copy.value.id !== original.value.id && (() => {
  const o = loadProject(original.value.id);
  return o.ok && o.project.plan.furniture.length === 0 && o.project.name === 'Wohnzimmer';
})());
check('Speichern unter: eigene Zeitstempel, keine gemeinsamen Daten', copy.ok && original.ok && copy.value.createdAt >= original.value.createdAt && serializeProject(copy.value) !== serializeProject(original.value));

done();
