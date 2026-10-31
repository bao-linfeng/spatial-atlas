// 系列首页：按 parks/index.js 在常州区县图上落点，并生成右侧目录；两边悬停联动，点击后镜头扎入再进入园区
import parks from '../parks/index.js';

const NS = 'http://www.w3.org/2000/svg';
const KM = 111.32;                       // 每度纬度的公里数
const svg = document.getElementById('map');
const mapBox = svg.parentElement;
const readout = document.getElementById('readout');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const href = p => `./parks/${p.id}/`;

renderIndex();
let geo = null;
try {
  const res = await fetch(new URL('./changzhou.json', import.meta.url));
  if (!res.ok) throw new Error(res.status);
  geo = await res.json();
} catch {
  svg.hidden = true;
  document.getElementById('map-missing').hidden = false;
}
if (geo) {
  let first = true;
  new ResizeObserver(() => { renderMap(first); first = false; }).observe(mapBox);
}

// ---------- 目录 ----------
function renderIndex() {
  document.getElementById('count').textContent = `已收录 ${parks.length} 处园区 · 持续增补`;
  document.getElementById('parks').innerHTML = parks.map(p => `
    <li class="entry" data-id="${p.id}">
      <a href="${href(p)}">
        <span class="entry-no">${p.no}</span>
        <h3>${p.name}</h3>
        <span class="entry-en">${p.nameEn}</span>
        <p class="entry-where">${p.district} · ${p.address}</p>
        <p class="entry-summary">${p.summary}</p>
        <ul class="entry-stats">${p.stats.map(([v, u]) => `<li>${v}<small>${u}</small></li>`).join('')}</ul>
        <span class="entry-go">进入沙盘 <span>→</span></span>
      </a>
    </li>`).join('');
  for (const li of document.querySelectorAll('.entry')) {
    li.addEventListener('pointerenter', () => setHot(li.dataset.id, true));
    li.addEventListener('pointerleave', () => setHot(li.dataset.id, false));
    li.addEventListener('focusin', () => setHot(li.dataset.id, true));
    li.addEventListener('focusout', () => setHot(li.dataset.id, false));
  }
}

function setHot(id, on) {
  const park = parks.find(p => p.id === id);
  document.querySelectorAll(`[data-id="${id}"]`).forEach(el => el.classList.toggle('is-hot', on));
  document.querySelectorAll(`[data-district="${park.district}"]`).forEach(el => el.classList.toggle('is-hot', on));
}

// ---------- 地图 ----------
function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.appendChild(node);
  return node;
}

// 等距圆柱投影，按中心纬度压缩经向；市域尺度下形变可忽略
function makeProjection(w, h) {
  const rings = geo.features.flatMap(f => f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat());
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) for (const [lng, lat] of r) {
    x0 = Math.min(x0, lng); x1 = Math.max(x1, lng); y0 = Math.min(y0, lat); y1 = Math.max(y1, lat);
  }
  const kx = Math.cos((y0 + y1) / 2 * Math.PI / 180);
  const narrow = w < 700;
  const pad = narrow ? { l: 24, r: 24, t: 110, b: 56 } : { l: 70, r: 70, t: 70, b: 70 };
  const s = Math.min((w - pad.l - pad.r) / ((x1 - x0) * kx), (h - pad.t - pad.b) / (y1 - y0));
  const ox = pad.l + (w - pad.l - pad.r - (x1 - x0) * kx * s) / 2;
  const oy = pad.t + (h - pad.t - pad.b - (y1 - y0) * s) / 2;
  const project = ([lng, lat]) => [ox + (lng - x0) * kx * s, oy + (y1 - lat) * s];
  const invert = ([x, y]) => [x0 + (x - ox) / (kx * s), y1 - (y - oy) / s];
  return { project, invert, rings, pxPerKm: s / KM };
}

