import * as THREE from 'three';

export function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.0, '#2b4d9e');
  g.addColorStop(0.45, '#6fa8e8');
  g.addColorStop(0.72, '#bcd9f2');
  g.addColorStop(1.0, '#e9d7b8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // three 0.186 已移除 PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function createScene(renderer) {
  const scene = new THREE.Scene();
  const sky = makeSkyTexture();
  scene.background = sky;

  // PBR 材質需要環境貼圖才算得出反射，沒有的話金屬面會是死黑。
  // 必須經過 PMREM 預濾波：粗糙度要對應到不同模糊程度的 mip，
  // 直接把原始 equirect 丟給 environment 會讓粗糙表面出現閃爍雜訊。
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromEquirectangular(sky).texture;
  scene.environmentIntensity = 0.65;
  pmrem.dispose();

  scene.fog = new THREE.Fog(0xb9d3ec, 220, 720);

  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a5236, 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d6, 2.1);
  sun.position.set(120, 190, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 520;
  const d = 130;
  Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d });
  sun.shadow.camera.updateProjectionMatrix(); // 改過 frustum 邊界後必須重算
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  return { scene, sun };
}

/** 跟隨鏡頭：位置用彈簧平滑，加速時拉遠並拉高 FOV。 */
export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.baseFov = 62;
    this._init = false;
    this._shake = 0;
  }

  shake(amount) {
    this._shake = Math.min(1.2, this._shake + amount);
  }

  /** @param {import('../game/kart.js').Kart} kart */
  update(dt, kart, lookBack = false) {
    const speedRatio = THREE.MathUtils.clamp(kart.vf / kart.stats.maxSpeed, 0, 1.4);
    const boosting = kart.boostTime > 0;

    const dir = lookBack ? -1 : 1;
    const back = 8.4 + speedRatio * 2.6 + (boosting ? 1.6 : 0);
    const height = 3.9 + speedRatio * 0.9;

    // 漂移時鏡頭往彎道外側帶，看得進彎心。
    // 偏移向量 (cos yaw, 0, -sin yaw) 指向車身左側，往右漂時外側就是左側，故取正。
    const driftOffset = kart.drifting ? kart.driftDir * 2.0 : 0;

    const yaw = kart.yaw;
    const target = new THREE.Vector3(
      kart.position.x - Math.sin(yaw) * back * dir + Math.cos(yaw) * driftOffset,
      kart.position.y + height,
      kart.position.z - Math.cos(yaw) * back * dir - Math.sin(yaw) * driftOffset,
    );

    const lookTarget = new THREE.Vector3(
      kart.position.x + Math.sin(yaw) * 7 * dir,
      kart.position.y + 1.7,
      kart.position.z + Math.cos(yaw) * 7 * dir,
    );

    if (!this._init) {
      this.pos.copy(target);
      this.look.copy(lookTarget);
      this._init = true;
    }
    const k = 1 - Math.exp(-(lookBack ? 18 : 9) * dt);
    this.pos.lerp(target, k);
    this.look.lerp(lookTarget, 1 - Math.exp(-12 * dt));

    this._shake = Math.max(0, this._shake - dt * 2.4);
    const s = this._shake;
    this.camera.position.set(
      this.pos.x + (Math.random() - 0.5) * s,
      this.pos.y + (Math.random() - 0.5) * s,
      this.pos.z + (Math.random() - 0.5) * s,
    );
    this.camera.lookAt(this.look);

    const targetFov = this.baseFov + speedRatio * 10 + (boosting ? 9 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-6 * dt));
      this.camera.updateProjectionMatrix();
    }
  }

  reset() {
    this._init = false;
  }
}
