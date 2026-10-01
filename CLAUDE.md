# 3DRaum – 3D-Raumplaner (Übergabedokument)

Browserbasierter Raumplaner: Grundriss (Rechteck, L-Form, freie Polygone) in 2D zeichnen, Türen/Fenster/
Durchgänge/Raumobjekte an Wände setzen, Möbel und Lampen platzieren, Materialien und Licht gestalten, in 3D
bearbeiten bzw. realistisch ansehen, lokal speichern und als PNG/PDF/Projektdatei exportieren.

- **Stand:** V1.0.0 + V1.1 Block A („Maße und Grundriss“) + Block B („Möbel realistisch platzieren“).
  Alle Funktionen fertig und getestet: **1793/1793 Tests in 35 Suiten** grün.
- **Repository:** https://github.com/Muecahitbyr/3DRaum.git, Branch `main`.
- Den aktuellen Stand liefert `git log` (V1.1 Block A: Raumfläche/Umfang, Öffnungsmaßketten,
  Lagemaße mit Direkteingabe, Durchgang, L-Form-Hauptmaße, Format 6, Unit-Tests; Block B: semantische
  Kollisionszonen, 3D-Ziehen/-Drehen, gemeinsames Drehen von Auswahl und Gruppe, Gruppennamen,
  Platzsuche neuer Möbel, Tischlampe auf Trägern).
- **Sprache:** Oberfläche, Code-Kommentare, Commits und Berichte an den Nutzer auf **Deutsch**.
  Berichte strukturiert und knapp.
- **Ziel jetzt:** Stabilität und Qualität. Keine Features auf Verdacht und keine Umbauten ohne Anlass.
  Funktionierenden Code nicht grundlos refactoren.

## Git-Regeln (verbindlich, nach jeder abgeschlossenen Änderung)

1. Vollständige Tests, TypeScript und Production-Build ausführen: `npm test` erledigt alle drei.
2. Nur committen/pushen, wenn **alles grün** ist. Bei roten Tests erst beheben.
   Tests nie entfernen oder abschwächen, nur damit sie grün werden.
3. Vorher `git status` prüfen.
4. **Niemals committen:** `dist/`, `node_modules/`, `e2e/.output/`, `.claude/` sowie temporäre
   oder Debug-Dateien (z. B. `e2e/.*.mjs`, Mess-Skripte; diese gehören in den Scratchpad).
5. Beschreibende **deutsche** Commit-Namen; Attributionszeile gemäß System-Hinweis.
6. Auf `main` pushen (`git push origin main`).
7. Danach prüfen: `git rev-parse HEAD` == `git ls-remote origin main`.
8. Abschlussbericht immer mit Testergebnis (x/y Tests, Suiten) und Commit-Hash.

## Tech-Stack

- React 19, TypeScript 7 (strict, `noUnusedLocals/Parameters`) und Vite 8 (rolldown).
- Three.js r186, @react-three/fiber 9, @react-three/drei 10 (OrbitControls, Line, Edges, Html).
- Keine weiteren Laufzeit-Abhängigkeiten. Das ist bewusst so: PDF-Writer, Bildexport und Texturen
  sind selbst geschrieben. **Keine unnötigen Libraries hinzufügen.**
- Styles: CSS Modules plus `src/styles/global.css` mit Design-Tokens (`--color-*`, `--radius-*`, `--shadow-*`).
- Tests: eigener Node-Runner mit `playwright-core` und vorhandenem Chromium; kein Jest/Vitest.
  Unit-Tests laufen als TypeScript direkt in Node (`--experimental-strip-types` + Resolve-Hook
  `e2e/unit/ts-resolve.mjs` für Importe ohne Dateiendung) – ohne Browser, in Sekunden.
- Skripte: `npm run dev`, `npm run build` (`tsc -b && vite build`), `npm run typecheck`, `npm test`.

## Verzeichnisstruktur

