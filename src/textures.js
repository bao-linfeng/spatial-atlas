import * as THREE from 'three';
import { rng } from './rng.js';

// 立面贴图：每张贴图 = 8 开间 × 8 层，按建筑尺寸重复。
// 同时生成一张夜景自发光贴图（随机亮灯）。
const BAY = 32, FLOOR = 32, COLS = 8, ROWS = 8;
export const BAY_M = 3.6, FLOOR_M = 4.2;

const rand = () => rng.facade();      // 立面
const noise = () => rng.texture();    // 路面、水面

function makeCanvas(w = BAY * COLS, h = FLOOR * ROWS) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

const lit = () => {
  const r = rand();
  return r < 0.34 ? `hsl(${36 + rand() * 10}, 90%, ${62 + rand() * 18}%)` : r < 0.5 ? '#bcd8ff' : '#000';
};

// 每种立面：draw(ctx, isNight)
const STYLES = {
  // 白色网格框 + 浅灰蓝玻璃（41号楼）
  grid(ctx, night) {
    ctx.fillStyle = night ? '#000' : '#f1f1ec';
    ctx.fillRect(0, 0, BAY * COLS, FLOOR * ROWS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = c * BAY + 4, y = r * FLOOR + 5, w = BAY - 8, h = FLOOR - 9;
      if (night) { ctx.fillStyle = lit(); ctx.fillRect(x, y, w, h); continue; }
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      const l = 52 + rand() * 8;
      g.addColorStop(0, `hsl(200, 14%, ${l + 8}%)`); g.addColorStop(1, `hsl(205, 16%, ${l - 4}%)`);
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + w / 2 - 1, y, 2, h);
    }
  },
  // 深灰玻璃 + 白色竖肋
  fin(ctx, night) {
    ctx.fillStyle = night ? '#000' : '#46525c';
    ctx.fillRect(0, 0, BAY * COLS, FLOOR * ROWS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS * 2; c++) {
      const x = c * BAY / 2, y = r * FLOOR;
      if (night) { ctx.fillStyle = lit(); ctx.fillRect(x + 3, y + 4, BAY / 2 - 6, FLOOR - 7); continue; }
      ctx.fillStyle = `hsl(208, 12%, ${30 + rand() * 9}%)`; ctx.fillRect(x + 2, y + 3, BAY / 2 - 4, FLOOR - 6);
    }
    if (!night) {
      ctx.fillStyle = '#e9ebe8';
      for (let c = 0; c <= COLS * 2; c++) ctx.fillRect(c * BAY / 2 - 1.5, 0, 3, FLOOR * ROWS);
      ctx.fillStyle = '#7d878d';
      for (let r = 0; r <= ROWS; r++) ctx.fillRect(0, r * FLOOR - 1, BAY * COLS, 2);
    }
  },
  // 白色实墙带 + 横向带形窗
  ribbon(ctx, night) {
    ctx.fillStyle = night ? '#000' : '#f2f2ee';
    ctx.fillRect(0, 0, BAY * COLS, FLOOR * ROWS);
    for (let r = 0; r < ROWS; r++) {
      const y = r * FLOOR + 12, h = FLOOR - 14;
      for (let c = 0; c < COLS * 2; c++) {
        const x = c * BAY / 2;
        ctx.fillStyle = night ? lit() : `hsl(205, 14%, ${40 + rand() * 8}%)`;
        ctx.fillRect(x, y, BAY / 2, h);
      }
      if (!night) {
        ctx.fillStyle = '#c9ced0';
        for (let c = 0; c <= COLS * 2; c++) ctx.fillRect(c * BAY / 2 - 0.5, y, 1, h);
      }
    }
  },
  // 沿街研发楼：浅灰墙 + 竖向窗
  slab(ctx, night) {
    ctx.fillStyle = night ? '#000' : '#e6e6e1';
    ctx.fillRect(0, 0, BAY * COLS, FLOOR * ROWS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const x = c * BAY + 3, y = r * FLOOR + 7, w = BAY - 6, h = FLOOR - 11;
      ctx.fillStyle = night ? lit() : `hsl(205, 13%, ${38 + rand() * 10}%)`;
      ctx.fillRect(x, y, w, h);
      if (!night) { ctx.fillStyle = '#d4d8d9'; ctx.fillRect(x + w / 2 - 1, y, 2, h); }
    }
    if (!night) { ctx.fillStyle = '#fafaf7'; for (let r = 0; r < ROWS; r++) ctx.fillRect(0, r * FLOOR, BAY * COLS, 3); }
  },
  // 独栋主立面：通长深色玻璃带 + 白色楼板线 + 每 4 开间白色框柱（中轴航拍）
  villa(ctx, night) {
    ctx.fillStyle = night ? '#000' : '#f3f3ef';
    ctx.fillRect(0, 0, BAY * COLS, FLOOR * ROWS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS * 2; c++) {
      const x = c * BAY / 2, y = r * FLOOR + 5, h = FLOOR - 8;
      ctx.fillStyle = night ? lit() : `hsl(206, 14%, ${27 + rand() * 9}%)`;
      ctx.fillRect(x, y, BAY / 2, h);
    }
    if (!night) {
      ctx.fillStyle = '#8d979c';
      for (let c = 0; c <= COLS * 2; c++) ctx.fillRect(c * BAY / 2 - 0.5, 0, 1, FLOOR * ROWS);
      ctx.fillStyle = '#f3f3ef';
      for (let c = 0; c <= COLS; c += 4) ctx.fillRect(c * BAY - 4, 0, 8, FLOOR * ROWS);
      for (let r = 0; r <= ROWS; r++) ctx.fillRect(0, r * FLOOR - 3, BAY * COLS, 6);
    }
  },
  // 独栋山墙：白色石材实墙 + 竖向窄窗
  villaEnd(ctx, night) {
    ctx.fillStyle = night ? '#000' : '#eeeee9';
    ctx.fillRect(0, 0, BAY * COLS, FLOOR * ROWS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (c % 3 !== 1) continue;
      const x = c * BAY + 9, y = r * FLOOR + 6, w = BAY - 18, h = FLOOR - 10;
      ctx.fillStyle = night ? lit() : `hsl(206, 12%, ${32 + rand() * 8}%)`;
      ctx.fillRect(x, y, w, h);
    }
    if (!night) {
      ctx.fillStyle = 'rgba(0,0,0,.05)';
      for (let r = 0; r < ROWS * 2; r++) ctx.fillRect(0, r * FLOOR / 2, BAY * COLS, 1);
    }
  },
  // 玻璃裙房
  podium(ctx, night) {
    ctx.fillStyle = night ? '#000' : '#3c4a54';
    ctx.fillRect(0, 0, BAY * COLS, FLOOR * ROWS);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS * 2; c++) {
      const x = c * BAY / 2, y = r * FLOOR;
      ctx.fillStyle = night ? (rand() < 0.75 ? '#ffd9a6' : '#000') : `hsl(205, 14%, ${30 + rand() * 12}%)`;
      ctx.fillRect(x + 1, y + 2, BAY / 2 - 2, FLOOR - 4);
    }
  },
};

