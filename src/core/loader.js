import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const gltfLoader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('/draco/gltf/'); // public/draco/ 由 three 套件複製而來，離線可用
gltfLoader.setDRACOLoader(draco);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

/** 角色在卡丁車上的目標身高（公尺）。 */
export const CHARACTER_HEIGHT = 2.2;

/**
 * 將任意尺度的模型正規化：置中於原點、腳底貼齊 y=0、縮放到指定高度。
 * Hyper3D / Rodin 輸出的尺度不一定一致，所以一律重算。
 */
function normalize(object3d, targetHeight) {
  const box = new THREE.Box3().setFromObject(object3d);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = targetHeight / Math.max(size.y, 1e-4);

  const wrapper = new THREE.Group();
  object3d.position.set(-center.x, -box.min.y, -center.z);
  wrapper.add(object3d);
  wrapper.scale.setScalar(scale);

  const outer = new THREE.Group();
  outer.add(wrapper);
  return outer;
}

/** 程序化佔位角色：GLB 還沒生好時用，讓遊戲隨時可玩。 */
function buildPlaceholder(character) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: character.color, roughness: 0.65 });
  const accent = new THREE.MeshStandardMaterial({ color: character.accentColor, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d2b, roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.5, 6, 14), accent);
  body.position.y = 0.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 16), skin);
  head.position.y = 1.62;
  const earGeo = new THREE.ConeGeometry(0.19, 0.4, 10);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, skin);
    ear.position.set(0.28 * s, 2.02, 0);
    ear.rotation.z = s * 0.24;
    g.add(ear);
  }
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), dark);
    eye.position.set(0.19 * s, 1.68, 0.45);
    g.add(eye);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.36, 4, 8), skin);
    arm.position.set(0.5 * s, 0.86, 0.14);
    arm.rotation.z = s * 0.5;
    arm.rotation.x = -0.5;
    g.add(arm);
  }
  g.add(body, head);
  g.traverse((o) => { o.castShadow = true; });
  return normalize(g, CHARACTER_HEIGHT);
}

/**
 * 載入角色模型；檔案不存在或解析失敗時回傳佔位角色。
 * @returns {Promise<{object:THREE.Object3D, placeholder:boolean}>}
 */
export async function loadCharacterModel(character) {
  if (!character.model) return { object: buildPlaceholder(character), placeholder: true };
  try {
    const gltf = await gltfLoader.loadAsync(character.model);
    const root = gltf.scene;
    let untextured = true;

    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = true;
      // Hyper3D 有時輸出雙面/透明旗標，賽車裡不需要，關掉省效能
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        m.side = THREE.FrontSide;
        if (m.transparent && m.opacity >= 1) m.transparent = false;

        // 只生了幾何、沒生貼圖的模型會是死板的 50% 灰，八個角色長得一模一樣。
        // 染上角色配色，至少在選角和賽道上還分得出誰是誰。
        if (m.map) untextured = false;
        else {
          m.color.setHex(character.color);
          m.roughness = Math.min(m.roughness ?? 0.8, 0.75);
        }
      }
    });

    if (untextured) {
      console.warn(`[loader] ${character.name} 的模型沒有貼圖（只有幾何），已暫時染上角色配色。`);
    }
    return {
      object: normalize(root, CHARACTER_HEIGHT),
      placeholder: false,
      untextured,
      animations: gltf.animations,
    };
  } catch (err) {
    console.warn(`[loader] ${character.name} 的模型載入失敗，改用佔位角色：`, character.model, err?.message ?? err);
    return { object: buildPlaceholder(character), placeholder: true };
  }
}

/** 一次載入全部角色，回報進度。 */
export async function loadAllCharacters(characters, onProgress) {
  const out = new Map();
  let done = 0;
  for (const c of characters) {
    out.set(c.id, await loadCharacterModel(c));
    done++;
    onProgress?.(done / characters.length, c.name);
  }
  return out;
}

export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k of Object.keys(m)) {
        const v = m[k];
        if (v && v.isTexture) v.dispose();
      }
      m.dispose();
    }
  });
}
