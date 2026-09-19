import * as THREE from 'three';
import { ROAD_HALF_WIDTH } from './track.js';
import { getSeat } from './characters.js';

/** 漂移蓄力三段（跑跑式：藍 → 橘 → 紫）。 */
export const DRIFT_TIERS = [
  { charge: 0.85, boost: 0.9, color: 0x56b6ff, label: '藍火' },
  { charge: 1.95, boost: 1.55, color: 0xffa23a, label: '橘火' },
  { charge: 3.2, boost: 2.5, color: 0xc57bff, label: '紫火' },
];

const KART_RADIUS = 1.5;
const WALL_LIMIT = ROAD_HALF_WIDTH + 1.5 - KART_RADIUS * 0.55;

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function deriveStats(s) {
  return {
    maxSpeed: 27 + s.speed * 15,
    accel: 11 + s.accel * 10,
    brakeForce: 27,
    reverseSpeed: 7,
    steerRate: 2.0 + s.handling * 1.15,
    grip: 7.5 + s.handling * 4.5,
    driftGrip: 1.45,
    driftSteer: 1.35 + s.handling * 0.55,
    driftPush: 0.95,
    mass: 0.7 + s.weight * 0.9,
  };
}

/* ------------------------------------------------------------------ */
/* 車體外觀                                                            */
/* ------------------------------------------------------------------ */

function buildKartBody(character) {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: character.accentColor, roughness: 0.35, metalness: 0.45 });
  const trim = new THREE.MeshStandardMaterial({ color: character.color, roughness: 0.4, metalness: 0.2 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x15161d, roughness: 0.92 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xd9dde8, roughness: 0.3, metalness: 0.8 });

  // 車身是一個有深度的「浴缸」座艙，不是薄底盤：角色是站姿模型，
  // 要靠這個深度把腿整個藏進去才看得出是坐著。艙口上緣約在 y=1.16。
  const tub = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.9, 2.6), shell);
  tub.position.set(0, 0.71, -0.1);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.32, 1.0), trim);
  nose.position.set(0, 0.48, 1.85);
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.78, 0.3), trim);
  seatBack.position.set(0, 1.35, -1.3);
  const spoilerBlade = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 0.5), trim);
  spoilerBlade.position.set(0, 1.86, -1.75);
  for (const s of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.14), shell);
    stalk.position.set(0.68 * s, 1.5, -1.75);
    g.add(stalk);
  }
  g.add(tub, nose, seatBack, spoilerBlade);

  // 輪胎
  const wheelGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.42, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.45, 12);
  rimGeo.rotateZ(Math.PI / 2);
  const wheels = { fl: null, fr: null, rl: null, rr: null };
  const spec = [
    ['fl', -0.98, 1.05],
    ['fr', 0.98, 1.05],
    ['rl', -1.02, -1.12],
    ['rr', 1.02, -1.12],
  ];
  for (const [key, x, z] of spec) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.52, z);
    const tyre = new THREE.Mesh(wheelGeo, rubber);
    const hub = new THREE.Mesh(rimGeo, rim);
    tyre.castShadow = true;
    pivot.add(tyre, hub);
    g.add(pivot);
    wheels[key] = { pivot, tyre };
  }

  // 尾焰
  const flames = [];
  const flameGeo = new THREE.ConeGeometry(0.3, 1.5, 10, 1, true);
  flameGeo.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(
      flameGeo,
      new THREE.MeshBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    f.position.set(0.55 * s, 0.72, -1.5);
    f.visible = false;
    g.add(f);
    flames.push(f);
  }

  // 漂移火花
  const sparks = [];
  for (const s of [-1, 1]) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ color: 0x56b6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    sp.position.set(1.02 * s, 0.35, -1.12);
    sp.scale.setScalar(0.9);
    sp.visible = false;
    g.add(sp);
    sparks.push(sp);
  }

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, wheels, flames, sparks };
}

/* ------------------------------------------------------------------ */
/* Kart                                                                */
/* ------------------------------------------------------------------ */

