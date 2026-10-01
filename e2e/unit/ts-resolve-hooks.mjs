/**
 * Resolve-Hook für die Unit-Tests: Der Quellcode importiert ohne Dateiendung
 * (Vite/Bundler-Auflösung). Node findet dann `./modul.ts` bzw. `./ordner/index.ts`.
 */
const RELATIVE = /^\.{1,2}\//;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$/;

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (!RELATIVE.test(specifier) || HAS_EXTENSION.test(specifier)) throw error;
    for (const suffix of ['.ts', '/index.ts']) {
      try {
        return await next(specifier + suffix, context);
      } catch {
        /* nächste Variante */
      }
    }
    throw error;
  }
}
