/**
 * Rodin 模型匯入腳本。
 *
 *   npm run import
 *
 * 做的事：
 *   1. 掃描 incoming/ 和 public/models/ 裡的 .zip
 *   2. 從檔名判斷是哪個角色（支援英文 id 與中文名）
 *   3. 解壓，挑出 PBR 版本的 GLB（優先 base_basic_pbr.glb）
 *   4. 寫成 public/models/<角色id>.glb
 *   5. 把處理完的 zip 移到專案外的封存資料夾
 *
 * 刻意不依賴任何 npm 套件：ZIP 的 deflate 用 Node 內建的 zlib 就能解，
 * 為了一個匯入腳本去裝 CLI 工具不划算。
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, copyFileSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { join, resolve, basename, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { CHARACTERS } from '../src/game/characters.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_DIR = join(ROOT, 'public', 'models');
const INCOMING_DIR = join(ROOT, 'incoming');
/** 封存位置刻意放在專案外，避免 public/ 底下的檔案被打包進 dist/。 */
const ARCHIVE_DIR = resolve(ROOT, '..', 'Hyper3DGame-assets', 'rodin-zips');

/* ------------------------------------------------------------------ */
/* 最小 ZIP 讀取器                                                      */
/* ------------------------------------------------------------------ */

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

/** 解析中央目錄，回傳 [{name, method, compressedSize, localOffset}]。 */
function readZipEntries(buf) {
  // EOCD 在檔尾，註解最長 65535，所以從尾端往前找簽章就好
  let eocd = -1;
  const from = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('找不到 ZIP 結尾標記（檔案可能損毀或還在下載中）');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error('中央目錄格式異常');
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.push({ name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** 取出單一檔案內容。本地檔頭的 extra 欄位長度可能和中央目錄不同，必須重讀。 */
function extractEntry(buf, entry) {
  const p = entry.localOffset;
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`不支援的壓縮方式 ${entry.method}（${entry.name}）`);
}

/* ------------------------------------------------------------------ */
/* 角色比對                                                            */
/* ------------------------------------------------------------------ */

function matchCharacter(zipName) {
  const stem = basename(zipName, extname(zipName)).trim().toLowerCase();
  // 完全相同的英文 id
  let hit = CHARACTERS.find((c) => c.id.toLowerCase() === stem);
  if (hit) return hit;
  // 中文名
  hit = CHARACTERS.find((c) => stem.includes(c.name));
  if (hit) return hit;
  // 檔名裡包含英文 id（例如 gugugaga_final.zip）
  hit = CHARACTERS.find((c) => stem.includes(c.id.toLowerCase()));
  return hit ?? null;
}

/** 從 zip 內容挑出最適合的 GLB：優先 PBR，其次任何 glb，明確排除 shaded。 */
function pickGlb(entries) {
  const glbs = entries.filter((e) => e.name.toLowerCase().endsWith('.glb'));
  if (!glbs.length) return null;
  return (
    glbs.find((e) => /pbr/i.test(e.name)) ??
    glbs.find((e) => !/shaded/i.test(e.name)) ??
    glbs[0]
  );
}

/* ------------------------------------------------------------------ */

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

function collectZips() {
  const out = [];
  for (const dir of [INCOMING_DIR, MODELS_DIR]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.toLowerCase().endsWith('.zip')) out.push(join(dir, f));
    }
  }
  return out;
}

function main() {
  mkdirSync(INCOMING_DIR, { recursive: true });
  mkdirSync(MODELS_DIR, { recursive: true });

  const zips = collectZips();
  if (!zips.length) {
    console.log(`沒有待處理的 zip。\n把 Rodin 下載的壓縮檔放進：\n  ${INCOMING_DIR}\n`);
    printStatus();
    return;
  }

  const unmapped = [];
  let imported = 0;

  for (const zipPath of zips) {
    const name = basename(zipPath);
    const character = matchCharacter(name);
    if (!character) {
      unmapped.push(name);
      continue;
    }

    let buf;
    try {
      buf = readFileSync(zipPath);
    } catch (e) {
      console.error(`✗ ${name}：讀取失敗（${e.message}）`);
      continue;
    }

    let glbEntry, data;
    try {
      const entries = readZipEntries(buf);
      glbEntry = pickGlb(entries);
      if (!glbEntry) {
        console.error(`✗ ${name}：壓縮檔裡沒有 .glb`);
        continue;
      }
      data = extractEntry(buf, glbEntry);
    } catch (e) {
      console.error(`✗ ${name}：解壓失敗（${e.message}）`);
      continue;
    }

    const dest = join(MODELS_DIR, `${character.id}.glb`);
    const had = existsSync(dest) ? statSync(dest).size : 0;
    writeFileSync(dest, data);
    console.log(
      `✓ ${character.name.padEnd(5)} ← ${glbEntry.name}  ${mb(data.length)}` +
        (had ? `  (覆蓋原本的 ${mb(had)})` : ''),
    );

    // 封存 zip 到專案外
    mkdirSync(ARCHIVE_DIR, { recursive: true });
    const archived = join(ARCHIVE_DIR, `${character.id}_${name}`);
    try {
      renameSync(zipPath, archived);
    } catch {
      // 跨磁碟時 rename 會失敗，退回複製後刪除
      copyFileSync(zipPath, archived);
      unlinkSync(zipPath);
    }
    imported++;
  }

  if (unmapped.length) {
    console.log(`\n無法判斷角色的壓縮檔（${unmapped.length} 個），已原地保留：`);
    for (const n of unmapped) console.log(`  · ${n}`);
    console.log('\n請把檔名改成角色的 id 或中文名再跑一次，例如：');
    console.log(`  ${CHARACTERS[0].id}.zip   或   ${CHARACTERS[0].name}.zip`);
  }

  if (imported) console.log(`\n封存位置：${ARCHIVE_DIR}`);
  console.log();
  printStatus();
}

function printStatus() {
  console.log('目前模型狀態：');
  let total = 0;
  for (const c of CHARACTERS) {
    const p = join(MODELS_DIR, `${c.id}.glb`);
    if (existsSync(p)) {
      const s = statSync(p).size;
      total += s;
      console.log(`  ✓ ${c.name.padEnd(5)} ${c.id}.glb  ${mb(s)}`);
    } else {
      console.log(`  · ${c.name.padEnd(5)} ${c.id}.glb  (尚未提供，遊戲中使用佔位角色)`);
    }
  }
  console.log(`  ── 合計 ${mb(total)}`);
}

main();
