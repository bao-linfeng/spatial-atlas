import * as THREE from 'three';
import { ribbon, flatPoly } from '../geom.js';

// 沙盘底座 + 农田 / 绿地底色（色块朝向随园区路网）
export function buildPlate(ctx, { fields = 70 } = {}) {
  const { world, M, rand, gridAngle } = ctx;
  const { x0: px0, x1: px1, z0: pz0, z1: pz1 } = ctx.plate;
  const pw = px1 - px0, pd = pz1 - pz0;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(pw, 8, pd),
    [M.plateSide, M.plateSide, M.plate, M.plateSide, M.plateSide, M.plateSide]);
  plate.position.set((px0 + px1) / 2, -4, (pz0 + pz1) / 2);
  plate.receiveShadow = true;
  world.add(plate);

  for (let i = 0; i < fields; i++) {
    const cx = px0 + rand() * pw, cz = pz0 + rand() * pd;
    const w = 40 + rand() * 110, d = 30 + rand() * 80, a = gridAngle + (rand() - 0.5) * 0.5;
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [
      Math.min(px1, Math.max(px0, cx + x * Math.cos(a) + z * Math.sin(a))),
      Math.min(pz1, Math.max(pz0, cz - x * Math.sin(a) + z * Math.cos(a))),
    ]);
    world.add(flatPoly(pts, 0.02 + i * 0.004, M.field[i % M.field.length]));
  }
}

// 河道：lines 为 [[折线, 水面宽 m], ...]，两侧各留 6 m 河岸
export function buildRivers(ctx, lines) {
  const { world, M, water, blockers } = ctx;
  for (const [line, w] of lines) {
    const bank = new THREE.Mesh(ribbon(line, w + 12, 0.45), M.bank); bank.receiveShadow = true; world.add(bank);
    const wm = new THREE.Mesh(ribbon(line, w, 0.6, 60), water); wm.receiveShadow = true; world.add(wm);
    blockers.water.push({ pts: line, hw: w / 2 + 7 });
  }
}

// 池塘：多边形水面，按外接矩形避让
export function buildPonds(ctx, ponds) {
  const { world, water, blockers } = ctx;
  for (const pond of ponds) {
    world.add(flatPoly(pond, 0.6, water));
    const xs = pond.map(p => p[0]), zs = pond.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    blockers.rects.push({ c: [(x0 + x1) / 2, (z0 + z1) / 2], w: x1 - x0 + 4, d: z1 - z0 + 4, a: 0 });
  }
}
