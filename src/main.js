import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWorld } from './world.js';
import { facadeMaterials } from './textures.js';
import { G, P, PLAZA, SOUTH_GATE } from './layout.js';

const $ = s => document.querySelector(s);
const host = $('#canvas-host');
const statusEl = $('#status');
const setStatus = t => (statusEl.textContent = t);

// ───────── 渲染器 / 相机 ─────────
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(host.clientWidth, host.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const DAY_FOG = new THREE.Color(0xe9ece4), NIGHT_FOG = new THREE.Color(0x121a22);
scene.fog = new THREE.Fog(DAY_FOG.clone(), 1600, 4200);

const camera = new THREE.PerspectiveCamera(32, host.clientWidth / host.clientHeight, 2, 8000);
camera.position.set(-1100, 900, 1300);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 40;
controls.maxDistance = 1800;
controls.target.set(0, 0, 0);
controls.autoRotateSpeed = 0.6;

// ───────── 灯光 ─────────
const hemi = new THREE.HemisphereLight(0xf4f6ff, 0xb7bba5, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
sun.position.set(-260, 420, 300);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -460, right: 460, top: 420, bottom: -420, near: 50, far: 1400 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(sun);
const moon = new THREE.DirectionalLight(0x8fb4ff, 0);
moon.position.set(300, 500, -200);
scene.add(moon);

// ───────── 世界 ─────────
const W = buildWorld(scene);
const { buildings, labels, pickables, trees, cars, lamps, fountain } = W;
setStatus(`场景就绪 · ${buildings.length} 个建筑体量 · ${trees.count} 棵树 · ${cars.count} 辆车`);

// ───────── 标注 ─────────
const labelHost = $('#labels');
const labelEls = labels.map(l => {
  const el = document.createElement('div');
  el.className = `label label-${l.kind}`;
  if (l.kind === 'building') {
    el.innerHTML = `<b>${l.text}</b><span>${l.sub}</span>`;
    el.addEventListener('click', () => select(l.bld));
  } else el.textContent = l.text;
  labelHost.appendChild(el);
  return el;
});
let showLabels = true;
const tmpV = new THREE.Vector3();
function updateLabels() {
  const w = host.clientWidth, h = host.clientHeight;
  labels.forEach((l, i) => {
    const el = labelEls[i];
    let visible = showLabels;
    if (l.kind === 'building') {
      const g = l.bld.userData.grow.scale.y;
      visible = visible && g > 0.98;
      // 独栋以外的建筑才常驻标注
    }
    if (!visible) { el.style.display = 'none'; return; }
    tmpV.copy(l.pos).project(camera);
    if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.transform = `translate(-50%, -100%) translate(${(tmpV.x * 0.5 + 0.5) * w}px, ${(-tmpV.y * 0.5 + 0.5) * h}px)`;
    const dist = camera.position.distanceTo(l.pos);
    el.style.opacity = l.kind === 'place' ? THREE.MathUtils.clamp(1.6 - dist / 900, 0.25, 1) : 1;
  });
}

// ───────── 动画工具 ─────────
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = t => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const tweens = new Set();
function tween(dur, fn, { easing = ease } = {}) {
  return new Promise(resolve => {
    const tw = { t: 0, dur, fn, easing, resolve };
    tweens.add(tw);
  });
}
function stepTweens(dt) {
  for (const tw of [...tweens]) {
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    tw.fn(tw.easing(tw.t), tw.t);
    if (tw.t >= 1) { tweens.delete(tw); tw.resolve(); }
  }
}
const sleep = s => tween(s, () => {});

// 相机沿弧线飞行
let flightToken = 0;
function fly(pos, target, dur = 4) {
  const token = ++flightToken;
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  const p1 = new THREE.Vector3(...pos), t1 = new THREE.Vector3(...target);
  const lift = Math.min(260, p0.distanceTo(p1) * 0.18);
  return tween(dur, k => {
    if (token !== flightToken) return;
    camera.position.lerpVectors(p0, p1, k);
    camera.position.y += Math.sin(k * Math.PI) * lift;
    controls.target.lerpVectors(t0, t1, k);
  });
}
const cancelFlight = () => { flightToken++; };

// ───────── 楼宇生长 ─────────
const gate = new THREE.Vector3(SOUTH_GATE[0], 0, SOUTH_GATE[1]);
buildings.forEach(b => {
  b.userData.grow.scale.y = 0.0001;
  const d = b.position.distanceTo(gate);
  const tall = b.userData.rec.f > 10;
  b.userData.delay = tall ? 1.6 + d / 260 : d / 300;
});
function grow(duration = 4.6) {
  const maxDelay = Math.max(...buildings.map(b => b.userData.delay));
  const total = duration + 0.1;
  buildings.forEach(b => (b.userData.grow.scale.y = 0.0001));
  trees.setGrowth(0);
  return tween(total, (_, raw) => {
    const t = raw * total;
    buildings.forEach(b => {
      const k = THREE.MathUtils.clamp((t - (b.userData.delay / maxDelay) * (duration - 1.3)) / 1.3, 0, 1);
      b.userData.grow.scale.y = Math.max(0.0001, k < 1 ? easeOutBack(k) : 1);
    });
    trees.setGrowth(THREE.MathUtils.clamp((t - 0.6) / (duration - 0.6), 0, 1));
  }, { easing: t => t });
}

// ───────── 夜景 ─────────
let night = 0;
const DAY_HEMI_SKY = new THREE.Color(0xf4f6ff), NIGHT_HEMI_SKY = new THREE.Color(0x3a4c6e);
const DAY_HEMI_GND = new THREE.Color(0xb7bba5), NIGHT_HEMI_GND = new THREE.Color(0x1b2128);
function applyNight(t) {
  night = t;
  sun.intensity = THREE.MathUtils.lerp(2.6, 0.05, t);
  moon.intensity = THREE.MathUtils.lerp(0, 0.35, t);
  hemi.intensity = THREE.MathUtils.lerp(0.85, 0.3, t);
  hemi.color.lerpColors(DAY_HEMI_SKY, NIGHT_HEMI_SKY, t);
  hemi.groundColor.lerpColors(DAY_HEMI_GND, NIGHT_HEMI_GND, t);
  scene.environmentIntensity = THREE.MathUtils.lerp(0.7, 0.06, t);
  scene.fog.color.lerpColors(DAY_FOG, NIGHT_FOG, t);
  facadeMaterials.forEach(m => (m.emissiveIntensity = t * 1.25));
  W.materials.M.glass.emissiveIntensity = t * 0.55;
  W.materials.M.canopy.emissiveIntensity = t * 0.35;
  lamps.material.opacity = t;
  cars.lightMat.opacity = t;
  cars.cabMat.emissiveIntensity = t * 0.25;
  if (fountain) fountain.material.emissiveIntensity = t * 1.5;
  document.body.style.setProperty('--night', t.toFixed(3));
  document.body.classList.toggle('is-night', t > 0.5);
}
function toggleNight(on = night < 0.5) {
  const a = night, b = on ? 1 : 0;
  $('#btn-night').classList.toggle('active', on);
  return tween(2.2, k => applyNight(a + (b - a) * k));
}

// ───────── 白模 ─────────
let whitebox = false;
function setWhitebox(on) {
  whitebox = on;
  facadeMaterials.forEach(m => {
    if (on) { m.userData.map ??= m.map; m.map = null; m.color.set(0xf3f3ef); }
    else { m.map = m.userData.map || m.map; m.color.set(0xffffff); }
    m.needsUpdate = true;
  });
  $('#btn-white').classList.toggle('active', on);
}

// ───────── 点选 ─────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selected = null;
const highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
  new THREE.LineBasicMaterial({ color: 0x1f8a68, transparent: true, opacity: 0.9, depthTest: false }));
highlight.renderOrder = 10;
highlight.visible = false;
scene.add(highlight);

function select(b) {
  selected = b;
  if (!b) { $('#selection').hidden = true; highlight.visible = false; return; }
  const r = b.userData.rec, H = b.userData.height || 10;
  highlight.visible = true;
  highlight.position.set(b.position.x, H / 2, b.position.z);
  highlight.rotation.y = b.rotation.y;
  highlight.scale.set(r.w + 2, H + 2, r.d + 2);
  $('#building-id').textContent = r.id;
  $('#building-name').textContent = r.name;
  $('#building-info').textContent = r.info || '';
  $('#building-stats').innerHTML = `
    <div><strong>${r.f}</strong><span>层（估）</span></div>
    <div><strong>${Math.round(H)}</strong><span>米高（估）</span></div>
    <div><strong>${Math.round(r.w)}×${Math.round(r.d)}</strong><span>平面 m</span></div>`;
  $('#selection').hidden = false;
}
let downAt = null;
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; stopAuto(); });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  select(hit ? hit.object.userData.bld : null);
});
$('#close-selection').addEventListener('click', () => select(null));
$('#focus-button').addEventListener('click', () => {
  if (!selected) return;
  const H = selected.userData.height || 10, p = selected.position;
  const d = Math.max(70, H * 1.6);
  fly([p.x + d * 0.8, H * 0.8 + 30, p.z + d], [p.x, H * 0.45, p.z], 2.4);
});

