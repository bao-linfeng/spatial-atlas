import { V3, insertY, smooth, flatPoly } from '../../../core/geom.js';
import { buildRivers, buildPonds } from '../../../core/kit/ground.js';
import { contextBox } from '../../../core/kit/buildings.js';
import { P, RIVER, RIVER_BRANCHES, PONDS, CONTEXT_BLOCKS } from '../layout.js';

// 北塘河及支流、池塘。返回平滑后的河道中线（行道树、跨河桥要用）。
export function buildWater(ctx) {
  const river = smooth(RIVER, 6), branches = RIVER_BRANCHES.map(l => smooth(l, 6));
  buildRivers(ctx, [[river, 40], ...branches.map(b => [b, 20])]);
  buildPonds(ctx, PONDS);
  ctx.place('北塘河', V3(...insertY(river[Math.floor(river.length * 0.55)], 2)));
  return { river, branches };
}

// 周边建筑（卫星图描摹，浅色概念体量）、周边地名、壹网球俱乐部
export function buildContext(ctx) {
  const { M } = ctx;
  const context = ctx.addGroup('context');
  const ctxMat = { blue: M.ctxBlue, gray: M.ctxGray };
  for (const b of CONTEXT_BLOCKS) {
    const mat = ctxMat[b.c] || M.ctx;
    if (b.r) {
      const [x0, z0] = P(b.r[0], b.r[1]), [x1, z1] = P(b.r[2], b.r[3]);
      contextBox(ctx, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, b.h, 0, mat);
    } else {
      const [x, z] = P(...b.at);
      contextBox(ctx, x, z, b.w, b.d, b.h, b.a, mat);
    }
  }
  ctx.place('天宁智能制造产业园', V3(...insertY(P(-60, 440), 18)));
  ctx.place('宁沪高速常州管理处', V3(...insertY(P(1430, -40), 18)));
  // 壹网球俱乐部（卫星图：创客路南侧，粉色场地 + 蓝色球场）
  {
    const [x, z] = P(694, 1100), a = 0.45;
    const rect = (w, d, ox, oz) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
      .map(([u, v]) => [x + (u + ox) * Math.cos(a) + (v + oz) * Math.sin(a), z - (u + ox) * Math.sin(a) + (v + oz) * Math.cos(a)]);
    context.add(flatPoly(rect(66, 30, 0, 0), 0.5, M.courtLine));
    for (const ox of [-24, -8, 8, 24]) context.add(flatPoly(rect(11, 24, ox, 0), 0.53, M.court));
    ctx.blockers.rects.push({ c: [x, z], w: 70, d: 34, a });
    ctx.place('壹网球俱乐部', V3(x, 6, z));
  }
}
