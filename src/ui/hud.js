import { ITEM_DEFS } from '../game/items.js';
import { DRIFT_TIERS } from '../game/kart.js';

const ORDINALS = ['', 'st', 'nd', 'rd'];
const ordinal = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ORDINALS[n % 10] ?? 'th');

export function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      lap: document.getElementById('lap-display'),
      pos: document.getElementById('pos-display'),
      time: document.getElementById('time-display'),
      itemSlot: document.getElementById('item-slot'),
      itemIcon: document.getElementById('item-icon'),
      speedRing: document.getElementById('speed-ring'),
      speedValue: document.getElementById('speed-value'),
      boostFill: document.getElementById('boost-fill'),
      countdown: document.getElementById('countdown'),
      toast: document.getElementById('toast'),
      standings: document.getElementById('standings'),
    };
    this._lastItem = undefined;
    this._toastTimer = null;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  countdown(text) {
    const el = this.el.countdown;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth; // 重播動畫
    el.classList.add('show');
  }

  toast(text, color = '#ffcc33') {
    const el = this.el.toast;
    el.textContent = text;
    el.style.color = color;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /**
   * @param {import('../game/kart.js').Kart} kart
   * @param {{lap:number, totalLaps:number, time:number, karts:any[]}} race
   */
  update(kart, race) {
    const { el } = this;

    // lap 從 -1 起算（起跑格在終點線後方），顯示時夾在 1..totalLaps
    const shownLap = Math.min(Math.max(kart.lap + 1, 1), race.totalLaps);
    el.lap.textContent = `LAP ${shownLap}/${race.totalLaps}`;
    el.pos.innerHTML = `${kart.rank}<span class="sup">${ordinal(kart.rank)}</span>`;
    el.time.textContent = formatTime(race.time);

    // 速度表（dasharray 314 ≈ 2πr，只用 3/4 圈）
    const kmh = kart.speedKmh;
    el.speedValue.textContent = Math.round(kmh);
    const maxKmh = kart.stats.maxSpeed * 1.42 * 3.6;
    const frac = Math.min(1, kmh / maxKmh) * 0.75;
    el.speedRing.style.strokeDashoffset = String(314 * (1 - frac));
    el.speedRing.style.stroke = kart.boostTime > 0 ? '#ff5e7a' : '#ffcc33';

    // 漂移蓄力條
    const maxCharge = DRIFT_TIERS[DRIFT_TIERS.length - 1].charge;
    if (kart.drifting) {
      const pct = Math.min(1, kart.driftCharge / maxCharge) * 100;
      let tier = -1;
      for (let i = 0; i < DRIFT_TIERS.length; i++) if (kart.driftCharge >= DRIFT_TIERS[i].charge) tier = i;
      el.boostFill.style.width = `${pct}%`;
      el.boostFill.style.background = tier >= 0 ? `#${DRIFT_TIERS[tier].color.toString(16).padStart(6, '0')}` : '#7b8aa8';
    } else if (kart.boostTime > 0) {
      el.boostFill.style.width = `${Math.min(100, kart.boostTime * 40)}%`;
      el.boostFill.style.background = '#ff5e7a';
    } else {
      el.boostFill.style.width = '0%';
    }

    // 道具格
    if (kart.item !== this._lastItem) {
      this._lastItem = kart.item;
      el.itemIcon.textContent = kart.item ? ITEM_DEFS[kart.item].icon : '';
      el.itemSlot.classList.toggle('filled', !!kart.item);
    }
    el.itemSlot.classList.toggle('rolling', kart.itemRolling > 0);

    // 排名列表
    this._renderStandings(race.karts, kart);
  }

  _renderStandings(karts, me) {
    const rows = karts
      .slice()
      .sort((a, b) => a.rank - b.rank)
      .map(
        (k) =>
          `<div class="row${k === me ? ' me' : ''}"><span class="n">${k.rank}</span><span>${k.character.name}</span></div>`,
      )
      .join('');
    if (this._standingsCache !== rows) {
      this._standingsCache = rows;
      this.el.standings.innerHTML = rows;
    }
  }
}