// ───────── 视角 ─────────
const HOME = { pos: [-170, 360, 640], target: [-10, 10, -10] };
const TOP = { pos: [0.1, 820, 40], target: [0, 0, 30] };
function stopAuto() {
  if (touring) endTour(true);
  cancelFlight();
}
$('#home').addEventListener('click', () => { stopAuto(); fly(HOME.pos, HOME.target, 2.2); });
$('#top').addEventListener('click', () => { stopAuto(); fly(TOP.pos, TOP.target, 2.2); });
const dolly = k => {
  stopAuto();
  const dir = camera.position.clone().sub(controls.target);
  const p = controls.target.clone().add(dir.multiplyScalar(k));
  fly(p.toArray(), controls.target.toArray(), 0.6);
};
$('#zoom-in').addEventListener('click', () => dolly(0.75));
$('#zoom-out').addEventListener('click', () => dolly(1.3));

$('#btn-orbit').addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  $('#btn-orbit').classList.toggle('active', controls.autoRotate);
});
$('#btn-night').addEventListener('click', () => toggleNight());
$('#btn-labels').addEventListener('click', () => {
  showLabels = !showLabels;
  $('#btn-labels').classList.toggle('active', showLabels);
});
$('#btn-white').addEventListener('click', () => setWhitebox(!whitebox));
$('#btn-grow').addEventListener('click', () => { stopAuto(); grow(); });

