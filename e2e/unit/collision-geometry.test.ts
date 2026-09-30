import { polygonsOverlap, quarterSectorPolygon, rectanglePolygon } from '../../src/collision/geometry.ts';
const T = 1e-4;
let pass = 0, fail = 0;
const check = (name: string, ok: boolean) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };
const R = (x: number, z: number, w: number, d: number, r = 0) => rectanglePolygon({ x, z }, w / 2, d / 2, r);
check('0°: Überlappung', polygonsOverlap(R(0, 0, 2, 1), R(1.5, 0, 2, 1), T));
check('0°: Kante an Kante = keine Kollision', !polygonsOverlap(R(0, 0, 2, 1), R(2, 0, 2, 1), T));
check('0°: Ecke an Ecke = keine Kollision', !polygonsOverlap(R(0, 0, 2, 1), R(2, 1, 2, 1), T));
check('0°: 1 mm Überlappung = Kollision', polygonsOverlap(R(0, 0, 2, 1), R(1.999, 0, 2, 1), T));
check('0°: getrennt', !polygonsOverlap(R(0, 0, 2, 1), R(2.01, 0, 2, 1), T));
check('90°: gedrehtes 2×1 bei x=1,6 überlappt (Breite in z)', polygonsOverlap(R(0, 0, 2, 1), R(1.45, 0, 2, 1, 90), T));
check('90°: gedrehtes 2×1 berührt bei x=1,5', !polygonsOverlap(R(0, 0, 2, 1), R(1.5, 0, 2, 1, 90), T));
// 45°: AABB überlappt, echte Formen nicht (Ecke des Quadrats zeigt ins Leere)
const sq45 = R(1.2, 1.2, 1, 1, 45); // Halbdiagonale 0,707 → AABB [0,49..1,91]
check('45°: AABBs überlappen, echte Grundflächen NICHT', !polygonsOverlap(R(0, 0, 1.2, 1.2), sq45, T));
check('45°: echte Überlappung', polygonsOverlap(R(0, 0, 1.2, 1.2), R(0.9, 0.9, 1, 1, 45), T));
// 45°-Quadrat berührt mit Spitze eine Kante: Spitze bei x = 1.2 - 0.7071 → genau an Kante x=0.6? (Zentrum 1.3071, 0)
check('45°: Spitze berührt Kante = keine Kollision', !polygonsOverlap(R(0, 0, 1.2, 1.2), R(0.6 + Math.SQRT1_2, 0, 1, 1, 45), T));
// Sektor: Anschlag (0,0), Radius 1, von +x nach +z
const sector = quarterSectorPolygon({ x: 0, z: 0 }, 1, { x: 1, z: 0 }, { x: 0, z: 1 }, 16);
check('Sektor: Rechteck im Bogen = Kollision', polygonsOverlap(sector, R(0.4, 0.4, 0.3, 0.3), T));
check('Sektor: Rechteck in der Ecke außerhalb des Bogens = keine Kollision', !polygonsOverlap(sector, R(0.95, 0.95, 0.2, 0.2), T));
check('Sektor: Rechteck auf der anderen Wandseite = keine Kollision', !polygonsOverlap(sector, R(0.5, -0.3, 0.4, 0.4), T));
console.log(`\n${pass}/${pass + fail} bestanden`);
process.exit(fail ? 1 : 0);
