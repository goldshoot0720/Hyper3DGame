import * as THREE from 'three';
import { flatBasis } from './track.js';

export const ITEM_DEFS = {
  boost: { icon: '🚀', name: '加速器' },
  banana: { icon: '🍌', name: '香蕉皮' },
  missile: { icon: '🎯', name: '追蹤飛彈' },
  shield: { icon: '🛡️', name: '護盾' },
  water: { icon: '💧', name: '水球' },
};

/** 名次越後面，抽到強力道具的機率越高（橡皮筋機制）。 */
function rollItem(rank, total) {
  const back = total > 1 ? (rank - 1) / (total - 1) : 0; // 0 = 第一名, 1 = 最後一名
  const table = [
    ['boost', 0.3 + back * 0.1],
    ['banana', 0.28 - back * 0.14],
    ['shield', 0.22 - back * 0.06],
    ['missile', 0.14 + back * 0.2],
    ['water', 0.02 + back * 0.26],
  ];
  const total_w = table.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let r = Math.random() * total_w;
  for (const [id, w] of table) {
    r -= Math.max(0, w);
    if (r <= 0) return id;
  }
  return 'boost';
}

export class ItemManager {
  constructor(track, scene) {
    this.track = track;
    this.scene = scene;
    this.boxes = [];
    this.bananas = [];
    this.missiles = [];
    this.pads = [];
    this._padCooldown = new WeakMap();

    this._buildBoxes();
    this._buildPads();

    this._bananaGeo = new THREE.SphereGeometry(0.55, 12, 9);
    this._bananaGeo.scale(1, 0.45, 1.5);
    this._bananaMat = new THREE.MeshStandardMaterial({ color: 0xf5d442, roughness: 0.5, emissive: 0x3a2f00 });
    this._missileGeo = new THREE.ConeGeometry(0.3, 1.3, 10);
    this._missileGeo.rotateX(Math.PI / 2);
    this._missileMat = new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x661111, roughness: 0.3, metalness: 0.5 });
  }

  _buildBoxes() {
    const geo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x59d2ff,
      emissive: 0x1f6fa8,
      roughness: 0.25,
      metalness: 0.35,
      transparent: true,
      opacity: 0.86,
    });
    for (const spot of this.track.itemBoxSpots) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(spot.position);
      m.castShadow = true;
      this.scene.add(m);
      this.boxes.push({ mesh: m, base: spot.position.clone(), cooldown: 0 });
    }
  }

  _buildPads() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x4ad6ff, transparent: true, opacity: 0.65, depthWrite: false });
    for (const spot of this.track.boostPadSpots) {
      const g = new THREE.PlaneGeometry(9, 6);
      const m = new THREE.Mesh(g, mat.clone());
      m.position.copy(spot.position).add(new THREE.Vector3(0, 0.08, 0));
      m.quaternion.setFromRotationMatrix(flatBasis(spot.side, spot.tangent));
      this.scene.add(m);
      this.pads.push({ mesh: m, position: spot.position.clone() });
    }
  }

  /** @param {import('./kart.js').Kart} kart */
  useItem(kart, karts) {
    const type = kart.item;
    if (!type) return null;
    kart.item = null;

    switch (type) {
      case 'boost':
        kart.applyBoost(1.8, 1.6);
        break;
      case 'shield':
        kart.shieldTime = 7;
        break;
      case 'banana':
        this._dropBanana(kart);
        break;
      case 'missile':
        this._fireMissile(kart, karts);
        break;
      case 'water':
        this._throwWater(kart, karts);
        break;
    }
    return type;
  }

  _dropBanana(kart) {
    const back = new THREE.Vector3(-Math.sin(kart.yaw), 0, -Math.cos(kart.yaw)).multiplyScalar(3.2);
    const m = new THREE.Mesh(this._bananaGeo, this._bananaMat);
    m.position.copy(kart.position).add(back).setY(kart.position.y + 0.35);
    m.rotation.y = Math.random() * Math.PI;
    this.scene.add(m);
    this.bananas.push({ mesh: m, life: 30, owner: kart, armDelay: 0.4 });
  }

  _fireMissile(kart, karts) {
    // 鎖定「名次在我前面一位」的車
    const ahead = karts
      .filter((k) => k !== kart && !k.finished && k.progress > kart.progress)
      .sort((a, b) => a.progress - b.progress)[0];

    const m = new THREE.Mesh(this._missileGeo, this._missileMat);
    const fwd = new THREE.Vector3(Math.sin(kart.yaw), 0, Math.cos(kart.yaw));
    m.position.copy(kart.position).addScaledVector(fwd, 2.6).setY(kart.position.y + 0.8);
    const light = new THREE.PointLight(0xff5533, 3, 12);
    m.add(light);
    this.scene.add(m);
    this.missiles.push({
      mesh: m,
      owner: kart,
      target: ahead ?? null,
      velocity: fwd.clone().multiplyScalar(Math.max(kart.vf, 18) + 14),
      life: 8,
      trackIndex: kart.trackIndex,
    });
  }

  _throwWater(kart, karts) {
    const leader = karts.filter((k) => k !== kart && !k.finished).sort((a, b) => b.progress - a.progress)[0];
    if (!leader) return;
    // 水球是全域命中，給一點延遲營造「天上掉下來」的感覺
    setTimeout(() => {
      if (!leader.finished) leader.squash(1.7);
    }, 700);
  }

  update(dt, karts) {
    this._updateBoxes(dt, karts);
    this._updateBananas(dt, karts);
    this._updateMissiles(dt, karts);
    this._updatePads(dt, karts);
  }

  _updateBoxes(dt, karts) {
    const t = performance.now() * 0.002;
    for (const box of this.boxes) {
      if (box.cooldown > 0) {
        box.cooldown -= dt;
        if (box.cooldown <= 0) box.mesh.visible = true;
        continue;
      }
      box.mesh.rotation.y += dt * 1.6;
      box.mesh.rotation.x = Math.sin(t) * 0.25;
      box.mesh.position.y = box.base.y + Math.sin(t * 1.4) * 0.25;

      for (const k of karts) {
        if (k.item || k.finished) continue;
        if (k.position.distanceToSquared(box.mesh.position) < 3.6) {
          k.item = rollItem(k.rank, karts.length);
          k.itemRolling = 0.6;
          box.cooldown = 4;
          box.mesh.visible = false;
          break;
        }
      }
    }
  }

  _updateBananas(dt, karts) {
    for (let i = this.bananas.length - 1; i >= 0; i--) {
      const b = this.bananas[i];
      b.life -= dt;
      b.armDelay -= dt;
      b.mesh.rotation.y += dt * 0.8;
      let hit = false;
      if (b.armDelay <= 0) {
        for (const k of karts) {
          if (k.finished) continue;
          if (k.position.distanceToSquared(b.mesh.position) < 3.2) {
            k.spinOut(1.4);
            hit = true;
            break;
          }
        }
      }
      if (hit || b.life <= 0) {
        this.scene.remove(b.mesh);
        this.bananas.splice(i, 1);
      }
    }
  }

  _updateMissiles(dt, karts) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;

      if (m.target && !m.target.finished) {
        // 追蹤：朝目標轉向
        const to = new THREE.Vector3().subVectors(m.target.position, m.mesh.position).setY(0);
        const dist = to.length();
        to.normalize();
        const speed = Math.max(m.velocity.length(), 30);
        m.velocity.lerp(to.multiplyScalar(speed), Math.min(1, 3.4 * dt)).setLength(speed + 8 * dt);
        if (dist < 2.4) {
          m.target.spinOut(1.6);
          m.life = 0;
        }
      } else {
        // 無目標就沿賽道中心線飛
        const loc = this.track.locate(m.mesh.position, m.trackIndex);
        m.trackIndex = loc.index;
        const ahead = this.track.sampleAt(loc.index + 24);
        const to = new THREE.Vector3().subVectors(ahead.pos, m.mesh.position).setY(0).normalize();
        const speed = m.velocity.length();
        m.velocity.lerp(to.multiplyScalar(speed), Math.min(1, 2.6 * dt)).setLength(speed);
        for (const k of karts) {
          if (k === m.owner || k.finished) continue;
          if (k.position.distanceToSquared(m.mesh.position) < 5) {
            k.spinOut(1.6);
            m.life = 0;
            break;
          }
        }
      }

      m.mesh.position.addScaledVector(m.velocity, dt);
      m.mesh.lookAt(new THREE.Vector3().addVectors(m.mesh.position, m.velocity));

      if (m.life <= 0) {
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }
  }

  _updatePads(dt, karts) {
    const pulse = 0.45 + Math.abs(Math.sin(performance.now() * 0.004)) * 0.4;
    for (const pad of this.pads) {
      pad.mesh.material.opacity = pulse;
      for (const k of karts) {
        if (k.finished) continue;
        if (k.position.distanceToSquared(pad.position) < 22) {
          const last = this._padCooldown.get(k) ?? 0;
          if (performance.now() - last > 1200) {
            k.applyBoost(1.1, 1.5);
            this._padCooldown.set(k, performance.now());
          }
        }
      }
    }
  }

  reset() {
    for (const b of this.bananas) this.scene.remove(b.mesh);
    for (const m of this.missiles) this.scene.remove(m.mesh);
    this.bananas.length = 0;
    this.missiles.length = 0;
    for (const box of this.boxes) {
      box.cooldown = 0;
      box.mesh.visible = true;
    }
  }
}
