import fs from 'node:fs';

/**
 * Bildanalyse im Browser (Canvas): Größe, Farbstatistik und Zählung bestimmter Farben.
 * `file` ist ein Pfad zu einer PNG/JPEG-Datei.
 */
export async function analyzeImage(page, file, { colors = {} } = {}) {
  const b64 = fs.readFileSync(file).toString('base64');
  return page.evaluate(async ({ b64, colors }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const counts = Object.fromEntries(Object.keys(colors).map((k) => [k, 0]));
    let dark = 0;
    let white = 0;
    let sum = 0;
    let sum2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += l;
      sum2 += l * l;
      if (l < 80) dark++;
      if (r > 250 && g > 250 && b > 250) white++;
      for (const [name, [cr, cg, cb, tol]] of Object.entries(colors)) {
        if (Math.abs(r - cr) <= tol && Math.abs(g - cg) <= tol && Math.abs(b - cb) <= tol) counts[name]++;
      }
    }
    const n = d.length / 4;
    const corner = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    return {
      width: c.width,
      height: c.height,
      dark: dark / n,
      white: white / n,
      mean: sum / n,
      std: Math.sqrt(sum2 / n - (sum / n) ** 2),
      counts,
      corners: [corner(2, 2), corner(c.width - 3, 2), corner(2, c.height - 3), corner(c.width - 3, c.height - 3)],
    };
  }, { b64, colors });
}

/** Download über den Export-Dialog auslösen und Pfad der Datei liefern. */
export async function exportFile(page, testId) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByTestId(testId).click()]);
  const path = await download.path();
  return { path, name: download.suggestedFilename() };
}
