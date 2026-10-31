import * as THREE from 'three';
import { V3, polyIntersect } from '../../../core/geom.js';
import { CANAL_Y } from './water.js';
import { BRIDGE } from '../layout.js';

// 玉新桥：低平三跨板梁桥。依据老百晓集桥 2012 年照片（.research/yuxin-0*.jpg）：
// 灰色石栏板 + 方柱、圆柱桥墩、桥侧一绿一黄两根管线；桥面与两岸路面齐平（运河下沉，见 water.js）。
// road 为玉龙南路中线（场景米），canal 为运河中线；deckY 为桥面（路面）高度
export function buildBridge(ctx, road, canal, deckY) {
  const { world, M } = ctx;
  const hit = polyIntersect(road, canal);
  if (!hit) return;
  const [cx, cz, t] = hit;                   // t：交点所在路段的方向，即桥轴
  const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = Math.atan2(t[0], t[1]);   // 局部 z 沿桥轴，x 横向
  world.add(g); g.updateMatrixWorld(true);
  const { len: L, w: W } = BRIDGE, thick = 1.3, top = deckY - 0.06;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W, thick, L), M.concrete);
  deck.position.y = top - thick / 2; deck.castShadow = deck.receiveShadow = true; g.add(deck);
  // 边梁（外侧略深的立面带）
  for (const s of [-1, 1]) {
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.5, thick + 0.5, L), M.concreteDark);
    fascia.position.set(s * (W / 2 - 0.2), top - (thick + 0.5) / 2, 0); g.add(fascia);
  }
  // 桥墩：两排，跨径约 18 m；每排圆柱 + 盖梁
  const span = L / BRIDGE.spans, bottom = top - thick;
  const colGeo = new THREE.CylinderGeometry(0.65, 0.65, bottom - CANAL_Y + 0.3, 14);
  for (let i = 1; i < BRIDGE.spans; i++) {
    const z = -L / 2 + span * i;
    for (let x = -W / 2 + 3.4; x <= W / 2 - 3.3; x += (W - 6.8) / 6) {
      const c = new THREE.Mesh(colGeo, M.concreteDark);
      c.position.set(x, (bottom + CANAL_Y - 0.3) / 2, z); c.castShadow = true; g.add(c);
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(W - 2, 0.9, 1.8), M.concreteDark);
    cap.position.set(0, bottom - 0.45, z); g.add(cap);
  }
  // 石栏杆：方柱 + 栏板 + 扶手，桥头端柱加高
  const stone = new THREE.MeshStandardMaterial({ color: 0xc8c6bf, roughness: 0.9 });
  const postGeo = new THREE.BoxGeometry(0.45, 1.25, 0.45), endGeo = new THREE.BoxGeometry(0.8, 1.9, 0.8);
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.35);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, L), stone);
    panel.position.set(x, top + 0.45, 0); panel.castShadow = true; g.add(panel);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, L), stone);
    rail.position.set(x, top + 1.0, 0); g.add(rail);
    for (let z = -L / 2; z <= L / 2 + 0.01; z += 2.4) {
      const end = Math.abs(z) > L / 2 - 1;
      const p = new THREE.Mesh(end ? endGeo : postGeo, stone);
      p.position.set(x, top + (end ? 0.95 : 0.62), z); g.add(p);
    }
    // 桥侧管线：一侧绿、一侧黄（2012 年照片）
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, L, 10),
      new THREE.MeshStandardMaterial({ color: s < 0 ? 0x4f8a5b : 0xd2a634, roughness: 0.6 }));
    pipe.rotation.x = Math.PI / 2; pipe.position.set(s * (W / 2 + 0.45), bottom + 0.2, 0); g.add(pipe);
    // 栏杆灯
    for (const z of [-L / 2 + 6, 0, L / 2 - 6]) ctx.lampSpots.push(V3(...g.localToWorld(new THREE.Vector3(x, top + 6, z)).toArray()));
  }
  ctx.blockers.rects.push({ c: [cx, cz], w: W + 6, d: L + 6, a: g.rotation.y });
  ctx.labels.push({ text: BRIDGE.name, kind: 'place', pos: V3(cx, 9, cz) });
}
