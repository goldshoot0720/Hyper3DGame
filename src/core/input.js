/** 鍵盤 / 觸控 / 手把輸入，統一輸出成 controls 物件。 */
export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = new Set();
    this.controls = { accel: false, brake: false, steer: 0, drift: false, useItem: false, lookBack: false };
    this._itemEdge = false;
    this._steerSmooth = 0;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    this._bindTouch();
  }

  _bindTouch() {
    const pads = document.querySelectorAll('#touch .tpad');
    for (const pad of pads) {
      const key = pad.dataset.key;
      const on = (e) => {
        e.preventDefault();
        this.touch.add(key);
        pad.classList.add('pressed');
      };
      const off = (e) => {
        e.preventDefault();
        this.touch.delete(key);
        pad.classList.remove('pressed');
      };
      pad.addEventListener('pointerdown', on);
      pad.addEventListener('pointerup', off);
      pad.addEventListener('pointercancel', off);
      pad.addEventListener('pointerleave', off);
    }
    if (matchMedia('(pointer: coarse)').matches) {
      document.getElementById('touch')?.classList.remove('hidden');
    }
  }

  _gamepad() {
    const gp = navigator.getGamepads?.().find((g) => g && g.connected);
    if (!gp) return null;
    const dead = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    return {
      steer: dead(gp.axes[0] ?? 0),
      accel: gp.buttons[0]?.pressed || (gp.buttons[7]?.value ?? 0) > 0.2,
      brake: gp.buttons[1]?.pressed || (gp.buttons[6]?.value ?? 0) > 0.2,
      drift: gp.buttons[5]?.pressed || gp.buttons[4]?.pressed,
      useItem: gp.buttons[2]?.pressed || gp.buttons[3]?.pressed,
      lookBack: gp.buttons[9]?.pressed,
    };
  }

  /** @param {number} dt */
  sample(dt) {
    const k = this.keys;
    const t = this.touch;
    const gp = this._gamepad();

    const left = k.has('ArrowLeft') || k.has('KeyA') || t.has('left');
    const right = k.has('ArrowRight') || k.has('KeyD') || t.has('right');
    let rawSteer = (right ? 1 : 0) - (left ? 1 : 0);
    if (gp && gp.steer !== 0) rawSteer = gp.steer;

    // 類比化：鍵盤也有轉向漸進，手感比較像跑跑
    const rate = rawSteer === 0 ? 14 : 9;
    this._steerSmooth += (rawSteer - this._steerSmooth) * Math.min(1, rate * dt);
    if (Math.abs(this._steerSmooth) < 0.002) this._steerSmooth = 0;

    const c = this.controls;
    c.steer = this._steerSmooth;
    c.accel = k.has('ArrowUp') || k.has('KeyW') || t.has('accel') || !!gp?.accel;
    c.brake = k.has('ArrowDown') || k.has('KeyS') || t.has('brake') || !!gp?.brake;
    c.drift = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || t.has('drift') || !!gp?.drift;
    c.lookBack = k.has('KeyB') || !!gp?.lookBack;

    // useItem 取上升緣，避免按著不放連續觸發
    const itemDown = k.has('KeyE') || k.has('ControlLeft') || t.has('item') || !!gp?.useItem;
    c.useItem = itemDown && !this._itemEdge;
    this._itemEdge = itemDown;

    return c;
  }

  /** 供 UI 判斷「有沒有按下任何鍵」（例如彈射起步）。 */
  get anyAccel() {
    return this.controls.accel;
  }
}
