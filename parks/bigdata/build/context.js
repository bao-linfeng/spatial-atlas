import * as THREE from 'three';
import { V3, insertY, flatPoly, pointInPoly } from '../../../core/geom.js';
import { makeBlock, roofKit, contextBox } from '../../../core/kit/buildings.js';
import { isBlocked } from '../../../core/kit/scatter.js';
import { GRID_ANGLE, GREENS, CONTEXT_TOWERS, CONTEXT_BLOCKS, RES_ZONES, PLACES } from '../layout.js';

const RES_FLOOR = 3;   // 住宅层高 m

// 绿地底色（白鹤河公园、运河绿带、慧园）
export function buildGreens(ctx) {
  GREENS.forEach((g, i) => ctx.world.add(flatPoly(g, 0.34 + i * 0.01, i % 2 ? ctx.M.lawn : ctx.M.lawnLight)));
}

// 周边：高层白楼、多层与厂房体量
export function buildContext(ctx) {
  const { M } = ctx;
  const context = ctx.addGroup('context');
  for (const t of CONTEXT_TOWERS) {
    const a = t.a ?? GRID_ANGLE;
    const g = new THREE.Group(); g.position.set(t.pos[0], 0, t.pos[1]); g.rotation.y = a; context.add(g);
    const b = makeBlock(ctx, { w: t.w, d: t.d, f: t.f, style: 'punch' });
    g.add(b.mesh);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(t.w + 0.6, 1.6, t.d + 0.6), M.white);
    crown.position.y = b.H + 0.8; g.add(crown);
    roofKit(ctx, g, t.w, t.d, b.H, { solar: true });
    ctx.blockers.rects.push({ c: t.pos, w: t.w + 6, d: t.d + 6, a });
    ctx.place(t.name, V3(t.pos[0], b.H + 14, t.pos[1]));
  }
  const mat = { blue: M.ctxBlue, gray: M.ctxGray };
  for (const b of CONTEXT_BLOCKS) contextBox(ctx, b.pos[0], b.pos[1], b.w, b.d, b.h, b.a ?? GRID_ANGLE, mat[b.c] || M.ctx);
}

// 住宅片区：在多边形内逐行排布条式住宅，避开道路、河道与已登记的建筑（须在路网与建筑之后调用）
export function buildHousing(ctx) {
  const { rand } = ctx;
  for (const z of RES_ZONES) {
    const ca = Math.cos(z.a), sa = Math.sin(z.a);
    const toW = (u, v) => [u * ca + v * sa, -u * sa + v * ca];           // 局部 (u 沿楼长, v 垂直) → 场景米
    const uv = z.pts.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca]);
    const us = uv.map(p => p[0]), vs = uv.map(p => p[1]);
    const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    for (let v = v0 + z.d / 2 + rand() * z.gap * 0.5; v < v1 - z.d / 2; v += z.gap) {
      for (let u = u0 + rand() * 12; u < u1;) {
        const L = z.len[0] + rand() * (z.len[1] - z.len[0]);
        const c = toW(u + L / 2, v);
        const corners = [[-L / 2, -z.d / 2], [L / 2, -z.d / 2], [L / 2, z.d / 2], [-L / 2, z.d / 2]].map(([du, dv]) => toW(u + L / 2 + du, v + dv));
        const ok = [c, ...corners].every(p => pointInPoly(p[0], p[1], z.pts) && !isBlocked(ctx, p[0], p[1], 1.5));
        if (ok) {
          const f = z.f[0] + Math.floor(rand() * (z.f[1] - z.f[0] + 1));
          const b = makeBlock(ctx, { w: L, d: z.d, f, style: 'slab', floorH: RES_FLOOR });
          b.mesh.position.set(c[0], 0, c[1]); b.mesh.rotation.y = z.a; ctx.context.add(b.mesh);
          ctx.blockers.rects.push({ c, w: L + 4, d: z.d + 4, a: z.a });
          u += L + 7 + rand() * 9;
        } else u += 6;
      }
    }
  }
  for (const p of PLACES) ctx.place(p.text, V3(...insertY(p.pos, 22)));
}
