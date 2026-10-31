import * as THREE from 'three';
import {
  P, G, PX, GRID_ANGLE, PLATE, BOUNDARY, QINGYANG_AXIS, CHUANGKE_ROAD, HONGYANG_ROAD, HIGHWAY, G42_MAIN, G42_RAMP, TOLL,
  HEHAI_ROAD, FRONTAGE, ELEVATED_RAMPS, DECK_START, LANDING, LOCAL_ROADS, PONDS, CONTEXT_BLOCKS, FORESTS,
  RIVER, RIVER_BRANCHES, PARK_ROADS, NORTH_ROADS, AXIS, SOUTH_GATE, TOWERS, PLAZA, CLUB, VILLAS,
} from './layout.js';
import {
  facadeMaterial, roadTexture, signTexture, solarTexture, waterTexture, FLOOR_M,
} from './textures.js';
import { rng } from './rng.js';

const rand = () => rng.world();

// ───────────────────────── 工具 ─────────────────────────
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len2 = a => Math.hypot(a[0], a[1]);
const norm2 = a => { const l = len2(a) || 1; return [a[0] / l, a[1] / l]; };

function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += len2(sub2(pts[i], pts[i - 1]));
  return L;
}

// 平滑折线（Catmull-Rom 采样）
function smooth(pts, step = 8) {
  if (pts.length < 3) return densify(pts, step);
  const curve = new THREE.CatmullRomCurve3(pts.map(p => V3(p[0], 0, p[1])), false, 'centripetal');
  const n = Math.max(8, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map(v => [v.x, v.z]);
}
function densify(pts, step = 8) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(len2(sub2(b, a)) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  return out;
}

// 沿折线生成带状几何（道路/河道），UV.y 按米计；width / y 可为逐点数组；flip 时朝下
function ribbon(pts, width, y = 0, texLen = 30, flip = false) {
  const pos = [], uv = [], idx = [];
  const W = Array.isArray(width) ? i => width[i] : () => width;
  const Y = Array.isArray(y) ? i => y[i] : () => y;
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const t = norm2(sub2(b, a));
    const n = [-t[1], t[0]];
    if (i > 0) acc += len2(sub2(p, pts[i - 1]));
    const hw = W(i) / 2, yy = Y(i);
    pos.push(p[0] + n[0] * hw, yy, p[1] + n[1] * hw, p[0] - n[0] * hw, yy, p[1] - n[1] * hw);
    uv.push(0, acc / texLen, 1, acc / texLen);
    if (i > 0) {
      const k = i * 2;
      if (flip) idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
      else idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function shapeFrom(pts) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], -p[1]) : s.moveTo(p[0], -p[1])));
  return s;
}
function flatPoly(pts, y, mat) {
  const g = new THREE.ShapeGeometry(shapeFrom(pts));
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}
function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
function segIntersect(a, b, c, d) {
  const r = sub2(b, a), s = sub2(d, c), den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t, norm2(r)] : null;
}
function polyIntersect(p, q) {
  for (let i = 1; i < p.length; i++) for (let j = 1; j < q.length; j++) {
    const hit = segIntersect(p[i - 1], p[i], q[j - 1], q[j]);
    if (hit) return hit;
  }
  return null;
}
const offsetLine = (pts, d) => pts.map((p, i) => {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const t = norm2(sub2(b, a));
  return [p[0] - t[1] * d, p[1] + t[0] * d];
});
// 逐点偏移量版本（车道横向渐变）
const offsetLineVar = (pts, ds) => pts.map((p, i) => offsetLine([pts[Math.max(0, i - 1)], p, pts[Math.min(pts.length - 1, i + 1)]], ds[i])[1]);

// ── 车道：按行驶方向的折线 { pts, ys }，用于路口转向拼接 ──
const laneOf = (pts, y) => ({ pts, ys: Array.isArray(y) ? y : pts.map(() => y) });
const revLane = l => ({ pts: l.pts.slice().reverse(), ys: l.ys.slice().reverse() });
function laneCum(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + len2(sub2(pts[i], pts[i - 1])));
  return c;
}
function laneAt(l, cum, s) {
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const t = Math.min(1, Math.max(0, (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)));
  const a = l.pts[i - 1], b = l.pts[i];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, l.ys[i - 1] + (l.ys[i] - l.ys[i - 1]) * t];
}
function cutLane(l, cum, s0, s1) {
  const out = { pts: [], ys: [] };
  const push = ([x, z, y]) => { out.pts.push([x, z]); out.ys.push(y); };
  push(laneAt(l, cum, s0));
  cum.forEach((c, i) => { if (c > s0 && c < s1) push([...l.pts[i], l.ys[i]]); });
  push(laneAt(l, cum, s1));
  return out;
}
// 路口转向：a 行至与 b 交点前 r 米，经二次贝塞尔（控制点为交点）接入 b 交点后 r 米；
// T 形路口车道未必相交，故 a 末端向前、b 起点向后各延长 40 m 再求交
function turnLane(a, b, r = 9) {
  const n = a.pts.length, da = norm2(sub2(a.pts[n - 1], a.pts[n - 2])), db = norm2(sub2(b.pts[0], b.pts[1]));
  const A = { pts: [...a.pts, [a.pts[n - 1][0] + da[0] * 40, a.pts[n - 1][1] + da[1] * 40]], ys: [...a.ys, a.ys[n - 1]] };
  const B = { pts: [[b.pts[0][0] + db[0] * 40, b.pts[0][1] + db[1] * 40], ...b.pts], ys: [b.ys[0], ...b.ys] };
  const ca = laneCum(A.pts), cb = laneCum(B.pts);
  let sa = -1, sb = -1;
  for (let i = 1; i < A.pts.length && sa < 0; i++) for (let j = 1; j < B.pts.length; j++) {
    const p = A.pts[i - 1], q = B.pts[j - 1], u = sub2(A.pts[i], p), v = sub2(B.pts[j], q), den = u[0] * v[1] - u[1] * v[0];
    if (Math.abs(den) < 1e-9) continue;
    const t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / den, w = ((q[0] - p[0]) * u[1] - (q[1] - p[1]) * u[0]) / den;
    if (t < 0 || t > 1 || w < 0 || w > 1) continue;
    sa = ca[i - 1] + t * (ca[i] - ca[i - 1]); sb = cb[j - 1] + w * (cb[j] - cb[j - 1]);
    break;
  }
  if (sa < 0) throw new Error('turnLane: 车道不相交');
  const head = cutLane(A, ca, 0, Math.max(0, sa - r)), tail = cutLane(B, cb, Math.min(cb.at(-1), sb + r), cb.at(-1));
  const p0 = head.pts.at(-1), p2 = tail.pts[0], [cx, cz] = laneAt(A, ca, sa), y0 = head.ys.at(-1), y2 = tail.ys[0];
  for (let k = 1; k < 8; k++) {
    const t = k / 8, s = 1 - t;
    head.pts.push([s * s * p0[0] + 2 * s * t * cx + t * t * p2[0], s * s * p0[1] + 2 * s * t * cz + t * t * p2[1]]);
    head.ys.push(y0 + (y2 - y0) * t);
  }
  return { pts: [...head.pts, ...tail.pts], ys: [...head.ys, ...tail.ys] };
}

