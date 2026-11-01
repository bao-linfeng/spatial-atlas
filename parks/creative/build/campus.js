import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, flatPoly } from '../../../core/geom.js';
import { placeBuilding } from '../../../core/kit/buildings.js';
import { facadeMaterial, signTexture } from '../../../core/textures.js';
import { TILE_W, wallGeometry, roofGeometry, steps } from './prism.js';
import { PARK_LOT, F_LOT, PARK_BUILDINGS, F_BLOCKS } from '../layout.js';

const FLOOR_H = 4;   // 办公楼层高 m（立面贴图一层的高度）

// 外轮廓上法向满足 ok(n)、最长的一条边：{ mid, ang, len, a, b }（ang 为使平面 +z 朝外的 rotation.y）
function face(poly, ok) {
  let best = null;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    for (const n of [[-dz / len, dx / len], [dz / len, -dx / len]]) {
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (ok(n) && (!best || len > best.len) && !inside([mid[0] + n[0], mid[1] + n[1]], poly)) best = { mid, ang: Math.atan2(n[0], n[1]), len, a, b, n };
    }
  });
  return best;
}
// 屋面构架（A 座）：轮廓的定向外接矩形内收 inset，周边一圈加 cols × rows 网格的白色梁，梁宽 bw、高 bh
function roofFrame(poly, y, { cols, rows, inset = 0.6, bw = 1.1, bh = 3.6 }) {
  const e = face(poly, () => true), u = [(e.b[0] - e.a[0]) / e.len, (e.b[1] - e.a[1]) / e.len], v = [-u[1], u[0]];
  const pu = poly.map(p => p[0] * u[0] + p[1] * u[1]), pv = poly.map(p => p[0] * v[0] + p[1] * v[1]);
  const u0 = Math.min(...pu) + inset, u1 = Math.max(...pu) - inset, v0 = Math.min(...pv) + inset, v1 = Math.max(...pv) - inset;
  const geos = [], ang = Math.atan2(-u[1], u[0]);
  const beam = (uc, vc, lu, lv) => {
    const g = new THREE.BoxGeometry(lu, bh, lv);
    g.rotateY(ang);
    g.translate(u[0] * uc + v[0] * vc, y + bh / 2, u[1] * uc + v[1] * vc);
    geos.push(g);
  };
  for (let k = 0; k <= cols; k++) beam(u0 + (u1 - u0) * k / cols, (v0 + v1) / 2, bw, v1 - v0);
  for (let k = 0; k <= rows; k++) beam((u0 + u1) / 2, v0 + (v1 - v0) * k / rows, u1 - u0, bw);
  return mergeGeometries(geos);
}
function inside([x, z], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// 由百度轮廓挤出的园区楼：各部分（可退台）的外墙铺立面、白色平屋面；整栋登记为一个可点选建筑
function parkBuilding(ctx, b) {
  const { M } = ctx;
  const all = b.parts.flatMap(p => p.poly), xs = all.map(p => p[0]), zs = all.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const c = [(x0 + x1) / 2, (z0 + z1) / 2];
  const rec = { id: b.id, name: b.name, info: b.info, f: b.f, w: x1 - x0, d: z1 - z0 };
  const { root, grow } = placeBuilding(ctx, rec, c, 0);
  const rel = poly => poly.map(([x, z]) => [x - c[0], z - c[1]]);
  let H = 0;
  for (const p of b.parts) {
    const style = p.style || b.style, floorH = p.floorH || FLOOR_H;
    const pieces = Array.isArray(p.h) ? steps(rel(p.poly), p.dir, p.steps, p.h[0], p.h[1]) : [{ poly: rel(p.poly), h: p.h }];
    for (const s of pieces) {
      const top = s.h - (p.crown || 0);   // crown：顶部一圈白色实墙的高度
      const meshes = [new THREE.Mesh(wallGeometry(s.poly, 0, top, floorH), facadeMaterial(style, TILE_W, 8)), new THREE.Mesh(roofGeometry(s.poly, s.h), M.roof)];
      if (p.crown) meshes.push(new THREE.Mesh(wallGeometry(s.poly, top, s.h, floorH), M.white));
      if (p.frame) meshes.push(new THREE.Mesh(roofFrame(s.poly, s.h, p.frame), M.white));
      for (const m of meshes) { m.castShadow = m.receiveShadow = true; m.userData.bld = root; grow.add(m); ctx.pickables.push(m); }
      H = Math.max(H, s.h + (p.frame ? 3.6 : 0));
    }
    // core：东端整面白色实墙（核心筒），高出屋面 4 m，顶上一个设备百叶间
    if (p.core) {
      const e = face(rel(p.poly), n => n[0] > 0.5), t = 2.4, wd = e.len + 1.2;
      const core = new THREE.Mesh(new THREE.BoxGeometry(wd, p.h + 4, t), M.white);
      core.rotation.y = e.ang; core.position.set(e.mid[0] - e.n[0] * (t / 2 - 0.4), (p.h + 4) / 2, e.mid[1] - e.n[1] * (t / 2 - 0.4));
      const box = new THREE.Mesh(new THREE.BoxGeometry(e.len * 0.7, 4.5, 7), M.concreteDark);
      box.rotation.y = e.ang; box.position.set(e.mid[0] - e.n[0] * 6, p.h + 2.25, e.mid[1] - e.n[1] * 6);
      for (const m of [core, box]) { m.castShadow = m.receiveShadow = true; m.userData.bld = root; grow.add(m); }
      ctx.pickables.push(core);
    }
  }
  // 楼顶标识（B 座「常州创意」）：红字挂在顶部白色实墙朝南的长边上
  if (b.sign) {
    const top = b.parts[0], h = Array.isArray(top.h) ? top.h[1] : top.h, crown = top.crown || 8;
    const f = face(rel(top.poly), n => n[1] > 0.3), sw = Math.min(f.len * 0.62, crown * 4.4);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw / 4), new THREE.MeshBasicMaterial({ map: signTexture(ctx.sign), transparent: true, toneMapped: false }));
    sign.position.set(f.mid[0] + f.n[0] * 0.25, h - crown / 2, f.mid[1] + f.n[1] * 0.25); sign.rotation.y = f.ang; grow.add(sign);
  }
  root.userData.height = H;
  ctx.labels.push({ text: b.id, sub: b.name, kind: 'building', bld: root, pos: V3(c[0], H + 10, c[1]) });
}

