import { smooth, offsetLine } from '../../../core/geom.js';
import { rowTrees, scatterTrees, forest, clusters } from '../../../core/kit/scatter.js';
import { FRONTAGE, BOUNDARY, FORESTS, PARK_ROADS, NORTH_ROADS } from '../layout.js';

// 行道树、园区散植、片林（卫星图）、零星树丛。lines 为 buildWater / buildRoads 返回的中线。
export function plantTrees(ctx, { river, branches, qa, ck, hy, hehai }) {
  rowTrees(ctx, ck, 23, 11, 1.1);
  rowTrees(ctx, hy, 16, 11);
  rowTrees(ctx, hehai, 19.5, 11, 1.1);
  rowTrees(ctx, offsetLine(qa, -FRONTAGE), 15.5, 11);
  rowTrees(ctx, offsetLine(qa, FRONTAGE), 15.5, 11);
  rowTrees(ctx, river, 28, 10, 1.1);
  for (const b of branches) rowTrees(ctx, b, 18, 10);
  for (const r of PARK_ROADS) rowTrees(ctx, r.pts, r.w / 2 + 2.2, 9, 0.75, 1);
  for (const r of NORTH_ROADS) rowTrees(ctx, smooth(r.pts, 6), r.w / 2 + 2.2, 9, 0.75, 1);
  scatterTrees(ctx, BOUNDARY, 900);
  // 片林约 1 株 / 48 ㎡，园区红线内不种
  for (const f of FORESTS) forest(ctx, f, { exclude: BOUNDARY });
  clusters(ctx, { count: 30, exclude: BOUNDARY });
}
