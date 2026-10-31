// 固定种子随机数（mulberry32），按用途分流：
// 某一处多用或少用了随机数，只影响自己这一路，不会让其他部分的结果整体错位。
export function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// facade 立面贴图 · texture 路面/水面贴图 · world 场景构建 · trees 树 · cars 车辆
export const STREAMS = ['facade', 'texture', 'world', 'trees', 'cars'];
export const rng = {};
export function seedRng(seed) {
  for (const k of STREAMS) rng[k] = mulberry32((seed ^ hash(k)) >>> 0);
}
seedRng(20260724);
