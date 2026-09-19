/** 2D 小地圖：把賽道中心線投影到 canvas，畫出所有車的位置。 */
export class Minimap {
  constructor(canvas, track) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.track = track;

    // 依賽道包圍盒算出縮放與位移
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of track.samples) {
      minX = Math.min(minX, s.pos.x); maxX = Math.max(maxX, s.pos.x);
      minZ = Math.min(minZ, s.pos.z); maxZ = Math.max(maxZ, s.pos.z);
    }
    const pad = 16;
    const w = canvas.width - pad * 2;
    const h = canvas.height - pad * 2;
    this.scale = Math.min(w / (maxX - minX), h / (maxZ - minZ));
    // 地圖兩軸都取負，讓它和玩家看到的畫面同手性：
    // 車頭朝世界 +Z，而鏡頭同向往 +Z 看，此時螢幕右方是世界 -X。
    // 直接把 x/z 畫上去的話地圖會左右鏡像，而且前進方向會往下跑。
    this.offX = pad + (w - (maxX - minX) * this.scale) / 2 + maxX * this.scale;
    this.offZ = pad + (h - (maxZ - minZ) * this.scale) / 2 + maxZ * this.scale;

    this.path = new Path2D();
    track.samples.forEach((s, i) => {
      const [x, y] = this._project(s.pos);
      if (i === 0) this.path.moveTo(x, y);
      else this.path.lineTo(x, y);
    });
    this.path.closePath();
  }

  _project(v) {
    return [-v.x * this.scale + this.offX, -v.z * this.scale + this.offZ];
  }

  draw(karts, player) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 11;
    ctx.stroke(this.path);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.stroke(this.path);

    // 起點線
    const [sx, sy] = this._project(this.track.samples[0].pos);
    ctx.fillStyle = '#ffcc33';
    ctx.fillRect(sx - 4, sy - 4, 8, 8);

    for (const k of karts) {
      const [x, y] = this._project(k.position);
      const isMe = k === player;
      ctx.beginPath();
      ctx.arc(x, y, isMe ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = isMe ? '#ffcc33' : `#${k.character.accentColor.toString(16).padStart(6, '0')}`;
      ctx.fill();
      if (isMe) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
}