```
src/
  App.tsx                 Komposition: Layout, Sidebar-Panels, Canvas, Dialoge, Export-Ablauf
  main.tsx                Einstieg, globale ErrorBoundary (Fallback „app-error“)
  types/                  Datenmodell: room, opening, fixture, furniture, design, view
  config/                 Kataloge und Konstanten: furniture (19 Typen), furnitureGeometry (Bauteilmaße für
                          Modelle und Kollisionszonen), fixtures, openings, design, room, scene, collision
  state/plannerState.ts   Planungs-Reducer (alle Aktionen, Auswahl, Normalisierung)
  state/history.ts        Undo/Redo-Wrapper mit Transaktionen
  hooks/                  usePlanner, useProjectSession, useCollisionReport,
                          useEditingShortcuts, useHistoryShortcuts, useMediaQuery
  collision/              Collider, semantische Möbelzonen (furnitureZones), Regeln, Erkennung (Broad Phase), Meldungstexte
  projects/format.ts      Projektformat v5: Parsen, Validieren, Migrationen 1→5
  projects/storage.ts     localStorage (ein Schlüssel je Projekt)
  export/                 planImage (2D-PNG), pdf (Writer), report (Planungsbericht), files (Download/Import)
  utils/room/             model (RoomModel), plan (Bearbeitung/Validierung, L-Form), containment, dimensions, remap, snap,
                          measurements (Fläche/Umfang, Lagemaße, Maßkette), dimensionLayout (Beschriftung aller Wandmaße)
  utils/                  polygon, camera, previewCamera, furniture*, furniturePlacement (Platzsuche),
                          furnitureRotation (gemeinsames Drehen), furnitureSupport (Tischlampe auf Trägern),
                          openings, fixtures, wallGeometry, units, webgl …
  components/
    layout/               PlannerLayout (Drawer), Workspace (Toolbars), MenuButton, Fallback, HistoryControls
    sidebar/              Panels: Raum, Öffnungen, Raumobjekte, Möbel, Eigenschaften, Mehrfachauswahl, Gestaltung
    projects/             ProjectBar, ProjectManager, ProjectsDialog, Save-/ConfirmDialog
    export/ExportDialog   Export-Optionen mit Status/Fehlermeldung
    library/              Möbelbibliothek mit Vorschaubildern (eigener Canvas, frameloop 'never')
    ui/                   Button, Dialog (Fokusfalle), SegmentedControl, Text-/Maß-/Auswahlfelder
    scene/                PlannerCanvas, TopView (2D), PerspectiveView (3D), Licht, Lampen, Capture,
                          annotations/ (Wandmaß, Öffnungsmaßkette, Lagemaße der Auswahl),
                          room/ (Wände, Boden, Decke, Öffnungen inkl. Durchgang, Raumobjekte, Wand-Fade),
                          furniture/ (Modelle, Planssymbole, Abstandsmaße, Drehgriff 2D, Drehring 3D,
                          Grundfläche, gemeinsamer Drehgriff),
                          interaction/ (Drag-Provider, Grundriss-Editor, Auswahlrahmen)
e2e/  run.mjs (Runner), suites/*.mjs, lib/ (scenes, planner, images),
      unit/*.test.ts (reine Logik; harness.ts, ts-resolve*.mjs)
```

## Einheiten und Koordinaten

- Alle Längen in **Metern** (1 Three-Einheit = 1 m). In der UI erscheinen sie als „x,xx m“
  bzw. cm (Abstände, Möbelmaße im PDF); dafür sind `utils/units.ts` (`formatNumber`, `parseMeters`) zuständig.
- Achsen: x = Breite, z = Länge (im Grundriss nach unten), y = Höhe; der Boden liegt bei y = 0.
- **Grundrisskoordinaten:** gemessen ab der linken/oberen Kante des Innenumrisses.
  **Welt = Grundriss − `room.origin`.**
  Bei der Normalisierung (`normalizeRoomPlan`) bleibt die Hülle des Umrisses bei 0/0, und `origin`
  wird mitverschoben, sodass die Welt fest bleibt.
- Möbelpositionen werden in Grundrisskoordinaten gespeichert (Mittelpunkt);
  `furnitureToWorld()` rechnet in die Welt um.

## Raumgeometrie und freie Raumformen

- `RoomPlan { shape: 'rectangle'|'l-shape'|'free', walls: RoomWall[], height, origin }`.
- `RoomWall { id, start, end, height, thickness }`: Strecke auf der **Innenfläche**. Die Wände bilden
  einen geschlossenen Umriss und laufen vom Rauminneren aus gesehen von links nach rechts; die Stärke
  liegt außen. Ins Rauminnere zeigt `inward = (−d.z, d.x)`.
- Rechteck-Wand-IDs sind `north/east/south/west`; Polygone haben `wall-1 …` (`nextWallId`).
  In der Szene heißen die Objekte `wall-${id}` (Gruppe) und `wall-${id}-body` (Mesh, `userData.wallId`).
- `roomModelOf(plan)` liefert das gecachte (WeakMap) `RoomModel`:
  - `walls: WallSegment[]` mit Welt-/Plan-Punkten, `axis`, `inward`, Gehrung `outerStart/End`,
    `center`, `rotationY`, `readingReversed`, `horizontal`, `label`
  - `polygon`/`worldPolygon`, `bounds`, `outerPolygon/outerBounds`, `dimensions`, `isRectangle`, `wallById`
- **Fläche und Umfang** (`roomMeasurements`) kommen immer aus dem Innenumriss (Schnürsenkelformel bzw.
  Summe der lichten Wandlängen), nie aus der Hülle. Anzeige im Bereich „Raum“, im PNG-Fuß und im PDF.
- **L-Form:** `LShapeDimensions { width, length, cutWidth, cutLength }` (Ausschnitt rechts unten).
  Formwechsel übernimmt die aktuellen Maße (`lShapeFromSize`: Ausschnitt ≈ 40 %, auf 0,5 m gerundet; aus 6 × 5
  wird die alte Vorlage 2,5 × 2). Neue Projekte nutzen die Vorlage 6 × 5. Solange die L-Form unverändert ist
  (`lShapeDimensionsOf` ≠ null), zeigt der Bereich „Raum“ die vier Hauptmaße (Aktion `setLShapeDimensions`,
  `resizeLShape` behält Wand-IDs, Stärken und Weltmitte). Nach freier Bearbeitung im Editor entfallen die Felder.
- `utils/room/plan.ts`: Vorlagen (`createRectangleRoom`, `createLShapeRoom`, `createFreeRoom`) sowie
  `validateRoomPlan`, `moveCorner`, `setWallLength/Thickness`, `splitWall`, `removeCorner/removeWall`,
  `resizeRectangle`, `setRoomHeight`. Alle Bearbeitungen liefern `{ok, plan}` oder `{ok:false, error}`,
  ungültige Geometrie wird abgelehnt (Selbstüberschneidung, zu kurze Wände usw.).