// ───────────────────────── 材质 ─────────────────────────
const M = {
  plate: new THREE.MeshStandardMaterial({ color: 0xdfe3d6, roughness: 1 }),
  plateSide: new THREE.MeshStandardMaterial({ color: 0xc9cdc0, roughness: 1 }),
  field: [0xbccb9f, 0xb0c290, 0xc6d0aa, 0xa6bb88, 0xcfd4b6].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 })),
  paving: new THREE.MeshStandardMaterial({ color: 0xe6e5de, roughness: 0.95 }),
  pavingDark: new THREE.MeshStandardMaterial({ color: 0xd4d3cb, roughness: 0.95 }),
  lawn: new THREE.MeshStandardMaterial({ color: 0x9db680, roughness: 1 }),
  lawnLight: new THREE.MeshStandardMaterial({ color: 0xafc592, roughness: 1 }),
  bank: new THREE.MeshStandardMaterial({ color: 0xc3c9b8, roughness: 1 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xd9dad4, roughness: 0.85 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0xb9bcb6, roughness: 0.85 }),
  roof: new THREE.MeshStandardMaterial({ color: 0xd2d4cf, roughness: 0.9 }),
  roofDark: new THREE.MeshStandardMaterial({ color: 0x9ea4a3, roughness: 0.8 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 }),
  ctx: new THREE.MeshStandardMaterial({ color: 0xeceee7, roughness: 0.9 }),
  ctxBlue: new THREE.MeshStandardMaterial({ color: 0x8fb0c9, roughness: 0.7 }),
  ctxGray: new THREE.MeshStandardMaterial({ color: 0xa8aca8, roughness: 0.9 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x51626c, roughness: 0.2, metalness: 0.5, emissive: 0xffd49a, emissiveIntensity: 0 }),
  court: new THREE.MeshStandardMaterial({ color: 0x3f7ab8, roughness: 0.8 }),
  courtLine: new THREE.MeshStandardMaterial({ color: 0xb3524a, roughness: 0.8 }),
  canopy: new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.5, emissive: 0xfff1d6, emissiveIntensity: 0 }),
  sidewalk: new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.95 }),
  parapet: new THREE.MeshStandardMaterial({ color: 0xe4e5e0, roughness: 0.8, side: THREE.DoubleSide }),
};
const water = new THREE.MeshStandardMaterial({ map: waterTexture(), roughness: 0.15, metalness: 0.3, color: 0xffffff });
const roadMats = {
  city: new THREE.MeshStandardMaterial({ map: roadTexture('city'), roughness: 0.9 }),
  highway: new THREE.MeshStandardMaterial({ map: roadTexture('highway'), roughness: 0.9 }),
  park: new THREE.MeshStandardMaterial({ map: roadTexture('park'), roughness: 0.95 }),
  elevated: new THREE.MeshStandardMaterial({ map: roadTexture('elevated'), roughness: 0.85 }),
  local: new THREE.MeshStandardMaterial({ map: roadTexture('local'), roughness: 0.95 }),
};

