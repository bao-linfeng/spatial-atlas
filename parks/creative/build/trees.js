import { pointInPoly } from '../../../core/geom.js';
import { rowTrees, scatterTrees, forest } from '../../../core/kit/scatter.js';
import { TAIHU_W, HUXI_W, QINGFENG_W, WUSHAN_W, HUXING_W, LONGCANG_W, PARK_LOT, F_LOT, WATERS, GREENS, LOCAL_ROADS } from '../layout.js';

// 行道树、岸边树、绿地片林、园区散植。lines 为 buildWater / buildRoads 返回的中线与岸线。
export function plantTrees(ctx, { shores, taihu, huxi, qingfeng, wushanN, wushanS, huxing, longcang, locals }) {
  rowTrees(ctx, taihu, TAIHU_W / 2 + 4, 10, 1.1);
  rowTrees(ctx, huxi, HUXI_W / 2 + 3.5, 10);
  rowTrees(ctx, qingfeng, QINGFENG_W / 2 + 3.5, 10);
  for (const l of [wushanN, wushanS]) rowTrees(ctx, l, WUSHAN_W / 2 + 3.5, 10);
  rowTrees(ctx, huxing, HUXING_W / 2 + 3.5, 10);
  rowTrees(ctx, longcang, LONGCANG_W / 2 + 3.5, 10);
  locals.forEach((l, i) => rowTrees(ctx, l, LOCAL_ROADS[i].w / 2 + 3, 11, 0.8, 1));
  for (const s of shores) rowTrees(ctx, s, 8, 9, 1.05);   // 水面一侧的点由末尾剔除
  for (const g of GREENS) forest(ctx, g, { density: 110 });
  scatterTrees(ctx, PARK_LOT, 900);
  scatterTrees(ctx, F_LOT, 300);
  // 水面以多边形登记，避让表只认折线和矩形，这里直接剔除落在水里的树
  ctx.treeSpots = ctx.treeSpots.filter(t => !WATERS.some(w => pointInPoly(t.p[0], t.p[1], w)));
}