- Raumgrenzen: Breite/Länge 1–30 m, Höhe 1,8–6 m, Wandstärke 0,05–0,5 m (Standard 0,15).
- **Wandgebundene Elemente** (Öffnungen, Raumobjekte) referenzieren `wall` (ID) und speichern `offset`
  ab Wandanfang. Die UI zeigt die Leserichtung („Abstand von links/oben“) über `readingOffset` an.
  Ändert sich der Raum, ordnet `remapWallItem` die Elemente neu zu.
- **Grundriss-Editor** (`RoomEditor`, nur 2D, Button „Grundriss bearbeiten“): Ecken ziehen mit Einrasten
  (`snapCorner`), Wände wählen und teilen, Ecken und Wände löschen.

## 2D-/3D-System und Ansichten

- `ViewMode '2d'|'3d'`. In 3D gibt es zusätzlich **Bearbeiten/Vorschau**.
  Die Decke ist in der Bearbeitung optional und in der Vorschau immer sichtbar.
- **2D** (`TopView`): orthografische Draufsicht, Norden oben. OrbitControls ohne Drehen,
  `zoomToCursor`, Touch: ein Finger verschiebt, zwei Finger zoomen.
  - Eingepasst wird bei Aktivierung, wenn sich `fitKey` ändert, sowie bei neuen Rechteckmaßen
    (`computePlanFitZoom`; der Rand passt sich an kleine Bildschirme an).
  - Planssymbole (Möbel, Türbögen, Fenster, Heizkörper), Raummaßlinien und Abstandsmaße
    werden zoomunabhängig in Pixeln skaliert.
  - **Maßsystem (Hierarchie):** außerhalb der Wand von innen nach außen: Öffnungsmaßkette (22 px, Zahlen in m
    ohne Einheit, ohne Rahmen) → zweite Spur für kurze Abschnitte (40 px) → Gesamtmaß der Wand (62 px; ohne
    Öffnungen wie bisher 30 px). Im Raum, blau und anklickbar: Auswahlmaße (Möbel-Abstände, Lagemaße der
    ausgewählten Öffnung in cm). Wände mit Öffnungen vergrößern beim Einpassen den Rand um 32 px.
  - **Beschriftung ohne Überdeckung:** `layoutRoomDimensions` platziert alle Wandmaße gemeinsam (Live und PNG):
    Gesamtmaße zuerst (weichen entlang ihrer Linie aus), Kettenmaße danach (zweite Spur oder entfallen).
    Etiketten werden als gedrehte Rechtecke geprüft (Trennachsen-Test), Text folgt der Wandrichtung.
- **3D Bearbeiten** (`PerspectiveView`): FOV 45. Die Kamera wird einmal pro `fitToken` eingepasst
  (Start oder Projekt öffnen) und bleibt sonst stehen. Seit Block B eine echte Bearbeitungsansicht:
  - Klick/Antippen wählt aus; ein **ausgewähltes** Möbel lässt sich auf der Bodenebene ziehen (gleiche Logik
    wie 2D: `FurnitureInteractionProvider`, `computeFurnitureMove`, Raumkontur, Einrasten, Live-Kollisionen).
    Ziehen über ein nicht ausgewähltes Möbel oder freie Fläche bleibt Kamera.
  - Die OrbitControls sind `makeDefault` und werden von der Zeiger-Sitzung synchron pausiert
    (`usePlanPointerSession`: Meter/Pixel auch perspektivisch, Touch-Startschwelle 8 px, zweiter Finger
    bricht ab und überlässt die Geste der Kamera, Esc stellt den Ausgangszustand her).
  - Hilfselemente nur in „Bearbeiten“: Grundfläche (`furniture-footprint`), Drehring (`furniture-rotation-ring`,
    Radius wächst per `useFrame(-1)` bei kleinem Maßstab, Griff nie über dem Möbel) und DOM-Griff.
    Nicht in Vorschau und Export (`SceneCapture`-Hilfsnamen). Sichtbare Wände blockieren das Greifen dahinter.
  - **Wand-Fade** (`useWallFade`): Wände zwischen Kamera und Raum werden pro Frame ohne React-Render
    ausgeblendet und zeitlich geglättet. Nur der Wechsel der Klickbarkeit löst ein Rendern aus.
  - Ausgeblendete Wände fangen keine Klicks ab.
- **3D Vorschau:** Kamera auf Augenhöhe 1,6 m. Die Startposition meidet Hindernisse wie Türschwenk und
  hohe Möbel (`previewPose`) und bleibt im Raum (`keepInside`).
  - Sichtfeld 60°, im Hochformat breiter (`previewFov`: mindestens ~62° horizontal, höchstens 90° vertikal).
  - Keine Wandkanten, kein Fade, keine Kollisionsrahmen. Die Auswahl-Umrandung bleibt.
  - Beim Verlassen wird die gespeicherte Bearbeitungskamera wiederhergestellt.
- **Dev-Brücke:** Nur im Dev-Modus ist der R3F-Store unter `window.__PLANNER_R3F__()` erreichbar.
  Die E2E-Tests sind darauf angewiesen.

