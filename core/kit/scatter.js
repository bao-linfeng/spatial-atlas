import { sub2, len2, densify, offsetLine, pointInPoly, distToPolyline } from '../geom.js';

// 树点 kind：0 片林大树，1 园区小乔木。最终由 finalize() 统一过滤沙盘外和避让区内的点。

// 是否落在道路、河道或建筑等避让区内
export function isBlocked(ctx, x, z, pad = 0) {
  const { blockers } = ctx;
  for (const r of blockers.roads) if (distToPolyline(x, z, r.pts) < r.hw + pad) return true;
  for (const r of blockers.water) if (distToPolyline(x, z, r.pts) < r.hw + pad) return true;
  for (const b of blockers.rects) {
    const dx = x - b.c[0], dz = z - b.c[1];
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
    if (Math.abs(lx) < b.w / 2 + pad && Math.abs(lz) < b.d / 2 + pad) return true;
  }
  return false;
}

// 行道树：沿折线两侧各偏移 off 米，每 step 米一株
export function rowTrees(ctx, pts, off, step, s = 1, kind = 0) {
  const line = densify(pts, 2);
  for (const side of [-1, 1]) {
    const o = offsetLine(line, off * side);
    let acc = 0;
    for (let i = 1; i < o.length; i++) {
      acc += len2(sub2(o[i], o[i - 1]));
      if (acc >= step) { acc = 0; ctx.treeSpots.push({ p: o[i], s: s * (0.85 + ctx.rand() * 0.3), kind }); }
    }
  }
}

// 散植：在整个沙盘内均匀抽样 count 个点，保留落在 poly 内的
export function scatterTrees(ctx, poly, count) {
  const { rand } = ctx, { x0, x1, z0, z1 } = ctx.plate, pw = x1 - x0, pd = z1 - z0;
  for (let i = 0; i < count; i++) {
    const x = x0 + rand() * pw, z = z0 + rand() * pd;
    if (!pointInPoly(x, z, poly)) continue;
    ctx.treeSpots.push({ p: [x, z], s: 0.6 + rand() * 0.35, kind: 1 });
  }
}

// 片林：按面积均匀撒点，每 density ㎡ 约一株；exclude 多边形内不种（如园区红线）
export function forest(ctx, poly, { exclude, density = 48 } = {}) {
  const { rand } = ctx;
  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const n = Math.floor((x1 - x0) * (z1 - z0) / density);
  for (let i = 0; i < n; i++) {
    const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
    if (!pointInPoly(x, z, poly) || (exclude && pointInPoly(x, z, exclude))) continue;
    ctx.treeSpots.push({ p: [x, z], s: 1.05 + rand() * 0.55, kind: 0 });
  }
}

// 零星树丛：沙盘内随机 count 处，每处 5–16 株；中心落在 exclude 内的跳过
export function clusters(ctx, { count = 30, exclude } = {}) {
  const { rand } = ctx, { x0, x1, z0, z1 } = ctx.plate, pw = x1 - x0, pd = z1 - z0;
  for (let c = 0; c < count; c++) {
    const cx = x0 + rand() * pw, cz = z0 + rand() * pd, r = 12 + rand() * 25, n = 5 + Math.floor(rand() * 12);
    if (exclude && pointInPoly(cx, cz, exclude)) continue;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
      ctx.treeSpots.push({ p: [cx + Math.cos(a) * d, cz + Math.sin(a) * d], s: 1 + rand() * 0.5, kind: 0 });
    }
  }
}
