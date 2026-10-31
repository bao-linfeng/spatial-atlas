// 回归检查：冻结页面时钟，只用 __park.advance() 推进时间，按固定场景截图并统计场景数据，与基准逐像素比对。
// 用法：node tools/regress.mjs <playwright-core/index.mjs 的绝对路径> [--park sunan] [--path /parks/sunan/] [--update]
// --update 写入 verification/baseline/<park>/，否则写入 verification/current/<park>/ 并与基准比对。
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const pwPath = args[0];
if (!pwPath || pwPath.startsWith('--')) { console.error('需要传入 playwright-core/index.mjs 的绝对路径'); process.exit(2); }
const park = flag('--park', 'sunan');
const path = flag('--path', `/parks/${park}/`);
const update = args.includes('--update');
const PORT = 5291;

const ROOT = new URL('..', import.meta.url);
const outDir = new URL(`verification/${update ? 'baseline' : 'current'}/${park}/`, ROOT);
const baseDir = new URL(`verification/baseline/${park}/`, ROOT);
await mkdir(outDir, { recursive: true });

const server = spawn(process.execPath, [fileURLToPath(new URL('server.mjs', ROOT)), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => server.stdout.once('data', r));

const { chromium } = await import(pathToFileURL(pwPath).href);
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
page.on('requestfailed', r => errors.push(`请求失败 ${r.url()}`));

// 场景中仍有直接调用 Math.random 的地方（树、车），这里换成固定种子，保证每次加载结果相同
await page.addInitScript(() => {
  let a = 20261031;
  Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
});
await page.clock.install({ time: new Date('2026-10-31T10:00:00') });
await page.clock.pauseAt(new Date('2026-10-31T10:00:01'));
await page.goto(`http://127.0.0.1:${PORT}${path}`);
await page.waitForFunction(() => window.__park, null, { polling: 100, timeout: 60000 });

const run = fn => page.evaluate(fn);
const shots = [];
const shot = async name => { await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, outDir)), animations: 'disabled' }); shots.push(name); };
const view = (cam, tgt, extra = 0.1) => page.evaluate(async ([cam, tgt, extra]) => {
  const p = window.__park;
  p.controls.target.set(...tgt); p.camera.position.set(...cam); p.controls.update();
  await p.advance(extra);
}, [cam, tgt, extra]);

// 场景顺序固定，状态依次延续
await run(() => window.__park.advance(7, 0.25));                       // 开场飞行 + 生长
await shot('01-home');
await run(async () => { const p = window.__park; p.select(p.W.buildings[0]); await p.advance(0.1); });
await shot('02-select');
await run(async () => { const p = window.__park; p.select(null); document.querySelector('#btn-white').click(); await p.advance(0.1); });
await shot('03-white');
await run(async () => { document.querySelector('#btn-white').click(); await window.__park.advance(0.1); });
await view([0.1, 820, 40], [0, 0, 30]);
await shot('04-top');
await view([150, 60, 300], [100, 10, 120]);
await shot('05-close');
await run(async () => { const p = window.__park; p.applyNight(1); await p.advance(0.1); });
await view([-170, 360, 640], [-10, 10, -10]);
await shot('06-night');
await run(async () => { const p = window.__park; p.applyNight(0); p.runTour(); await p.advance(12, 0.25); });
await shot('07-tour');