## Möbel, Lampen, Raumobjekte

- **Katalog** in `config/furniture.ts`, prozedurale Modelle ohne Asset-Dateien. 19 Typen:
  - sofa, armchair, coffee-table, tv-board, shelf, bed, double-bed, wardrobe, dresser, nightstand,
    table, chair, sideboard, desk, office-chair
  - Lampen: ceiling-light, pendant-light, floor-lamp, table-lamp
- Kategorien `living|bedroom|dining|office|lamps`. Die Bibliothek bietet Suche und Filter (`libraryFilter`).
- **`FurnitureItem`:** `{ id, type, name, width, depth, height, position (Plan), rotationDeg, colors?,
  light?, elevation? }`.
  - Farbslots `main|wood|fabric` laut Katalog (`colorSlots`).
  - `normalizeFurniture` hält Maße, Rotation und Position gültig: Die Grundfläche muss im Umriss liegen.
    Namen werden beim Tippen nicht am Ende gekürzt, erst beim Einlesen.
- **Lampen:** `light { on, intensity 0,1–2, temperature 2200–6500 K }`, Tischlampe mit `elevation`,
  Decken-/Pendelleuchten mit `mount: 'ceiling'`.
  - **Tischlampe auf Trägern** (`furnitureSupport`): Liegt ihr Mittelpunkt über einem Möbel mit `surface`
    (Nachttisch, Schreibtisch, Kommode, Sideboard, Esstisch, Couchtisch, TV-Board), steht sie auf dessen
    Oberkante (`furnitureBaseY(…, supportY)`; Darstellung, Licht, Kollision, Abstände). Gespeichert bleibt
    die eigene `elevation` – ohne Träger gilt sie wieder. Keine Formatänderung.
  - Echtes Licht über einen festen Pool von **max. 8 PointLights ohne Schatten** (`LampLights`,
    Größen 0/2/4/8 → keine Shader-Neukompilierung beim Schalten).
  - Lichtfarbe: Kelvin-Wert zu 50 % mit Weiß gemischt (`lampLightColor`).
- **Bearbeiten:**
  - Mehrfachauswahl per Shift-Klick bzw. Shift-Ziehen (Rahmen), Gruppen mit optionalem Namen
    (`renameGroup`, Feld „Gruppenname“, max. 40 Zeichen; leer → „Gruppe N“; bereits Teil von Format 6).
  - **Gemeinsames Drehen** (Auswahl, Gruppe): Griff über dem Auswahlrahmen (2D) bzw. Ring (3D) und
    Schaltflächen ±90°. `rotateFormation` dreht um die Auswahlmitte (Positionen und Eigendrehung),
    hält alles in der Raumkontur (Formation verschieben) oder lehnt den Winkel ab. Eine Geste = ein Schritt.
  - **Neue Möbel** (`findFreePosition`): deterministische Platzsuche auf 25-cm-Raster um die Raummitte
    (max. 600 Plätze), erster Platz ohne Kollision (Möbel, Wände, Türschwenk, Fenster, Heizkörper);
    sonst Raummitte mit Warnung.
  - Duplizieren Strg/⌘+D, Kopieren/Einfügen (Versatz 0,2 m), Entf/Backspace löscht.
  - Pfeiltasten verschieben, Ausrichten an Wänden bzw. Raummitte (`AlignmentTools`).
  - Drehgriff im Grundriss, Einrasten an Wänden und Möbeln (`computeFurnitureMove`).
  - Tastenkürzel greifen nicht in Eingabefeldern und pausieren, solange ein Dialog offen ist.
- **Raumobjekte** (`RoomFixture`: radiator, socket, switch): wandgebunden wie Öffnungen, mit `depth`
  und `elevation`.
- **Öffnungen:**
  - Tür: `hinge left|right`, `swing inward|outward`.
  - Fenster: `sillHeight`, `sashes 1|2`.
  - **Durchgang** (`type: 'passage'`): nur Wand, Position, Breite (0,5–5 m), Höhe; echte Wandöffnung ohne
    Türblatt, Anschlag und Schwenkbereich. 2D: Laibungen + gestrichelter Sturz; 3D: offen, ausgewählt umrandet.
    Kollision nur als Wandspanne (`opening-overlap`).
  - **Lagemaße:** Sidebar „Abstand von links/rechts“ bzw. „oben/unten“ (`readingDistances`,
    `offsetForReadingDistance`), im Grundriss blaue Maße zu beiden Wandecken mit cm-Eingabe. Intern bleibt
    es bei `offset` ab Wandanfang; eine Eingabe ist ein Verlaufsschritt („Tür verschieben“).
  - Wandaussparungen: in 3D in echter Größe, im Grundriss über die volle Höhe.

## Kollisionen und Abstände

- `computeCollisionReport` (über `useCollisionReport`) prüft Collider mit Höhenbereichen:
  Möbel, Wände, Öffnungen inklusive Türschwenk (Viertelkreis-Polygon) und Fensterzone (0,4 m), Raumobjekte.
