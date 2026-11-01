// 逐个中心定位百度地图（普通地图 19 级），读瓦片缓存里的楼栋顶面环（buildings.js），合并写入 baidu-buildings.json
// 用法：node buildings-capture.mjs --target <ID> --out parks/<id>/.research/baidu-buildings.json
//        [--box col0,col1,row0,row1] [--wait 9000] [--replace] x,y ... | @centers.json
// 中心可与截图共用 tiles.mjs 的输出。--box 缺省按中心与视野自动估算瓦片范围（多取一圈，buildings.mjs 再按沙盘裁切）。
// 输出文件已存在时默认保留其中已有的瓦片、只补新瓦片：同一瓦片重读的环数会略有出入，而 layout.js 按轮廓中心引用楼栋环，
// 旧瓦片换掉可能让引用失配。要整体重读时加 --replace，之后核对 layout.js 的 at。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, ev, centerAndZoom, sleep } from './cdp.mjs';

const { opt, centers } = args(['replace']);
const T = opt.target, out = resolve(opt.out || 'baidu-buildings.json'), wait = +(opt.wait || 9000);
if (!T || !centers.length) { console.error('需要 --target 与至少一个中心 x,y（或 @centers.json）'); process.exit(1); }

const ok = await ev(T, '(()=>!!(window.map&&map.tileMgr&&map.tileMgr.tileLayers))()');
if (!ok) { console.error('页面上没有 map.tileMgr：确认是普通地图（不是地球模式），必要时 navigate 回 https://map.baidu.com/@X,Y,19z'); process.exit(1); }

let box = opt.box ? opt.box.split(',').map(Number) : null;
if (!box) {
  const view = JSON.parse(await ev(T, '(()=>{const r=map.getContainer().getBoundingClientRect();return JSON.stringify([r.width,r.height])})()'));
  const hx = view[0] / 2 * 0.5, hy = view[1] / 2 * 0.5;   // 19 级每 css 像素 0.5 墨卡托单位
  const xs = centers.flatMap(([x]) => [x - hx, x + hx]), ys = centers.flatMap(([, y]) => [y - hy, y + hy]);
  box = [Math.floor(Math.min(...xs) / 512) - 1, Math.floor(Math.max(...xs) / 512) + 1, Math.floor(Math.min(...ys) / 512) - 1, Math.floor(Math.max(...ys) / 512) + 1];
}
console.log('瓦片范围 col', box[0], '–', box[1], ' row', box[2], '–', box[3]);
const js = readFileSync(fileURLToPath(new URL('buildings.js', import.meta.url)), 'utf8').replace('const BOX = null;', `const BOX = ${JSON.stringify(box)};`);

const all = existsSync(out) && !opt.replace ? JSON.parse(readFileSync(out, 'utf8')) : {};
const before = new Set(Object.keys(all));
for (const c of centers) {
  await centerAndZoom(T, c, 19);
  await sleep(wait);
  const got = JSON.parse(await ev(T, js));
  let added = 0;
  for (const [k, rings] of Object.entries(got)) if (!(k in all)) { all[k] = rings; added++; }
  console.log(c.join(','), '缓存中', Object.keys(got).length, '块，新增', added, '块');
}
writeFileSync(out, JSON.stringify(all));
const fresh = Object.keys(all).filter(k => !before.has(k));
console.log(`共 ${Object.keys(all).length} 块瓦片（新增 ${fresh.length}），${Object.values(all).reduce((s, r) => s + r.length, 0)} 个环 → ${out}`);
if (!fresh.length && !before.size) console.log('没有读到楼栋：瓦片结构可能变了，按 references/baidu-web.md 的「探查」重新定位 building3d');
