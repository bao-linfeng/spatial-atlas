// web-access 的 CDP 代理（http://localhost:3456）的最小封装，供 capture.mjs / buildings-capture.mjs 共用
import { readFileSync } from 'node:fs';

export const API = process.env.CDP_API || 'http://localhost:3456';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// 页面内求值，返回 value（脚本返回字符串时原样返回）
export async function ev(target, js) {
  const res = await fetch(`${API}/eval?target=${target}`, { method: 'POST', body: js });
  const j = await res.json();
  if (j.error || j.exceptionDetails) throw new Error(`eval 失败：${JSON.stringify(j).slice(0, 400)}`);
  return j.value;
}
export const evFile = (target, file) => ev(target, readFileSync(file, 'utf8'));

// 截取视口（设备像素），file 为绝对路径（代理在本机写文件）
export async function screenshot(target, file) {
  const j = await (await fetch(`${API}/screenshot?target=${target}&file=${encodeURIComponent(file)}`)).json();
  if (j.error) throw new Error(`截图失败：${j.error}`);
  return j;
}

export const centerAndZoom = (target, [x, y], zoom) => ev(target, `(()=>{map.centerAndZoom(new BMap.Point(${x},${y}),${zoom});return 1})()`);

// 解析命令行：--key value，bools 中列出的为不带值的开关；其余为位置参数，@file.json 展开为文件里的 [[x, y], ...]
export function args(bools = [], argv = process.argv.slice(2)) {
  const opt = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2), v = argv[i + 1];
      if (bools.includes(k) || v === undefined) opt[k] = true; else { opt[k] = v; i++; }
    } else pos.push(a);
  }
  const centers = pos.flatMap(p => p.startsWith('@') ? JSON.parse(readFileSync(p.slice(1), 'utf8')) : [p.split(',').map(Number)]);
  return { opt, centers };
}
