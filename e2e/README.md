# End-to-End-Tests

```bash
npm test                        # alles: Build (inkl. TypeScript), Unit-Test, alle Browser-Suiten
npm test -- furniture history   # nur Suiten, deren Dateiname einen der Begriffe enthält
npm test -- --no-build          # vorhandenen Build (dist/) verwenden
npm test -- --verbose           # alle Einzelergebnisse ausgeben
```

- **Browser:** Es wird ein vorhandenes Chromium verwendet (Playwright-Cache oder installiertes
  Chrome). Anderer Pfad: `E2E_CHROME=/pfad/zu/chrome npm test`.
- **Server:** Der Runner startet Vite (Dev) und Vite Preview (Produktions-Build) auf freien Ports.
  Die meisten Suiten laufen gegen den Dev-Server, weil nur dort die Debug-Brücke
  `window.__PLANNER_R3F__` für Szenenprüfungen (Raycasts, Materialien) existiert.
- **Screenshots** der Suiten landen in `e2e/.output/<suite>/` (nicht versioniert).
- **Aufbau einer Suite:** eigenständiges Node-Skript, gibt je Prüfung `PASS`/`FAIL` und am Ende
  `x/y Tests bestanden` aus; Exit-Code ≠ 0 bei Fehlern.
