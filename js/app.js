import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';

/**
 * AR MENU — zero-cost POC.
 * MindAR image tracking (anchor 0 = printed card) + Three.js.
 * Menu panel + 3D dish are BOTH children of the tracked anchor,
 * so they stay spatially attached while the phone moves.
 */

const TARGET_SRC = './assets/target/targets.mind';

const container = document.getElementById('ar-container');
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const startError = document.getElementById('start-error');
const loadingEl = document.getElementById('loading');
const scanHint = document.getElementById('scan-hint');
const lostBanner = document.getElementById('lost-banner');
const toastEl = document.getElementById('toast');
const backBtn = document.getElementById('back-btn');
const dishCaption = document.getElementById('dish-caption');

let toastTimer = null;
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

// ---------- tiny tween engine (no extra libs) ----------
const tweens = [];
function tween({ dur = 600, ease = easeInOut, update, done }) {
  tweens.push({ t: 0, dur, ease, update, done });
}
function stepTweens(dtMs) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dtMs;
    const k = Math.min(1, tw.t / tw.dur);
    tw.update(tw.ease(k));
    if (k >= 1) {
      tweens.splice(i, 1);
      tw.done && tw.done();
    }
  }
}
function easeInOut(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
function easeOutBack(k) { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }

// ---------- state ----------
let state = 'idle'; // idle | starting | scanning | menu | toDish | dish | toMenu
let mindarThree = null;
let renderer, scene, camera, anchor;
let menuGroup, dishGroup, dishSpin;
let menuPanel, menuTex, menuCanvas;
let hitItem1, hitItem2;
let menuVisible = false;
let dishBuilt = false;
let dishScale = 1;

// ---------- AR menu texture (drawn on canvas, used as Three texture) ----------
const MENU_W = 1024, MENU_H = 640;
menuCanvas = document.createElement('canvas');
menuCanvas.width = MENU_W;
menuCanvas.height = MENU_H;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawMenu(highlight = false) {
  const ctx = menuCanvas.getContext('2d');
  ctx.clearRect(0, 0, MENU_W, MENU_H);

  // panel
  ctx.fillStyle = 'rgba(12,12,16,0.94)';
  roundRect(ctx, 8, 8, MENU_W - 16, MENU_H - 16, 44);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ff8c1a';
  roundRect(ctx, 8, 8, MENU_W - 16, MENU_H - 16, 44);
  ctx.stroke();

  // header
  ctx.fillStyle = '#ffc93c';
  ctx.font = '900 84px system-ui, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('AR MENU', MENU_W / 2, 120);
  ctx.fillStyle = '#b9b3a6';
  ctx.font = '500 30px system-ui, Arial';
  ctx.fillText('— tap a dish to preview in 3D —', MENU_W / 2, 168);

  // item rows
  const rows = [
    { y: 200, name: 'Royal Burger', price: '₹249', desc: 'Crispy patty · cheese · house sauce', badge: highlight ? '● OPENING…' : 'TAP TO VIEW 3D ▶', active: true },
    { y: 392, name: 'Farm Pizza', price: '₹299', desc: 'Garden veggies · mozzarella (demo only)', badge: 'SOON', active: false },
  ];
  rows.forEach((r, idx) => {
    const isHot = idx === 0;
    const hot = isHot && highlight;
    ctx.fillStyle = hot ? 'rgba(255,140,26,0.30)' : (isHot ? 'rgba(255,140,26,0.12)' : 'rgba(255,255,255,0.06)');
    roundRect(ctx, 36, r.y, MENU_W - 72, 160, 26);
    ctx.fill();
    ctx.lineWidth = isHot ? 6 : 3;
    ctx.strokeStyle = isHot ? (hot ? '#ffffff' : '#ff8c1a') : 'rgba(255,255,255,0.25)';
    roundRect(ctx, 36, r.y, MENU_W - 72, 160, 26);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 46px system-ui, Arial';
    ctx.fillText(`${isHot ? '🍔' : '🍕'}  ${r.name}`, 70, r.y + 62);
    ctx.fillStyle = '#ffc93c';
    ctx.font = '800 44px system-ui, Arial';
    ctx.textAlign = 'right';
    ctx.fillText(r.price, MENU_W - 70, r.y + 62);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#cfc9bb';
    ctx.font = '400 30px system-ui, Arial';
    ctx.fillText(r.desc, 70, r.y + 106);

    ctx.fillStyle = isHot ? '#ff8c1a' : '#6b675f';
    roundRect(ctx, 70, r.y + 118, 250, 4, 2);
    ctx.fill();
    ctx.fillStyle = isHot ? '#ffd9a8' : '#8f8a7e';
    ctx.font = '700 26px system-ui, Arial';
    ctx.textAlign = 'right';
    ctx.fillText(r.badge, MENU_W - 70, r.y + 140);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '400 24px system-ui, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('menu stays pinned to the card — move your phone to check', MENU_W / 2, MENU_H - 28);

  if (menuTex) menuTex.needsUpdate = true;
}

// ---------- procedural stylized burger (no download, instant) ----------
function buildBurger() {
  const g = new THREE.Group();
  const mat = (c, rough = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.02 });

  // plate + soft shadow blob
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.32, 0.025, 40), mat(0xf3ede0, 0.4));
  plate.position.y = 0.012;
  g.add(plate);
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const grd = x.createRadialGradient(64, 64, 8, 64, 64, 62);
    grd.addColorStop(0, 'rgba(0,0,0,0.42)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.72),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.026;
  g.add(shadow);

  const add = (mesh, y) => { mesh.position.y = y; mesh.castShadow = true; g.add(mesh); return mesh; };

  add(new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.150, 0.075, 32), mat(0xe0a050)), 0.06); // bottom bun
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.045, 32), mat(0x6b3a1f)), 0.12); // patty
  const cheese = add(new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.014, 0.27), mat(0xffc93c, 0.5)), 0.15);
  cheese.rotation.y = Math.PI / 4;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.032, 32), mat(0xe2452b, 0.55)), 0.175); // tomato
  const lettuce = add(new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.016, 24), mat(0x7ed957, 0.6)), 0.20);
  lettuce.scale.y = 1;

  // top bun (dome)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.165, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe8a94f));
  dome.position.y = 0.205;
  g.add(dome);

  // sesame seeds
  const seedGeo = new THREE.SphereGeometry(0.012, 8, 8);
  const seedMat = mat(0xfff3d6, 0.5);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const r = 0.06 + (i % 3) * 0.035;
    const s = new THREE.Mesh(seedGeo, seedMat);
    s.position.set(Math.cos(a) * r, 0.205 + Math.sqrt(Math.max(0, 0.165 * 0.165 - r * r)) * 0.95, Math.sin(a) * r);
    s.scale.set(1, 0.7, 1);
    g.add(s);
  }

  // steam wisps (two translucent sprites that bob in animate loop)
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0 });
  const steams = [];
  for (let i = 0; i < 2; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), steamMat.clone());
    s.position.set(i === 0 ? -0.05 : 0.06, 0.42, 0);
    s.userData.phase = i * Math.PI;
    g.add(s);
    steams.push(s);
  }
  g.userData.steams = steams;
  return g;
}

