/**
 * Minimaler Test-Rahmen für die Unit-Tests (reine Logik aus `src/`, ohne Browser).
 * Ausgabe wie die Browser-Suiten: `PASS`/`FAIL` je Prüfung, am Ende „x/y bestanden“.
 */
export function createSuite() {
  let pass = 0;
  let fail = 0;
  const check = (name: string, ok: boolean, detail: unknown = '') => {
    if (ok) pass++;
    else fail++;
    const info = detail === '' ? '' : `  — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : info}`);
  };
  const near = (a: number, b: number, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
  const done = () => {
    console.log(`\n${pass}/${pass + fail} bestanden`);
    process.exit(fail ? 1 : 0);
  };
  return { check, near, done };
}
