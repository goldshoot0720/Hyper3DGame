import * as THREE from 'three';
import { DEFAULT_SEAT } from '../game/characters.js';

const HELP = [
  ['W / S', '前後 (z)'],
  ['A / D', '左右 (x)'],
  ['R / F', '上下 (y)'],
  ['Q / E', '旋轉'],
  ['Z / X', '縮放'],
  ['方向鍵', '環繞鏡頭'],
  ['空白鍵', '轉 180°（面向相反）'],
  ['0', '回到預設值'],
  ['C', '把數值輸出到 Console'],
  ['P', '離開調整模式'],
];

/**
 * 座位調整模式。Rodin 給的是站姿模型，塞進駕駛座的位置與朝向沒辦法用算的決定，
 * 得看實際畫面。這個工具讓你邊看邊調，調好把數值貼回 characters.js。
 */
export class SeatTuner {
  constructor(camera) {
    this.camera = camera;
    this.active = false;
    this.kart = null;
    this.seat = { ...DEFAULT_SEAT };

    this.orbit = { yaw: 2.4, pitch: 0.28, dist: 7.5 };
    this.keys = new Set();

    this.el = document.createElement('div');
    this.el.id = 'seat-tuner';
    this.el.style.cssText = `
      position:fixed; left:18px; top:18px; z-index:40;
      background:rgba(10,13,28,.92); border:1px solid rgba(255,255,255,.18);
      border-radius:14px; padding:14px 18px; font:13px/1.65 ui-monospace,Consolas,monospace;
      color:#fff; pointer-events:none; backdrop-filter:blur(10px); display:none;
      box-shadow:0 12px 40px rgba(0,0,0,.5);
    `;
    document.body.appendChild(this.el);

    addEventListener('keydown', (e) => {
      if (e.code === 'KeyP') {
        this.toggle();
        e.preventDefault();
        return;
      }
      if (!this.active) return;
      this.keys.add(e.code);
      if (e.code === 'KeyC') this.dump();
      if (e.code === 'Digit0') this.seat = { ...DEFAULT_SEAT };
      if (e.code === 'Space') this.seat.rotY += Math.PI;
      e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  /** @param {import('../game/kart.js').Kart} kart */
  attach(kart) {
    this.kart = kart;
    if (kart?.seat) this.seat = { ...kart.seat };
  }

  toggle() {
    if (!this.kart) return;
    this.active = !this.active;
    this.el.style.display = this.active ? 'block' : 'none';
    if (!this.active) this.dump();
  }

  dump() {
    const s = this.seat;
    const r = (v) => Number(v.toFixed(3));
    const deg = Math.round((s.rotY * 180) / Math.PI);
    const line = `{ x: ${r(s.x)}, y: ${r(s.y)}, z: ${r(s.z)}, rotY: ${r(s.rotY)}, scale: ${r(s.scale)} }`;
    console.log(
      `%c[座位設定] ${this.kart?.character.name ?? ''}  (旋轉 ${deg}°)\n` +
        `貼到 characters.js 的 DEFAULT_SEAT：\n` +
        `export const DEFAULT_SEAT = ${line};\n` +
        `或只給這個角色：  seat: ${line},`,
      'color:#ffcc33;font-weight:bold',
    );
  }

  update(dt) {
    if (!this.active || !this.kart) return;
    const k = this.keys;
    const step = (a, b, rate) => ((k.has(a) ? -1 : 0) + (k.has(b) ? 1 : 0)) * rate * dt;

    this.seat.z += step('KeyS', 'KeyW', 1.2);
    this.seat.x += step('KeyA', 'KeyD', 1.2);
    this.seat.y += step('KeyF', 'KeyR', 1.2);
    this.seat.rotY += step('KeyQ', 'KeyE', 1.8);
    this.seat.scale = Math.max(0.15, this.seat.scale + step('KeyZ', 'KeyX', 0.7));

    this.orbit.yaw += step('ArrowLeft', 'ArrowRight', 1.6);
    this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch + step('ArrowDown', 'ArrowUp', 1.2), -0.3, 1.2);

    this.kart.applySeat(this.seat);

    // 環繞鏡頭，方便從各角度確認朝向與坐姿
    const { yaw, pitch, dist } = this.orbit;
    const c = this.kart.position;
    this.camera.position.set(
      c.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      c.y + 1.4 + Math.sin(pitch) * dist,
      c.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    this.camera.lookAt(c.x, c.y + 1.2, c.z);

    this.render();
  }

  render() {
    const s = this.seat;
    const f = (v) => (v >= 0 ? ' ' : '') + v.toFixed(2);
    const deg = Math.round(((s.rotY * 180) / Math.PI) % 360);
    this.el.innerHTML =
      `<div style="color:#ffcc33;font-weight:700;margin-bottom:8px">座位調整：${this.kart.character.name}</div>` +
      `<div>x ${f(s.x)}　y ${f(s.y)}　z ${f(s.z)}</div>` +
      `<div>旋轉 ${deg}°　縮放 ${s.scale.toFixed(2)}</div>` +
      `<div style="margin:10px 0 6px;opacity:.5">─────────────</div>` +
      HELP.map(([key, desc]) => `<div><b style="color:#59d2ff">${key}</b>　${desc}</div>`).join('');
  }
}
