/** Kann dieser Browser WebGL darstellen? (Einmal geprüft, dann gemerkt.) */
let cached: boolean | null = null;

export function isWebGLAvailable(): boolean {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    cached = !!context;
    (context as WebGL2RenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
