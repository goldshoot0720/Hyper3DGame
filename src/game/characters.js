/**
 * 角色名冊。
 *
 * `model` 指向 public/models/ 下的 GLB（由 Hyper3D 生成）。
 * 檔案不存在時 loader 會自動退回程序化佔位角色，遊戲仍可正常遊玩。
 *
 * `stats` 皆為 0~1 的相對值，實際物理量在 kart.js 的 deriveStats() 換算。
 *
 * `seat` 是角色坐在車上的擺放微調，省略時用 DEFAULT_SEAT。
 * Rodin 輸出的都是站姿模型，我們把它往下沉、腿藏進車殼裡假裝在坐。
 * 遊戲中按 P 進入座位調整模式，調好後按 C 匯出數值貼回這裡。
 */

/**
 * 所有角色共用的預設坐姿。x/y/z 單位是公尺，rotY 是弧度，scale 是相對縮放。
 *
 * rotY = 0：實測八個 Rodin 模型原生都面向 +Z，而卡丁車的前進方向也是 +Z，
 * 所以不需要額外旋轉。（驗證方式：匯入 Blender 從正視圖看，Blender 的 -Y 對應
 * glTF 的 +Z，八個角色都臉朝鏡頭。）
 */
export const DEFAULT_SEAT = { x: 0, y: 0.22, z: -0.3, rotY: 0, scale: 1 };
export const CHARACTERS = [
  {
    id: 'miaobaibai',
    name: '喵白白',
    tag: '均衡型',
    model: 'models/miaobaibai.glb',
    color: 0xfff4e2,
    accentColor: 0xffb3c7,
    stats: { speed: 0.66, accel: 0.66, handling: 0.66, weight: 0.5 },
    baseball: { contact: 0.70, power: 0.50, speed: 0.55, arm: 0.50, field: 0.65, breaking: 0.50 },
  },
  {
    id: 'miaobubu',
    name: '喵布布',
    tag: '靈巧型',
    model: 'models/miaobubu.glb',
    color: 0xffd9a8,
    accentColor: 0xe8743c,
    stats: { speed: 0.58, accel: 0.78, handling: 0.84, weight: 0.34 },
    baseball: { contact: 0.80, power: 0.35, speed: 0.85, arm: 0.45, field: 0.80, breaking: 0.45 },
  },
  {
    id: 'fengbro',
    name: '鋒兄',
    tag: '極速型',
    model: 'models/fengbro.glb',
    color: 0xd8c39a,
    accentColor: 0x2f3a63,
    stats: { speed: 0.9, accel: 0.48, handling: 0.46, weight: 0.72 },
    baseball: { contact: 0.50, power: 0.90, speed: 0.45, arm: 0.80, field: 0.50, breaking: 0.60 },
  },
  {
    id: 'xiaotu',
    name: '小塗',
    tag: '衝刺型',
    model: 'models/xiaotu.glb',
    color: 0x9fb6cf,
    accentColor: 0x3d5a80,
    stats: { speed: 0.74, accel: 0.8, handling: 0.5, weight: 0.6 },
    baseball: { contact: 0.62, power: 0.68, speed: 0.78, arm: 0.65, field: 0.60, breaking: 0.55 },
  },
  {
    id: 'yamei',
    name: '牙妹',
    tag: '漂移型',
    model: 'models/yamei.glb',
    color: 0xc0392b,
    accentColor: 0x1c1c26,
    stats: { speed: 0.64, accel: 0.7, handling: 0.9, weight: 0.38 },
    baseball: { contact: 0.88, power: 0.40, speed: 0.72, arm: 0.50, field: 0.75, breaking: 0.85 },
  },
  {
    id: 'yumei',
    name: '魚妹',
    tag: '穩定型',
    model: 'models/yumei.glb',
    color: 0x86b6e0,
    accentColor: 0x1f2c4c,
    stats: { speed: 0.7, accel: 0.62, handling: 0.74, weight: 0.5 },
    baseball: { contact: 0.75, power: 0.55, speed: 0.60, arm: 0.60, field: 0.82, breaking: 0.70 },
  },
  {
    id: 'gugugaga',
    name: '咕咕嘎嘎',
    tag: '重量型',
    model: 'models/gugugaga.glb',
    color: 0x2b2f3a,
    accentColor: 0xf5c518,
    stats: { speed: 0.8, accel: 0.4, handling: 0.42, weight: 0.95 },
    baseball: { contact: 0.45, power: 0.95, speed: 0.25, arm: 0.90, field: 0.45, breaking: 0.40 },
  },
  {
    id: 'jingyuniang',
    name: '鯨魚娘',
    tag: '爆發型',
    model: 'models/jingyuniang.glb',
    color: 0x2f4a8c,
    accentColor: 0x7fd4ff,
    stats: { speed: 0.76, accel: 0.86, handling: 0.56, weight: 0.66 },
    baseball: { contact: 0.60, power: 0.80, speed: 0.60, arm: 0.75, field: 0.55, breaking: 0.78 },
  },
];

export const getCharacter = (id) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

/** 取得角色的坐姿設定，未指定的欄位用預設值補齊。 */
export const getSeat = (character) => ({ ...DEFAULT_SEAT, ...(character.seat ?? {}) });