// ---------- scene setup ----------
async function initAR() {
  mindarThree = new MindARThree({
    container,
    imageTargetSrc: TARGET_SRC,
    maxTrack: 1,
    uiLoading: 'no',
    uiScanning: 'no',
  });
  ({ renderer, scene, camera } = mindarThree);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(0.6, 1.2, 1.4);
  scene.add(key);
  const warm = new THREE.DirectionalLight(0xffc98a, 0.5);
  warm.position.set(-1, 0.6, 0.8);
  scene.add(warm);

  anchor = mindarThree.addAnchor(0);

  // ----- menu group (pinned to card) -----
  menuGroup = new THREE.Group();
  anchor.group.add(menuGroup);

  drawMenu(false);
  menuTex = new THREE.CanvasTexture(menuCanvas);
  menuTex.colorSpace = THREE.SRGBColorSpace;
  menuTex.anisotropy = 4;

  // Panel is 1.0 wide in anchor units (= image width). Slight lift off the card.
  menuPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, (MENU_H / MENU_W) * 1.0),
    new THREE.MeshBasicMaterial({ map: menuTex, transparent: true, side: THREE.DoubleSide })
  );
  menuPanel.position.set(0, 0, 0.02);
  menuGroup.add(menuPanel);

  // invisible hitboxes over the two rows (raycast targets)
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  hitItem1 = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.16), hitMat);
  hitItem1.position.set(0, 0.045, 0.035);
  hitItem1.userData.item = 1;
  menuGroup.add(hitItem1);
  hitItem2 = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.16), hitMat.clone());
  hitItem2.position.set(0, -0.15, 0.035);
  hitItem2.userData.item = 2;
  menuGroup.add(hitItem2);

  menuGroup.scale.setScalar(0.0001);
  menuGroup.visible = false;

  // ----- dish group (also pinned to same anchor => stays with card) -----
  dishGroup = new THREE.Group();
  dishGroup.position.set(0, -0.02, 0.30); // floats just above card centre
  dishGroup.scale.setScalar(0.0001);
  dishGroup.visible = false;
  // lay the burger "upright" relative to the card: anchor plane is XY, Z is out.
  // Burger is built Y-up; Rx(+90deg) maps +Y -> +Z (out of the card).
  dishSpin = new THREE.Group();
  dishSpin.rotation.x = Math.PI / 2; // burger up-axis -> card normal
  dishGroup.add(dishSpin);
  anchor.group.add(dishGroup);

  anchor.onTargetFound = () => {
    lostBanner.classList.add('hidden');
    if (state === 'scanning') {
      state = 'menu';
      scanHint.classList.add('hidden');
      showMenuPop();
    } else if (state === 'menu' && !menuVisible) {
      showMenuPop();
    }
  };
  anchor.onTargetLost = () => {
    if (state === 'menu' || state === 'dish' || state === 'toDish' || state === 'toMenu') {
      lostBanner.classList.remove('hidden');
      setTimeout(() => lostBanner.classList.add('hidden'), 2500);
    }
  };

  // tap handling on AR canvas
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerdown', onTapDown, { passive: true });
  let downPos = null;
  function onTapDown(e) {
    downPos = { x: e.clientX, y: e.clientY, t: performance.now() };
  }
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downPos) return;
    const dx = e.clientX - downPos.x, dy = e.clientY - downPos.y;
    const moved = Math.hypot(dx, dy);
    const dt = performance.now() - downPos.t;
    downPos = null;
    if (moved > 12 || dt > 600) return; // it was a drag, not a tap
    handleTap(e.clientX, e.clientY);
  }, { passive: true });

  function handleTap(cx, cy) {
    if (state !== 'menu' || !menuVisible) return;
    const r = renderer.domElement.getBoundingClientRect();
    ptr.x = ((cx - r.left) / r.width) * 2 - 1;
    ptr.y = -((cy - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects([hitItem1, hitItem2], false);
    if (!hits.length) return;
    if (hits[0].object.userData.item === 1) selectDish();
    else toast('Farm Pizza is display-only in this POC 🍕');
  }

  // dish inspect: one-finger drag spins, two-finger pinch zooms
  const pointers = new Map();
  let pinchD0 = 0, pinchS0 = 1;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const p = [...pointers.values()];
      pinchD0 = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      pinchS0 = dishScale;
    }
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (state !== 'dish') return;
    if (pointers.size === 1) {
      const dx = e.clientX - prev.x;
      dishSpin.rotation.y += dx * 0.008; // spin around burger up-axis
    } else if (pointers.size === 2) {
      const p = [...pointers.values()];
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinchD0 > 0) dishScale = Math.min(2.2, Math.max(0.5, pinchS0 * (d / pinchD0)));
    }
  });
  const endPointer = (e) => pointers.delete(e.pointerId);
  renderer.domElement.addEventListener('pointerup', endPointer);
  renderer.domElement.addEventListener('pointercancel', endPointer);

  window.addEventListener('resize', () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
}