// ───────── 导览 ─────────
const wp = (u, v) => G(u, v);
const A = wp(-385, 235), PL = P(...PLAZA.px), E = P(890, 222);
const CHAPTERS = [
  { title: '区位', en: 'LOCATION', pos: [560, 560, 700], target: [0, 0, 0], dur: 5,
    text: '西临青洋路高架，北经青龙收费站连接线接入 G42 沪蓉高速，南沿创客路、东南望北塘河——三面路网、一面临水。' },
  { title: '西南塔楼群', en: 'LANDMARK TOWERS', pos: [A[0] + 210, 120, A[1] + 330], target: [A[0] + 20, 46, A[1] - 50], dur: 5,
    text: '41号楼主塔约 24 层，白色网格立面，楼顶「苏南智城」标识；北侧深色竖肋塔楼与之一深一浅。' },
  { title: '中轴景观带', en: 'CENTRAL AXIS', pos: [SOUTH_GATE[0] + 20, 24, SOUTH_GATE[1] + 90], target: [SOUTH_GATE[0] - 10, 10, SOUTH_GATE[1] - 80], dur: 5,
    text: '南入口环形雕塑起势，宽阔的铺装中轴向北延伸至双塔，两侧玻璃带独栋夹道，“一轴多节点”串联各组团。',
    then: { pos: wp(37, 40).concat([]), dur: 5 } },
  { title: '风车式独栋', en: 'GARDEN OFFICES', pos: [-80, 190, 210], target: [-70, 0, 50], dur: 5,
    text: '38 栋 4–6 层花园独栋，以四合院母题风车式错位排布，单栋约 1688–1848㎡。' },
  { title: '北区 · 下沉广场', en: 'SUNKEN PLAZA', pos: [PL[0] + 90, 165, PL[1] + 240], target: [PL[0] - 5, 18, PL[1] - 40], dur: 5,
    text: '中轴北端两栋高层商务办公，下沉式商业广场与高层裙房结合，形成全天候活力空间。' },
  { title: '夜色', en: 'NIGHT', pos: [-360, 280, 420], target: [0, 20, -10], dur: 5, night: true,
    text: '华灯初上，高架与沪蓉高速车流如织。' },
];
let touring = false, tourToken = 0;
const tourCard = $('#tour-card');
const tourDots = $('#tour-dots');
tourDots.innerHTML = CHAPTERS.map((c, i) => `<i data-i="${i}"></i>`).join('');
async function runTour() {
  const token = ++tourToken;
  touring = true;
  controls.autoRotate = false; $('#btn-orbit').classList.remove('active');
  $('#btn-tour').classList.add('active');
  document.body.classList.add('touring');
  select(null);
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (token !== tourToken) return;
    const c = CHAPTERS[i];
    $('#tour-index').textContent = String(i + 1).padStart(2, '0');
    $('#tour-title').textContent = c.title;
    $('#tour-en').textContent = c.en;
    $('#tour-text').textContent = c.text;
    [...tourDots.children].forEach((d, k) => d.classList.toggle('on', k <= i));
    tourCard.classList.remove('show'); void tourCard.offsetWidth; tourCard.classList.add('show');
    const jobs = [fly(c.pos, c.target, c.dur)];
    if (c.night && night < 0.5) jobs.push(toggleNight(true));
    await Promise.all(jobs);
    if (token !== tourToken) return;
    if (c.then) {
      const [x, z] = c.then.pos;
      await fly([x + 10, 30, z + 40], [x - 25, 14, z - 160], c.then.dur);
      if (token !== tourToken) return;
    }
    await sleep(c.night ? 3.5 : 1.6);
  }
  if (token !== tourToken) return;
  await Promise.all([toggleNight(false), fly(HOME.pos, HOME.target, 4)]);
  endTour();
}
function endTour(interrupted = false) {
  tourToken++;
  touring = false;
  $('#btn-tour').classList.remove('active');
  document.body.classList.remove('touring');
  tourCard.classList.remove('show');
  if (recorder && recorder.state === 'recording') recorder.stop();
  if (interrupted) setStatus('导览已中断 · 可随时重新播放');
}
$('#btn-tour').addEventListener('click', () => (touring ? endTour(true) : runTour()));

