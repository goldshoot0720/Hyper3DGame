import * as THREE from 'three';

const DIFFICULTY = {
  easy: { skill: 0.62, speedCap: 0.82, driftUse: 0.35, itemUse: 0.5, reaction: 0.35 },
  normal: { skill: 0.8, speedCap: 0.93, driftUse: 0.7, itemUse: 0.8, reaction: 0.22 },
  hard: { skill: 0.95, speedCap: 1.0, driftUse: 0.95, itemUse: 1.0, reaction: 0.12 },
};

const _target = new THREE.Vector3();
const _local = new THREE.Vector3();

export class AIDriver {
  /**
   * @param {import('./kart.js').Kart} kart
   * @param {import('./track.js').Track} track
   * @param {'easy'|'normal'|'hard'} difficulty
   */
  constructor(kart, track, difficulty = 'normal') {
    this.kart = kart;
    this.track = track;
    this.cfg = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;

    // 每台 AI 給一點個性，避免整排車走同一條線
    this.lineBias = (Math.random() - 0.5) * 6;
    this.speedJitter = 0.92 + Math.random() * 0.12;
    this.wobblePhase = Math.random() * Math.PI * 2;

    this.driftHold = 0;
    this.itemTimer = 1 + Math.random() * 2;
    this.controls = { accel: true, brake: false, steer: 0, drift: false, useItem: false };
  }

  /** 前方 `span` 個取樣點的累積轉角（正 = 右彎）。 */
  _curvature(index, span) {
    const a = this.track.sampleAt(index).tangent;
    const b = this.track.sampleAt(index + span).tangent;
    const cross = a.x * b.z - a.z * b.x;
    const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
    return Math.sign(-cross) * Math.acos(dot);
  }

  update(dt, karts) {
    const k = this.kart;
    const c = this.controls;
    const cfg = this.cfg;

    if (k.finished) {
      c.accel = true;
      c.brake = false;
      c.steer = 0;
      c.drift = false;
      c.useItem = false;
      return c;
    }

    const speedRatio = THREE.MathUtils.clamp(k.vf / k.stats.maxSpeed, 0, 1);
    const lookAhead = Math.round(16 + speedRatio * 40); // 取樣點數
    const nearCurve = this._curvature(k.trackIndex, 26);
    const farCurve = this._curvature(k.trackIndex, 70);

    /* ---- 目標點（走內線） ---- */
    const s = this.track.sampleAt(k.trackIndex + lookAhead);
    const apex = -Math.sign(nearCurve) * Math.min(Math.abs(nearCurve) * 9, 6) * cfg.skill;
    const wobble = Math.sin(performance.now() * 0.0012 + this.wobblePhase) * 1.2 * (1 - cfg.skill);
    const lateral = THREE.MathUtils.clamp(apex + this.lineBias * (1 - cfg.skill) + wobble, -7.5, 7.5);
    _target.copy(s.pos).addScaledVector(s.side, lateral);

    /* ---- 轉向 ---- */
    _local.subVectors(_target, k.position);
    // 分子是目標點在車身「左側」的分量（世界 +X 一側），分母是前方分量。
    // steer 是 +1 = 往右，所以目標在左邊時要給負的 steer，取負號。
    const angle = Math.atan2(
      _local.x * Math.cos(k.yaw) - _local.z * Math.sin(k.yaw),
      _local.x * Math.sin(k.yaw) + _local.z * Math.cos(k.yaw),
    );
    c.steer = THREE.MathUtils.clamp(-angle * (1.9 + cfg.skill), -1, 1);

    /* ---- 油門 / 煞車 ---- */
    const corner = Math.abs(farCurve) * 0.62 + Math.abs(nearCurve) * 0.38;
    const targetRatio = THREE.MathUtils.clamp(1 - corner * 0.85, 0.42, 1) * cfg.speedCap * this.speedJitter;
    const targetSpeed = k.stats.maxSpeed * targetRatio;
    c.accel = k.vf < targetSpeed;
    c.brake = k.vf > targetSpeed * 1.16;

    /* ---- 漂移 ---- */
    const wantDrift =
      Math.abs(nearCurve) > 0.42 &&
      speedRatio > 0.45 &&
      Math.abs(c.steer) > 0.3 &&
      Math.random() < cfg.driftUse;
    if (wantDrift) this.driftHold = Math.max(this.driftHold, 0.35 + Math.abs(nearCurve) * 0.9);
    this.driftHold = Math.max(0, this.driftHold - dt);
    // 彎道快結束就放開，讓蓄力轉成加速
    if (Math.abs(nearCurve) < 0.2 && k.drifting && k.driftCharge > 0.9) this.driftHold = 0;
    c.drift = this.driftHold > 0;

    /* ---- 避讓前車 ---- */
    for (const other of karts) {
      if (other === k || other.finished) continue;
      const d = other.position.distanceTo(k.position);
      if (d > 8) continue;
      const rel = _local.subVectors(other.position, k.position);
      const fwdDot = rel.x * Math.sin(k.yaw) + rel.z * Math.cos(k.yaw);
      if (fwdDot < 1) continue;
      // sideDot > 0 表示對方在我的左側，要往右閃（steer 正向）
      const sideDot = rel.x * Math.cos(k.yaw) - rel.z * Math.sin(k.yaw);
      c.steer = THREE.MathUtils.clamp(c.steer + Math.sign(sideDot || 1) * (1 - d / 8) * 0.55, -1, 1);
    }

    /* ---- 道具 ---- */
    c.useItem = false;
    this.itemTimer -= dt;
    if (k.item && this.itemTimer <= 0 && Math.random() < cfg.itemUse) {
      const good =
        k.item === 'boost' ? Math.abs(nearCurve) < 0.3 && speedRatio > 0.5
        : k.item === 'shield' ? true
        : k.item === 'banana' ? karts.some((o) => o !== k && o.progress < k.progress && k.progress - o.progress < 30)
        : true;
      if (good) {
        c.useItem = true;
        this.itemTimer = 0.8 + Math.random() * 1.6;
      }
    }

    return c;
  }
}
