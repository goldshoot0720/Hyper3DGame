import * as THREE from 'three';
import { CHARACTERS } from './game/characters.js';
import { Track } from './game/track.js';
import { Race } from './game/race.js';
import { Hud, formatTime } from './ui/hud.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { loadAllCharacters } from './core/loader.js';
import { createRenderer, createScene, ChaseCamera, makeSkyTexture } from './core/scene.js';
import { SeatTuner } from './ui/seatTuner.js';

/* ------------------------------------------------------------------ */
/* 初始化                                                              */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('game-canvas');
const renderer = createRenderer(canvas);
const { scene, sun } = createScene(renderer);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.4, 1400);
const chaseCam = new ChaseCamera(camera);

const track = new Track();
scene.add(track.group);

const input = new Input();
const audio = new Audio();
const hud = new Hud();

const seatTuner = new SeatTuner(camera);

const race = new Race({
  scene,
  track,
  hud,
  chaseCam,
  input,
  minimapCanvas: document.getElementById('minimap'),
  audio,
});

const el = {
  loading: document.getElementById('loading'),
  loadingBar: document.getElementById('loading-bar'),
  loadingText: document.getElementById('loading-text'),
  select: document.getElementById('select'),
  roster: document.getElementById('roster'),
  stats: document.getElementById('stats'),
  startBtn: document.getElementById('start-btn'),
  lapCount: document.getElementById('lap-count'),
  aiCount: document.getElementById('ai-count'),
  difficulty: document.getElementById('difficulty'),
  results: document.getElementById('results'),
  resultTitle: document.getElementById('result-title'),
  resultTable: document.getElementById('result-table'),
  retryBtn: document.getElementById('retry-btn'),
  menuBtn: document.getElementById('menu-btn'),
};

let models = new Map();
let thumbs = new Map();
let selectedId = CHARACTERS[0].id;
let appState = 'loading'; // loading | select | racing | results

/* ------------------------------------------------------------------ */
/* 角色縮圖：把載好的模型離屏渲染成圖片                                 */
/* ------------------------------------------------------------------ */

function renderThumbnails() {
  const size = 256;
  // preserveDrawingBuffer：toDataURL 要讀回 framebuffer，否則某些瀏覽器會拿到空白
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size);
  r.setPixelRatio(1);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;

  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2, 4, 4);
  s.add(key);

  // 這是另一個 WebGL context，不能共用主場景的 PMREM 貼圖（它只存在於主 renderer 的
  // GPU 記憶體裡，沒有可重新上傳的影像資料），所以在這裡自己生一份
  const pmrem = new THREE.PMREMGenerator(r);
  s.environment = pmrem.fromEquirectangular(makeSkyTexture()).texture;
  s.environmentIntensity = 0.8;
  pmrem.dispose();

  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);

  for (const c of CHARACTERS) {
    const entry = models.get(c.id);
    if (!entry) continue;
    const obj = entry.object.clone(true);
    s.add(obj);

    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    const h = Math.max(box.getSize(new THREE.Vector3()).y, 0.001);
    cam.position.set(center.x + h * 0.55, center.y + h * 0.12, center.z + h * 2.5);
    cam.lookAt(center.x, center.y + h * 0.05, center.z);

    r.render(s, cam);
    thumbs.set(c.id, r.domElement.toDataURL('image/webp', 0.85));
    s.remove(obj);
  }

  r.dispose();
}

/* ------------------------------------------------------------------ */
/* 角色選擇畫面                                                        */
/* ------------------------------------------------------------------ */

const STAT_LABELS = { speed: '極速', accel: '加速', handling: '操控', weight: '重量' };

function buildRoster() {
  el.roster.innerHTML = '';
  for (const c of CHARACTERS) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = c.id;
    const thumb = thumbs.get(c.id);
    const entry = models.get(c.id);
    const badge = entry?.placeholder ? '佔位' : entry?.untextured ? '無貼圖' : '';
    card.innerHTML = `
      <div class="thumb" style="${thumb ? `background-image:url(${thumb})` : ''}"></div>
      <div class="name">${c.name}</div>
      <div class="tag">${c.tag}</div>
      ${badge ? `<div class="missing">${badge}</div>` : ''}
    `;
    card.addEventListener('click', () => selectCharacter(c.id));
    el.roster.appendChild(card);
  }
  selectCharacter(selectedId);
}

function selectCharacter(id) {
  selectedId = id;
  for (const card of el.roster.children) card.classList.toggle('active', card.dataset.id === id);
  const c = CHARACTERS.find((x) => x.id === id);
  el.stats.innerHTML = Object.entries(STAT_LABELS)
    .map(
      ([key, label]) =>
        `<div class="stat"><b>${label}</b><div class="meter"><i style="width:${Math.round(c.stats[key] * 100)}%"></i></div></div>`,
    )
    .join('');
}