const metrics = await run(() => {
  const p = window.__park, W = p.W;
  let meshes = 0, instances = 0, vertices = 0;
  p.scene.traverse(o => {
    if (!o.isMesh && !o.isPoints && !o.isLineSegments) return;
    meshes++;
    const n = o.isInstancedMesh ? o.count : 1;
    instances += n;
    vertices += (o.geometry.attributes.position?.count || 0) * n;
  });
  // 车辆瞬移检测（同 tools/_jump.html）
  const { cars, plateRect: r } = W, body = cars.group.children[0], a = body.instanceMatrix.array;
  const n = body.count, prev = new Float32Array(n * 3), hits = {};
  const snap = () => { for (let i = 0; i < n; i++) prev.set([a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14]], i * 3); };
  const edge = (x, z) => Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z) < 25;
  snap();
  for (let k = 0; k < 6000; k++) {
    cars.update(0.05);
    for (let i = 0; i < n; i++) {
      const x0 = prev[i * 3], z0 = prev[i * 3 + 2], x1 = a[i * 16 + 12], z1 = a[i * 16 + 14];
      if (Math.hypot(x1 - x0, z1 - z0) > 6) for (const [x, z] of [[x0, z0], [x1, z1]]) if (!edge(x, z)) {
        const key = `${Math.round(x / 20) * 20},${Math.round(z / 20) * 20}`; hits[key] = (hits[key] || 0) + 1;
      }
    }
    snap();
  }
  return {
    status: document.querySelector('#status').textContent,
    buildings: W.buildings.length, labels: W.labels.length, pickables: W.pickables.length,
    trees: W.trees.count, cars: W.cars.count, meshes, instances, vertices, carJumps: hits,
  };
});
metrics.errors = errors;
await writeFile(new URL('metrics.json', outDir), JSON.stringify(metrics, null, 2));

let failed = errors.length > 0;
if (!update) {
  if (!existsSync(new URL('metrics.json', baseDir))) { console.error(`缺少基准：${fileURLToPath(baseDir)}`); process.exit(2); }
  const base = JSON.parse(await readFile(new URL('metrics.json', baseDir), 'utf8'));
  for (const k of Object.keys(base)) {
    if (k === 'errors') continue;
    const same = JSON.stringify(base[k]) === JSON.stringify(metrics[k]);
    if (!same) failed = true;
    console.log(`${same ? '✓' : '✗'} ${k}: ${same ? JSON.stringify(metrics[k]) : `${JSON.stringify(base[k])} → ${JSON.stringify(metrics[k])}`}`);
  }
  // 在空白页的 canvas 中逐像素比对
  const blank = await browser.newPage();
  for (const name of shots) {
    const [a, b] = await Promise.all([readFile(new URL(`${name}.png`, baseDir)), readFile(new URL(`${name}.png`, outDir))]);
    const res = a.equals(b) ? { n: 0 } : await blank.evaluate(async ([a, b]) => {
      const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { n: -1 };
      const px = img => { const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height); };
      const A = px(ia), da = A.data, db = px(ib).data;
      let n = 0;
      for (let i = 0; i < da.length; i += 4) {
        const hit = Math.abs(da[i] - db[i]) > 2 || Math.abs(da[i + 1] - db[i + 1]) > 2 || Math.abs(da[i + 2] - db[i + 2]) > 2;
        if (hit) n++;
        // 差异图：不同处标红，其余淡化
        if (hit) { da[i] = 255; da[i + 1] = 0; da[i + 2] = 0; } else for (let k = 0; k < 3; k++) da[i + k] = 255 - (255 - da[i + k]) * 0.25;
      }
      const c = new OffscreenCanvas(A.width, A.height); c.getContext('2d').putImageData(A, 0, 0);
      const blob = await c.convertToBlob();
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { n, png: btoa(s) };
    }, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`]);
    const diff = res.n;
    if (res.png) await writeFile(new URL(`${name}.diff.png`, outDir), Buffer.from(res.png, 'base64'));
    if (diff) failed = true;
    console.log(`${diff ? '✗' : '✓'} ${name}.png${diff ? `：${diff < 0 ? '尺寸不同' : `${diff} 个像素不同`}` : ''}`);
  }
}
if (errors.length) console.log('页面错误：\n  ' + errors.join('\n  '));
console.log(update ? `基准已写入 ${fileURLToPath(outDir)}` : failed ? '回归检查未通过' : '回归检查通过');

await browser.close();
server.kill();
process.exit(failed ? 1 : 0);
