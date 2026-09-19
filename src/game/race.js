import * as THREE from 'three';
import { Kart } from './kart.js';
import { AIDriver } from './ai.js';
import { ItemManager } from './items.js';
import { Minimap } from '../ui/minimap.js';
import { ITEM_DEFS } from './items.js';
import { DRIFT_TIERS } from './kart.js';

const COUNTDOWN_STEPS = [
  { at: 0.0, text: '3' },
  { at: 1.0, text: '2' },
  { at: 2.0, text: '1' },
  { at: 3.0, text: 'GO!' },
];
const GO_TIME = 3.0;
const PERFECT_START_WINDOW = 0.28;

export class Race {
  constructor({ scene, track, hud, chaseCam, input, minimapCanvas, audio }) {
    this.scene = scene;
    this.track = track;
    this.hud = hud;
    this.chaseCam = chaseCam;
    this.input = input;
    this.audio = audio;

    this.items = new ItemManager(track, scene);
    this.minimap = new Minimap(minimapCanvas, track);

    /** @type {Kart[]} */
    this.karts = [];
    /** @type {AIDriver[]} */
    this.ais = [];
    this.player = null;

    this.state = 'idle';
    this.clock = 0;
    this.time = 0;
    this.totalLaps = 3;
    this._countdownIdx = 0;
    this._goAt = 0;
    this._perfectUsed = false;
    this.onFinish = null;
  }

  /**
   * @param {{playerCharacter:object, roster:object[], models:Map, laps:number, difficulty:string}} opts
   */
  start({ playerCharacter, roster, models, laps, difficulty }) {
    this.dispose();
    this.totalLaps = laps;

    const grid = this.track.startGrid(roster.length);
    // 玩家排在中段，前面留幾台 AI 讓追逐有意義。
    // 先把玩家的格子挑掉，剩下的依序發給 AI，保證一車一格不重疊。
    const playerSlot = Math.min(grid.length - 1, Math.floor(roster.length / 2));
    const aiSlots = grid.map((_, i) => i).filter((i) => i !== playerSlot);

    let aiCursor = 0;
    roster.forEach((character) => {
      const isPlayer = character.id === playerCharacter.id;
      const entry = models.get(character.id);
      const model = entry?.object ? entry.object.clone(true) : null;
      const kart = new Kart(character, model, isPlayer);

      const slotIdx = isPlayer ? playerSlot : aiSlots[aiCursor++];
      kart.placeAt(grid[slotIdx]);

      this.scene.add(kart.root);
      this.karts.push(kart);
      if (isPlayer) this.player = kart;
      else this.ais.push(new AIDriver(kart, this.track, difficulty));
    });

    this.items.reset();
    this.chaseCam.reset();
    this.state = 'countdown';
    this.clock = 0;
    this.time = 0;
    this._countdownIdx = 0;
    this._perfectUsed = false;
    this._heldEarly = false;
    this._updateRanks();
  }

  dispose() {
    for (const k of this.karts) this.scene.remove(k.root);
    this.karts.length = 0;
    this.ais.length = 0;
    this.player = null;
    this.items.reset();
    this.state = 'idle';
  }

  get finished() {
    return this.state === 'finished';
  }

  update(dt) {
    if (this.state === 'idle') return;
    this.clock += dt;

    const racing = this.state !== 'countdown';
    if (this.state === 'countdown') this._tickCountdown();
    if (racing) this.time += dt;

    const ctrl = this.input.sample(dt);
    const locked = this.state === 'countdown';

    /* --- 玩家 --- */
    if (this.player) {
      const pc = locked
        ? { accel: false, brake: false, steer: 0, drift: false, useItem: false }
        : ctrl;
      if (!locked && ctrl.useItem && this.player.item) {
        const used = this.items.useItem(this.player, this.karts);
        if (used) this.hud.toast(ITEM_DEFS[used].name, '#59d2ff');
      }
      if (!this.player.finished) this.player.update(dt, pc, this.track);
      else this.player.update(dt, { accel: true, brake: false, steer: 0, drift: false }, this.track);
      this._handleEvents(this.player, true);
    }

    /* --- AI --- */
    for (const ai of this.ais) {
      const aic = locked
        ? { accel: false, brake: false, steer: 0, drift: false, useItem: false }
        : ai.update(dt, this.karts);
      if (!locked && aic.useItem && ai.kart.item) this.items.useItem(ai.kart, this.karts);
      ai.kart.update(dt, aic, this.track);
      this._handleEvents(ai.kart, false);
    }

    /* --- 車與車碰撞 --- */
    this._resolveCollisions();

    /* --- 道具 / 名次 / 完賽 --- */
    if (racing) {
      this.items.update(dt, this.karts);
      for (const k of this.karts) k.itemRolling = Math.max(0, k.itemRolling - dt);
      this._updateRanks();
      this._checkFinish();
    }

    /* --- 鏡頭 / HUD --- */
    if (this.player) {
      this.chaseCam.update(dt, this.player, ctrl.lookBack);
      this.hud.update(this.player, {
        totalLaps: this.totalLaps,
        time: this.time,
        karts: this.karts,
      });
      this.minimap.draw(this.karts, this.player);
    }
  }