// ---------- transitions ----------
function showMenuPop() {
  menuGroup.visible = true;
  menuVisible = true;
  const s0 = menuGroup.scale.x || 0.0001;
  tween({
    dur: 550, ease: easeOutBack,
    update: (k) => { const s = Math.max(0.0001, s0 + (1 - s0) * k); menuGroup.scale.setScalar(s); },
  });
}

function selectDish() {
  if (state !== 'menu') return;
  state = 'toDish';
  // 1) highlight the tapped row
  drawMenu(true);
  toast('Royal Burger — plating up…');
  setTimeout(() => {
    // lazily build the 3D only when first needed
    if (!dishBuilt) {
      dishSpin.add(buildBurger());
      dishBuilt = true;
    }
    // 2) menu recedes (scale down + sink slightly)
    const mStart = menuGroup.scale.x;
    tween({
      dur: 420, ease: easeInOut,
      update: (k) => {
        menuGroup.scale.setScalar(Math.max(0.0001, mStart * (1 - k)));
        menuGroup.position.z = -0.15 * k;
      },
      done: () => { menuGroup.visible = false; menuVisible = false; },
    });
    // 3) dish scales/fades/moves into position
    dishGroup.visible = true;
    dishGroup.position.set(0, -0.02, 0.10);
    tween({
      dur: 750, ease: easeOutBack,
      update: (k) => {
        dishGroup.scale.setScalar(Math.max(0.0001, k * dishScale));
        dishGroup.position.z = 0.10 + 0.20 * k;
      },
      done: () => {
        state = 'dish';
        backBtn.classList.remove('hidden');
        dishCaption.classList.remove('hidden');
        drawMenu(false);
      },
    });
  }, 380);
}

