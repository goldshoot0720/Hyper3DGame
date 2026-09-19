/**
 * 轉向方向的無頭驗證。
 *
 *   node tools/steering-check.mjs
 *
 * 座標慣例：車頭 +Z，追尾鏡頭同向往 +Z 看，因此**螢幕右方 = 世界 -X**。
 * 按右鍵時車子必須往世界 -X 移動，按左鍵往 +X。這支腳本直接跑物理來檢查，
 * 不依賴瀏覽器（用一段筆直賽道的樁件取代 Track，避開 canvas 相依）。
 */
import * as THREE from 'three';
import { Kart } from '../src/game/kart.js';
import { AIDriver } from '../src/game/ai.js';
import { CHARACTERS } from '../src/game/characters.js';

/** 沿 +Z 的無限直線賽道，介面與 Track 相同。 */
const straightTrack = {
  length: 10000,
  samples: [],
  locate(point) {
    return {
      index: 0,
      center: new THREE.Vector3(0, 0, point.z),
      tangent: new THREE.Vector3(0, 0, 1),
      side: new THREE.Vector3(1, 0, 0),
      dist: ((point.z % 10000) + 10000) % 10000,
      lateral: point.x,
      height: 0,
    };
  },
  /** 前方 30 公尺、偏世界 +X 五公尺處的目標點（+X 在畫面上是左邊）。 */
  sampleAt() {
    return {
      pos: new THREE.Vector3(5, 0, 30),
      tangent: new THREE.Vector3(0, 0, 1),
      side: new THREE.Vector3(1, 0, 0),
      dist: 0,
    };
  },
};

function drive(steer, seconds = 1.5) {
  const kart = new Kart(CHARACTERS[0], null, true);
  kart.placeAt({ position: new THREE.Vector3(0, 0, 0), yaw: 0, index: 0, dist: 0, trackLength: 10000 });
  const ctrl = { accel: true, brake: false, steer, drift: false, useItem: false };
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) kart.update(dt, ctrl, straightTrack);
  return kart;
}

const screenSide = (x) => (x < -0.05 ? '螢幕右' : x > 0.05 ? '螢幕左' : '沒有轉向');

let failed = 0;
function check(label, got, want) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${label}：實際「${got}」，應為「${want}」`);
}

console.log('玩家轉向');
const right = drive(+1);
const left = drive(-1);
console.log(`  按右鍵 1.5s → x = ${right.position.x.toFixed(2)}, yaw = ${right.yaw.toFixed(3)}`);
console.log(`  按左鍵 1.5s → x = ${left.position.x.toFixed(2)}, yaw = ${left.yaw.toFixed(3)}`);
check('按右鍵往螢幕右', screenSide(right.position.x), '螢幕右');
check('按左鍵往螢幕左', screenSide(left.position.x), '螢幕左');

console.log('\n漂移側滑方向');
const kart = new Kart(CHARACTERS[0], null, true);
kart.placeAt({ position: new THREE.Vector3(0, 0, 0), yaw: 0, index: 0, dist: 0, trackLength: 10000 });
for (let i = 0; i < 90; i++) kart.update(1 / 60, { accel: true, brake: false, steer: 0, drift: false }, straightTrack);
for (let i = 0; i < 60; i++) kart.update(1 / 60, { accel: true, brake: false, steer: 1, drift: true }, straightTrack);
console.log(`  向右漂移：vl = ${kart.vl.toFixed(2)}（正 = 車速落在車身左側，符合右轉甩尾）`);
check('向右漂移時 vl 為正', kart.vl > 0.2 ? '正' : '非正', '正');

console.log('\nAI 循跡');
const aiKart = new Kart(CHARACTERS[1], null, false);
aiKart.placeAt({ position: new THREE.Vector3(0, 0, 0), yaw: 0, index: 0, dist: 0, trackLength: 10000 });
aiKart.vf = 20;
const ai = new AIDriver(aiKart, straightTrack, 'hard');
ai.lineBias = 0;
ai.speedJitter = 1;
// 賽道樁件的目標點在前方 30m、世界 +X 五公尺（= 螢幕左），
// AI 要往那邊走就必須給「負」的 steer（正 = 往右）
const aiCtrl = ai.update(1 / 60, [aiKart]);
console.log(`  目標在前方偏世界 +X（螢幕左）→ AI steer = ${aiCtrl.steer.toFixed(3)}`);
check('AI 朝螢幕左的目標給負 steer', aiCtrl.steer < -0.05 ? '負' : '非負', '負');

console.log(failed === 0 ? '\n全部通過' : `\n${failed} 項未通過`);
process.exit(failed === 0 ? 0 : 1);