// 圆角矩形（局部坐标，中心为原点），每个圆角 seg 段
function rounded(w, d, r, seg = 6) {
  const pts = [];
  for (const [cx, cz, a0] of [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, Math.PI / 2], [-w / 2 + r, -d / 2 + r, Math.PI], [w / 2 - r, -d / 2 + r, Math.PI * 1.5]]) {
    for (let k = 0; k <= seg; k++) { const t = a0 + (k / seg) * Math.PI / 2; pts.push([cx + Math.cos(t) * r, cz + Math.sin(t) * r]); }
  }
  return pts;
}

// F 座：玻璃幕墙体量 + 外挑的白色弧边屋盖（倒角挤出），中、南楼屋面有采光天井
function fBlock(ctx, f) {
  const { M } = ctx;
  const { root, grow } = placeBuilding(ctx, f, f.pos, f.a);
  const body = rounded(f.w - 3, f.d - 3, f.r - 1.5);
  const wall = new THREE.Mesh(wallGeometry(body, 0, f.h - 2, 4.2), facadeMaterial('podium', TILE_W, 8));
  wall.castShadow = wall.receiveShadow = true; wall.userData.bld = root; grow.add(wall); ctx.pickables.push(wall);
  const shape = new THREE.Shape();
  rounded(f.w - 4, f.d - 4, f.r - 2).forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  const lid = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 2, bevelSegments: 4, curveSegments: 8 }), M.white);
  lid.rotation.x = -Math.PI / 2; lid.position.y = f.h - 2.4; lid.castShadow = lid.receiveShadow = true; lid.userData.bld = root;
  grow.add(lid); ctx.pickables.push(lid);
  if (f.id !== 'F1') {
    const well = new THREE.Mesh(new THREE.PlaneGeometry(f.w * 0.32, f.d * 0.38), M.glass);
    well.rotation.x = -Math.PI / 2; well.position.set(f.w * 0.08, f.h + 0.45, 0); grow.add(well);
  }
  root.userData.height = f.h;
  ctx.labels.push({ text: f.id, sub: f.name, kind: 'building', bld: root, pos: V3(f.pos[0], f.h + 10, f.pos[1]) });
}

// 园区：地块铺装、A–E 座（百度轮廓挤出，按航拍退台）、F 座三栋
export function buildCampus(ctx) {
  const { M } = ctx;
  const park = ctx.addGroup('park');
  park.add(flatPoly(PARK_LOT, 0.4, M.paving));
  park.add(flatPoly(F_LOT, 0.4, M.paving));
  for (const b of PARK_BUILDINGS) parkBuilding(ctx, b);
  for (const f of F_BLOCKS) fBlock(ctx, f);
}