export class Kart {
  /**
   * @param {object} character 角色設定
   * @param {THREE.Object3D} characterModel 已正規化的模型（會被掛進車上）
   * @param {boolean} isPlayer
   */
  constructor(character, characterModel, isPlayer = false) {
    this.character = character;
    this.isPlayer = isPlayer;
    this.stats = deriveStats(character.stats);

    this.root = new THREE.Group();
    this.root.name = `Kart_${character.id}`;
    this.tiltGroup = new THREE.Group();
    this.root.add(this.tiltGroup);

    const body = buildKartBody(character);
    this.wheels = body.wheels;
    this.flames = body.flames;
    this.sparks = body.sparks;
    this.tiltGroup.add(body.group);

    if (characterModel) {
      this.tiltGroup.add(characterModel);
      this.characterModel = characterModel;
      this.applySeat(getSeat(character));
    }

    // 車底陰影（比真陰影便宜，且永遠貼地）
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    this.root.add(blob);

    // --- 物理狀態 ---
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.vf = 0;
    this.vl = 0;

    // --- 漂移 / 加速 ---
    this.drifting = false;
    this.driftDir = 0;
    this.driftCharge = 0;
    this.driftTier = -1;
    this.boostTime = 0;
    this.boostStrength = 1;
    this.hopTime = 0;

    // --- 狀態效果 ---
    this.spinTime = 0;
    this.squashTime = 0;
    this.shieldTime = 0;
    this.item = null;
    this.itemRolling = 0;

    // --- 賽事 ---
    this.lap = 0;
    this.trackIndex = 0;
    this.lastDist = 0;
    this.progress = 0;
    this.rank = 1;
    this.finished = false;
    this.finishTime = 0;
    this.lapTimes = [];

    this._roll = 0;
    this._wheelSpin = 0;
    this._steerVis = 0;
    this._events = [];
  }

  /**
   * 套用坐姿設定。角色是站姿模型，往下沉讓腿藏進車殼裡，看起來就像坐著。
   * @param {{x:number,y:number,z:number,rotY:number,scale:number}} seat
   */
  applySeat(seat) {
    if (!this.characterModel) return;
    this.seat = seat;
    this.characterModel.position.set(seat.x, seat.y, seat.z);
    this.characterModel.rotation.y = seat.rotY;
    this.characterModel.scale.setScalar(seat.scale);
  }

  /** 取出本幀發生的事件（漂移出火、撞牆…），供 HUD / 音效使用。 */
  drainEvents() {
    const e = this._events;
    this._events = [];
    return e;
  }

  placeAt(slot) {
    this.position.copy(slot.position);
    this.yaw = slot.yaw;
    this.trackIndex = slot.index;
    this.lastDist = slot.dist;
    // 起跑格在終點線「後方」，所以第一次過線是開始跑第 1 圈而不是完成第 1 圈。
    // 用 lap = -1 起算，過線後變 0（= 正在跑第 1 圈），lap 到達 totalLaps 才算完賽。
    this.lap = -1;
    this.progress = slot.dist - slot.trackLength;
    this.velocity.set(0, 0, 0);
    this.vf = this.vl = 0;
    this.finished = false;
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;
  }

  get speedKmh() {
    return Math.abs(this.vf) * 3.6;
  }

  applyBoost(duration, strength = 1.5) {
    this.boostTime = Math.max(this.boostTime, duration);
    this.boostStrength = strength;
    this._events.push({ type: 'boost', strength });
  }

  spinOut(duration = 1.5) {
    if (this.shieldTime > 0) {
      this.shieldTime = 0;
      this._events.push({ type: 'shieldBreak' });
      return false;
    }
    this.spinTime = Math.max(this.spinTime, duration);
    this.drifting = false;
    this.driftCharge = 0;
    this.boostTime = 0;
    this._events.push({ type: 'spin' });
    return true;
  }

  squash(duration = 1.6) {
    if (this.shieldTime > 0) {
      this.shieldTime = 0;
      this._events.push({ type: 'shieldBreak' });
      return false;
    }
    this.squashTime = Math.max(this.squashTime, duration);
    this.boostTime = 0;
    this._events.push({ type: 'squash' });
    return true;
  }