/* ------------------------------------------------------------------ */
/* 畫面切換                                                            */
/* ------------------------------------------------------------------ */

function showSelect() {
  appState = 'select';
  race.dispose();
  hud.hide();
  el.results.classList.add('hidden');
  el.select.classList.remove('hidden');
  audio.stopEngine();
}

function startRace() {
  audio.resume();
  audio.startEngine();

  const player = CHARACTERS.find((c) => c.id === selectedId);
  const aiCount = Number(el.aiCount.value);
  const pool = CHARACTERS.filter((c) => c.id !== player.id).sort(() => Math.random() - 0.5);
  const roster = [player, ...pool.slice(0, aiCount)];

  race.start({
    playerCharacter: player,
    roster,
    models,
    laps: Number(el.lapCount.value),
    difficulty: el.difficulty.value,
  });
  race.onFinish = showResults;
  seatTuner.attach(race.player);

  el.select.classList.add('hidden');
  el.results.classList.add('hidden');
  hud.show();
  appState = 'racing';
}

function showResults(sorted) {
  appState = 'results';
  hud.hide();
  audio.stopEngine();

  const me = race.player;
  el.resultTitle.textContent = me?.rank === 1 ? '🏆 冠軍！' : `第 ${me?.rank ?? '-'} 名`;
  el.resultTable.innerHTML =
    '<tr><th>名次</th><th>角色</th><th>時間</th></tr>' +
    sorted
      .map(
        (k, i) =>
          `<tr class="${k === me ? 'me' : ''}"><td class="rank">${i + 1}</td><td>${k.character.name}</td><td>${formatTime(k.finishTime)}</td></tr>`,
      )
      .join('');
  el.results.classList.remove('hidden');
}

el.startBtn.addEventListener('click', startRace);
el.retryBtn.addEventListener('click', startRace);
el.menuBtn.addEventListener('click', showSelect);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

addEventListener('pointerdown', () => audio.resume(), { once: true });
addEventListener('keydown', () => audio.resume(), { once: true });

/* ------------------------------------------------------------------ */
/* 主迴圈                                                              */
/* ------------------------------------------------------------------ */

const timer = new THREE.Timer(); // THREE.Clock 自 r183 起棄用，改用 Timer
let outroT = 0;

function tick() {
  requestAnimationFrame(tick);
  timer.update();
  const dt = Math.min(timer.getDelta(), 1 / 20); // 卡頓時夾住，避免穿牆

  // 座位調整模式會凍結比賽，改成環繞鏡頭讓你從各角度確認坐姿與朝向
  if (seatTuner.active) {
    seatTuner.update(dt);
    renderer.render(scene, camera);
    return;
  }

  if (appState === 'racing' || appState === 'results') {
    race.update(dt);
    race.tryPerfectStart();

    if (race.player) {
      // 太陽跟著玩家走，陰影貼圖才不會失焦
      sun.position.set(race.player.position.x + 110, 185, race.player.position.z + 80);
      sun.target.position.copy(race.player.position);
      sun.target.updateMatrixWorld();

      audio.updateEngine(
        THREE.MathUtils.clamp(Math.abs(race.player.vf) / race.player.stats.maxSpeed, 0, 1.4),
        race.player.boostTime > 0,
      );
    }
  }

  if (appState === 'results') {
    outroT += dt;
    race.updateOutro(dt, outroT);
  } else {
    outroT = 0;
  }

  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ */
/* 開機                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  el.loadingText.textContent = '建立賽道…';
  el.loadingBar.style.width = '10%';
  await new Promise((r) => setTimeout(r, 30));

  models = await loadAllCharacters(CHARACTERS, (frac, name) => {
    el.loadingBar.style.width = `${10 + frac * 75}%`;
    el.loadingText.textContent = `載入角色：${name}`;
  });

  el.loadingText.textContent = '產生角色縮圖…';
  el.loadingBar.style.width = '92%';
  await new Promise((r) => setTimeout(r, 30));
  renderThumbnails();

  buildRoster();
  el.loadingBar.style.width = '100%';
  el.loadingText.textContent = '準備就緒';

  const placeholders = CHARACTERS.filter((c) => models.get(c.id)?.placeholder).map((c) => c.name);
  if (placeholders.length) {
    console.info(`[Meow Kart] 尚未有 GLB 模型，使用佔位角色：${placeholders.join('、')}`);
  }

  await new Promise((r) => setTimeout(r, 250));
  el.loading.classList.add('hidden');
  showSelect();
  tick();
}

boot();