- **Semantisches Möbelmodell** (`collision/furnitureZones.ts`, Katalog `collision`): Möbel bestehen aus festen
  Zonen; kollidiert wird nur, wenn sich Zonen im Grundriss **und** in der Höhe überschneiden.
  | Form | Zonen | Folge |
  |---|---|---|
  | `box` (Standard, auch Couchtisch) | Korpus | fester Körper |
  | `table` | Platte, 4 Beine | darunter frei bis zur Plattenunterkante |
  | `desk` | Platte, Wange, Container, Sichtblende | Beinraum zwischen Wange und Container |
  | `chair` | Unterteil bis Sitzhöhe, Lehne | Sitz passt unter die Platte, die Lehne nicht |
  | `office-chair` | Unterteil bis Armlehnen-Oberkante, Lehne | passt, wenn die Armlehnen passen |
  Maße aus `config/furnitureGeometry.ts` (dieselben Formeln wie die 3D-Modelle). Zusätzlich eine Hülle
  (`furnitureEnvelope`) nur für die Heizkörper-Regel. Broad Phase (Sortieren/Fegen), ein Treffer je
  Möbelpaar (auch bei symmetrischen Regeln), Collider je Möbel zwischengespeichert (WeakMap).
  Abstandsmaße unterscheiden geometrischen Abstand, erlaubte Überdeckung (übergangen) und echte Kollision.
- **Regeln** (`collision/rules.ts`):

  | Regel | Schwere |
  |---|---|
  | `furniture-overlap` | error |
  | `door-swing` | error |
  | `window-blocked` | warning |
  | `radiator-covered` (ganze Hülle) | error |
  | `radiator-door-swing` | error |
  | `furniture-wall` | error |
  | `opening-overlap` | error |

  Berührung (Toleranz 0,1 mm) zählt nicht als Kollision.
- Kollisionen werden **gemeldet, nicht verhindert**: rote bzw. bernsteinfarbene Umrandung in 3D und im
  Grundriss, Texte in der Sidebar (`describeCollisions`), Markierung in der Liste. In der Vorschau keine Rahmen.
- **Containment:** Minkowski-Hüllen (`utils/room/containment.ts`: `fitsInRoom`, `nearestPositionInRoom`,
  `maxFormationStep`) halten Möbel und Formationen im Umriss.
- **Abstandsmaße** (2D, genau ein Möbel ausgewählt): `computeClearances` misst in vier Richtungen bis zu
  Wand, Möbel oder Heizkörper.
  - Das Etikett ist klickbar und nimmt einen exakten Abstand in cm entgegen.
  - Bei kurzen Abständen sitzt das Etikett **neben dem Möbel**, nie darüber, sonst würde es
    Finger/Maus beim Greifen abfangen.

## Undo/Redo

- `historyReducer` umhüllt `plannerReducer`. Gespeichert wird nur das **`PlanDocument`**
  (`room, openings, furniture, fixtures, groups, design`); Auswahl, Kamera und Ansicht nicht. Limit 100.
- **Transaktionen:**
  - `gesture` (Ziehen/Drehen) ergibt einen Schritt; Undo ist währenddessen gesperrt.
  - `edit` (Sidebar-Feld fokussiert, `begin` bei Fokus und `end` bei Blur über `onFocusCapture/onBlurCapture`)
    ergibt einen Schritt; Undo schließt die Transaktion zuerst ab.
- Reine Auswahländerungen erzeugen keinen Schritt (`sameDocument`, Wertvergleich).
  „Gespeichert/ungespeichert“ wird ebenfalls per Wertvergleich mit dem zuletzt gespeicherten Plan bestimmt.
- Jeder Schritt hat ein deutsches Label (`describeAction`), sichtbar im Undo-Tooltip, z. B. „Möbel verschieben“.
- `history/reset` beim Öffnen oder Anlegen eines Projekts. IDs werden nie wiederverwendet (Zähler `next*Number`).

## Materialien, Beleuchtung, Decke

- **12 Böden** (`FLOOR_MATERIALS`): wood-light, wood-dark, tiles, concrete, carpet, oak, parquet-dark,
  herringbone, tiles-large-light/-dark, carpet-light/-dark. Die ersten fünf stammen aus Altprojekten und bleiben gültig.
- Texturen werden **prozedural und synchron aus Canvas** erzeugt und pro Material gecacht
  (`materials/floorTextures.ts`, `wallTextures.ts`). Es gibt kein asynchrones Laden.
- Wände: Farbe je Wand-ID (`wallColors`) und Oberfläche `matte|plaster|concrete` (`wallFinishes`),
  beides auch für alle Wände gleichzeitig. Deckenfarbe `ceilingColor`.
- **Licht:**
  - `lighting { preset: daylight|warm|neutral|cool, brightness 0,4–1,6 }`: Hemisphere-Licht plus ein
    Directional Light mit Schatten (Schattenkamera eng um den Raum).
  - `LEGACY_LIGHTING` (neutral, 1) entspricht exakt der alten festen Beleuchtung.
  - Kontaktschatten unter Möbeln (`ContactShadow`, eigene Ebene).

## Projektformat (Version 6), Speicherung, Migration

- Datei/JSON: `{ format: 'raumplaner-project', version: 6, id, name, createdAt, updatedAt, plan }`.
  `plan` enthält `{ room: {shape, height, walls}, openings, furniture, fixtures, groups, design }`.
  `origin` wird nicht gespeichert; beim Laden wird normalisiert.