  /**
   * @param {number} dt
   * @param {{accel:boolean,brake:boolean,steer:number,drift:boolean}} ctrl
   * @param {import('./track.js').Track} track
   */
  update(dt, ctrl, track) {
    const st = this.stats;

    this.boostTime = Math.max(0, this.boostTime - dt);
    this.spinTime = Math.max(0, this.spinTime - dt);
    this.squashTime = Math.max(0, this.squashTime - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    this.hopTime = Math.max(0, this.hopTime - dt);

    const disabled = this.spinTime > 0 || this.squashTime > 0;
    const boosting = this.boostTime > 0;

    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.vf = this.velocity.dot(_fwd);
    this.vl = this.velocity.dot(_right);

    /* ---- 路面 ---- */
    const loc = track.locate(this.position, this.trackIndex);
    this.trackIndex = loc.index;
    const onKerb = Math.abs(loc.lateral) > ROAD_HALF_WIDTH;
    const surfSpeed = onKerb ? 0.9 : 1;
    const surfGrip = onKerb ? 0.75 : 1;

    /* ---- 節流 ---- */
    let maxSpeed = st.maxSpeed * surfSpeed * (boosting ? 1.42 : 1);
    if (this.squashTime > 0) maxSpeed = 4;

    if (disabled) {
      this.vf -= 9 * dt;
      if (this.squashTime > 0) this.vf = Math.min(this.vf, 4);
    } else if (ctrl.accel) {
      this.vf += st.accel * (boosting ? 2.4 : 1) * dt;
    } else {
      this.vf -= 6.5 * dt * Math.sign(this.vf || 1);
      if (Math.abs(this.vf) < 0.4) this.vf = 0;
    }
    if (!disabled && ctrl.brake) {
      if (this.vf > 0.5) this.vf -= st.brakeForce * dt;
      else this.vf = Math.max(this.vf - st.accel * 0.55 * dt, -st.reverseSpeed);
    }
    this.vf = THREE.MathUtils.clamp(this.vf, -st.reverseSpeed, maxSpeed);

    /* ---- 漂移狀態機 ---- */
    const speedRatio = this.vf / st.maxSpeed;
    if (!disabled && ctrl.drift && !this.drifting && speedRatio > 0.34 && Math.abs(ctrl.steer) > 0.22) {
      this.drifting = true;
      this.driftDir = Math.sign(ctrl.steer);
      this.driftCharge = 0;
      this.driftTier = -1;
      this.hopTime = 0.24;
      this._events.push({ type: 'driftStart' });
    }
    if (this.drifting && (disabled || !ctrl.drift || speedRatio < 0.2)) {
      this._releaseDrift();
    }

    /* ---- 轉向 ----
     * 座標慣例（很容易搞錯，寫清楚）：
     *   車頭 forward = (sin yaw, 0, cos yaw)，yaw=0 時朝世界 +Z。
     *   追尾鏡頭在車後、同樣朝 +Z 看，此時攝影機的 xAxis = cross(up, eye-target)
     *   = (-1, 0, 0)，也就是「螢幕右方 = 世界 -X」。
     *   yaw 增加會讓車頭從 +Z 轉向 +X，那是螢幕的「左」。
     * 所以 yawRate 一律以「向左為正」計算，最後取負號套用到 yaw，
     * 玩家按右鍵（steer=+1）才會真的往螢幕右邊轉。
     */
    let yawRate; // 正 = 向左
    if (this.drifting) {
      const lean = THREE.MathUtils.clamp(ctrl.steer * this.driftDir, -1, 1);
      yawRate = st.driftSteer * this.driftDir * (0.58 + 0.42 * lean);
    } else if (disabled) {
      yawRate = this.spinTime > 0 ? 9.5 : 0;
    } else {
      yawRate = st.steerRate * ctrl.steer;
    }
    const speedGate = THREE.MathUtils.clamp(Math.abs(this.vf) / 5, 0, 1);
    const highSpeedDamp = 1 - 0.32 * THREE.MathUtils.clamp(Math.abs(this.vf) / st.maxSpeed, 0, 1);
    const reverseFlip = this.vf < -0.2 && !disabled ? -1 : 1;
    this.yaw -= yawRate * speedGate * highSpeedDamp * reverseFlip * dt;

    /* ---- 側向抓地 ---- */
    const grip = (this.drifting ? st.driftGrip : st.grip) * surfGrip;
    this.vl *= Math.exp(-grip * dt);
    if (this.drifting) {
      // _right 是世界 +X 方向（= 車身左側）。向右漂移時車頭轉得比速度方向快，
      // 速度相對車身就落在左邊，也就是 vl 往正的方向跑。
      this.vl += this.driftDir * Math.abs(this.vf) * st.driftPush * dt;
      this.vl = THREE.MathUtils.clamp(this.vl, -14, 14);
      this.driftCharge += dt * (0.72 + 0.55 * THREE.MathUtils.clamp(Math.abs(this.vl) / 8, 0, 1));
      const tier = this._tierFor(this.driftCharge);
      if (tier > this.driftTier) {
        this.driftTier = tier;
        this._events.push({ type: 'driftTier', tier });
      }
    }

    /* ---- 積分 ---- */
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.velocity.copy(_fwd).multiplyScalar(this.vf).addScaledVector(_right, this.vl);
    this.position.addScaledVector(this.velocity, dt);

    /* ---- 牆壁 ---- */
    const loc2 = track.locate(this.position, this.trackIndex);
    this.trackIndex = loc2.index;
    if (Math.abs(loc2.lateral) > WALL_LIMIT) {
      const sign = Math.sign(loc2.lateral);
      const over = Math.abs(loc2.lateral) - WALL_LIMIT;
      this.position.addScaledVector(loc2.side, -sign * over);
      const into = this.velocity.dot(loc2.side) * sign;
      if (into > 0) {
        this.velocity.addScaledVector(loc2.side, -sign * into * 1.5);
        this.velocity.multiplyScalar(0.82);
        if (into > 6) this._events.push({ type: 'wallHit', force: into });
      }
      if (this.drifting) this._releaseDrift();
    }

    // 貼地
    this.position.y = THREE.MathUtils.lerp(this.position.y, loc2.height, 1 - Math.exp(-14 * dt));

    /* ---- 圈數 ---- */
    const d = loc2.dist;
    const L = track.length;
    if (this.lastDist > L * 0.75 && d < L * 0.25) {
      this.lap++;
      this._events.push({ type: 'lap', lap: this.lap });
    } else if (this.lastDist < L * 0.25 && d > L * 0.75) {
      this.lap--;
    }
    this.lastDist = d;
    this.progress = this.lap * L + d;

    this._updateVisuals(dt, ctrl);
  }

  _tierFor(charge) {
    let t = -1;
    for (let i = 0; i < DRIFT_TIERS.length; i++) if (charge >= DRIFT_TIERS[i].charge) t = i;
    return t;
  }

  _releaseDrift() {
    const tier = this._tierFor(this.driftCharge);
    this.drifting = false;
    this.driftCharge = 0;
    this.driftTier = -1;
    if (tier >= 0) {
      this.applyBoost(DRIFT_TIERS[tier].boost, 1.4 + tier * 0.12);
      this._events.push({ type: 'driftBoost', tier });
    }
  }

  _updateVisuals(dt, ctrl) {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;

    // 漂移時車身相對前進方向偏一個角度（視覺甩尾）
    const slip = Math.atan2(this.vl, Math.max(Math.abs(this.vf), 1)) * (this.drifting ? 1.0 : 0.45);
    this.tiltGroup.rotation.y = THREE.MathUtils.lerp(this.tiltGroup.rotation.y, -slip, 1 - Math.exp(-12 * dt));

    // 側傾
    const targetRoll = THREE.MathUtils.clamp(-this.vl * 0.045, -0.3, 0.3);
    this._roll = THREE.MathUtils.lerp(this._roll, targetRoll, 1 - Math.exp(-10 * dt));
    this.tiltGroup.rotation.z = this._roll;

    // 小跳 + 壓扁
    const hop = this.hopTime > 0 ? Math.sin((1 - this.hopTime / 0.24) * Math.PI) * 0.45 : 0;
    this.tiltGroup.position.y = hop;
    const squash = this.squashTime > 0 ? 0.35 : 1;
    this.tiltGroup.scale.set(
      THREE.MathUtils.lerp(this.tiltGroup.scale.x, squash > 0.5 ? 1 : 1.35, 1 - Math.exp(-14 * dt)),
      THREE.MathUtils.lerp(this.tiltGroup.scale.y, squash, 1 - Math.exp(-14 * dt)),
      THREE.MathUtils.lerp(this.tiltGroup.scale.z, squash > 0.5 ? 1 : 1.35, 1 - Math.exp(-14 * dt)),
    );

    // 輪子
    this._wheelSpin += (this.vf / 0.52) * dt;
    // 前輪轉角也要跟著座標慣例取負，否則會朝反方向打
    const steerVisTarget = -(this.drifting ? this.driftDir * 0.5 : (ctrl?.steer ?? 0) * 0.42);
    this._steerVis = THREE.MathUtils.lerp(this._steerVis, steerVisTarget, 1 - Math.exp(-14 * dt));
    for (const key of ['fl', 'fr', 'rl', 'rr']) {
      const w = this.wheels[key];
      w.tyre.rotation.x = this._wheelSpin;
      if (key[0] === 'f') w.pivot.rotation.y = this._steerVis;
    }

    // 尾焰
    const boosting = this.boostTime > 0;
    for (const f of this.flames) {
      f.visible = boosting;
      if (boosting) {
        const k = 0.75 + Math.random() * 0.6;
        f.scale.set(k, k, 1 + Math.random() * 0.8);
        f.material.opacity = 0.55 + Math.random() * 0.4;
      }
    }

    // 漂移火花
    const tier = this.drifting ? this._tierFor(this.driftCharge) : -1;
    for (const sp of this.sparks) {
      sp.visible = tier >= 0;
      if (tier >= 0) {
        sp.material.color.setHex(DRIFT_TIERS[tier].color);
        sp.scale.setScalar(0.7 + Math.random() * 0.75 + tier * 0.22);
        sp.material.opacity = 0.6 + Math.random() * 0.4;
      }
    }
  }
}
