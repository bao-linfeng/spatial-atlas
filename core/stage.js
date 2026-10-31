import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// 与沙盘尺度相关的参数，园区可在 park.stage 中覆盖（单位：米）
const DEFAULTS = {
  start: [-1100, 900, 1300],          // 开场飞行前的相机位置
  far: 8000,
  minDistance: 40, maxDistance: 1800,
  fog: [1600, 4200],
  sun: [-260, 420, 300],
  shadow: { left: -460, right: 460, top: 420, bottom: -420, near: 50, far: 1400 },
  labelFade: 900,                     // 地名标注随距离淡出的尺度
};

const DAY_FOG = new THREE.Color(0xe9ece4), NIGHT_FOG = new THREE.Color(0x121a22);
const DAY_HEMI_SKY = new THREE.Color(0xf4f6ff), NIGHT_HEMI_SKY = new THREE.Color(0x3a4c6e);
const DAY_HEMI_GND = new THREE.Color(0xb7bba5), NIGHT_HEMI_GND = new THREE.Color(0x1b2128);

// 渲染器、相机、轨道控制、日月光照与雾
export function createStage(host, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
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
  scene.fog = new THREE.Fog(DAY_FOG.clone(), ...o.fog);

  const camera = new THREE.PerspectiveCamera(32, host.clientWidth / host.clientHeight, 2, o.far);
  camera.position.set(...o.start);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minDistance = o.minDistance;
  controls.maxDistance = o.maxDistance;
  controls.target.set(0, 0, 0);
  controls.autoRotateSpeed = 0.6;

  const hemi = new THREE.HemisphereLight(0xf4f6ff, 0xb7bba5, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
  sun.position.set(...o.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, o.shadow);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x8fb4ff, 0);
  moon.position.set(300, 500, -200);
  scene.add(moon);

  // 光照与雾在白天（0）和夜晚（1）之间插值
  function setDaylight(t) {
    sun.intensity = THREE.MathUtils.lerp(2.6, 0.05, t);
    moon.intensity = THREE.MathUtils.lerp(0, 0.35, t);
    hemi.intensity = THREE.MathUtils.lerp(0.85, 0.3, t);
    hemi.color.lerpColors(DAY_HEMI_SKY, NIGHT_HEMI_SKY, t);
    hemi.groundColor.lerpColors(DAY_HEMI_GND, NIGHT_HEMI_GND, t);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.7, 0.06, t);
    scene.fog.color.lerpColors(DAY_FOG, NIGHT_FOG, t);
  }

  return { renderer, scene, camera, controls, setDaylight, labelFade: o.labelFade };
}