- `parseProject` validiert alles und gibt verständliche deutsche Fehler aus: kein JSON, fremdes Format,
  neuere Version, ungültiger Grundriss.
  Defekte Einzelelemente werden übersprungen, mit Warnung „n Elemente konnten nicht gelesen werden“.
- **Migrationen** (`MIGRATIONS` in `projects/format.ts`):
  - 1→2: Standardgestaltung ergänzen.
  - 2→3: Türanschlag wie bisher (Nord/Ost links, Süd/West rechts, nach innen), Fenster einflügelig,
    `fixtures`/`groups` leer.
  - 3→4: `dimensions` werden zu vier Wänden `north/east/south/west`; Süd-/West-Offsets auf Wandanfang
    umgerechnet (`Länge − offset − Breite`).
  - 4→5: `wallFinishes {}`, Decke weiß, Licht `LEGACY_LIGHTING`.
  - 5→6: keine Datenänderung (neue Öffnungsart Durchgang). V1.1-Projekte sind nicht rückwärtskompatibel
    (V1.0 lehnt Version 6 als „neuere Version“ ab).
  - Alle Versionen ergeben geometrisch identische Szenen; die Suite „migrations“ prüft das.
    Beim Speichern wird auf Version 6 gehoben.
- **Neue Formatversion nötig?** Dann `PROJECT_FORMAT_VERSION` erhöhen, Migration ergänzen und
  Tests in `migrations.mjs` erweitern.
- **localStorage:** Schlüssel `raumplaner:project:<id>`, je Projekt einzeln. Beschädigte Einträge
  erscheinen markiert und sind nur löschbar.
  - Fehler „Speicher voll“ und „Speicher nicht verfügbar“ werden verständlich gemeldet.
  - `beforeunload` warnt bei ungespeicherten Änderungen.
- Start: immer ein neues Standardprojekt (Rechteck 5 × 4 × 2,5 m, „Unbenanntes Projekt“).
  Das erste Speichern fragt nach dem Namen; beim Ersetzen ungespeicherter Änderungen gibt es eine Rückfrage.

## Export und Import (Dialog „Export“)

- **Grundriss-PNG:** `renderPlanImage` zeichnet direkt aus den Plandaten auf ein 2D-Canvas, ohne Screenshot
  und damit garantiert ohne UI-Hilfselemente.
  - Längste Seite max. 3200 px, weißer Hintergrund.
  - Inhalt: Wände, Türbögen, Fenster, Durchgänge, Raumobjekte, beschriftete Möbel (Lampen über Möbeln werden
    darunter beschriftet), Wandmaße, Öffnungsmaßketten; Fußzeile unter dem Plan mit Maßstab und
    Grundfläche/Umfang (schmale Pläne: zweite Zeile).
- **3D-PNG:** `SceneCapture` rendert einmal mit erhöhter Pixeldichte und kopiert sofort, ohne
  `preserveDrawingBuffer`. Hilfselemente (Umrandungen, Einrastlinien, Auswahlrahmen) werden dabei ausgeblendet.
  - Ist die Vorschau nicht offen, schaltet `capturePreview()` kurz in die Vorschau und stellt Ansicht und
    Kamera danach wieder her.
- **PDF:** eigener schlanker Writer (`export/pdf.ts`: Helvetica/WinAnsi, JPEG-Bilder, xref).
  `buildReport` erzeugt Kopf, Datum, Raumdaten (inkl. Grundfläche, Umfang) und Grundriss, danach
  3D-Vorschau, Möbeltabelle (Maße in cm, Position) und die Tabelle „Türen, Fenster und Durchgänge“
  (Wand, Lage „0,80 m von links (rechts 3,30 m)“, B × H, Brüstung, Ausführung), beide mit Seitenumbrüchen.
- 3D-Bild für den Export: Ausgewählte Türen/Fenster/Raumobjekte (blau eingefärbt) werden für die Aufnahme
  kurz abgewählt und danach wieder ausgewählt.
- **Projektdatei `.3draum`** (max. 5 MB):
  - Import über „Projekte“ → „Projektdatei importieren“.
  - Erst validieren, dann als **neues** lokales Projekt speichern und öffnen; bestehende Projekte werden
    nie überschrieben.
  - Ist der Speicher voll, wird das Projekt trotzdem geöffnet, mit dem Hinweis „Nicht lokal gespeichert“.
- **Dateinamen:** `<Projekt>.3draum`, `<Projekt> – Grundriss.png`, `<Projekt> – 3D.png`, `<Projekt> – Planungsbericht.pdf`.
- **Fehler:** Meldung im Dialog („Export fehlgeschlagen: …“). Ohne WebGL ist das 3D-PNG deaktiviert,
  das PDF entsteht dann ohne 3D-Bild.

## Mobile, Tablet, Touch

- `COMPACT_QUERY = '(max-width: 900px)'` (`useMediaQuery`). Darunter ist die Sidebar ein **Drawer**:
  - Menü-Button, Scrim, Escape und Schließen-Button schließen ihn.
  - Geschlossen ist er `inert`/`aria-hidden`; offen ist die Arbeitsfläche dahinter `inert`.
  - Der Fokus geht beim Öffnen hinein und beim Schließen zurück.
- **Auswahl-Chip** unten: „<Name> · bearbeiten“. Er öffnet den Drawer und springt direkt zu den
  Eigenschaften der Auswahl.
