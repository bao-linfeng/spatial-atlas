import * as THREE from 'three';
import { seedRng } from './rng.js';
import { renderUI } from './ui.js';
import { createStage } from './stage.js';
import { createMotion, easeOutBack } from './motion.js';
import { createLabels } from './labels.js';
import { createTour } from './tour.js';
import { createContext, finalize } from './context.js';
import { buildPlate } from './kit/ground.js';
import { facadeMaterials } from './textures.js';

const $ = s => document.querySelector(s);

// 园区配置 park：
//   seed        随机数种子
//   meta        页面文字（见 ui.js），meta.sign 为楼顶 / 门头标识文字
//   plate       沙盘范围（场景米）{ x0, x1, z0, z1 }
//   ground      可选，底座参数（见 kit/ground.js 的 buildPlate），如 { holes } 下沉河道开洞
//   gridAngle   园区建筑默认朝向（弧度）
//   stage       尺度相关参数，覆盖 stage.js 的默认值
//   views       { home, top }：{ pos, target } 机位
//   growOrigin  生长动画的起点 [x, z]，楼宇按距离依次升起
//   chapters    导览章节（见 tour.js）
//   build(ctx)  生成园区内容（见 context.js）
export function createViewer(park) {
  renderUI(park);
  seedRng(park.seed);
  const host = $('#canvas-host');
  const statusEl = $('#status');
  const setStatus = t => (statusEl.textContent = t);

  const { renderer, scene, camera, controls, setDaylight, labelFade } = createStage(host, park.stage);

  // ───────── 世界 ─────────
  const ctx = createContext(scene, { plate: park.plate, gridAngle: park.gridAngle, sign: park.meta.sign });
  buildPlate(ctx, park.ground);
  park.build(ctx);
  const W = finalize(ctx);
  const { buildings, labels, pickables, trees, cars, lamps } = W;
  setStatus(`场景就绪 · ${buildings.length} 个建筑体量 · ${trees.count} 棵树 · ${cars.count} 辆车`);

  const labelView = createLabels(labels, { host, layer: $('#labels'), camera, fade: labelFade, onSelect: b => select(b) });
  const motion = createMotion(camera, controls);
  const { tween, stepTweens, sleep, fly, cancelFlight } = motion;

  // ───────── 楼宇生长 ─────────
  const gate = new THREE.Vector3(park.growOrigin[0], 0, park.growOrigin[1]);
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
  function applyNight(t) {
    night = t;
    setDaylight(t);
    facadeMaterials.forEach(m => (m.emissiveIntensity = t * 1.25));
    for (const [m, k] of W.nightables) m.emissiveIntensity = t * k;
    lamps.material.opacity = t;
    cars.lightMat.opacity = t;
    cars.cabMat.emissiveIntensity = t * 0.25;
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

  // ───────── 导览 ─────────
  const { home: HOME, top: TOP } = park.views;
  const tour = createTour({
    chapters: park.chapters, home: HOME, motion, toggleNight, getNight: () => night, controls, select, setStatus,
    canvas: renderer.domElement, filename: `${park.meta.name}-导览.webm`,
  });
  const { runTour } = tour;

  // ───────── 视角与工具栏 ─────────
  function stopAuto() {
    if (tour.isTouring()) tour.endTour(true);
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
    labelView.visible = !labelView.visible;
    $('#btn-labels').classList.toggle('active', labelView.visible);
  });
  $('#btn-white').addEventListener('click', () => setWhitebox(!whitebox));
  $('#btn-grow').addEventListener('click', () => { stopAuto(); grow(); });

  $('#sources-button').addEventListener('click', () => $('#sources').showModal());
  $('#sources-close').addEventListener('click', () => $('#sources').close());

  // ───────── 循环 ─────────
  const clock = new THREE.Clock();
  function tick(dt) {
    stepTweens(dt);
    cars.update(dt);
    W.materials.water.map.offset.x += dt * 0.004;
    controls.update();
  }
  function frame() {
    tick(Math.min(clock.getDelta(), 0.05));
    renderer.render(scene, camera);
    labelView.update();
    requestAnimationFrame(frame);
  }
  // 手动推进时间（后台标签页截图 / 调试 / 回归检查）
  async function advance(sec, step = 1 / 30) {
    for (let t = 0; t < sec; t += step) {
      tick(step);
      for (let k = 0; k < 8; k++) await null; // 让 Promise 链（导览章节）推进
    }
    renderer.render(scene, camera);
    labelView.update();
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
  const api = { scene, camera, controls, W, fly, runTour, applyNight, advance, toggleNight, select };
  window.__park = api;
  return api;
}