const base = new Map();
function baseTextures(style) {
  if (base.has(style)) return base.get(style);
  const [dc, dctx] = makeCanvas(); STYLES[style](dctx, false);
  const [nc, nctx] = makeCanvas(); STYLES[style](nctx, true);
  const map = new THREE.CanvasTexture(dc);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(nc);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, emissiveMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  const v = { map, emissiveMap };
  base.set(style, v);
  return v;
}

// 夜景时统一调节的材质列表
export const facadeMaterials = [];
const matCache = new Map();

export function facadeMaterial(style, widthM, floors) {
  const bays = Math.max(1, Math.round(widthM / BAY_M));
  const key = `${style}|${bays}|${floors}`;
  if (matCache.has(key)) return matCache.get(key);
  const { map, emissiveMap } = baseTextures(style);
  const rx = bays / COLS, ry = floors / ROWS;
  const m = map.clone(); m.repeat.set(rx, ry); m.needsUpdate = true;
  const e = emissiveMap.clone(); e.repeat.set(rx, ry); e.offset.set(rand(), rand()); e.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({
    map: m, emissiveMap: e, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0,
    roughness: style === 'fin' || style === 'podium' ? 0.35 : 0.55,
    metalness: style === 'fin' || style === 'podium' ? 0.35 : 0.08,
  });
  mat.userData.facade = true;
  facadeMaterials.push(mat);
  matCache.set(key, mat);
  return mat;
}

// 路面贴图：沿长度方向重复
export function roadTexture(kind) {
  const [c, ctx] = makeCanvas(128, 128);
  // elevated：高架/匝道深色沥青 + 黄色边线；city：地面主干；local：周边支路（浅色单中线）
  const asphalt = { park: '#9a9e9f', highway: '#6a6f72', elevated: '#5b6064', local: '#8a8e90' }[kind] || '#767b7e';
  ctx.fillStyle = asphalt; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(${noise() < 0.5 ? '255,255,255' : '0,0,0'},${noise() * 0.05})`;
    ctx.fillRect(noise() * 128, noise() * 128, 2, 2);
  }
  ctx.fillStyle = 'rgba(245,245,240,.85)';
  if (kind === 'elevated') {
    ctx.fillStyle = '#e0c25a'; ctx.fillRect(5, 0, 3, 128); ctx.fillRect(120, 0, 3, 128);
    ctx.fillStyle = 'rgba(245,245,240,.85)'; ctx.fillRect(43, 0, 2, 64); ctx.fillRect(84, 0, 2, 64);
  } else if (kind === 'local') {
    ctx.fillStyle = 'rgba(250,250,245,.6)'; ctx.fillRect(63, 0, 2, 64);
  } else if (kind !== 'park') {
    ctx.fillRect(4, 0, 2, 128); ctx.fillRect(122, 0, 2, 128);
    const lanes = kind === 'highway' ? [32, 64, 96] : [42, 86];
    lanes.forEach((x, i) => {
      if (kind === 'highway' && i === 1) { ctx.fillStyle = '#d9c46a'; ctx.fillRect(x - 2, 0, 4, 128); ctx.fillStyle = 'rgba(245,245,240,.85)'; }
      else ctx.fillRect(x - 1, 0, 2, 64);
    });
  } else {
    ctx.fillStyle = 'rgba(250,250,245,.5)'; ctx.fillRect(62, 0, 2, 50);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// 楼顶标识「苏南智城」
export function signTexture(text = '苏南智城') {
  const [c, ctx] = makeCanvas(512, 128);
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = '#d0312d';
  ctx.font = 'bold 92px "Microsoft YaHei", "PingFang SC", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 太阳能板屋面
export function solarTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#cfd2cd'; ctx.fillRect(0, 0, 128, 128);
  for (let y = 6; y < 122; y += 20) for (let x = 6; x < 122; x += 29) {
    ctx.fillStyle = '#34495e'; ctx.fillRect(x, y, 25, 14);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, y, 25, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function waterTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#8fa9a6'); g.addColorStop(1, '#7c9895');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.04 + noise() * 0.08})`;
    ctx.lineWidth = 1;
    const x = noise() * 256, y = noise() * 256, l = 8 + noise() * 30;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + noise() * 2); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
