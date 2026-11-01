// 百度全景定向截图：在已打开 map.baidu.com 的 CDP 后台标签页里，逐个打开全景点，朝向目标楼、按楼高取俯仰与视场角，
// 隐藏页面控件后截图。配合 pano-near.mjs 选点、pano-model.mjs 在同一机位截模型对照。
// 用法：
//   node pano-capture.mjs --target <ID> --out parks/<id>/.research/pano --box X,Y,r,H [--eye 2.3] 名称=全景ID[@fov] ...
//   --box：目标楼中心（百度墨卡托）、平面半径 m、高度 m；--pitch 固定俯仰（度，缺省按楼高自动取）；fov 可选 75 / 60 / 45 / 30（垂直视场角，缺省按楼的张角自动取）
// 每个视图写 <名称>.png（视口，设备像素）与同名 .json：
//   { name, pid, x, y, date, road, heading, pitch, fov, zoom, dist, eye, box, viewport, dpr, capturedAt }
// 全景页面：URL 带 panoid / heading / pitch 进入全景；$BAIDU$._._maps_id 下带 _panoFlashWraper 的对象为全景控件，
// 朝向由 URL 的 heading（罗盘方位）、pitch（向上为正）给定；.panorama.setPov 用的是全景内部朝向，与罗盘差一个改正角，不用。setZoom(z) 设缩放，
// fov = 90 − 15 z（z = 1 / 2 / 3 → 75° / 60° / 45°，垂直视场角）。
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { args, ev, screenshot, sleep, API } from './cdp.mjs';

const { opt } = args([], process.argv.slice(2).filter(a => !/^[^-].*=/.test(a)));
const views = process.argv.slice(2).filter(a => /^[^-].*=/.test(a)).map(a => {
  const [name, rest] = a.split('='), [pid, fov] = rest.split('@');
  return { name, pid, fov: fov ? +fov : null };
});
const T = opt.target, out = resolve(opt.out || '.'), eye = +(opt.eye || 2.3);
const box = String(opt.box || '').split(',').map(Number);
if (!T || box.length !== 4 || !views.length) { console.error('需要 --target、--box X,Y,r,H 与至少一个 名称=全景ID'); process.exit(1); }
mkdirSync(out, { recursive: true });
const M = 0.86, D = 180 / Math.PI;

const PANO = `(()=>{const m=$BAIDU$._._maps_id;for(const k in m)if(m[k]&&m[k]._panoFlashWraper)return m[k]._panoFlashWraper.panorama;return null})()`;
// 隐藏全景画布以外的页面元素（逐级把祖先的兄弟节点设为 display:none）
const HIDE = `(()=>{const cv=[...document.querySelectorAll('canvas')].find(c=>!c.closest('#MapHolder'));if(!cv)return 'no canvas';
  let n=0;for(let e=cv;e&&e!==document.body;e=e.parentElement)for(const s of e.parentElement.children)if(s!==e&&s.tagName!=='SCRIPT'&&s.tagName!=='STYLE'){s.style.display='none';n++}
  const p=${PANO};try{p.toggleUI({topo:false,marker:false,wellLid:false,pointCloud:false})}catch(e){}return 'hidden '+n})()`;

for (const v of views) {
  const c = (await (await fetch(`https://mapsv0.bdimg.com/?qt=sdata&sid=${v.pid}&pc=1`)).json())?.content?.[0];
  if (!c) { console.error(v.name, '取不到全景元数据', v.pid); continue; }
  const x = c.X / 100, y = c.Y / 100, dx = (box[0] - x) * M, dy = (box[1] - y) * M, dist = Math.hypot(dx, dy);
  const heading = (Math.atan2(dx, dy) * D + 360) % 360;
  // 竖向取景：近侧墙面距离 near，楼顶与墙脚的仰角各留 4°
  const near = Math.max(dist - box[2], 5), top = Math.atan((box[3] - eye) / near) * D + 4, bot = Math.atan(-eye / near) * D - 4;
  const fov = v.fov || [30, 45, 60, 75].find(f => f >= top - bot) || 75;
  const pitch = opt.pitch !== undefined ? +opt.pitch : top - bot <= fov ? (top + bot) / 2 : top - fov / 2;
  const zoom = (90 - fov) / 15;

  const url = `https://map.baidu.com/?newmap=1&shareurl=1&panotype=street&pid=${v.pid}&panoid=${v.pid}&heading=${heading.toFixed(2)}&pitch=${pitch.toFixed(2)}&l=21&tn=B_NORMAL_MAP&sc=0`;
  await fetch(`${API}/navigate?target=${T}&url=${encodeURIComponent(url)}`);
  let ok = false;
  for (let k = 0; k < 40 && !ok; k++) { await sleep(500); ok = await ev(T, `(()=>{const p=${PANO};return !!(p&&p.curPanoId===${JSON.stringify(v.pid)})})()`).catch(() => false); }
  if (!ok) { console.error(v.name, '全景没有打开', v.pid); continue; }
  await sleep(2500);
  const hidden = await ev(T, HIDE);
  await ev(T, `(()=>{const p=${PANO};p.setZoom(${zoom});return 1})()`);
  await sleep(6000);   // 等高清瓦片
  const st = JSON.parse(await ev(T, `(()=>{const p=${PANO};return JSON.stringify({pov:p.getPov(),zoom:p.getZoom(),fov:p.fov,vp:[innerWidth,innerHeight],dpr:devicePixelRatio})})()`));
  await screenshot(T, resolve(out, `${v.name}.png`));
  const meta = {
    name: v.name, pid: v.pid, x, y, date: c.Date, road: c.Rname || '', heading: +st.pov.heading.toFixed(2), pitch: +st.pov.pitch.toFixed(2),
    // fov 按 zoom 推算：后台标签页里缩放动画跑得慢，p.fov 读回的常是旧值
    fov: 90 - 15 * st.zoom, zoom: st.zoom, dist: +dist.toFixed(1), eye, box, viewport: st.vp, dpr: st.dpr, capturedAt: new Date().toISOString(),
  };
  writeFileSync(resolve(out, `${v.name}.json`), JSON.stringify(meta));
  console.log(v.name, hidden, JSON.stringify(meta));
}
