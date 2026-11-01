// 把 pano-model.mjs 生成的对照图（<名称>.cmp.png，上实景、下模型）拼成一张总览，格子左上角标方位名。
// 用法：node pano-sheet.mjs --out parks/<id>/.research/pano/B-八方位.png [--cols 4] [--w 640] B-前.cmp.png B-前东角.cmp.png ...
//   --w 为每格宽度（css 像素，按 dpr 2 截图）；缺的文件跳过并提示。
// 不安装依赖：借用本机已有的 playwright-core（PW 环境变量，缺省同 run-page.mjs）。
import { readFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { args } from './cdp.mjs';

const PW = process.env.PW || 'D:/baolf/muke/StayHelm/frontend/node_modules/playwright-core/index.mjs';
const argv = process.argv.slice(2), files = argv.filter(a => a.endsWith('.cmp.png'));
const { opt } = args([], argv.filter(a => !files.includes(a)));
if (!opt.out || !files.length) { console.error('需要 --out 与至少一张 .cmp.png'); process.exit(1); }
const cols = +(opt.cols || 4), w = +(opt.w || 640);
const cells = files.map(f => resolve(f)).filter(f => existsSync(f) || console.error('缺少', f) && false);

const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: cols * w, height: 400 }, deviceScaleFactor: 2 });
  const html = cells.map(f => `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}">
    <figcaption>${basename(f, '.cmp.png')}</figcaption></figure>`).join('');
  await page.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px)}
    figure{margin:0;position:relative}img{display:block;width:${w}px}
    figcaption{position:absolute;left:0;top:0;padding:2px 8px;font:bold 15px sans-serif;color:#fff;background:#c00c}</style>${html}`);
  await page.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth));
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewportSize({ width: cols * w, height: h });
  await page.screenshot({ path: resolve(opt.out), fullPage: true });
  console.log('→', resolve(opt.out), `${cells.length} 格`);
} finally {
  await browser.close();
}
