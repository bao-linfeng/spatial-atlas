// 高德地图截图：无头浏览器打开 amap.com，借页面已加载的 JSAPI 2.0（带 amap.com 自己的 key）在全屏 div 里新建一张 AMap.Map，
// 定位后截视口，并写同名 json 元数据（center 为 GCJ-02 经纬度、zoom、size 视口 css 像素，deviceScaleFactor 1）。
// 不需要登录；用户 Chrome 里的后台标签页不重绘（JSAPI 加载时就缓存了 requestAnimationFrame，事后打补丁无效），所以不走 CDP。
// 用法：node amap-capture.mjs --center 119.996979,31.810573 --zoom 19 --size 6160x3170 --out D:/.../amap-z19.png [--clean]
//   --clean：features 只留 bg / road / building、showLabel false（不带 POI 与路名，供按颜色提取）；缺省为带标注的完整底图。
//   单张视口可以开到 6000 px 以上（swiftshader WebGL），一张覆盖整个沙盘，省去拼接；但这么大的视口标注层不出图，
//   带标注的对照图降一级、视口减半截（同样覆盖范围）。
//   视口中心与 P 的换算：reg.js 的 amap(meta)（Web 墨卡托，每 css 像素 2πR / 256 / 2^zoom 米）+ AMAP_MERC。
import { writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { args } from './cdp.mjs';

const PW = process.env.PW || 'D:/baolf/muke/StayHelm/frontend/node_modules/playwright-core/index.mjs';
if (!existsSync(PW)) { console.error(`找不到 playwright-core：${PW}（用环境变量 PW 指定）`); process.exit(1); }
const { opt } = args(['clean']);
const center = opt.center.split(',').map(Number), zoom = +opt.zoom, [W, H] = (opt.size || '1600x1000').split('x').map(Number);
const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({
    viewport: { width: W, height: H }, deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  });
  await page.goto('https://www.amap.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.AMap && AMap.Map, null, { timeout: 60000 });
  await page.waitForTimeout(2000);
  const meta = await page.evaluate(async ({ center, zoom, clean }) => {
    document.querySelectorAll('body > *').forEach(e => e.style.setProperty('visibility', 'hidden'));
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;visibility:visible';
    document.body.appendChild(d);
    const m = new AMap.Map(d, { center, zoom, viewMode: '2D', ...(clean ? { features: ['bg', 'road', 'building'], showLabel: false } : {}) });
    await new Promise(r => m.on('complete', r));
    await new Promise(r => setTimeout(r, 6000));   // 瓦片出齐
    const c = m.getCenter();
    return { center: [c.lng, c.lat], zoom: m.getZoom(), size: [innerWidth, innerHeight], clean };
  }, { center, zoom, clean: !!opt.clean });
  await page.screenshot({ path: opt.out });
  writeFileSync(opt.out.replace(/\.png$/, '.json'), JSON.stringify(meta, null, 1));
  console.log(opt.out, JSON.stringify(meta));
} finally {
  await browser.close();
}