- **Toolbars:** Container-Queries auf `container: workspace`.
  - Unter 1060 px rutscht die Ansichtsleiste unter die Projektleiste, Meldungen landen darunter.
  - Unter 760 px zeigt die Projektleiste nur Symbole.
- **Touch** (`pointer: coarse`): Bedienflächen ≥ 40 px, Eingabefelder 16 px (kein iOS-Auto-Zoom).
  - 2D: Pinch und Pan, Antippen wählt aus, Möbel lassen sich mit dem Finger ziehen.
  - 3D: Orbit und Pinch.
- Geprüft bei 375, 390, 430, 768, 1024 und 1440 px: keine Überlappungen, keine Scrollleisten,
  Dialoge bleiben im Bildschirm.

## Accessibility

- `Dialog`: `role="dialog"`, `aria-modal`, `aria-labelledby`.
  - Anfangsfokus: `data-autofocus`, sonst das erste sichtbare Feld.
  - **Fokusfalle** für Tab/Shift+Tab; Escape schließt nur den obersten Dialog; danach geht der Fokus
    an den Auslöser zurück.
- Alle Buttons haben zugängliche Namen; Icon-Buttons per `aria-label` und `title`.
  Alle Felder haben Labels.
  Export-Status ist eine Live-Region (`role=status/alert`).
- Kontraste nach WCAG AA:
  - `--color-text-muted: #5d6572`.
  - Akzent als Textfarbe auf getönten Flächen: `--color-accent-text: #1d4ed8`.
- Sichtbarer `:focus-visible`. Tastenkürzel greifen nicht in Textfeldern; Leerzeichen und
  Rücktaste funktionieren dort normal.

## Fehlerbehandlung

- **Globale ErrorBoundary** (`main.tsx`): Fallback mit Neu-laden-Button, die App wird nie weiß.
- **Eigene ErrorBoundary um den Canvas** (Fallback „scene-error“ mit Reset).
- **Ohne WebGL** (`isWebGLAvailable`): Fallback „webgl-missing“. Sidebar, Speichern, Grundriss-PNG,
  PDF und Projektdatei funktionieren weiter.
- Auch abgesichert: Speicher voll/gesperrt, beschädigte oder zukünftige Projekte, ungültige Geometrie,
  Extremräume 1 × 1 und 30 × 30 m, 150 Möbel, schnelles Undo/Redo und schnelles Umschalten der Ansichten.

## Performance-Architektur

- **`<Canvas frameloop="demand">`:** Im Leerlauf wird **nicht** gerendert (0 Frames und etwa 0 % CPU über
  10 s, gemessen mit 50 und 150 Möbeln; vorher Dauerbetrieb mit rund 65 s CPU in 10 s im Software-Rendering).
- **Wer Frames anfordert:**
  - R3F automatisch bei jeder Prop-Änderung durch React, also bei Plan-, Auswahl- und Designänderungen.
  - drei-OrbitControls bei Kamerabewegung.
  - **Explizites `invalidate()`** an Stellen, an denen Szenenänderungen keine React-Props berühren:
    - Kamera einpassen (`TopView`, `PerspectiveView`)
    - Vorschau betreten/verlassen, Sichtfeld ändern
    - `useWallFade`, solange die Überblendung läuft
- **`useControlsSettle`** (in `TopView` und `PerspectiveView`, läuft nach dem Controls-Update):
  - Hintergrund: Gedämpfte OrbitControls melden Änderungen nur oberhalb einer festen Schwelle. Ohne den Hook
    bliebe der letzte Rest der Gleitbewegung ungerendert.
  - Der Hook fordert Frames an, solange sich das Bild um mehr als **0,02 px pro Frame** bewegt.
    Danach verbraucht er den Restschwung ohne Dämpfung, und die Szene ruht.
- **Regel für neuen Code:** Jede imperative Änderung an Szene oder Kamera außerhalb von React-Props und
  außerhalb eines laufenden Frames braucht `invalidate()`. Animationen fordern in `useFrame` den nächsten
  Frame an, solange sie laufen. **Tests**, die die Kamera direkt setzen, müssen anschließend
  `window.__PLANNER_R3F__().invalidate()` aufrufen.
- **Weitere Maßnahmen:**
  - `FurnitureObject` ist `memo`; der Wand-Fade arbeitet ohne React.
  - Feste Lichtanzahl, damit keine Shader neu kompiliert werden.
  - Texturen und Materialien werden gecacht, Geometrien bei Änderung freigegeben.
  - `<Edges key={edgeCount}>` an Wänden baut die Kantenlinie neu auf, wenn sich die Kantenzahl ändert.
    Sonst übernimmt three.js die alte Instanzanzahl, und es entstehen Streulinien.
- **Messbar:** Die Suite „performance“ prüft React-Commits im Leerlauf (0) und beim Ziehen (nur bei
  Bewegung) sowie Speicherlecks: `gl.info.memory` ist nach Zyklen unverändert. Mit 150 Möbeln: 3D-Ziehen
  ≈ 3, Drehen ≈ 3, Gruppendrehen ≈ 4 Commits je Bewegung, danach 0 Commits und 0 Frames; Kollisionsbericht
  bei einem bewegten Möbel < 1 ms.
- `RoomDimensionLines` ist `memo`: Jedes Maß-Etikett ist ein eigenes HTML-Overlay mit eigener React-Wurzel.

