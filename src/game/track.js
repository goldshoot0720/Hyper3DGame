import * as THREE from 'three';

/** 賽道中心線控制點（封閉迴圈），y 為高低起伏。 */
const CONTROL_POINTS = [
  [0, 0, 0],
  [62, 0, 42],
  [112, 3, 122],
  [92, 8, 212],
  [20, 10, 252],
  [-62, 6, 236],
  [-112, 1, 172],
  [-142, 0, 82],
  [-122, 4, -22],
  [-62, 8, -72],
  [22, 4, -62],
  [62, 1, -22],
];

/**
 * 給「平躺在地面」的 PlaneGeometry 用的旋轉：local X→side、local Y→水平化的 tangent、
 * local Z→up。tangent 有坡度時先壓平，確保三軸正交、算出來是純旋轉。
 */
export function flatBasis(side, tangent) {
  const up = new THREE.Vector3(0, 1, 0);
  const t = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
  const s = new THREE.Vector3(side.x, 0, side.z).normalize();
  return new THREE.Matrix4().makeBasis(s, t, up);
}

export const ROAD_HALF_WIDTH = 9.5;
const WALL_HEIGHT = 3.0;
const SAMPLES = 900;

/* ------------------------------------------------------------------ */
/* 程序化貼圖                                                          */
/* ------------------------------------------------------------------ */

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeAsphaltTexture() {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#3a3d47';
    ctx.fillRect(0, 0, s, s);
    const img = ctx.getImageData(0, 0, s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 34;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    // 中央虛線
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let y = 0; y < s; y += 64) ctx.fillRect(s / 2 - 3, y, 6, 34);
  });
}

function makeKerbTexture() {
  return canvasTexture(64, (ctx, s) => {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#e23b3b' : '#f4f4f4';
      ctx.fillRect(0, (i * s) / 4, s, s / 4);
    }
  });
}

function makeGrassTexture() {
  return canvasTexture(
    128,
    (ctx, s) => {
      ctx.fillStyle = '#4d7c3f';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = `rgba(${60 + Math.random() * 70 | 0},${110 + Math.random() * 70 | 0},${45 + Math.random() * 50 | 0},0.7)`;
        ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    },
    90,
    90,
  );
}

function makeCheckerTexture() {
  return canvasTexture(64, (ctx, s) => {
    const n = 8;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#141414';
        ctx.fillRect((x * s) / n, (y * s) / n, s / n, s / n);
      }
  });
}

/* ------------------------------------------------------------------ */
/* Track                                                               */
/* ------------------------------------------------------------------ */

export class Track {
  constructor() {
    this.curve = new THREE.CatmullRomCurve3(
      CONTROL_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      true,
      'centripetal',
      0.5,
    );

    /** @type {{pos:THREE.Vector3, tangent:THREE.Vector3, side:THREE.Vector3, dist:number}[]} */
    this.samples = [];
    this._buildSamples();

    this.length = this.samples[this.samples.length - 1].dist;
    this.group = new THREE.Group();
    this.group.name = 'Track';
    this._buildRoad();
    this._buildKerbs();
    this._buildWalls();
    this._buildGround();
    this._buildStartLine();
    this._buildScenery();

    this.itemBoxSpots = this._layoutItemBoxes();
    this.boostPadSpots = this._layoutBoostPads();
  }

