/**
 * 把 three 附帶的 Draco 解碼器複製到 public/draco/。
 *
 * 模型用 Draco 壓縮過，載入時需要解碼器。它是 three 套件裡的第三方檔案（約 1.8MB），
 * 不進版控，改用 postinstall 在安裝後自動複製，避免 repo 帶著 vendored 的二進位檔。
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco');
const DEST = join(ROOT, 'public', 'draco');

if (!existsSync(SRC)) {
  console.warn('[draco] 找不到 three 的 Draco 解碼器，略過。先跑 npm install。');
  process.exit(0);
}

mkdirSync(DEST, { recursive: true });
cpSync(SRC, DEST, { recursive: true });
console.log(`[draco] 解碼器已複製到 public/draco/`);