function resetToMenu() {
  if (state !== 'dish') return;
  state = 'toMenu';
  backBtn.classList.add('hidden');
  dishCaption.classList.add('hidden');
  // dish shrinks away
  const dStart = dishGroup.scale.x;
  tween({
    dur: 350, ease: easeInOut,
    update: (k) => {
      dishGroup.scale.setScalar(Math.max(0.0001, dStart * (1 - k)));
      dishGroup.position.z = 0.30 - 0.12 * k;
    },
    done: () => { dishGroup.visible = false; },
  });
  // menu pops back
  menuGroup.visible = true;
  menuGroup.position.z = 0;
  tween({
    dur: 550, ease: easeOutBack,
    update: (k) => menuGroup.scale.setScalar(Math.max(0.0001, k)),
    done: () => { state = 'menu'; menuVisible = true; },
  });
}

backBtn.addEventListener('click', resetToMenu);

// ---------- animation loop ----------
let lastT = 0;
function loop(t) {
  // driven by renderer.setAnimationLoop (MindAR documented pattern)
  const dt = Math.min(50, t - (lastT || t));
  lastT = t;
  stepTweens(dt);
  if (dishGroup && dishGroup.visible) {
    if (state === 'dish') {
      // gentle auto-rotate (burger local up-axis) + steam bob (time-based)
      dishSpin.rotation.y += dt * 0.0004;
      const burger = dishSpin.children[0];
      if (burger && burger.userData.steams) {
        burger.userData.steams.forEach((s, i) => {
          const ph = t * 0.002 + s.userData.phase;
          s.position.y = 0.42 + Math.sin(ph) * 0.02;
          s.material.opacity = state === 'dish' ? 0.10 + 0.08 * Math.sin(ph * 1.3) : 0;
          s.scale.setScalar(1 + 0.25 * Math.sin(ph));
        });
      }
      // apply pinch zoom smoothly
      const target = dishScale;
      const cur = dishGroup.scale.x;
      if (Math.abs(cur - target) > 0.001) dishGroup.scale.setScalar(cur + (target - cur) * 0.2);
    }
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
}

// ---------- start flow (camera permission) ----------
startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  startError.classList.add('hidden');
  loadingEl.classList.remove('hidden');
  state = 'starting';
  try {
    if (!mindarThree) await initAR();
    await mindarThree.start();
    renderer.setSize(container.clientWidth, container.clientHeight);
    startOverlay.style.display = 'none';
    loadingEl.classList.add('hidden');
    state = 'scanning';
    scanHint.classList.remove('hidden');
    renderer.setAnimationLoop(loop);
  } catch (err) {
    console.error(err);
    state = 'idle';
    loadingEl.classList.add('hidden');
    startBtn.disabled = false;
    startError.textContent = 'Could not start camera. Use HTTPS (or localhost), allow camera permission, and use Chrome on Android. ' + (err && err.message ? '(' + err.message + ')' : '');
    startError.classList.remove('hidden');
  }
});