// ───────────────────────── 世界 ─────────────────────────
export function buildWorld(scene) {
  const world = new THREE.Group();
  scene.add(world);

  const blockers = { roads: [], rects: [], water: [] };   // 种树时避让
  const buildings = [];                                   // 可点选建筑
  const labels = [];                                      // 标注锚点
  const treeSpots = [];
  const lampSpots = [];
  const carPaths = [];
  const pickables = [];

  const addRoadBlock = (pts, w) => blockers.roads.push({ pts, hw: w / 2 + 2.5 });

  // 沙盘底座
  const [px0, pz0] = P(PLATE.x0, PLATE.y0), [px1, pz1] = P(PLATE.x1, PLATE.y1);
  const pw = px1 - px0, pd = pz1 - pz0;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(pw, 8, pd),
    [M.plateSide, M.plateSide, M.plate, M.plateSide, M.plateSide, M.plateSide]);
  plate.position.set((px0 + px1) / 2, -4, (pz0 + pz1) / 2);
  plate.receiveShadow = true;
  world.add(plate);
  const plateRect = { x0: px0, x1: px1, z0: pz0, z1: pz1 };
  const inPlate = (x, z, m = 4) => x > px0 + m && x < px1 - m && z > pz0 + m && z < pz1 - m;

  // 农田 / 绿地底色
  for (let i = 0; i < 70; i++) {
    const cx = px0 + rand() * pw, cz = pz0 + rand() * pd;
    const w = 40 + rand() * 110, d = 30 + rand() * 80, a = GRID_ANGLE + (rand() - 0.5) * 0.5;
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [
      Math.min(px1, Math.max(px0, cx + x * Math.cos(a) + z * Math.sin(a))),
      Math.min(pz1, Math.max(pz0, cz - x * Math.sin(a) + z * Math.cos(a))),
    ]);
    world.add(flatPoly(pts, 0.02 + i * 0.004, M.field[i % M.field.length]));
  }

  // ── 北塘河 ──
  const river = smooth(RIVER, 6), branches = RIVER_BRANCHES.map(l => smooth(l, 6));
  for (const [line, w] of [[river, 40], ...branches.map(b => [b, 20])]) {
    const bank = new THREE.Mesh(ribbon(line, w + 12, 0.45), M.bank); bank.receiveShadow = true; world.add(bank);
    const wm = new THREE.Mesh(ribbon(line, w, 0.6, 60), water); wm.receiveShadow = true; world.add(wm);
    blockers.water.push({ pts: line, hw: w / 2 + 7 });
  }
  for (const pond of PONDS) {
    world.add(flatPoly(pond, 0.6, water));
    const xs = pond.map(p => p[0]), zs = pond.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    blockers.rects.push({ c: [(x0 + x1) / 2, (z0 + z1) / 2], w: x1 - x0 + 4, d: z1 - z0 + 4, a: 0 });
  }
  labels.push({ text: '北塘河', kind: 'place', pos: V3(...insertY(river[Math.floor(river.length * 0.55)], 2)) });

  // ── 地面道路：路面 + 两侧人行道（略低、略宽，形成路缘），按层级错开高度避免交叉口闪烁 ──
  let roadRank = 0;
  const groundRoad = (pts, w, { y, mat = roadMats.city, walk = 2.5, lanes = [], speed = 9, count = 3, lamp = 0, offset } = {}) => {
    const yy = y ?? 0.76 + (roadRank++ % 6) * 0.006;
    if (walk) world.add(Object.assign(new THREE.Mesh(ribbon(pts, w + walk * 2, 0.68, 18), M.sidewalk), { receiveShadow: true }));
    world.add(Object.assign(new THREE.Mesh(ribbon(pts, w, yy, 30), mat), { receiveShadow: true }));
    addRoadBlock(pts, w + walk * 2);
    for (const [o, dir] of lanes) carPaths.push({ pts: offsetLine(pts, o), y: yy + 0.05, dir, speed: speed * (0.85 + rand() * 0.3), count, offset });
    if (lamp) for (let i = 0, acc = 0; i < pts.length; i++) {
      if (i) acc += len2(sub2(pts[i], pts[i - 1]));
      if (acc >= lamp) { acc = 0; lampSpots.push(V3(...insertY(offsetLine(pts, w / 2 + walk * 0.6)[i], 7))); }
    }
    return yy;
  };

  // ── 高架构造：低于 SOLID 为挡墙填土段（实心落地），以上为桥梁段（桥面 + 桥墩 + 防撞墙）──
  const SOLID = 5;
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const wallGeo = (pts, off, bot, top, keep) => {
    const pos = [], edge = offsetLine(pts, off);
    for (let i = 1; i < pts.length; i++) {
      if (!keep(i - 1) || !keep(i)) continue;
      const a = edge[i - 1], b = edge[i];
      pos.push(a[0], bot[i - 1], a[1], b[0], bot[i], b[1], b[0], top[i], b[1],
        a[0], bot[i - 1], a[1], b[0], top[i], b[1], a[0], top[i - 1], a[1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  // keep(p)：该处侧墙是否保留（与主线桥面重叠段不设）；护栏全程设置，仅在起点 25 m 内渐出
  const elevatedRoad = (line, w, ys, keep = () => true) => {
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + len2(sub2(line[i], line[i - 1])));
    const bots = ys.map(y => (y < SOLID ? 0.05 : y - 1.6));
    const tops = ys.map((y, i) => y + 0.9 * smoothstep(0, 25, cum[i]));
    world.add(Object.assign(new THREE.Mesh(ribbon(line, w, ys, 30), roadMats.elevated), { receiveShadow: true }));
    world.add(new THREE.Mesh(ribbon(line, w, bots, 30, true), M.concrete));
    for (const side of [-1, 1]) {
      const edge = offsetLine(line, side * w / 2);
      const wall = new THREE.Mesh(wallGeo(line, side * w / 2, bots, tops, i => keep(edge[i])), M.parapet);
      wall.castShadow = true; world.add(wall);
    }
    // 桥墩：桥梁段约 24 m 一跨，落在路面上的跳过（由相邻墩跨越）
    for (let i = 1, acc = 99; i < line.length; i++) {
      acc += len2(sub2(line[i], line[i - 1]));
      if (acc < 24 || ys[i] < SOLID) continue;
      const [x, z] = line[i];
      if (blockers.roads.some(r => distToPolyline(x, z, r.pts) < r.hw - 1)) continue;
      acc = 0;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.05, bots[i], 10), M.concreteDark);
      p.position.set(x, bots[i] / 2, z); p.castShadow = true; world.add(p);
    }
    addRoadBlock(line, w + 4);
  };

  // ── 青洋路高架（主线）：桥面 s ∈ [DECK_START, qLen]，北端经落地坡道接地面青洋北路 ──
  const qa = QINGYANG_AXIS;
  const qDir = norm2(sub2(qa[1], qa[0])), qLen = len2(sub2(qa[1], qa[0]));
  const qAng = Math.atan2(qDir[0], qDir[1]);
  const deckH = 10;
  const E = [qDir[1], -qDir[0]];                                   // 高架东侧单位向量
  const axisPt = (s, lat) => [qa[0][0] + qDir[0] * s + E[0] * lat, qa[0][1] + qDir[1] * s + E[1] * lat];
  const latOf = p => (p[0] - qa[0][0]) * E[0] + (p[1] - qa[0][1]) * E[1];
  const sOf = p => (p[0] - qa[0][0]) * qDir[0] + (p[1] - qa[0][1]) * qDir[1];
  const S0 = DECK_START, deckLen = qLen - S0;
  const sNorth = (P(0, PLATE.y0)[1] - qa[0][1]) / qDir[1];          // 沙盘北缘处的 s（负值）
  {
    const mid = axisPt(S0 + deckLen / 2, 0);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(34, 1.8, deckLen), M.concrete);
    deck.position.set(mid[0], deckH - 0.9, mid[1]); deck.rotation.y = qAng;
    deck.castShadow = deck.receiveShadow = true; world.add(deck);
    const top = new THREE.Mesh(ribbon([axisPt(S0, 0), qa[1]], 32, deckH + 0.02, 40), roadMats.elevated);
    top.receiveShadow = true; world.add(top);
    const pierGeo = new THREE.CylinderGeometry(1.1, 1.3, deckH - 1.8, 12);
    const capGeo = new THREE.BoxGeometry(26, 1.6, 2.6);
    for (let s = S0 + 8; s < qLen - 6; s += 34) {
      const [x, z] = axisPt(s, 0);
      for (const o of [-7, 7]) {
        const p = new THREE.Mesh(pierGeo, M.concreteDark);
        p.position.set(x + o * E[0], (deckH - 1.8) / 2, z + o * E[1]); p.castShadow = true; world.add(p);
      }
      const cap = new THREE.Mesh(capGeo, M.concreteDark);
      cap.position.set(x, deckH - 2.6, z); cap.rotation.y = qAng; world.add(cap);
    }
    for (let s = S0 + 10; s < qLen; s += 40) for (const o of [-16.2, 16.2]) lampSpots.push(V3(...insertY(axisPt(s, o), deckH + 7)));
    addRoadBlock([axisPt(sNorth, 0), qa[1]], 38);
    labels.push({ text: '青洋路高架', kind: 'place', pos: V3(...insertY(axisPt(S0 + deckLen * 0.25, 0), deckH + 6)) });
  }

  // ── 河海东路（地面，高架下穿）──
  // 连接线西端断面：环形匝道（北）、河海东路（中）、东匝道（南）在此相切汇入；断面处与地面齐平，向东爬升至路堤
  const hw = smooth(HIGHWAY, 8);
  const hwT = norm2(sub2(hw[1], hw[0])), hwN = [-hwT[1], hwT[0]];
  const hwJoin = (lat, back) => [hw[0][0] + hwN[0] * lat - hwT[0] * back, hw[0][1] + hwN[1] * lat - hwT[1] * back];
  const hwCum = [0];
  for (let i = 1; i < hw.length; i++) hwCum.push(hwCum[i - 1] + len2(sub2(hw[i], hw[i - 1])));
  const hwY = hwCum.map(L => 0.86 + (1.4 - 0.86) * smoothstep(20, 90, L));
  const hehai = smooth([...HEHAI_ROAD, hwJoin(0, 22), hwJoin(0, -10)], 6);
  groundRoad(hehai, 24, { y: 0.84, lamp: 30 });
  // 河海东路与连接线为同一条地面道路的延伸：车道连成一条，断面处横向渐变（河海 ±3.5 / ±8 → 连接线 ±5 / ±10.5），右侧通行
  // hehaiLane[o]：按行驶方向的车道（o > 0 东行，o < 0 西行），供青洋北路转向拼接
  const hehaiLane = {};
  {
    const head = hehai.filter(p => (p[0] - hw[0][0]) * hwT[0] + (p[1] - hw[0][1]) * hwT[1] < -1);
    const pts = [...head, ...hw];
    const ys = [...head.map(() => 0.89), ...hwY.map(y => y + 0.05)];
    for (const [a, b] of [[3.5, 5], [8, 10.5], [-3.5, -5], [-8, -10.5]]) {
      const ds = [...head.map(() => a), ...hwCum.map(L => a + (b - a) * smoothstep(10, 90, L))];
      const l = laneOf(offsetLineVar(pts, ds), ys);
      hehaiLane[a] = a > 0 ? l : revLane(l);
      carPaths.push({ ...hehaiLane[a], dir: 1, speed: 16 + rand() * 5, count: 8 });
    }
  }
  labels.push({ text: '河海东路', kind: 'place', pos: V3(...insertY(hehai[Math.floor(hehai.length * 0.18)], 3)) });

  // ── 青洋北路（高架两侧地面辅路，北接河海东路）──
  // 西幅南行、东幅北行（单向两车道）；frontLine[o] 为自北向南的道路中线
  const frontLine = {};
  for (const o of [-FRONTAGE, FRONTAGE]) {
    const full = densify([axisPt(0, o), axisPt(qLen, o)], 10);
    const hit = polyIntersect(full, hehai);
    frontLine[o] = hit ? [[hit[0], hit[1]], ...full.filter(p => sOf(p) > sOf(hit) + 2)] : full;
    groundRoad(frontLine[o], 17, { y: 0.8, lamp: 32 });
  }
  labels.push({ text: '青洋北路', kind: 'place', pos: V3(...insertY(axisPt(qLen * 0.55, FRONTAGE), 3)) });

  // ── 创客路 / 虹阳路 ──
  const ck = smooth(CHUANGKE_ROAD, 6);
  groundRoad(ck, 30, { y: 0.86, lanes: [[-11, 1], [-4, 1], [4, -1], [11, -1]], speed: 12, count: 8, lamp: 30 });
  labels.push({ text: '创客路', kind: 'place', pos: V3(...insertY(ck[Math.floor(ck.length * 0.66)], 3)) });
  const hy = densify(HONGYANG_ROAD, 10);
  groundRoad(hy, 18, { y: 0.82, lamp: 30 });
  labels.push({ text: '虹阳路', kind: 'place', pos: V3(...insertY(P(120, 592), 3)) });
  // ── T 形路口车流：青洋北路北接河海东路、虹阳路东接青洋北路西幅，按右侧通行转向拼接，车辆只在沙盘边缘出入 ──
  {
    // 西幅南行：+3 外侧（西）、-3 内侧；东幅北行：中线自北向南，-3 为外侧（东）
    const W = o => laneOf(offsetLine(frontLine[-FRONTAGE], o), 0.85);
    const E = o => revLane(laneOf(offsetLine(frontLine[FRONTAGE], o), 0.85));
    const hyEast = laneOf(offsetLine(hy, 3), 0.87), hyWest = revLane(laneOf(offsetLine(hy, -3), 0.87));
    const flows = [
      [turnLane(hehaiLane[8], W(3)), 3],                        // 河海东路东行 → 右转南行
      [turnLane(hehaiLane[3.5], W(-3)), 3],
      [turnLane(turnLane(hehaiLane[8], W(3)), hyWest), 3],      // 河海东路东行 → 右转南行 → 右转虹阳路西行
      [turnLane(hyEast, W(3)), 3],                              // 虹阳路东行 → 右转南行
      [turnLane(E(-3), hehaiLane[8]), 4],                       // 北行 → 右转河海东路东行 → 连接线
      [turnLane(E(3), hehaiLane[-3.5], 12), 4],                 // 北行 → 左转河海东路西行
    ];
    for (const [l, count] of flows) carPaths.push({ ...l, dir: 1, speed: 9 + rand() * 3, count });
  }
  // 周边支路
  for (const r of LOCAL_ROADS) {
    const pts = smooth(r.pts.map(p => P(...p)), 6);
    groundRoad(pts, r.w * PX * 1.4, { mat: roadMats.local, walk: 1.5, lanes: [[0, rand() < 0.5 ? 1 : -1]], speed: 6, count: 1, offset: 1.6 });
  }

  // 跨河桥栏杆
  for (const b of branches) {
    const hit = polyIntersect(ck, b);
    if (!hit) continue;
    const [bx, bz, t] = hit, ang = Math.atan2(t[0], t[1]);
    for (const s of [-15.5, 15.5]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 34), M.white);
      r.position.set(bx - t[1] * s, 1.2, bz + t[0] * s); r.rotation.y = ang; r.castShadow = true; world.add(r);
    }
  }

  // ── 主线落地坡道 + 路口以北地面青洋北路（河海东路路口为平交）──
  const [la, lb] = LANDING;
  {
    const line = densify([axisPt(la, 0), axisPt(lb, 0)], 5);
    elevatedRoad(line, 20, line.map(p => 0.84 + (deckH + 0.04 - 0.84) * smoothstep(la, lb, sOf(p))));
  }
  groundRoad(densify([axisPt(sNorth, 0), axisPt(la + 8, 0)], 10), 22, { y: 0.8, lamp: 32 });
  // 直行车流：地面青洋北路 ↔ 落地坡道 ↔ 主线内侧车道（右侧通行：西幅南行，东幅北行）
  {
    const ss = [];
    for (let s = sNorth; s < la; s += 10) ss.push(s);
    for (let s = la; s < S0; s += 5) ss.push(s);
    for (let s = S0; s <= qLen; s += 20) ss.push(s);
    const ys = ss.map(s => 0.85 + (deckH + 0.05 - 0.85) * smoothstep(la, lb, s));
    for (const lane of [-5.5, 5.5]) {
      carPaths.push({ pts: ss.map(s => axisPt(s, lane)), ys, dir: lane < 0 ? 1 : -1, speed: 15 + rand() * 4, count: 9 });
    }
  }

  // ── 高架匝道（逐点高程：自连接线端爬坡，低段挡墙填土，高段桥梁）──
  const railGaps = { '-1': [], '1': [] };
  const onDeck = p => Math.abs(latOf(p)) < 16.9 && sOf(p) > S0 - 1;
  for (const r of ELEVATED_RAMPS) {
    const line = smooth([hwJoin(r.join, 0), hwJoin(r.join, 22), ...r.pts.map(p => P(...p)), ...r.tail.map(([s, l]) => axisPt(s, l))], 5);
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + len2(sub2(line[i], line[i - 1])));
    let L0, L1;
    if (r.climb) [L0, L1] = r.climb;
    else {
      L1 = cum[line.findIndex(p => Math.abs(latOf(p)) < 24 && sOf(p) > 0)];
      L0 = Math.max(15, L1 - 230);
    }
    const y0 = hwY[0] + 0.02, yTop = deckH + 0.08;
    const ys = cum.map(L => y0 + (yTop - y0) * smoothstep(L0, L1, L));
    elevatedRoad(line, r.w, ys, p => !onDeck(p));
    // 与主线防撞墙重叠段留缺口
    line.forEach(p => {
      if (sOf(p) > S0 - 1 && Math.abs(latOf(p) - r.side * 16.6) < r.w / 2 + 0.5) railGaps[r.side].push(sOf(p));
    });
    // 车流：单车道接入高架外侧车道（out：高架北行 → 匝道 → 连接线；in：连接线西行 → 环形匝道 → 高架南行）
    const outer = [1, -1].find(k => Math.abs(latOf(offsetLine(line, k * 2.8).at(-1))) > Math.abs(latOf(line.at(-1))));
    const lane = offsetLine(line, outer * 2.8), laneY = ys.map(y => y + 0.05);
    const sEnd = r.tail.at(-1)[0], deckLane = r.side * 13.5;
    // 连接线段：自匝道端点横向渐变并入外侧车道（±10.5），一直行驶到沙盘边缘，避免中途消失
    const lat0 = (lane[0][0] - hw[0][0]) * hwN[0] + (lane[0][1] - hw[0][1]) * hwN[1];
    const hwLane = offsetLineVar(hw, hwCum.map(L => lat0 + (r.side * 10.5 - lat0) * smoothstep(0, 60, L))).slice(1);
    if (r.flow === 'out') {
      const deck = densify([axisPt(qLen, deckLane), axisPt(sEnd + 25, deckLane)], 20);
      const trail = hwLane;
      carPaths.push({
        pts: [...deck, ...lane.slice().reverse(), ...trail],
        ys: [...deck.map(() => deckH + 0.05), ...laneY.slice().reverse(), ...trail.map((_, i) => hwY[i + 1] + 0.05)], dir: 1, speed: 15, count: 10,
      });
    } else {
      const lead = hwLane.slice().reverse();
      const leadY = hwY.slice(1).reverse().map(y => y + 0.05);
      const deck = densify([axisPt(sEnd + 25, deckLane), axisPt(qLen, deckLane)], 20);
      carPaths.push({ pts: [...lead, ...lane, ...deck], ys: [...leadY, ...laneY, ...deck.map(() => deckH + 0.05)], dir: 1, speed: 15, count: 12 });
    }
  }
  // 主线两侧防撞墙（匝道并入处断开）
  for (const side of [-1, 1]) {
    const g = railGaps[side];
    const segs = g.length ? [[S0, Math.min(...g) - 1], [Math.max(...g) + 1, qLen]] : [[S0, qLen]];
    for (const [a, b] of segs) {
      if (b - a < 2) continue;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, b - a), M.white);
      const [x, z] = axisPt((a + b) / 2, side * 16.6);
      rail.position.set(x, deckH + 0.55, z); rail.rotation.y = qAng; rail.castShadow = true; world.add(rail);
    }
  }

  // ── 沪蓉高速连接线（路堤式，收费站处加宽）──
  let tollI = 0;
  hw.forEach((p, i) => { if (len2(sub2(p, TOLL.at)) < len2(sub2(hw[tollI], TOLL.at))) tollI = i; });
  // 宽度：西端断面容纳三路（≈49 m）渐收至 34 m，收费站处加宽
  const hwW = hwCum.map(L => 34 + 15 * (1 - smoothstep(0, 90, L)) + 34 * Math.exp(-(((L - hwCum[tollI]) / 70) ** 2)));
  world.add(Object.assign(new THREE.Mesh(ribbon(hw, hwW.map((w, i) => w + 12 * smoothstep(0, 60, hwCum[i])), hwY.map(y => y - 0.6)), M.bank), { receiveShadow: true }));
  world.add(Object.assign(new THREE.Mesh(ribbon(hw, hwW, hwY, 40), roadMats.highway), { receiveShadow: true }));
  addRoadBlock(hw, 50);
  labels.push({ text: '沪蓉高速连接线', kind: 'place', pos: V3(...insertY(hw[Math.floor(hw.length * 0.3)], 6)) });
  // ── G42 沪蓉高速主线（东北角，路堤双向分幅）+ 环道 ──
  {
    const g = densify(G42_MAIN, 10);
    world.add(Object.assign(new THREE.Mesh(ribbon(g, 62, 1.6), M.bank), { receiveShadow: true }));
    for (const o of [-12, 12]) {
      const line = offsetLine(g, o);
      world.add(Object.assign(new THREE.Mesh(ribbon(line, 20, 2.6, 40), roadMats.highway), { receiveShadow: true }));
      for (const lane of [-6, 0, 6]) carPaths.push({ pts: offsetLine(line, lane), y: 2.65, dir: o < 0 ? 1 : -1, speed: 28 + rand() * 6, count: 3 });
    }
    addRoadBlock(g, 62);
    labels.push({ text: 'G42 沪蓉高速', kind: 'place', pos: V3(...insertY(g[Math.floor(g.length * 0.55)], 8)) });
    const ramp = smooth(G42_RAMP, 8);
    world.add(Object.assign(new THREE.Mesh(ribbon(ramp, 22, 0.8), M.bank), { receiveShadow: true }));
    world.add(Object.assign(new THREE.Mesh(ribbon(ramp, 12, 1.4, 30), roadMats.elevated), { receiveShadow: true }));
    addRoadBlock(ramp, 22);
    carPaths.push({ pts: ramp, y: 1.45, dir: 1, speed: 20, count: 3 });
  }
  // 青龙收费站
  {
    const p = hw[tollI], t = norm2(sub2(hw[Math.min(hw.length - 1, tollI + 1)], hw[Math.max(0, tollI - 1)]));
    const ang = Math.atan2(t[0], t[1]);
    const g = new THREE.Group(); g.position.set(p[0], 1.4, p[1]); g.rotation.y = ang;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(66, 1.2, 14), M.canopy);
    roof.position.y = 7.5; roof.castShadow = true; g.add(roof);
    const band = new THREE.Mesh(new THREE.BoxGeometry(66.2, 0.6, 14.2), new THREE.MeshStandardMaterial({ color: 0x2e7d5b }));
    band.position.y = 7.2; g.add(band);
    for (let i = -30; i <= 30; i += 5) {
      const booth = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 4), M.white);
      booth.position.set(i, 1.3, 0); booth.castShadow = true; g.add(booth);
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), M.concreteDark);
      col.position.set(i, 3.6, 0); g.add(col);
    }
    world.add(g);
    labels.push({ text: TOLL.name, kind: 'place', pos: V3(p[0], 12, p[1]) });
  }

  // ───────────────── 园区 ─────────────────
  const park = new THREE.Group(); world.add(park);
  park.add(flatPoly(BOUNDARY, 0.4, M.paving));

  const gRect = (u0, v0, u1, v1) => [G(u0, v0), G(u1, v0), G(u1, v1), G(u0, v1)];
  // 地块绿地
  const greens = [
    [-286, -45, 15, 280], [59, -45, 193, 124], [59, 136, 193, 280], [207, -45, 315, 124], [207, 136, 315, 280],
  ];
  greens.forEach(r => park.add(flatPoly(gRect(...r), 0.55, M.lawn)));
  park.add(flatPoly([[850, 330], [872, 222], [1000, 248], [1100, 218], [1262, 348], [1282, 436], [1005, 497], [905, 470], [868, 420]].map(p => P(...p)), 0.55, M.lawn));
  park.add(flatPoly([[700, 440], [850, 418], [905, 500], [700, 560]].map(p => P(...p)), 0.55, M.lawnLight));

  // 内部道路
  for (const r of PARK_ROADS) {
    const pts = densify(r.pts.map(p => G(...p)), 8);
    const w = r.w * PX;
    park.add(Object.assign(new THREE.Mesh(ribbon(pts, w, 0.75, 18), roadMats.park), { receiveShadow: true }));
    addRoadBlock(pts, w);
    carPaths.push({ pts, y: 0.8, dir: rand() < 0.5 ? 1 : -1, speed: 5, count: 2, offset: 1.6 });
    for (let s = 0; s < pts.length; s += 3) lampSpots.push(V3(...insertY(offsetLine(pts, w / 2 + 1.5)[s], 4.5)));
  }
  for (const r of NORTH_ROADS) {
    const pts = smooth(r.pts.map(p => P(...p)), 6);
    const w = r.w * PX;
    park.add(Object.assign(new THREE.Mesh(ribbon(pts, w, 0.74, 18), roadMats.park), { receiveShadow: true }));
    addRoadBlock(pts, w);
    for (let s = 0; s < pts.length; s += 5) lampSpots.push(V3(...insertY(offsetLine(pts, w / 2 + 1.5)[s], 4.5)));
  }
  carPaths.push({ pts: smooth(NORTH_ROADS[0].pts.map(p => P(...p)), 6), y: 0.8, dir: 1, speed: 5, count: 3, offset: 1.6 });

  // 中轴景观带：草坪 + 水渠 + 两侧铺装
  {
    // 照片：中轴为宽铺装广场，中间带状绿篱与水渠，两侧行道树
    park.add(flatPoly(gRect(AXIS.u0, AXIS.v0, AXIS.u1, AXIS.v1 - 22), 0.8, M.pavingDark));
    park.add(flatPoly(gRect(24, AXIS.v0 + 12, 42, AXIS.v1 - 90), 0.86, M.lawnLight));
    park.add(flatPoly(gRect(30, AXIS.v0 + 24, 36, AXIS.v1 - 110), 0.92, water));
    for (let v = AXIS.v0 + 16; v < AXIS.v1 - 60; v += 16) {
      for (const u of [AXIS.u0 + 3, AXIS.u1 - 3]) treeSpots.push({ p: G(u, v), s: 0.9, kind: 1, force: true });
    }
    // 白色弧形步道（正射航拍可见）
    const walk = smooth([G(20, 190), G(14, 232), G(26, 268), G(50, 286), G(56, 312)], 3);
    park.add(Object.assign(new THREE.Mesh(ribbon(walk, 3.2, 0.95), M.white), { receiveShadow: true }));
    blockers.rects.push({ c: G((AXIS.u0 + AXIS.u1) / 2, (AXIS.v0 + AXIS.v1) / 2), w: (AXIS.u1 - AXIS.u0 - 8) * PX, d: (AXIS.v1 - AXIS.v0) * PX, a: GRID_ANGLE });
    labels.push({ text: '中轴景观带', kind: 'place', pos: V3(...insertY(G(37, 110), 4)) });
  }
  // 南入口广场 + 喷泉 + 门头
  {
    const [gx, gz] = SOUTH_GATE;
    const disk = new THREE.Mesh(new THREE.CircleGeometry(15, 48), M.pavingDark);
    disk.rotation.x = -Math.PI / 2; disk.position.set(gx, 0.85, gz); park.add(disk);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.6, 40), water);
    pool.position.set(gx, 0.9, gz); park.add(pool);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7, 0.35, 8, 48), M.white);
    rim.rotation.x = -Math.PI / 2; rim.position.set(gx, 1.2, gz); park.add(rim);
    // 环形不锈钢雕塑（中轴航拍可见）
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.45, 16, 64, Math.PI * 1.75),
      new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.15, metalness: 0.9, emissive: 0x9fd6ff, emissiveIntensity: 0 }));
    ring.position.set(gx, 4.2, gz); ring.rotation.set(0, GRID_ANGLE + 0.5, 0.35); park.add(ring);
    ring.userData.fountain = true;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 1, 24), M.white);
    plinth.position.set(gx, 1.4, gz); park.add(plinth);
    // 门头：两片白墙 + 标识
    const [sx, sz] = G(40, 352);
    const gate = new THREE.Group(); gate.position.set(sx, 0, sz); gate.rotation.y = GRID_ANGLE; park.add(gate);
    for (const o of [-16, 16]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 1.2), M.white);
      wall.position.set(o, 2.5, 0); wall.castShadow = true; gate.add(wall);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: signTexture('苏南智城'), transparent: true }));
    sign.position.set(16, 3, 0.62); gate.add(sign);
    labels.push({ text: '南入口', kind: 'place', pos: V3(sx, 8, sz) });
  }

  // ── 建筑 ──
  function makeBlock({ w, d, f, style, sideStyle = style, floorH = FLOOR_M }) {
    const H = f * floorH;
    const front = facadeMaterial(style, w, f), side = facadeMaterial(sideStyle, d, f);
    const geo = new THREE.BoxGeometry(w, H, d); geo.translate(0, H / 2, 0);
    const m = new THREE.Mesh(geo, [side, side, M.roof, M.roof, front, front]);
    m.castShadow = m.receiveShadow = true;
    return { mesh: m, H };
  }
  function roofKit(g, w, d, H, { solar = false, parapet = true } = {}) {
    if (parapet) {
      for (const [sx, sz, lw, ld] of [[0, d / 2, w, 0.5], [0, -d / 2, w, 0.5], [w / 2, 0, 0.5, d], [-w / 2, 0, 0.5, d]]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(lw, 1.1, ld), M.white);
        p.position.set(sx, H + 0.55, sz); g.add(p);
      }
    }
    if (solar) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, d * 0.7), new THREE.MeshStandardMaterial({ map: solarTexture(), roughness: 0.4, metalness: 0.3 }));
      s.material.map.repeat.set(Math.max(1, w / 10), Math.max(1, d / 8));
      s.material.map.wrapS = s.material.map.wrapT = THREE.RepeatWrapping;
      s.rotation.x = -Math.PI / 2; s.position.set(0, H + 0.15, d * 0.08); g.add(s);
    }
    const n = solar ? 2 : 1 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const bw = 2 + rand() * Math.min(6, w * 0.25), bd = 2 + rand() * Math.min(5, d * 0.25), bh = 1.5 + rand() * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), M.roofDark);
      b.position.set((rand() - 0.5) * (w - bw - 2), H + bh / 2, (rand() - 0.5) * (d - bd - 2) - (solar ? d * 0.3 : 0));
      b.castShadow = true; g.add(b);
    }
  }
  function placeBuilding(rec, [x, z], rot = GRID_ANGLE) {
    const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = rot;
    const grow = new THREE.Group(); root.add(grow);
    root.userData = { rec, grow };
    park.add(root);
    buildings.push(root);
    blockers.rects.push({ c: [x, z], w: rec.w + 6, d: rec.d + 6, a: rot });
    return { root, grow };
  }

  // 高层 / 多层
  for (const t of TOWERS) {
    const at = t.at ? G(...t.at) : P(...t.px);
    const { root, grow } = placeBuilding(t, at);
    let baseY = 0;
    if (t.podium) {
      const pd = makeBlock({ w: t.podium.w, d: t.podium.d, f: t.podium.f, style: 'podium', floorH: 5 });
      pd.mesh.position.z = t.podium.d / 2 - t.d / 2 - 4;
      grow.add(pd.mesh); pickables.push(pd.mesh); pd.mesh.userData.bld = root;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(t.podium.w + 2, 0.8, t.podium.d + 2), M.white);
      lid.position.set(0, pd.H + 0.4, pd.mesh.position.z); grow.add(lid);
      blockers.rects.push({ c: at, w: t.podium.w + 6, d: t.podium.d + 14, a: GRID_ANGLE });
    }
    const { mesh, H } = makeBlock(t);
    mesh.position.y = baseY;
    grow.add(mesh); pickables.push(mesh); mesh.userData.bld = root;
    // 底层玻璃门厅
    if (t.f > 10) {
      const lobby = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.4, 5.5, t.d + 0.4), M.glass);
      lobby.position.y = 2.75; grow.add(lobby);
    }
    roofKit(grow, t.w, t.d, H, { solar: t.f > 12 });
    if (t.style === 'grid') {
      const crown = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.8, 2.4, t.d + 0.8), M.white);
      crown.position.y = H + 1.2; grow.add(crown);
    }
    if (t.sign) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true, toneMapped: false }));
      sign.position.set(0, H + 4.2, t.d / 2 + 0.5); grow.add(sign);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(22, 0.4, 0.4), M.concreteDark);
      frame.position.set(0, H + 1.6, t.d / 2 + 0.3); grow.add(frame);
    }
    root.userData.height = H;
    labels.push({ text: t.id, sub: t.name, kind: 'building', bld: root, pos: V3(at[0], H + 10, at[1]) });
  }

  // 下沉式商业广场
  {
    const [cx, cz] = P(...PLAZA.px);
    const root = new THREE.Group(); root.position.set(cx, 0, cz); root.rotation.y = GRID_ANGLE;
    const grow = new THREE.Group(); root.add(grow); park.add(root);
    const rec = { id: 'P', name: PLAZA.name, f: 2, w: PLAZA.rx * 2, d: PLAZA.rz * 2, info: '园区北部核心，下沉庭院与高层裙房结合，形成全天候城市活力空间。卫星图上为椭圆形白色环状屋面。' };
    root.userData = { rec, grow }; buildings.push(root);
    const ring = (rx, rz, ix, iz) => {
      const s = new THREE.Shape(); s.absellipse(0, 0, rx, rz, 0, Math.PI * 2);
      const h = new THREE.Path(); h.absellipse(0, 0, ix, iz, 0, Math.PI * 2, true); s.holes.push(h);
      return s;
    };
    const ext = (shape, depth, mat, y) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 64 });
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat); m.position.y = y; m.castShadow = m.receiveShadow = true;
      grow.add(m); return m;
    };
    const glassRing = ext(ring(PLAZA.rx - 2, PLAZA.rz - 2, PLAZA.rx - 13, PLAZA.rz - 12), 6.5, M.glass, 0);
    const roofRing = ext(ring(PLAZA.rx + 1, PLAZA.rz + 1, PLAZA.rx - 15, PLAZA.rz - 14), 1.2, M.canopy, 6.5);
    pickables.push(glassRing, roofRing); glassRing.userData.bld = roofRing.userData.bld = root;
    // 下沉庭院台阶
    const steps = [[0.86, 0xd8d6cd], [0.72, 0xcac8bf], [0.58, 0xbdbbb2], [0.4, 0xa38f74]];
    steps.forEach(([k, c], i) => {
      const e = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
      e.scale.set((PLAZA.rx - 13) * k, (PLAZA.rz - 12) * k, 1);
      e.rotation.x = -Math.PI / 2; e.position.y = 0.6 + i * 0.06; grow.add(e);
    });
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) treeSpots.push({ p: [cx + Math.cos(a) * (PLAZA.rx + 7), cz + Math.sin(a) * (PLAZA.rz + 7)], s: 0.9, kind: 1 });
    blockers.rects.push({ c: [cx, cz], w: PLAZA.rx * 2 + 6, d: PLAZA.rz * 2 + 6, a: GRID_ANGLE });
    root.userData.height = 8;
    labels.push({ text: 'P', sub: PLAZA.name, kind: 'building', bld: root, pos: V3(cx, 18, cz) });
  }

  // 会所
  {
    const at = G(...CLUB.at);
    const rec = { id: 'Q', name: CLUB.name, ...CLUB, info: '设计说明中会所位于园区南侧，靠近中轴与南入口。' };
    const { root, grow } = placeBuilding(rec, at);
    const body = new THREE.Mesh(new THREE.BoxGeometry(CLUB.w - 4, 8, CLUB.d - 4), M.glass);
    body.position.y = 4; body.castShadow = true; grow.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(CLUB.w + 2, 1, CLUB.d + 4), M.white);
    lid.position.y = 8.5; lid.castShadow = true; grow.add(lid);
    pickables.push(body, lid); body.userData.bld = lid.userData.bld = root;
    root.userData.height = 9;
  }

  // 风车式花园独栋
  VILLAS.forEach((v, i) => {
    const at = G(...v.at);
    const rec = { ...v, name: `花园独栋 ${v.id}`, style: 'villa',
      info: `${v.f} 层花园独栋办公，四合院式布局、风车式错位排布。资料显示独栋面积约 1688–1848㎡。` };
    const { root, grow } = placeBuilding(rec, at);
    const fh = 3.9;
    // 主体 + 侧翼形成 L 形合院
    const mainW = v.w * 0.64, wingW = v.w - mainW;
    const a = makeBlock({ w: mainW, d: v.d, f: v.f, style: mainW >= v.d ? 'villa' : 'villaEnd', sideStyle: mainW >= v.d ? 'villaEnd' : 'villa', floorH: fh });
    a.mesh.position.x = -v.w / 2 + mainW / 2;
    const wingF = Math.max(2, v.f - (v.court ? 2 : 1));
    const wingD = v.d * (v.court ? 0.55 : 0.8);
    const b = makeBlock({ w: wingW, d: wingD, f: wingF, style: 'villaEnd', sideStyle: 'villa', floorH: fh });
    b.mesh.position.set(v.w / 2 - wingW / 2, 0, -v.d / 2 + wingD / 2);
    grow.add(a.mesh, b.mesh);
    pickables.push(a.mesh, b.mesh); a.mesh.userData.bld = b.mesh.userData.bld = root;
    const ga = new THREE.Group(); ga.position.x = a.mesh.position.x; grow.add(ga);
    roofKit(ga, mainW, v.d, a.H);
    const gb = new THREE.Group(); gb.position.copy(b.mesh.position); grow.add(gb);
    roofKit(gb, wingW, wingD, b.H, { parapet: true });
    // 首层玻璃
    const lob = new THREE.Mesh(new THREE.BoxGeometry(mainW + 0.3, 3.4, v.d + 0.3), M.glass);
    lob.position.set(a.mesh.position.x, 1.7, 0); grow.add(lob);
    // 庭院小树
    const [cx, cz] = [at[0], at[1]];
    const off = [v.w / 2 - wingW / 2, v.d / 2 - (v.d - wingD) / 2];
    const ca = Math.cos(GRID_ANGLE), sa = Math.sin(GRID_ANGLE);
    treeSpots.push({ p: [cx + off[0] * ca + off[1] * sa, cz - off[0] * sa + off[1] * ca], s: 0.65, kind: 1, force: true });
    root.userData.height = a.H;
  });

  // ── 周边建筑（卫星图描摹，浅色概念体量）──
  const context = new THREE.Group(); world.add(context);
  const ctxMat = { blue: M.ctxBlue, gray: M.ctxGray };
  const ctxBox = (x, z, w, d, h, a, mat = M.ctx) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [mat, mat, M.roof, M.roof, mat, mat]);
    m.position.set(x, h / 2, z); m.rotation.y = a; m.castShadow = m.receiveShadow = true;
    context.add(m);
    // 大跨厂房屋面采光带
    if (w * d > 1800) for (let k = -w / 2 + 6; k < w / 2 - 3; k += 9) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, d - 4), M.roofDark);
      s.position.set(x + k * Math.cos(a), h + 0.25, z - k * Math.sin(a)); s.rotation.y = a; context.add(s);
    }
    blockers.rects.push({ c: [x, z], w: w + 4, d: d + 4, a });
  };
  for (const b of CONTEXT_BLOCKS) {
    const mat = ctxMat[b.c] || M.ctx;
    if (b.r) {
      const [x0, z0] = P(b.r[0], b.r[1]), [x1, z1] = P(b.r[2], b.r[3]);
      ctxBox((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, b.h, 0, mat);
    } else {
      const [x, z] = P(...b.at);
      ctxBox(x, z, b.w, b.d, b.h, b.a, mat);
    }
  }
  labels.push({ text: '天宁智能制造产业园', kind: 'place', pos: V3(...insertY(P(-60, 440), 18)) });
  labels.push({ text: '宁沪高速常州管理处', kind: 'place', pos: V3(...insertY(P(1430, -40), 18)) });
  // 壹网球俱乐部（卫星图：创客路南侧，粉色场地 + 蓝色球场）
  {
    const [x, z] = P(694, 1100), a = 0.45;
    const rect = (w, d, ox, oz) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
      .map(([u, v]) => [x + (u + ox) * Math.cos(a) + (v + oz) * Math.sin(a), z - (u + ox) * Math.sin(a) + (v + oz) * Math.cos(a)]);
    context.add(flatPoly(rect(66, 30, 0, 0), 0.5, M.courtLine));
    for (const ox of [-24, -8, 8, 24]) context.add(flatPoly(rect(11, 24, ox, 0), 0.53, M.court));
    blockers.rects.push({ c: [x, z], w: 70, d: 34, a });
    labels.push({ text: '壹网球俱乐部', kind: 'place', pos: V3(x, 6, z) });
  }

  // ── 树 ──
  const isBlocked = (x, z, pad = 0) => {
    for (const r of blockers.roads) if (distToPolyline(x, z, r.pts) < r.hw + pad) return true;
    for (const r of blockers.water) if (distToPolyline(x, z, r.pts) < r.hw + pad) return true;
    for (const b of blockers.rects) {
      const dx = x - b.c[0], dz = z - b.c[1];
      const ca = Math.cos(b.a), sa = Math.sin(b.a);
      const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
      if (Math.abs(lx) < b.w / 2 + pad && Math.abs(lz) < b.d / 2 + pad) return true;
    }
    return false;
  };
  // 行道树
  const rowTrees = (pts, off, step, s = 1, kind = 0) => {
    const line = densify(pts, 2);
    for (const side of [-1, 1]) {
      const o = offsetLine(line, off * side);
      let acc = 0;
      for (let i = 1; i < o.length; i++) {
        acc += len2(sub2(o[i], o[i - 1]));
        if (acc >= step) { acc = 0; treeSpots.push({ p: o[i], s: s * (0.85 + rand() * 0.3), kind }); }
      }
    }
  };
  rowTrees(ck, 23, 11, 1.1);
  rowTrees(hy, 16, 11);
  rowTrees(hehai, 19.5, 11, 1.1);
  rowTrees(offsetLine(qa, -FRONTAGE), 15.5, 11);
  rowTrees(offsetLine(qa, FRONTAGE), 15.5, 11);
  rowTrees(river, 28, 10, 1.1);
  for (const b of branches) rowTrees(b, 18, 10);
  for (const r of PARK_ROADS) rowTrees(r.pts.map(p => G(...p)), r.w * PX / 2 + 2.2, 9, 0.75, 1);
  for (const r of NORTH_ROADS) rowTrees(smooth(r.pts.map(p => P(...p)), 6), r.w * PX / 2 + 2.2, 9, 0.75, 1);
  // 园区内散植
  for (let i = 0; i < 900; i++) {
    const x = px0 + rand() * pw, z = pz0 + rand() * pd;
    if (!pointInPoly(x, z, BOUNDARY)) continue;
    treeSpots.push({ p: [x, z], s: 0.6 + rand() * 0.35, kind: 1 });
  }
  // 片林（卫星图）：按面积均匀撒点，约 1 株 / 48 ㎡
  for (const f of FORESTS) {
    const poly = f.map(p => P(...p));
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const n = Math.floor((x1 - x0) * (z1 - z0) / 48);
    for (let i = 0; i < n; i++) {
      const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
      if (!pointInPoly(x, z, poly) || pointInPoly(x, z, BOUNDARY)) continue;
      treeSpots.push({ p: [x, z], s: 1.05 + rand() * 0.55, kind: 0 });
    }
  }
  // 零星树丛
  for (let c = 0; c < 30; c++) {
    const cx = px0 + rand() * pw, cz = pz0 + rand() * pd, r = 12 + rand() * 25, n = 5 + Math.floor(rand() * 12);
    if (pointInPoly(cx, cz, BOUNDARY)) continue;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
      treeSpots.push({ p: [cx + Math.cos(a) * d, cz + Math.sin(a) * d], s: 1 + rand() * 0.5, kind: 0 });
    }
  }

  const finalTrees = treeSpots.filter(t => inPlate(t.p[0], t.p[1], 3) && (t.force || !isBlocked(t.p[0], t.p[1], 1.5)));
  const trees = buildTrees(finalTrees);
  world.add(trees.group);

  // ── 车辆 ──
  // 双向单车道小路（带 offset）若有端点落在沙盘内部，改为往返：开到尽头掉头沿对侧返回，不在路中凭空消失
  for (const c of carPaths) {
    if (!c.offset || (!inPlate(...c.pts[0], 25) && !inPlate(...c.pts.at(-1), 25))) continue;
    c.pts = [...c.pts, ...c.pts.slice(0, -1).reverse()];
    if (c.ys) c.ys = [...c.ys, ...c.ys.slice(0, -1).reverse()];
  }
  const cars = buildCars(carPaths);
  world.add(cars.group);

  // ── 路灯（夜景发光点）──
  const lamps = buildLamps(lampSpots.filter(p => inPlate(p.x, p.z, 3)));
  world.add(lamps);


  return {
    world, park, buildings, labels, pickables, trees, cars, lamps, plateRect,
    materials: { M, water, roadMats },
    fountain: park.children.find(o => o.userData.fountain),
  };
}

function insertY([x, z], y) { return [x, y, z]; }

// ───────────────────────── 树 ─────────────────────────
function buildTrees(spots) {
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
function buildCars(paths) {
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
let _glow;
function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,240,210,.8)'); g.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}
function buildLamps(spots) {
  const g = new THREE.BufferGeometry().setFromPoints(spots);
  const mat = new THREE.PointsMaterial({ size: 9, map: glowTexture(), color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  return new THREE.Points(g, mat);
}
