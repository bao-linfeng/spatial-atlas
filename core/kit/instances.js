import * as THREE from 'three';
import { sub2, len2, norm2 } from '../geom.js';
import { glowTexture } from '../textures.js';
import { rng } from '../rng.js';

// ───────────────────────── 树 ─────────────────────────
export function buildTrees(spots) {
  const group = new THREE.Group();
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1, 5); trunkGeo.translate(0, 0.5, 0);
  const canopyMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a6a58, roughness: 1 });
  const n = spots.length;
  const canopy = new THREE.InstancedMesh(canopyGeo, canopyMat, n);
  const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
  canopy.castShadow = true; canopy.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const col = new THREE.Color();
  const data = [];
  spots.forEach((t, i) => {
    const sc = t.s * (t.kind === 1 ? 2.1 : 2.9);
    const h = sc * (t.kind === 1 ? 1.5 : 1.3);
    data.push({ x: t.p[0], z: t.p[1], sc, h, delay: rng.trees() });
    p.set(t.p[0], h + sc * 0.6, t.p[1]); s.set(sc, sc * (t.kind === 1 ? 1.15 : 0.95), sc);
    q.setFromEuler(new THREE.Euler(0, rng.trees() * 6, 0));
    m.compose(p, q, s); canopy.setMatrixAt(i, m);
    p.set(t.p[0], 0, t.p[1]); s.set(1, h + sc * 0.3, 1); m.compose(p, q, s); trunk.setMatrixAt(i, m);
    const hue = t.kind === 1 ? 0.25 + rng.trees() * 0.06 : 0.23 + rng.trees() * 0.08;
    col.setHSL(hue, 0.36 + rng.trees() * 0.16, 0.2 + rng.trees() * 0.08);
    canopy.setColorAt(i, col);
  });
  group.add(canopy, trunk);
  // 生长动画：按比例缩放
  function setGrowth(k) {
    data.forEach((d, i) => {
      const g = THREE.MathUtils.clamp((k - d.delay * 0.6) / 0.4, 0, 1);
      const e = g * g * (3 - 2 * g);
      const sc = Math.max(0.0001, d.sc * e);
      p.set(d.x, (d.h + d.sc * 0.6) * e, d.z); s.set(sc, sc, sc); q.identity();
      m.compose(p, q, s); canopy.setMatrixAt(i, m);
      p.set(d.x, 0, d.z); s.set(e || 0.0001, (d.h + d.sc * 0.3) * e || 0.0001, e || 0.0001); m.compose(p, q, s); trunk.setMatrixAt(i, m);
    });
    canopy.instanceMatrix.needsUpdate = trunk.instanceMatrix.needsUpdate = true;
  }
  return { group, setGrowth, count: n };
}

// ───────────────────────── 车 ─────────────────────────
export function buildCars(paths) {
  const group = new THREE.Group();
  const lanes = [];
  paths.forEach(path => {
    const pts = path.pts;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len2(sub2(pts[i], pts[i - 1])));
    const L = cum[cum.length - 1];
    if (L < 20) return;
    for (let k = 0; k < path.count; k++) {
      lanes.push({ pts, cum, L, y: path.y, ys: path.ys, dir: path.dir, offset: path.offset || 0, speed: path.speed * (0.85 + rng.cars() * 0.3), s: rng.cars() * L });
    }
  });
  const n = lanes.length;
  const bodyGeo = new THREE.BoxGeometry(1.9, 1.1, 4.4); bodyGeo.translate(0, 0.75, 0);
  const cabGeo = new THREE.BoxGeometry(1.7, 0.8, 2.3); cabGeo.translate(0, 1.65, -0.2);
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 });
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x2c3a44, roughness: 0.2, metalness: 0.4, emissive: 0xffe2b0, emissiveIntensity: 0 });
  const body = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
  const cab = new THREE.InstancedMesh(cabGeo, cabMat, n);
  body.castShadow = true;
  const palette = [0xf4f4f2, 0xe9e9e6, 0x2b2f33, 0x8d949a, 0xb33a35, 0x3d5a80, 0xd8d2c4, 0x56636d];
  const c = new THREE.Color();
  lanes.forEach((l, i) => body.setColorAt(i, c.set(palette[Math.floor(rng.cars() * palette.length)])));
  // 车灯光点（夜景）
  const lightGeo = new THREE.BufferGeometry();
  const lightPos = new Float32Array(n * 2 * 3), lightCol = new Float32Array(n * 2 * 3);
  lightGeo.setAttribute('position', new THREE.BufferAttribute(lightPos, 3));
  lightGeo.setAttribute('color', new THREE.BufferAttribute(lightCol, 3));
  for (let i = 0; i < n; i++) {
    lightCol.set([1, 0.93, 0.75], i * 6); lightCol.set([1, 0.2, 0.15], i * 6 + 3);
  }
  const lightMat = new THREE.PointsMaterial({ size: 5, map: glowTexture(), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const lights = new THREE.Points(lightGeo, lightMat);
  lights.frustumCulled = false;
  group.add(body, cab, lights);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  function sample(l, s) {
    let i = 1;
    while (i < l.cum.length - 1 && l.cum[i] < s) i++;
    const a = l.pts[i - 1], b = l.pts[i], seg = l.cum[i] - l.cum[i - 1] || 1;
    const t = (s - l.cum[i - 1]) / seg;
    const d = norm2(sub2(b, a));
    const y = l.ys ? l.ys[i - 1] + (l.ys[i] - l.ys[i - 1]) * t : l.y;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, d, y];
  }
  function update(dt) {
    lanes.forEach((l, i) => {
      l.s = (l.s + l.speed * dt * l.dir + l.L) % l.L;
      const [x, z, d, y] = sample(l, l.s);
      const fx = d[0] * l.dir, fz = d[1] * l.dir;
      const ox = -fz * l.offset, oz = fx * l.offset;
      p.set(x + ox, y, z + oz);
      q.setFromAxisAngle(up, Math.atan2(fx, fz));
      m.compose(p, q, one);
      body.setMatrixAt(i, m); cab.setMatrixAt(i, m);
      lightPos.set([p.x + fx * 2.4, p.y + 0.8, p.z + fz * 2.4], i * 6);
      lightPos.set([p.x - fx * 2.4, p.y + 0.8, p.z - fz * 2.4], i * 6 + 3);
    });
    body.instanceMatrix.needsUpdate = cab.instanceMatrix.needsUpdate = true;
    lightGeo.attributes.position.needsUpdate = true;
  }
  update(0);
  return { group, update, lightMat, cabMat, count: n };
}
// ───────────────────────── 路灯 ─────────────────────────
export function buildLamps(spots) {
  const g = new THREE.BufferGeometry().setFromPoints(spots);
  const mat = new THREE.PointsMaterial({ size: 9, map: glowTexture(), color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  return new THREE.Points(g, mat);
}
