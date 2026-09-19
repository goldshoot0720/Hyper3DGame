/**
 * 模型壓縮。
 *
 *   npm run optimize
 *
 * Rodin 的輸出每個約 10MB，裡面是三張 2048² 的無損 PNG。八個角色近 90MB，
 * 網頁載入與 GPU 貼圖記憶體都撐不住。這支腳本做三件事：
 *
 *   1. 貼圖縮到 1024² 並轉 WebP（遊戲鏡頭距離下看不出差異）
 *   2. 幾何用 Draco 壓縮（解碼器已放在 public/draco/，離線可用）
 *   3. 清掉重複與未使用的資料
 *
 * 原始檔會先備份到專案外的 models-original/，之後每次都從備份重新壓，
 * 所以重複執行不會累積劣化，調參數也能隨時重跑。
 */
import { readdirSync, existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, draco, flatten, join as joinMeshes } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_DIR = join(ROOT, 'public', 'models');
const BACKUP_DIR = resolve(ROOT, '..', 'Hyper3DGame-assets', 'models-original');

const TEXTURE_SIZE = 1024;
/** 顏色貼圖可以壓得兇一點；法線貼圖壓太兇會出現色帶，留高一些。 */
const QUALITY_COLOR = 82;
const QUALITY_DATA = 92;

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

async function main() {
  if (!existsSync(MODELS_DIR)) {
    console.error(`找不到 ${MODELS_DIR}`);
    process.exit(1);
  }
  const files = readdirSync(MODELS_DIR).filter((f) => f.toLowerCase().endsWith('.glb')).sort();
  if (!files.length) {
    console.log('public/models 裡沒有 .glb，先跑 npm run import。');
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

  let totalBefore = 0;
  let totalAfter = 0;

  for (const f of files) {
    const dest = join(MODELS_DIR, f);
    const backup = join(BACKUP_DIR, f);

    // 第一次跑先備份；之後一律從備份壓，避免重複壓縮累積劣化
    if (!existsSync(backup)) copyFileSync(dest, backup);
    const source = backup;
    const before = statSync(source).size;

    process.stdout.write(`${basename(f, '.glb').padEnd(14)} ${mb(before).padStart(9)} → `);

    try {
      const doc = await io.read(source);
      await doc.transform(
        dedup(),
        flatten(),
        joinMeshes(),
        weld(),
        textureCompress({
          encoder: sharp,
          targetFormat: 'webp',
          resize: [TEXTURE_SIZE, TEXTURE_SIZE],
          quality: QUALITY_COLOR,
          slots: /baseColor|emissive/,
        }),
        textureCompress({
          encoder: sharp,
          targetFormat: 'webp',
          resize: [TEXTURE_SIZE, TEXTURE_SIZE],
          quality: QUALITY_DATA,
          slots: /normal|metallicRoughness|occlusion/,
        }),
        prune(),
        draco({ method: 'edgebreaker' }),
      );
      await io.write(dest, doc);

      const after = statSync(dest).size;
      totalBefore += before;
      totalAfter += after;
      const pct = ((1 - after / before) * 100).toFixed(0);
      console.log(`${mb(after).padStart(9)}   −${pct}%`);
    } catch (e) {
      console.log(`失敗：${e.message}`);
      totalBefore += before;
      totalAfter += before;
    }
  }

  console.log('─'.repeat(52));
  console.log(
    `${'合計'.padEnd(13)} ${mb(totalBefore).padStart(9)} → ${mb(totalAfter).padStart(9)}   ` +
      `−${((1 - totalAfter / totalBefore) * 100).toFixed(0)}%`,
  );
  console.log(`\n原始檔備份於：${BACKUP_DIR}`);
  console.log('重新整理瀏覽器即可看到壓縮後的模型。若畫質不滿意，調整本檔頂端的');
  console.log('TEXTURE_SIZE / QUALITY_* 後再跑一次即可（永遠從備份重壓，不會劣化）。');
}

main();
