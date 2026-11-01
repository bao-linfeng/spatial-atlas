import * as THREE from 'three';
import { mulberry32 } from '../../../core/rng.js';
import { facadeMaterials } from '../../../core/textures.js';

// 屋面贴图：颜色取自百度卫星图 docs/fd8d2620-….png 的屋面取样（9–15 px 均值，避开阴影与树冠）。
// 场景光照会把浅色明显提亮、冲淡，绘制时统一按 TONE 压暗并略增饱和度，使屋面与白色立面拉开层次。
// 贴图按建筑实际尺寸绘制（每米 PPM 像素），铺满体量顶面；颜色烘进贴图、材质本身为白色，登记到 facadeMaterials，白模统一切换。
// 随机细节用按尺寸派生的独立种子，不消耗 core/rng 的任何分流。
const PPM = 6, MAX = 512, TONE = [0.06, -0.07];   // 饱和度、明度偏移

export const ROOF = {
  tower: '#b0a39b',   // 白色塔楼：暖米灰地砖（卫星图 #a99d99–#b8a6a0）
  flat: '#a59d98',    // 裙房、配套、商业、文创楼（#9e9590–#b0aba7）
  house: '#857d77',   // 多层住宅（#807770–#8f847f）
  metal: '#a3a6a7',   // 厂房金属屋面（layout 未给颜色时）
};

const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  return `#${c.offsetHSL(0, 0, k).getHexString()}`;
};

// 地砖：底色 + 逐块明度抖动 + 浅缝
function tiles(g, W, H, base, step, rand, jitter = 0.025) {
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    g.fillStyle = shade(base, (rand() - 0.5) * jitter * 2); g.fillRect(x, y, step, step);
  }
  g.fillStyle = 'rgba(0,0,0,.07)';
  for (let x = 0; x < W; x += step) g.fillRect(x, 0, 1, H);
  for (let y = 0; y < H; y += step) g.fillRect(0, y, W, 1);
}
const rim = (g, W, H, color, t) => { g.strokeStyle = color; g.lineWidth = t; g.strokeRect(t / 2, t / 2, W - t, H - t); };
// 屋面设备：深色箱体，带一道受光边
function gear(g, x, y, w, h, color) {
  g.fillStyle = color; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y, w, Math.max(1, h * 0.15));
}

const DRAW = {
  // 塔楼（卫星图）：浅色女儿墙一圈，内收约 1/5 处一道深色方框，中部核心筒略深并布设备
  tower(g, W, H, base, rand, m) {
    tiles(g, W, H, base, 2.5 * m, rand);
    rim(g, W, H, shade(base, 0.1), 1.1 * m);
    const ix = W * 0.2, iy = H * 0.2;
    g.strokeStyle = shade(base, -0.17); g.lineWidth = 0.8 * m; g.strokeRect(ix, iy, W - 2 * ix, H - 2 * iy);
    const cw = W * 0.36, ch = H * 0.32, cx = (W - cw) / 2 + (rand() - 0.5) * W * 0.08, cy = (H - ch) / 2 + (rand() - 0.5) * H * 0.08;
    g.fillStyle = shade(base, -0.06); g.fillRect(cx, cy, cw, ch);
    for (let i = 0; i < 4; i++) {
      const w = (1.5 + rand() * 3.5) * m, h = (1.5 + rand() * 3) * m;
      gear(g, cx + rand() * (cw - w), cy + rand() * (ch - h), w, h, i % 2 ? '#6f706c' : shade(base, -0.22));
    }
  },
  // 平屋面：地砖 + 浅色檐口 + 零散设备
  flat(g, W, H, base, rand, m) {
    tiles(g, W, H, base, 3 * m, rand);
    rim(g, W, H, shade(base, 0.12), 0.8 * m);
    const n = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const w = (2 + rand() * 4) * m, h = (1.5 + rand() * 3) * m;
      gear(g, 2 * m + rand() * (W - w - 4 * m), 2 * m + rand() * (H - h - 4 * m), w, h, shade(base, -0.2));
    }
  },
  // 住宅：灰色屋面，沿长边每个单元一处楼梯间出屋面
  house(g, W, H, base, rand, m) {
    tiles(g, W, H, base, 2 * m, rand, 0.012);
    rim(g, W, H, shade(base, 0.1), 0.6 * m);
    const units = Math.max(1, Math.round(W / m / 14)), uw = W / units;
    for (let i = 0; i < units; i++) {
      const w = 3 * m, h = 3.6 * m;
      gear(g, uw * (i + 0.5) - w / 2, (H - h) / 2 + (rand() - 0.5) * m, w, h, shade(base, -0.06));
    }
  },
  // 金属屋面（厂房）：沿进深方向的压型板棱线
  metal(g, W, H, base, rand, m) {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += m) { g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x, 0, Math.max(1, m * 0.3), H); }
    g.fillStyle = 'rgba(0,0,0,.08)';
    for (let y = 0; y < H; y += 12 * m) g.fillRect(0, y, W, Math.max(1, m * 0.25));
    rim(g, W, H, shade(base, 0.08), 0.5 * m);
  },
};

const cache = new Map();

// kind：tower | flat | house | metal；w / d 为顶面尺寸（米，w 沿局部 x），color 缺省取 ROOF[kind]
export function roofMaterial(kind, w, d, color = ROOF[kind]) {
  const rw = Math.round(w), rd = Math.round(d), key = `${kind}|${rw}|${rd}|${color}`;
  if (cache.has(key)) return cache.get(key);
  const m = Math.min(PPM, MAX / Math.max(rw, rd));
  const c = document.createElement('canvas');
  c.width = Math.max(16, Math.round(rw * m)); c.height = Math.max(16, Math.round(rd * m));
  const base = `#${new THREE.Color(color).offsetHSL(0, ...TONE).getHexString()}`;
  DRAW[kind](c.getContext('2d'), c.width, c.height, base, mulberry32(hash(key)), m);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.9 });
  facadeMaterials.push(mat);
  cache.set(key, mat);
  return mat;
}

// 盒体材质组：仅顶面（+y）用屋面贴图，其余面为 side
export const capMaterials = (side, roof) => [side, side, roof, side, side, side];
