// 车流检查（tools/jump.html 与 tools/regress.mjs 共用）：车辆按 0.05 s 步进 frames 帧，统计沙盘内部（离边缘 25 m 以外）
// 的异常，按类别各自计数，键为 20 m 网格的场景坐标 "x,z"：
//   jump：单帧位移 > 6 m，车道首尾回绕或拼接断开（车在路中凭空消失 / 出现）
//   hop： 单帧位移 2.5–6 m，往返车道在尽头横移到对侧、拼接点错位
//   flip：单帧转向 > 100°，原地调头
// 正常行驶单帧位移不超过 2 m（最高车速约 39 m/s），转向不超过二十余度。分类与对应修法见 CLAUDE.md「车流」一节
export function checkCars(W, frames = 6000) {
  const { cars, plateRect: r } = W, body = cars.group.children[0], a = body.instanceMatrix.array;
  const n = body.count, prev = new Float32Array(n * 4), out = { jump: {}, hop: {}, flip: {} };
  const snap = () => { for (let i = 0; i < n; i++) prev.set([a[i * 16 + 12], a[i * 16 + 14], a[i * 16 + 8], a[i * 16 + 10]], i * 4); };
  const edge = (x, z) => Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z) < 25;
  const hit = (kind, pts) => {
    for (const [x, z] of pts) if (!edge(x, z)) {
      const key = `${Math.round(x / 20) * 20},${Math.round(z / 20) * 20}`;
      out[kind][key] = (out[kind][key] || 0) + 1;
    }
  };
  snap();
  for (let k = 0; k < frames; k++) {
    cars.update(0.05);
    for (let i = 0; i < n; i++) {
      const [x0, z0, fx0, fz0] = prev.subarray(i * 4, i * 4 + 4), x1 = a[i * 16 + 12], z1 = a[i * 16 + 14];
      const d = Math.hypot(x1 - x0, z1 - z0);
      if (d > 6) hit('jump', [[x0, z0], [x1, z1]]);
      else if (d > 2.5) hit('hop', [[x1, z1]]);
      else if (fx0 * a[i * 16 + 8] + fz0 * a[i * 16 + 10] < Math.cos(100 / 180 * Math.PI)) hit('flip', [[x1, z1]]);
    }
    snap();
  }
  return out;
}