function pathOf(geometry, project) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let d = '';
  for (const poly of polys) for (const ring of poly) {
    let last = null;
    ring.forEach((pt, i) => {
      const [x, y] = project(pt);
      if (last && i < ring.length - 1 && Math.hypot(x - last[0], y - last[1]) < .6) return;
      d += `${last ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      last = [x, y];
    });
    d += 'Z';
  }
  return d;
}

const dms = (v, pos, neg) => {
  const t = Math.round(Math.abs(v) * 60), d = Math.floor(t / 60), m = t % 60;
  return `${d}°${String(m).padStart(2, '0')}′${v >= 0 ? pos : neg}`;
};

function renderMap(animate) {
  const w = mapBox.clientWidth, h = mapBox.clientHeight;
  if (!w || !h) return;
  svg.replaceChildren(svg.querySelector('desc'));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.classList.toggle('settled', !animate);
  const { project, invert, pxPerKm } = makeProjection(w, h);

  // 经纬网：每 15′ 一条，标注在左、下边缘
  const grid = el('g', { class: 'graticule' }, svg), ticks = el('g', {}, svg);
  const [lngA, latA] = invert([0, h]), [lngB, latB] = invert([w, 0]);
  const step = .25;
  for (let lng = Math.ceil(lngA / step) * step; lng <= lngB; lng += step) {
    const [x] = project([lng, 0]);
    el('line', { x1: x, y1: 0, x2: x, y2: h }, grid);
    el('text', { class: 'tick', x: x + 4, y: h - 8 }, ticks).textContent = dms(lng, 'E', 'W');
  }
  const titleBottom = mapBox.querySelector('.map-title').getBoundingClientRect().bottom - mapBox.getBoundingClientRect().top;
  for (let lat = Math.ceil(latA / step) * step; lat <= latB; lat += step) {
    const [, y] = project([0, lat]);
    el('line', { x1: 0, y1: y, x2: w, y2: y }, grid);
    if (y > titleBottom + 16) el('text', { class: 'tick', x: 8, y: y - 5 }, ticks).textContent = dms(lat, 'N', 'S');
  }

  const world = el('g', { class: 'world' }, svg);
  world.style.transform = 'translate(0px, 0px) scale(1)';

  // 先整体描一圈粗边作外轮廓，区县填色叠在上面盖住内部那一半，只留市界
  const feats = geo.features.filter(f => f.properties.name);
  const paths = feats.map(f => pathOf(f.geometry, project));
  const coast = el('g', {}, world);
  for (const d of paths) el('path', { class: 'coast', d }, coast);
  const lands = el('g', { class: 'lands' }, world);
  feats.forEach((f, i) => {
    const p = el('path', { class: 'district', d: paths[i], 'data-district': f.properties.name }, lands);
    p.style.setProperty('--i', i);
  });
  const names = el('g', {}, world);
  for (const f of feats) {
    const c = f.properties.centroid || f.properties.center;
    if (!c) continue;
    const [x, y] = project(c);
    const t = el('text', { class: 'district-name', x, y, 'data-district': f.properties.name }, names);
    t.textContent = f.properties.name;
  }

  // 园区标记：编号圆点 + 折线引线 + 名牌。名牌抬到右上方，避开所在区县的区名；
  // 超出画面时改朝左上；窄屏只留编号圆点，靠下方目录的同号条目对照
  const narrow = w < 700;
  const pins = el('g', {}, world);
  parks.forEach((park, i) => {
    const [x, y] = project(park.lnglat);
    const a = el('a', { class: 'pin', href: href(park), 'data-id': park.id, 'aria-label': `${park.no} ${park.name}，进入沙盘` }, pins);
    a.style.setProperty('--i', i);
    if (!narrow) {
      const ly = y - 36;
      const leader = el('polyline', { class: 'pin-leader' }, a);
      const plate = el('rect', { class: 'pin-plate', rx: 2 }, a);
      const label = el('text', { class: 'pin-label', y: ly - 2 }, a);
      label.textContent = park.name;
      const en = el('text', { class: 'pin-label-en', y: ly + 13 }, a);
      en.textContent = park.nameEn;
      const side = dir => {
        const lx = x + dir * 48, anchor = dir > 0 ? 'start' : 'end';
        for (const t of [label, en]) { t.setAttribute('x', lx + dir * 12); t.setAttribute('text-anchor', anchor); }
        leader.setAttribute('points', `${x + dir * 8},${y - 8} ${x + dir * 34},${ly} ${lx},${ly}`);
      };
      side(1);
      let b1 = label.getBBox(), b2 = en.getBBox();
      if (Math.max(b1.x + b1.width, b2.x + b2.width) + 12 > w - 8) { side(-1); b1 = label.getBBox(); b2 = en.getBBox(); }
      const bx = Math.min(b1.x, b2.x) - 12, bw = Math.max(b1.x + b1.width, b2.x + b2.width) + 12 - bx;
      plate.setAttribute('x', bx); plate.setAttribute('width', bw);
      plate.setAttribute('y', b1.y - 9); plate.setAttribute('height', b2.y + b2.height - b1.y + 18);
    }
    el('circle', { class: 'pin-ring', cx: x, cy: y, r: 11 }, a);
    el('circle', { class: 'pin-dot', cx: x, cy: y, r: 11 }, a);
    el('text', { class: 'pin-no', x, y }, a).textContent = park.no;

    a.addEventListener('pointerenter', () => setHot(park.id, true));
    a.addEventListener('pointerleave', () => setHot(park.id, false));
    a.addEventListener('focus', () => setHot(park.id, true));
    a.addEventListener('blur', () => setHot(park.id, false));
    a.addEventListener('click', e => {
      if (reduceMotion || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      // 只用 translate + scale 两项，补间时园区点沿直线移到画面中心
      world.style.transform = `translate(${w / 2 - 7 * x}px, ${h / 2 - 7 * y}px) scale(7)`;
      world.classList.add('is-diving');
      setTimeout(() => { location.href = href(park); }, 850);
    });
  });

  // 区名压在园区圆点上时，挪到圆点正下方
  const spots = parks.map(p => project(p.lnglat));
  for (const t of names.children) {
    const b = t.getBBox();
    const hit = spots.find(([x, y]) => x > b.x - 14 && x < b.x + b.width + 14 && y > b.y - 14 && y < b.y + b.height + 14);
    if (hit) { t.setAttribute('x', hit[0]); t.setAttribute('y', hit[1] + 30); }
  }
  svg.appendChild(ticks);              // 刻度字放到最上层，不被陆地盖住

  // 比例尺与指北针
  const km = [5, 10, 20, 50].find(k => k * pxPerKm >= 70) ?? 50;
  const len = km * pxPerKm, sx = narrow ? 24 : 44, sy = h - 40;
  const scale = el('g', { class: 'scale' }, svg);
  el('line', { x1: sx, y1: sy, x2: sx + len, y2: sy }, scale);
  for (const t of [0, .5, 1]) el('line', { x1: sx + len * t, y1: sy - (t === .5 ? 3 : 5), x2: sx + len * t, y2: sy }, scale);
  el('text', { x: sx + len + 8, y: sy + 3 }, scale).textContent = `${km} km`;
  const north = el('g', { class: 'north', transform: narrow ? `translate(${w - 30}, ${sy - 4})` : `translate(${sx + 6}, ${sy - 44})` }, svg);
  el('path', { d: 'M0,-14 L6,8 L0,4 L-6,8 Z' }, north);
  el('text', { x: 0, y: -20, 'text-anchor': 'middle' }, north).textContent = 'N';

  svg.onpointermove = e => {
    const r = svg.getBoundingClientRect();
    const [lng, lat] = invert([e.clientX - r.left, e.clientY - r.top]);
    readout.textContent = `${dms(lat, 'N', 'S')}  ${dms(lng, 'E', 'W')}`;
  };
  svg.onpointerleave = () => { readout.textContent = ''; };
}