  _tickCountdown() {
    // 「1」之後還按著油門就是搶跑，拿不到彈射起步
    if (this.clock > GO_TIME - 0.65 && this.input.controls.accel) this._heldEarly = true;

    while (this._countdownIdx < COUNTDOWN_STEPS.length && this.clock >= COUNTDOWN_STEPS[this._countdownIdx].at) {
      const step = COUNTDOWN_STEPS[this._countdownIdx];
      this.hud.countdown(step.text);
      this.audio?.beep(step.text === 'GO!' ? 880 : 440);
      this._countdownIdx++;
    }
    if (this.clock >= GO_TIME) {
      this.state = 'racing';
      this._goAt = this.clock;
      // AI 起步反應時間
      for (const ai of this.ais) ai.itemTimer = 1 + Math.random() * 2;
    }
  }

  _handleEvents(kart, isPlayer) {
    for (const e of kart.drainEvents()) {
      if (!isPlayer) continue;
      switch (e.type) {
        case 'driftBoost':
          this.hud.toast(`${DRIFT_TIERS[e.tier].label}！`, `#${DRIFT_TIERS[e.tier].color.toString(16).padStart(6, '0')}`);
          this.chaseCam.shake(0.18 + e.tier * 0.08);
          this.audio?.boost();
          break;
        case 'wallHit':
          this.chaseCam.shake(Math.min(0.5, e.force * 0.03));
          this.audio?.thud();
          break;
        case 'spin':
          this.hud.toast('被擊中！', '#ff5e7a');
          this.chaseCam.shake(0.4);
          break;
        case 'squash':
          this.hud.toast('被水球砸中！', '#59d2ff');
          this.chaseCam.shake(0.5);
          break;
        case 'shieldBreak':
          this.hud.toast('護盾擋下！', '#7cf7a0');
          break;
        case 'lap':
          // lap 0 是起跑過線，不是完成一圈，所以不報
          if (e.lap > 0 && e.lap < this.totalLaps) this.hud.toast(`第 ${e.lap + 1} 圈`, '#ffcc33');
          break;
      }
    }
  }

  /** 起跑瞬間按下油門 → 彈射起步。 */
  tryPerfectStart() {
    if (this._perfectUsed || this.state !== 'racing' || !this.player) return;
    if (this.clock - this._goAt <= PERFECT_START_WINDOW) {
      if (this.input.controls.accel && !this._heldEarly) {
        this._perfectUsed = true;
        this.player.applyBoost(1.6, 1.7);
        this.hud.toast('彈射起步！', '#7cf7a0');
      }
    } else {
      this._perfectUsed = true;
    }
  }

  _resolveCollisions() {
    const R = 2.1;
    for (let i = 0; i < this.karts.length; i++) {
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i];
        const b = this.karts[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R * 4 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const overlap = R * 2 - d;
        if (overlap <= 0) continue;

        const nx = dx / d;
        const nz = dz / d;
        const ma = a.stats.mass;
        const mb = b.stats.mass;
        const sum = ma + mb;
        a.position.x -= nx * overlap * (mb / sum);
        a.position.z -= nz * overlap * (mb / sum);
        b.position.x += nx * overlap * (ma / sum);
        b.position.z += nz * overlap * (ma / sum);

        const push = 4.5;
        a.velocity.x -= nx * push * (mb / sum);
        a.velocity.z -= nz * push * (mb / sum);
        b.velocity.x += nx * push * (ma / sum);
        b.velocity.z += nz * push * (ma / sum);

        if (a === this.player || b === this.player) this.chaseCam.shake(0.12);
      }
    }
  }

  _updateRanks() {
    const sorted = this.karts.slice().sort((x, y) => {
      if (x.finished && y.finished) return x.finishTime - y.finishTime;
      if (x.finished) return -1;
      if (y.finished) return 1;
      return y.progress - x.progress;
    });
    sorted.forEach((k, i) => { k.rank = i + 1; });
    this._sorted = sorted;
  }

  _checkFinish() {
    for (const k of this.karts) {
      if (!k.finished && k.lap >= this.totalLaps) {
        k.finished = true;
        k.finishTime = this.time;
        if (k === this.player) {
          this.hud.toast(`完賽 ${k.rank} 名！`, '#ffcc33');
          this._endRace();
        }
      }
    }
  }

  _endRace() {
    if (this.state === 'finished') return;
    this.state = 'finished';
    // 未完賽的車依進度補上名次與預估時間
    const remaining = this.karts.filter((k) => !k.finished).sort((a, b) => b.progress - a.progress);
    for (const k of remaining) {
      const left = this.totalLaps * this.track.length - k.progress;
      k.finishTime = this.time + left / Math.max(k.stats.maxSpeed * 0.8, 1);
    }
    this._updateRanks();
    setTimeout(() => this.onFinish?.(this._sorted), 2200);
  }

  /** 完賽後讓 AI 繼續跑動作，鏡頭環繞玩家。 */
  updateOutro(dt, t) {
    if (!this.player) return;
    const r = 14;
    const cam = this.chaseCam.camera;
    cam.position.set(
      this.player.position.x + Math.sin(t * 0.5) * r,
      this.player.position.y + 6,
      this.player.position.z + Math.cos(t * 0.5) * r,
    );
    cam.lookAt(new THREE.Vector3(this.player.position.x, this.player.position.y + 1.4, this.player.position.z));
  }
}