## Wichtige Entscheidungen und bekannte Grenzen

- **Entscheidungen:**
  - Keine externen Libraries für PDF/Bild. Prozedurale Modelle und Texturen, keine Asset-Dateien.
  - Kollisionen werden gemeldet, nicht verhindert.
  - Kamera und Ansicht gehören nicht in den Verlauf und nicht ins Projekt.
- **Bekannte Grenzen:**
  - Projekte liegen nur im Browser (localStorage); Übertragung per `.3draum`.
  - Kein „Alles auswählen“-Kürzel.
  - Maßketten nur für Türen/Fenster/Durchgänge (nicht für Raumobjekte). Bei sehr kleinem Zoom entfallen
    einzelne Kettenzahlen statt sich zu überdecken; die Auswahlmaße zeigen sie dann im Raum.
  - L-Form-Hauptmaße nur für den Ausschnitt rechts unten; frei bearbeitete L-Formen über den Editor.
  - Kollisionszonen nur für Esstisch, Schreibtisch, Stuhl, Bürostuhl; alle anderen sind Quader.
    Abstandsmaße übergehen ein erlaubt überdeckendes Möbel (z. B. den Tisch über dem Stuhl).
  - In 3D wird nur ein bereits ausgewähltes Möbel gezogen (erst antippen/klicken, dann ziehen).
  - Gemeinsames Drehen lehnt Winkel ab, in denen die Formation nicht in den Raum passt.
  - Ohne WebGL keine 3D-Ansicht.
  - Die E2E-Tests laufen mit Software-WebGL (SwiftShader), deshalb sind die Bildraten-Grenzwerte großzügig
    bzw. relativ zu einer Grundlinie im selben Lauf.
  - `dist/` ist lokal vorhanden, aber ignoriert.

## Tests

- **Befehle:**
  - `npm test`: Production-Build inklusive `tsc -b`, danach Unit-Test und alle Browser-Suiten.
    Dauert etwa 25 Minuten, daher im Hintergrund starten und das Log lesen.
  - `npm test -- mobile export`: nur Suiten, deren Dateiname passt.
  - `--no-build` nutzt das vorhandene `dist/`; `--verbose` zeigt alle Einzelprüfungen.
- **Runner** `e2e/run.mjs`:
  - Startet Vite Dev und Vite Preview auf freien Ports und nutzt ein vorhandenes Chromium
    (Playwright-Cache bzw. `E2E_CHROME`).
  - Suiten sind eigenständige Node-Skripte mit `PASS`/`FAIL`-Ausgabe.
  - **Neue Suiten im Array `SUITES` registrieren.** Screenshots landen in `e2e/.output/<suite>/`.
  - Unit-Suiten (`server: null`) sind `.ts`-Dateien in `e2e/unit/` mit `createSuite()` aus `harness.ts`;
    sie importieren reine Module aus `src/` direkt (Reducer, Format, Geometrie). `npm test -- unit` < 2 s.
    Neue reine Logik bevorzugt hier testen, Browser-Suiten für Oberfläche und Szene.
- Die meisten Suiten laufen gegen den **Dev-Server** (wegen `__PLANNER_R3F__`). Daher **während eines
  laufenden Testlaufs keine Dateien in `src/` ändern**: HMR verfälscht die Ergebnisse.
- **Hilfen:**
  - `e2e/lib/scenes.mjs`: Testprojekte (livingRoom, bedroom, lRoom, freeRoom, office; Block B: diningArea,
    officeDesk, livingCollision), `project()`,
    `item()`, `openScene()`.
  - `e2e/lib/planner.mjs`: `addFurniture`.
  - `e2e/lib/images.mjs`: `analyzeImage`, `exportFile`.
- **Suiten (35):**
  - Unit: Kollisionsgeometrie, Raummaße & Maßketten, L-Form, Öffnungen/Durchgang/Format 6,
    Kollisionszonen & Höhen, Platzierung/Drehen/Gruppen/Tischlampen
  - Grundlagen: Raumgeometrie, Raum 2D/3D (Preview-Build)
  - Öffnungen: Türen & Fenster, Drag & Drop Türen/Fenster, **Maße, Durchgang & L-Form**
  - Möbel: Möbel, Drag & Drop Möbel, Möbelbibliothek, Abstandsmaße, Bearbeiten/Mehrfachauswahl/Gruppen,
    **Möbel realistisch platzieren** (Essbereich/Büro/Wohnzimmer, 3D ziehen/drehen, Touch 375–768 px)
  - Szene: Kollisionen, Kameraabhängige Wände, Raumobjekte, Freie Raumformen & Grundriss-Editor
  - Gestaltung: Gestaltung, Gestaltung/Decke/Licht/Vorschau, Lampen & Möbelfarben, Visuelle Szenen
  - Verlauf und Projekte: Undo/Redo, Lokale Projekte, Speicherkompatibilität (Format 1–6)
  - Performance: Performance, **Rendern auf Anforderung**
  - V1-Abnahme: Export, Mobile/Tablet/Touch, Fehlerbehandlung & Robustheit, Accessibility,
    Visuelle Endabnahme (5 Projekte × 3 Geräte)
- **Aktueller Stand:** **1793/1793 Tests in 35 Suiten** grün, TypeScript und Build ohne Fehler und Warnungen.
