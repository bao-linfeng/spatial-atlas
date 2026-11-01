// 百度地图分块截图 + 配准元数据（经 web-access 的 CDP 代理操作已打开的 map.baidu.com 后台标签页）
// 用法：
//   node capture.mjs --target <ID> --out parks/<id>/.research --prefix map-z19 [--zoom 19] [--wait 9000] [--no-prep] x,y x,y ... | @centers.json
//   node capture.mjs --target <ID> --out parks/<id>/.research --prefix sat-z19 --earth [--wait 16000] @centers.json
// 中心为百度墨卡托 (X, Y)，可用 tiles.mjs 按沙盘范围生成。每块写 <prefix>-<i>.png（视口，设备像素）与同名 .json：
//   普通地图：{ zoom, center, centerPx, rect, dpr }，配准用 reg.js 的 baidu(meta)
//   --earth（地球模式）：{ zoom, rect, dpr, p00, p10, p01 }，p00 / p10 / p01 为容器像素 (0,0) / (1000,0) / (0,1000) 处的墨卡托坐标，
//     配准用 reg.js 的 earth([p00, p10, p01], dpr)（地球引擎为透视相机，实际缩放约 18.91，不能按 zoom 推算）
// 地球模式要先 navigate 到 https://map.baidu.com/@X,Y,19z/maptype%3DB_EARTH_MAP（navigate 后视野会被重置，本脚本会重新定位），
// 普通地图下 BMAP_SATELLITE_MAP 不出图。
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, ev, evFile, screenshot, centerAndZoom, sleep } from './cdp.mjs';

const { opt, centers } = args(['earth', 'no-prep']);
const T = opt.target, out = resolve(opt.out || '.'), prefix = opt.prefix || 'map-z19';
const earth = !!opt.earth, zoom = +(opt.zoom || 19), wait = +(opt.wait || (earth ? 16000 : 9000));
if (!T || !centers.length) { console.error('需要 --target 与至少一个中心 x,y（或 @centers.json）'); process.exit(1); }
mkdirSync(out, { recursive: true });

if (!opt['no-prep']) console.log('prep', await evFile(T, fileURLToPath(new URL('prep.js', import.meta.url))));

const META = earth
  ? `(()=>{const r=map.getContainer().getBoundingClientRect();const q=(a,b)=>{const p=map.pixelToPoint(new BMap.Pixel(a,b));return [p.lng,p.lat]};
      return JSON.stringify({zoom:map.getZoom(),rect:[r.left,r.top,r.width,r.height],dpr:devicePixelRatio,p00:q(0,0),p10:q(1000,0),p01:q(0,1000)})})()`
  : `(()=>{const c=map.getCenter(),p=map.pointToPixel(c),r=map.getContainer().getBoundingClientRect();
      return JSON.stringify({zoom:map.getZoom(),center:[c.lng,c.lat],centerPx:[p.x,p.y],rect:[r.left,r.top,r.width,r.height],dpr:devicePixelRatio})})()`;

for (const [i, c] of centers.entries()) {
  await centerAndZoom(T, c, zoom);
  await sleep(wait);
  const meta = JSON.parse(await ev(T, META));
  const name = `${prefix}-${i}`;
  await screenshot(T, resolve(out, `${name}.png`));
  writeFileSync(resolve(out, `${name}.json`), JSON.stringify(meta));
  console.log(name, JSON.stringify(meta));
}
