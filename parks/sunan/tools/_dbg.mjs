import { FORESTS, BOUNDARY } from '../layout.js';
function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
for (const f of FORESTS) {
  const poly = f;
  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const n = Math.floor((x1 - x0) * (z1 - z0) / 95);
  let k = 0;
  for (let i = 0; i < n; i++) { const x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0); if (pointInPoly(x, z, poly) && !pointInPoly(x, z, BOUNDARY)) k++; }
  console.log(f[0], n, k);
}