// ───────── 录制导览视频 ─────────
let recorder = null;
$('#btn-record').addEventListener('click', () => {
  if (recorder && recorder.state === 'recording') { endTour(true); return; }
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!mime) { setStatus('当前浏览器不支持录制'); return; }
  const stream = renderer.domElement.captureStream(60);
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16e6 });
  const chunks = [];
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: '苏南智城科技产业园-导览.webm' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    $('#btn-record').classList.remove('active');
    setStatus('导览视频已导出（WebM，仅含三维画面）');
  };
  recorder.start();
  $('#btn-record').classList.add('active');
  setStatus('正在录制导览…');
  runTour();
});

// ───────── 建模说明 ─────────
$('#sources-button').addEventListener('click', () => $('#sources').showModal());
$('#sources-close').addEventListener('click', () => $('#sources').close());

// ───────── 循环 ─────────
const clock = new THREE.Clock();
let elapsed = 0;
function tick(dt) {
  elapsed += dt;
  stepTweens(dt);
  cars.update(dt);
  W.materials.water.map.offset.x += dt * 0.004;
  controls.update();
}
function frame() {
  tick(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
  updateLabels();
  requestAnimationFrame(frame);
}
// 手动推进时间（后台标签页截图 / 调试）
async function advance(sec, step = 1 / 30) {
  for (let t = 0; t < sec; t += step) {
    tick(step);
    for (let k = 0; k < 8; k++) await null; // 让 Promise 链（导览章节）推进
  }
  renderer.render(scene, camera);
  updateLabels();
}
addEventListener('resize', () => {
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(host.clientWidth, host.clientHeight);
});

// ───────── 开场 ─────────
applyNight(0);
$('#btn-labels').classList.add('active');
frame();
(async () => {
  document.body.classList.add('intro-playing');
  const params = new URLSearchParams(location.search);
  if (params.has('night')) applyNight(1);
  await Promise.all([fly(HOME.pos, HOME.target, 5.5), sleep(0.6).then(() => grow(4.8))]);
  document.body.classList.remove('intro-playing');
  if (params.has('tour')) runTour();
})();

// 调试用
window.__park = { scene, camera, controls, W, fly, runTour, applyNight, advance, toggleNight, select };