  _buildSamples() {
    const up = new THREE.Vector3(0, 1, 0);
    let dist = 0;
    let prev = null;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const pos = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
      if (prev) dist += pos.distanceTo(prev);
      this.samples.push({ pos, tangent, side, dist });
      prev = pos;
    }
  }

  /** 以 hint 附近的視窗搜尋最近的中心線取樣點（每幀呼叫，必須便宜）。 */
  locate(point, hint = 0) {
    const n = this.samples.length;
    const window = hint >= 0 ? 60 : n;
    let best = -1;
    let bestD = Infinity;
    const start = hint >= 0 ? hint - window : 0;
    const end = hint >= 0 ? hint + window : n;
    for (let k = start; k < end; k++) {
      const i = ((k % n) + n) % n;
      const d = this.samples[i].pos.distanceToSquared(point);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const s = this.samples[best];
    const offset = new THREE.Vector3().subVectors(point, s.pos);
    return {
      index: best,
      center: s.pos,
      tangent: s.tangent,
      side: s.side,
      dist: s.dist,
      lateral: offset.dot(s.side),
      height: s.pos.y,
    };
  }

  /** 全域最近點搜尋（重置、重生時用）。 */
  locateGlobal(point) {
    return this.locate(point, -1);
  }

  sampleAt(index) {
    const n = this.samples.length;
    return this.samples[((index % n) + n) % n];
  }

  /** 距離（公尺）轉取樣索引。 */
  indexAtDistance(d) {
    const n = this.samples.length;
    const t = ((d % this.length) + this.length) % this.length;
    return Math.min(n - 1, Math.round((t / this.length) * (n - 1)));
  }

  /* ---------------- 網格 ---------------- */

  _ribbon(halfInner, halfOuter, yOffset, material, uvScale = 0.12) {
    const n = this.samples.length;
    const pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const a = new THREE.Vector3().copy(s.pos).addScaledVector(s.side, halfInner);
      const b = new THREE.Vector3().copy(s.pos).addScaledVector(s.side, halfOuter);
      a.y += yOffset;
      b.y += yOffset;
      pos.set([a.x, a.y, a.z], i * 6);
      pos.set([b.x, b.y, b.z], i * 6 + 3);
      const v = s.dist * uvScale;
      uv.set([0, v], i * 4);
      uv.set([1, v], i * 4 + 2);
      if (i < n - 1) {
        const o = i * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  _buildRoad() {
    const map = makeAsphaltTexture();
    map.repeat.set(1, 1);
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.94, metalness: 0.02 });
    const road = this._ribbon(-ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, 0.02, mat, 0.06);
    road.name = 'Road';
    this.group.add(road);
  }

  _buildKerbs() {
    const map = makeKerbTexture();
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.7 });
    const w = 1.4;
    const left = this._ribbon(-ROAD_HALF_WIDTH - w, -ROAD_HALF_WIDTH, 0.06, mat, 0.5);
    const right = this._ribbon(ROAD_HALF_WIDTH, ROAD_HALF_WIDTH + w, 0.06, mat, 0.5);
    left.name = 'KerbL';
    right.name = 'KerbR';
    this.group.add(left, right);
  }

  _buildWalls() {
    const n = this.samples.length;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x9fb0d6,
      roughness: 0.5,
      metalness: 0.15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    });
    const off = ROAD_HALF_WIDTH + 1.5;

    for (const dir of [-1, 1]) {
      const pos = new Float32Array(n * 2 * 3);
      const idx = [];
      for (let i = 0; i < n; i++) {
        const s = this.samples[i];
        const base = new THREE.Vector3().copy(s.pos).addScaledVector(s.side, off * dir);
        pos.set([base.x, base.y, base.z], i * 6);
        pos.set([base.x, base.y + WALL_HEIGHT, base.z], i * 6 + 3);
        if (i < n - 1) {
          const o = i * 2;
          idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = dir < 0 ? 'WallL' : 'WallR';
      this.group.add(mesh);
    }
  }

  _buildGround() {
    const g = new THREE.PlaneGeometry(2400, 2400);
    const mat = new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 1 });
    const m = new THREE.Mesh(g, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.6;
    m.receiveShadow = true;
    m.name = 'Ground';
    this.group.add(m);
  }

  _buildStartLine() {
    const s = this.samples[0];
    const map = makeCheckerTexture();
    map.repeat.set(10, 1);
    const g = new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, 4);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map, roughness: 0.8 }));
    m.position.copy(s.pos).add(new THREE.Vector3(0, 0.05, 0));
    // PlaneGeometry 躺在 XY 平面、法線 +Z；把 local X→side、Y→tangent、Z→up
    m.quaternion.setFromRotationMatrix(flatBasis(s.side, s.tangent));
    m.name = 'StartLine';
    this.group.add(m);

    // 起點拱門
    const pillarGeo = new THREE.BoxGeometry(1.2, 9, 1.2);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xffcc33, roughness: 0.4, metalness: 0.4 });
    for (const dir of [-1, 1]) {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.copy(s.pos).addScaledVector(s.side, (ROAD_HALF_WIDTH + 1.5) * dir).add(new THREE.Vector3(0, 4.5, 0));
      p.castShadow = true;
      this.group.add(p);
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry((ROAD_HALF_WIDTH + 2.2) * 2, 1.6, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xff5e7a, roughness: 0.4, metalness: 0.3 }),
    );
    beam.position.copy(s.pos).add(new THREE.Vector3(0, 9.2, 0));
    beam.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    beam.castShadow = true;
    this.group.add(beam);
  }

  /** 賽道外圍的樹與看板，純裝飾，用 InstancedMesh 保持便宜。 */
  _buildScenery() {
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.55, 3.4, 6);
    const leafGeo = new THREE.ConeGeometry(2.6, 6.5, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 1 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 0.95 });

    const count = 260;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
    trunks.castShadow = leaves.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scl = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const s = this.samples[Math.floor(Math.random() * this.samples.length)];
      const dir = Math.random() < 0.5 ? -1 : 1;
      const off = ROAD_HALF_WIDTH + 8 + Math.random() * 42;
      const p = new THREE.Vector3().copy(s.pos).addScaledVector(s.side, off * dir);
      const k = 0.7 + Math.random() * 0.9;
      scl.set(k, k, k);

      m.compose(new THREE.Vector3(p.x, p.y + 1.7 * k - 0.5, p.z), q, scl);
      trunks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, p.y + 5.6 * k - 0.5, p.z), q, scl);
      leaves.setMatrixAt(i, m);
    }
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    this.group.add(trunks, leaves);
  }

  /* ---------------- 佈點 ---------------- */

  _layoutItemBoxes() {
    const spots = [];
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      const d = ((r + 0.5) / rows) * this.length;
      const s = this.sampleAt(this.indexAtDistance(d));
      for (const lat of [-5, 0, 5]) {
        spots.push({
          position: new THREE.Vector3().copy(s.pos).addScaledVector(s.side, lat).add(new THREE.Vector3(0, 1.4, 0)),
          dist: s.dist,
        });
      }
    }
    return spots;
  }

  _layoutBoostPads() {
    const spots = [];
    for (const frac of [0.17, 0.43, 0.68, 0.88]) {
      const s = this.sampleAt(this.indexAtDistance(frac * this.length));
      spots.push({ position: s.pos.clone(), tangent: s.tangent.clone(), side: s.side.clone(), dist: s.dist });
    }
    return spots;
  }

  /** 起跑格：最後一個取樣點往後排，兩兩交錯。 */
  startGrid(count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2 === 0 ? -1 : 1;
      const back = this.length - 12 - row * 8;
      const s = this.sampleAt(this.indexAtDistance(back));
      out.push({
        position: new THREE.Vector3().copy(s.pos).addScaledVector(s.side, col * 4.2),
        yaw: Math.atan2(s.tangent.x, s.tangent.z),
        index: this.indexAtDistance(back),
        dist: s.dist,
        trackLength: this.length,
      });
    }
    return out;
  }
}
