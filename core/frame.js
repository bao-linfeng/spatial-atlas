// 坐标系：底图像素 → 场景米（x 向东，z 向南）。不依赖 three.js，Node 脚本也可导入。
// origin：场景原点对应的底图像素；scale：每像素米数；axis：园区路网主方向的单位向量 [cos, sin]（像素坐标系）。
export function createFrame({ origin = [0, 0], scale = 1, axis = [1, 0] } = {}) {
  const [C, S] = axis;
  // 底图像素 → 场景米
  const P = (x, y) => [(x - origin[0]) * scale, (y - origin[1]) * scale];
  // 园区网格坐标（u 沿主路，v 垂直主路，单位：像素）→ 场景米
  const G = (u, v) => P(origin[0] + u * C + v * S, origin[1] - u * S + v * C);
  return { PX: scale, P, G, GRID_ANGLE: Math.atan2(S, C) };
}
