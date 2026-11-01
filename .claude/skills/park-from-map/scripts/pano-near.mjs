// 列出某点周围的百度全景点（街景）：先按网格用 qsdata 找种子点，再沿 sdata 的同路点列表（Roads[].Panos）与 Links 遍历。
// 只读全景元数据接口（mapsv0.bdimg.com，公开、不需登录），不取全景图片。
// 用法：node pano-near.mjs --center X,Y [--radius 260] [--step 40] > panos.json
//   X / Y 为百度墨卡托；输出按方位角排序：[{ id, x, y, road, date, dist, az, heading, north }]
//   dist 为米、az 为全景点相对中心的方位角（度，北 0 顺时针）；date 为拍摄日期（YYYYMMDD）
import { args, sleep } from './cdp.mjs';

const { opt } = args();
const C = String(opt.center || '').split(',').map(Number), R = +(opt.radius || 260), STEP = +(opt.step || 40);
if (C.length !== 2 || C.some(Number.isNaN)) { console.error('需要 --center X,Y（百度墨卡托）'); process.exit(1); }
const M = 0.86;   // 1 墨卡托单位 ≈ 0.86 m（常州，cos 31.8°）；其他纬度改这里
const API = 'https://mapsv0.bdimg.com/';
const get = async q => { for (let k = 0; k < 3; k++) { try { return await (await fetch(API + q)).json(); } catch { await sleep(500); } } return null; };
const rel = (x, y) => { const dx = (x - C[0]) * M, dy = (y - C[1]) * M; return [Math.hypot(dx, dy), (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360]; };

// 网格找种子（qsdata 只在离全景点约十几米内才有返回）
const queue = [], queued = new Set();
for (let dy = -R; dy <= R; dy += STEP) for (let dx = -R; dx <= R; dx += STEP) {
  if (Math.hypot(dx, dy) > R) continue;
  const j = await get(`?qt=qsdata&x=${Math.round(C[0] + dx / M)}&y=${Math.round(C[1] + dy / M)}&l=19&action=0&mode=day`);
  const id = j?.content?.id;
  if (id && !queued.has(id)) { queued.add(id); queue.push(id); }
  await sleep(80);
}
console.error(`种子 ${queue.length} 个`);

const seen = new Map();
while (queue.length) {
  const id = queue.shift();
  const c = (await get(`?qt=sdata&sid=${id}&pc=1`))?.content?.[0];
  await sleep(100);
  if (!c) continue;
  const [dist, az] = rel(c.X / 100, c.Y / 100);
  seen.set(id, { id, x: c.X / 100, y: c.Y / 100, road: c.Rname || '', date: c.Date, dist: Math.round(dist), az: Math.round(az), heading: c.Heading, north: c.NorthDir });
  const nb = [...(c.Roads || []).flatMap(r => (r.Panos || []).map(p => [p.PID, p.X / 100, p.Y / 100])), ...(c.Links || []).map(l => [l.PID, l.X / 100, l.Y / 100])];
  for (const [pid, x, y] of nb) if (!queued.has(pid) && rel(x, y)[0] <= R + 20) { queued.add(pid); queue.push(pid); }
}
const list = [...seen.values()].filter(p => p.dist <= R).sort((a, b) => a.az - b.az || a.dist - b.dist);
console.error(`全景点 ${list.length} 个`);
console.log(JSON.stringify(list, null, 0).replace(/},{/g, '},\n{'));
