import * as THREE from 'three';
import { roadTexture, waterTexture } from './textures.js';

// 系列统一材质。创建顺序固定（路面、水面贴图会消耗 texture 随机数流）。
export function createMaterials() {
  const M = {
    plate: new THREE.MeshStandardMaterial({ color: 0xdfe3d6, roughness: 1 }),
    plateSide: new THREE.MeshStandardMaterial({ color: 0xc9cdc0, roughness: 1 }),
    field: [0xbccb9f, 0xb0c290, 0xc6d0aa, 0xa6bb88, 0xcfd4b6].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 })),
    paving: new THREE.MeshStandardMaterial({ color: 0xe6e5de, roughness: 0.95 }),
    pavingDark: new THREE.MeshStandardMaterial({ color: 0xd4d3cb, roughness: 0.95 }),
    lawn: new THREE.MeshStandardMaterial({ color: 0x9db680, roughness: 1 }),
    lawnLight: new THREE.MeshStandardMaterial({ color: 0xafc592, roughness: 1 }),
    bank: new THREE.MeshStandardMaterial({ color: 0xc3c9b8, roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xd9dad4, roughness: 0.85 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: 0xb9bcb6, roughness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xd2d4cf, roughness: 0.9 }),
    roofDark: new THREE.MeshStandardMaterial({ color: 0x9ea4a3, roughness: 0.8 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 }),
    ctx: new THREE.MeshStandardMaterial({ color: 0xeceee7, roughness: 0.9 }),
    ctxBlue: new THREE.MeshStandardMaterial({ color: 0x8fb0c9, roughness: 0.7 }),
    ctxGray: new THREE.MeshStandardMaterial({ color: 0xa8aca8, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x51626c, roughness: 0.2, metalness: 0.5, emissive: 0xffd49a, emissiveIntensity: 0 }),
    court: new THREE.MeshStandardMaterial({ color: 0x3f7ab8, roughness: 0.8 }),
    courtLine: new THREE.MeshStandardMaterial({ color: 0xb3524a, roughness: 0.8 }),
    canopy: new THREE.MeshStandardMaterial({ color: 0xf5f5f2, roughness: 0.5, emissive: 0xfff1d6, emissiveIntensity: 0 }),
    sidewalk: new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.95 }),
    parapet: new THREE.MeshStandardMaterial({ color: 0xe4e5e0, roughness: 0.8, side: THREE.DoubleSide }),
  };
  const water = new THREE.MeshStandardMaterial({ map: waterTexture(), roughness: 0.15, metalness: 0.3, color: 0xffffff });
  const roadMats = {
    city: new THREE.MeshStandardMaterial({ map: roadTexture('city'), roughness: 0.9 }),
    highway: new THREE.MeshStandardMaterial({ map: roadTexture('highway'), roughness: 0.9 }),
    park: new THREE.MeshStandardMaterial({ map: roadTexture('park'), roughness: 0.95 }),
    elevated: new THREE.MeshStandardMaterial({ map: roadTexture('elevated'), roughness: 0.85 }),
    local: new THREE.MeshStandardMaterial({ map: roadTexture('local'), roughness: 0.95 }),
  };
  return { M, water, roadMats };
}
