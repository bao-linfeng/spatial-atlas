// 无头运行仓库里的工具页（vmap.html、crop.html、shot.html 等），等到 document.title === 'ready'（或园区页的 window.__park），
// 截整页并可在页内求值。不安装依赖：借用本机已有的 playwright-core（同 tools/regress.mjs）。
// 用法：node run-page.mjs <相对仓库根的 url> <out.png> [<url> <out.png> ...]
// 环境变量：
//   PW    playwright-core/index.mjs 的绝对路径（缺省取 CLAUDE.md 里记的 D:/baolf/muke/StayHelm/... ）
//   W / H 视口（缺省 1600 × 1000）；WAIT 就绪后再等的毫秒数
//   EVAL  就绪后在（第一个）页内求值的表达式；OUT 给出时把结果（字符串原样，其余 JSON）写入该文件，否则打印
// 例：EVAL='JSON.stringify(window.VMAP)' OUT=parks/<id>/.research/vmap.json W=1200 H=800 \
//       node run-page.mjs "parks/<id>/tools/vmap.html" /tmp/vmap.png
import { spawn } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const PW = process.env.PW || 'D:/baolf/muke/StayHelm/frontend/node_modules/playwright-core/index.mjs';
if (!existsSync(PW)) { console.error(`找不到 playwright-core：${PW}（用环境变量 PW 指定）`); process.exit(1); }
const list = process.argv.slice(2);
if (!list.length || list.length % 2) { console.error('参数为成对的 <url> <out.png>'); process.exit(1); }

const port = 5300 + (process.pid % 200);
const server = spawn(process.execPath, ['server.mjs', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => server.stdout.once('data', r));
const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (let i = 0; i < list.length; i += 2) {
    const page = await browser.newPage({ viewport: { width: +(process.env.W || 1600), height: +(process.env.H || 1000) } });
    page.on('console', m => m.type() === 'error' && console.log('console:', m.text()));
    page.on('pageerror', e => console.log('pageerror:', e.message));
    await page.goto(`http://127.0.0.1:${port}/${list[i].replace(/^\//, '')}`);
    await page.waitForFunction(() => document.title === 'ready' || window.__park, null, { polling: 200, timeout: 300000 });
    if (process.env.WAIT) await page.waitForTimeout(+process.env.WAIT);
    if (process.env.EVAL && i === 0) {
      const r = await page.evaluate(process.env.EVAL);
      if (process.env.OUT) writeFileSync(resolve(process.env.OUT), typeof r === 'string' ? r : JSON.stringify(r));
      else console.log(r);
    }
    await page.screenshot({ path: resolve(list[i + 1]), fullPage: true });
    console.log('→', list[i + 1]);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
