import { rowTrees, scatterTrees, forest, clusters } from '../../../core/kit/scatter.js';
import { YULONG_W, SERVICE, CANAL_W, BAIHE_W, PARK_LOT, FORESTS, RES_ZONES, PARK_ROADS } from '../layout.js';

// 行道树、园区散植、成片乔木（卫星图）、住宅区庭院树。lines 为 buildWater / buildRoads 返回的中线。
export function plantTrees(ctx, { canal, baihe, yl, yulan, yunhe, yinxing, dzw, dze, locals }) {
  // 玉龙南路：主辅路之间的隔离带 + 外侧人行道
  rowTrees(ctx, yl, (YULONG_W / 2 + SERVICE.off - SERVICE.w / 2) / 2, 9, 1.0);
  rowTrees(ctx, yl, SERVICE.off + SERVICE.w / 2 + 2, 10, 1.1);
  rowTrees(ctx, yulan, 12.5, 10, 1.05);
  rowTrees(ctx, yunhe, 14.5, 10, 1.05);
  rowTrees(ctx, yinxing, 11.5, 10);
  rowTrees(ctx, dzw, 9.5, 10);
  rowTrees(ctx, dze, 9.5, 10);
  for (const l of locals) rowTrees(ctx, l, 6.5, 11, 0.8, 1);
  rowTrees(ctx, canal, CANAL_W / 2 + 8.5, 8, 1.15);
  rowTrees(ctx, baihe, BAIHE_W / 2 + 7, 9, 1.1);
  for (const r of PARK_ROADS) rowTrees(ctx, r.pts, r.w / 2 + 2.2, 9, 0.75, 1);
  scatterTrees(ctx, PARK_LOT, 700);
  for (const f of FORESTS) forest(ctx, f.poly, { density: f.density });
  // 住宅区庭院与宅间绿地（楼栋已登记为避让区，树只落在空地上）
  for (const z of RES_ZONES) scatterTrees(ctx, z.pts, 2600);
  clusters(ctx, { count: 18, exclude: PARK_LOT });
}
