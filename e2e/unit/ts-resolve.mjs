/** Registriert den Resolve-Hook für TypeScript-Quellen ohne Dateiendung (siehe ts-resolve-hooks.mjs). */
import { register } from 'node:module';

register('./ts-resolve-hooks.mjs', import.meta.url);
