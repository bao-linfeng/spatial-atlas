// 按 pano-capture.mjs 写的元数据，在同一机位（位置、朝向、俯仰、垂直视场角、画幅）截模型图，并与实景上下拼成对照图。
// 用法：node pano-model.mjs --park <id> [--dy 0.4] parks/<id>/.research/pano/B-前.json ...
//   园区的 tools/reg.js 须导出 MERC（百度墨卡托 → P），layout.js 须导出 ORIGIN、PX。
//   输出 <名称>.model.png（模型）与 <名称>.cmp.png（上：实景，下：模型）。--dy 为全景点所在地面在场景里的高度（园区铺装 0.4 m）。
// 不安装依赖：借用本机已有的 playwright-core（PW 环境变量，缺省同 run-page.mjs）。
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative, basename, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { args } from './cdp.mjs';

const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const PW = process.env.PW || 'D:/baolf/muke/StayHelm/frontend/node_modules/playwright-core/index.mjs';
const argv = process.argv.slice(2), files = argv.filter(a => a.endsWith('.json')).map(f => resolve(f));
const { opt } = args([], argv.filter(a => !a.endsWith('.json')));
if (!opt.park || !files.length) { console.error('需要 --park <id> 与至少一个元数据 json'); process.exit(1); }
const dy = +(opt.dy ?? 0.4);
const { MERC } = await import(pathToFileURL(resolve(ROOT, `parks/${opt.park}/tools/reg.js`)).href);
const { ORIGIN, PX } = await import(pathToFileURL(resolve(ROOT, `parks/${opt.park}/layout.js`)).href);
const toScene = ([X, Y]) => {
  const { a, b, c, f } = MERC, px = a * X - b * Y + c, py = -b * X - a * Y + f;
  return [(px - ORIGIN[0]) * PX, (py - ORIGIN[1]) * PX];
};

const port = 5300 + (process.pid % 200);
const server = spawn(process.execPath, ['server.mjs', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => server.stdout.once('data', r));
const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const url = f => `http://127.0.0.1:${port}/${relative(ROOT, f).replace(/\\/g, '/')}`;
try {
  for (const file of files) {
    const m = JSON.parse(readFileSync(file, 'utf8')), [w, h] = m.viewport;
    const [x, z] = toScene([m.x, m.y]), y = m.eye + dy;
    const hd = m.heading * Math.PI / 180, pt = m.pitch * Math.PI / 180, L = 100;
    const tgt = [x + Math.sin(hd) * Math.cos(pt) * L, y + Math.sin(pt) * L, z - Math.cos(hd) * Math.cos(pt) * L];
    const cam = [x, y, z].map(v => v.toFixed(2)).join(','), tg = tgt.map(v => v.toFixed(2)).join(',');
    const base = resolve(dirname(file), basename(file, '.json'));
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.on('pageerror', e => console.log('pageerror:', e.message));
    await page.goto(`http://127.0.0.1:${port}/tools/shot.html?park=${opt.park}&cam=${cam}&tgt=${tg}&fov=${m.fov}`);
    await page.waitForFunction(() => document.title === 'ready', null, { polling: 200, timeout: 300000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${base}.model.png` });
    // 对照图：上实景、下模型，左上角注明方位与机位
    const note = `${m.name}　${m.date} ${m.road}　距 ${m.dist} m　heading ${m.heading}°　pitch ${m.pitch}°　fov ${m.fov}°`;
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.setContent(`<style>body{margin:0;background:#111}img{display:block;width:${w}px;height:${h}px}
      p{position:absolute;margin:0;left:8px;padding:2px 8px;font:14px sans-serif;color:#fff;background:#0009}</style>
      <img src="${url(`${base}.png`)}"><img src="${url(`${base}.model.png`)}">
      <p style="top:8px">实景　${note}</p><p style="top:${h + 8}px">模型　cam ${cam}</p>`);
    await page.setViewportSize({ width: w, height: h * 2 });
    await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth));
    await page.screenshot({ path: `${base}.cmp.png` });
    await page.close();
    console.log('→', `${base}.cmp.png`, 'cam', cam);
  }
} finally {
  await browser.close();
  server.kill();
}
