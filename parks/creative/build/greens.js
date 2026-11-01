import { flatPoly } from '../../../core/geom.js';
import { GREENS } from '../layout.js';

// 绿地：矢量图绿地色块铺草坪（深浅两色交替），高于园区铺装、低于人行道和路面
export function buildGreens(ctx) {
  const { world, M } = ctx;
  GREENS.forEach((g, i) => world.add(flatPoly(g, 0.5 + (i % 4) * 0.004, i % 3 ? M.lawn : M.lawnLight)));
}
