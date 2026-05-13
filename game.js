/* ============================================================
 * City Bloxx Revamp
 * A classic Tower Bloxx-style crane stacker. The hook swings on
 * a pendulum cable; players time a drop. Mis-aligned blocks
 * tilt the tower. Too much tilt or no overlap and it topples.
 * ============================================================ */

(() => {
'use strict';

// ---------- Tunables ----------
const LOGICAL_W = 960;
const LOGICAL_H = 600;

const BLOCK_W = 48;
const BLOCK_H = 48;

const GROUND_OFFSET = 56;        // height of grass strip at bottom (world space)
const CRANE_Y = 56;              // screen-Y of the crane jib
const TOWER_TOP_TARGET = 280;    // once tower top is above this screen-Y, camera scrolls
const HANG_MARGIN = 18;          // clearance between hanging block and tower top

const GRAVITY = 0.6;

// Scoring
const PERFECT_TOLERANCE = 4;     // px center-to-center
const GOOD_TOLERANCE = 14;
const PERFECT_BONUS = 500;
const GOOD_POINTS = 200;
const MARGINAL_POINTS = 50;
const FIRST_BLOCK_POINTS = 200;

// Tilt / collapse
const MIN_OVERLAP = 8;           // below this, the block slides off entirely
const TILT_TORQUE_K = 0.00012;   // converts cumulative torque to radians
const MAX_TILT_RAD = 0.32;       // ~18° — beyond this the tower topples

// Pendulum
const SWING_ANGLE_CAP = 1.05;    // ~60° max swing (subject to field-width cap)
const PENDULUM_G = 550;          // tuned gravity for omega = sqrt(g/L)
const SWING_RAMP_PER_FLOOR = 0.028; // angular speed bonus per floor (endless ramp)
const SWING_RAMP_MAX = 3.0;      // hard ceiling so the hook is still trackable

// Cable length bounds
const MIN_CABLE = 80;
const MAX_CABLE = 280;

const TWO_PI = Math.PI * 2;

// ---------- DOM ----------
const screens = {
  menu: document.getElementById('screen-menu'),
  game: document.getElementById('screen-game'),
  end:  document.getElementById('screen-end'),
};
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = LOGICAL_W;
canvas.height = LOGICAL_H;
ctx.imageSmoothingEnabled = false;

const hud = {
  p1Floors: document.getElementById('hud-p1-floors'),
  p1Score:  document.getElementById('hud-p1-score'),
  p1Label:  document.getElementById('hud-p1-label'),
  p2Wrap:   document.getElementById('hud-p2-wrap'),
  p2Floors: document.getElementById('hud-p2-floors'),
  p2Score:  document.getElementById('hud-p2-score'),
};

function showScreen(name) {
  for (const k of Object.keys(screens)) {
    screens[k].classList.toggle('active', k === name);
  }
}

// ---------- Field ----------
class Field {
  constructor(originX, width) {
    this.originX = originX;
    this.w = width;
    this.h = LOGICAL_H;

    this.blocks = [];                  // {x, worldY, w, offset}
    this.cameraY = 0;                  // world Y at screen Y=0
    this.fallingPasts = [];            // blocks that slid off the side
    this.toppleParts = [];
    this.particles = [];

    this.activeBlock = null;
    this.cableLength = MAX_CABLE;
    this.swingPhase = 0;
    this.swingSpeedBonus = 0;

    this.score = 0;
    this.peakFloors = 0;               // highest floor count reached this run
    this.tiltAngle = 0;                // signed accumulated tilt (radians)
    this.swayTime = 0;

    this.gameOver = false;
    this.toppling = false;

    this.flashTimer = 0;
    this.flashColor = null;
    this.shakeTimer = 0;

    this.skyline = this._genSkyline();
    this.spawnBlock();
  }

  // ----- coordinates -----
  get groundWorldY() { return LOGICAL_H - GROUND_OFFSET; }
  get towerTopWorldY() { return this.groundWorldY - this.blocks.length * BLOCK_H; }
  worldToScreen(y) { return y - this.cameraY; }
  screenToWorld(y) { return y + this.cameraY; }

  _genSkyline() {
    const buildings = [];
    let x = -10;
    while (x < this.w + 10) {
      const w = 30 + Math.floor(Math.random() * 50);
      const h = 80 + Math.floor(Math.random() * 220);
      buildings.push({ x, w, h, shade: 0.35 + Math.random() * 0.35 });
      x += w + 2;
    }
    return buildings;
  }

  // ----- block lifecycle -----
  spawnBlock() {
    // Endless mode — no floor cap. Player keeps stacking until the tower topples.

    // Snap the camera so the tower top is at most TOWER_TOP_TARGET on screen.
    this.cameraY = Math.min(0, this.towerTopWorldY - TOWER_TOP_TARGET);

    // Cable length: hangs the block just above the tower top.
    const topScreen = this.worldToScreen(this.towerTopWorldY);
    const desired = topScreen - CRANE_Y - BLOCK_H - HANG_MARGIN;
    this.cableLength = Math.max(MIN_CABLE, Math.min(MAX_CABLE, desired));

    // Reset pendulum to bottom of swing, alternating initial direction.
    this.swingPhase = (this.blocks.length % 2 === 0) ? 0 : Math.PI;

    this.activeBlock = {
      x: this.w / 2,
      screenY: CRANE_Y + this.cableLength,
      w: BLOCK_W,
      vy: 0,
      worldY: 0,
      falling: false,
    };
  }

  drop() {
    if (!this.activeBlock || this.activeBlock.falling) return;
    if (this.gameOver || this.won) return;
    this.activeBlock.falling = true;
    this.activeBlock.worldY = this.screenToWorld(this.activeBlock.screenY);
    this.activeBlock.vy = 0;
  }

  // ----- per-frame update -----
  update() {
    this.flashTimer = Math.max(0, this.flashTimer - 1);
    this.shakeTimer = Math.max(0, this.shakeTimer - 1);
    this.swayTime += 1 / 60;

    // sliding-off blocks
    for (const f of this.fallingPasts) {
      f.vy += GRAVITY;
      f.worldY += f.vy;
      f.x += f.vx;
      f.rot += f.vrot;
    }
    this.fallingPasts = this.fallingPasts.filter(f => f.worldY < this.groundWorldY + 200);

    // topple parts
    if (this.toppling) {
      for (const p of this.toppleParts) {
        p.vy += GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
      }
      this.toppleParts = this.toppleParts.filter(p => p.y < this.h + 80);
    }

    // particles
    for (const s of this.particles) {
      s.life -= 1;
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.12;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    if (this.gameOver || this.won || !this.activeBlock) return;

    const a = this.activeBlock;

    if (!a.falling) {
      this._updatePendulum(a);
    } else {
      this._updateFalling(a);
    }
  }

  _updatePendulum(a) {
    // Field-aware cap on swing angle so block stays inside the playfield.
    const maxArc = (this.w / 2) - (BLOCK_W / 2) - 14;
    const ratio = Math.min(1, maxArc / this.cableLength);
    const thetaMax = Math.min(SWING_ANGLE_CAP, Math.asin(ratio));

    // omega = sqrt(g/L), tuned. Add a small ramp per floor for pressure.
    const omega = Math.sqrt(PENDULUM_G / this.cableLength) + this.swingSpeedBonus;
    this.swingPhase += omega / 60;
    if (this.swingPhase > TWO_PI) this.swingPhase -= TWO_PI;

    const theta = thetaMax * Math.sin(this.swingPhase);
    const anchorX = this.w / 2;
    a.x = anchorX + this.cableLength * Math.sin(theta);
    a.screenY = CRANE_Y + this.cableLength * Math.cos(theta);
  }

  _updateFalling(a) {
    a.vy += GRAVITY;
    a.worldY += a.vy;
    a.screenY = this.worldToScreen(a.worldY);

    const landingWorldY = this.blocks.length === 0
      ? this.groundWorldY - BLOCK_H
      : this.blocks[this.blocks.length - 1].worldY - BLOCK_H;

    if (a.worldY >= landingWorldY) {
      a.worldY = landingWorldY;
      a.screenY = this.worldToScreen(a.worldY);
      this._onLanded();
    }
  }

  _onLanded() {
    const a = this.activeBlock;

    // First block always plants on the ground.
    if (this.blocks.length === 0) {
      this.blocks.push({ x: a.x, worldY: a.worldY, w: a.w, offset: 0 });
      this.score += FIRST_BLOCK_POINTS;
      this._emitDust(a.x, this.worldToScreen(a.worldY) + BLOCK_H);
      this._afterLand();
      return;
    }

    const prev = this.blocks[this.blocks.length - 1];
    const signedOffset = a.x - prev.x;
    const absOffset = Math.abs(signedOffset);
    const maxAllowed = (a.w / 2) + (prev.w / 2) - MIN_OVERLAP;

    // Too far off — the block slides past the tower entirely.
    if (absOffset > maxAllowed) {
      this._sendBlockSliding(a, signedOffset);
      this.activeBlock = null;
      this.shakeTimer = 8;
      this.spawnBlock();
      return;
    }

    // Block lands at full width.
    this.blocks.push({
      x: a.x,
      worldY: a.worldY,
      w: a.w,
      offset: signedOffset,
    });

    this._updateTilt();

    let pts, isPerfect = false;
    if (absOffset <= PERFECT_TOLERANCE) { pts = PERFECT_BONUS; isPerfect = true; }
    else if (absOffset <= GOOD_TOLERANCE) { pts = GOOD_POINTS; }
    else { pts = MARGINAL_POINTS; }
    this.score += pts;

    if (isPerfect) {
      this.flashTimer = 18;
      this.flashColor = '#ffd23f';
      this._emitSparkles(a.x, this.worldToScreen(a.worldY));
    } else {
      this.flashTimer = 6;
      this.flashColor = '#ffffff';
      this._emitDust(a.x, this.worldToScreen(a.worldY) + BLOCK_H);
    }

    if (Math.abs(this.tiltAngle) > MAX_TILT_RAD) {
      this._topple();
      return;
    }

    this._afterLand();
  }

  _updateTilt() {
    if (this.blocks.length <= 1) {
      this.tiltAngle = 0;
      return;
    }
    // Torque = sum of (offset-from-base) weighted by height.
    const base = this.blocks[0];
    let torque = 0;
    for (let i = 1; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      torque += (b.x - base.x) * (i + 1);
    }
    this.tiltAngle = torque * TILT_TORQUE_K;
  }

  _afterLand() {
    this.peakFloors = Math.max(this.peakFloors, this.blocks.length);
    this.swingSpeedBonus = Math.min(
      SWING_RAMP_MAX,
      this.swingSpeedBonus + SWING_RAMP_PER_FLOOR,
    );
    this.spawnBlock();
  }

  _sendBlockSliding(a, signedOffset) {
    const dir = signedOffset > 0 ? 1 : -1;
    this.fallingPasts.push({
      x: a.x,
      worldY: a.worldY,
      w: a.w,
      vx: dir * (1.4 + Math.random() * 1.6),
      vy: Math.max(0, a.vy * 0.4),
      rot: 0,
      vrot: dir * (0.05 + Math.random() * 0.07),
    });
  }

  _topple() {
    this.gameOver = true;
    this.toppling = true;
    const dir = this.tiltAngle > 0 ? 1 : -1;
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      this.toppleParts.push({
        x: b.x,
        y: this.worldToScreen(b.worldY),
        w: b.w,
        h: BLOCK_H,
        rot: this.tiltAngle,
        vrot: dir * (0.06 + Math.random() * 0.08),
        vx: dir * (1 + Math.random() * 2.5) * (0.4 + (i + 1) / this.blocks.length),
        vy: -2 - Math.random() * 3,
      });
    }
    this.blocks = [];
    this.activeBlock = null;
    this.shakeTimer = 30;
  }

  _emitDust(x, y) {
    for (let i = 0; i < 14; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 3,
        vy: -Math.random() * 2,
        life: 22 + Math.random() * 12,
        color: '#d9c89a',
        size: 2 + Math.random() * 2,
      });
    }
  }
  _emitSparkles(x, y) {
    for (let i = 0; i < 18; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 5,
        vy: -1 - Math.random() * 3,
        life: 28 + Math.random() * 14,
        color: Math.random() < 0.5 ? '#ffd23f' : '#fff',
        size: 2 + Math.random() * 2,
      });
    }
  }

  // ----- visual sway (cosmetic) -----
  _swayVisualAngle() {
    // Static lean from cumulative offsets + an oscillating wobble.
    const wobbleAmp = 0.003 * this.blocks.length + 0.6 * Math.abs(this.tiltAngle);
    const wobble = wobbleAmp * Math.sin(this.swayTime * 1.7);
    return this.tiltAngle + wobble;
  }

  // ============================================================
  // DRAW
  // ============================================================
  draw(g) {
    g.save();
    g.translate(this.originX, 0);
    g.beginPath();
    g.rect(0, 0, this.w, this.h);
    g.clip();

    // optional screen shake
    if (this.shakeTimer > 0) {
      const s = this.shakeTimer / 30;
      g.translate(
        (Math.random() - 0.5) * 4 * s,
        (Math.random() - 0.5) * 4 * s,
      );
    }

    this._drawSky(g);
    this._drawSkyline(g);

    // world-space layers (tower, ground, sliding-off blocks)
    g.save();
    g.translate(0, -this.cameraY);
    this._drawGround(g);
    this._drawTowerWithTilt(g);
    this._drawFallingPasts(g);
    g.restore();

    // screen-space layers
    this._drawToppleParts(g);
    if (!this.gameOver && !this.won) this._drawCrane(g);
    this._drawParticles(g);

    if (this.flashTimer > 0) this._drawFlash(g);
    this._drawTiltMeter(g);

    g.restore();

    // border between fields
    g.save();
    g.fillStyle = '#1a3a8a';
    g.fillRect(this.originX + this.w - 2, 0, 4, this.h);
    g.restore();
  }

  _drawSky(g) {
    const grd = g.createLinearGradient(0, 0, 0, this.h);
    grd.addColorStop(0, '#2a4ba8');
    grd.addColorStop(0.45, '#5a8edc');
    grd.addColorStop(1, '#a8c8f0');
    g.fillStyle = grd;
    g.fillRect(0, 0, this.w, this.h);

    g.fillStyle = '#ffffff';
    for (let i = 0; i < 16; i++) {
      const sx = (i * 53 + 17) % this.w;
      const sy = (i * 31) % 110;
      g.globalAlpha = 0.5 + (i % 3) * 0.15;
      g.fillRect(sx, sy + 14, 2, 2);
    }
    g.globalAlpha = 1;
  }

  _drawSkyline(g) {
    const baseY = this.h - GROUND_OFFSET;
    for (const b of this.skyline) {
      const top = baseY - b.h;
      const shade = b.shade;
      g.fillStyle = `rgb(${Math.floor(70*shade)}, ${Math.floor(90*shade)}, ${Math.floor(140*shade)})`;
      g.fillRect(b.x, top, b.w, b.h);
      g.fillStyle = `rgba(255, 230, 140, ${0.18 + shade * 0.4})`;
      for (let yy = top + 6; yy < baseY - 4; yy += 8) {
        for (let xx = b.x + 4; xx < b.x + b.w - 4; xx += 6) {
          if (((xx + yy) >> 1) % 3 === 0) {
            g.fillRect(xx, yy, 2, 3);
          }
        }
      }
    }
  }

  _drawGround(g) {
    const gy = this.groundWorldY;
    g.fillStyle = '#3a5a2a';
    g.fillRect(0, gy, this.w, GROUND_OFFSET + Math.max(0, this.cameraY * -1) + 200);
    g.fillStyle = '#a0a0a0';
    g.fillRect(0, gy, this.w, 8);
    g.fillStyle = '#7a7a7a';
    for (let x = 0; x < this.w; x += 22) {
      g.fillRect(x, gy + 8, 1, 4);
    }
  }

  _drawBlock(g, cx, top, w) {
    const left = Math.round(cx - w / 2);
    const t = Math.round(top);
    const wi = Math.round(w);

    // body
    g.fillStyle = '#e8a23a';
    g.fillRect(left, t, wi, BLOCK_H);
    g.fillStyle = '#ffd06b';                // top highlight
    g.fillRect(left, t, wi, 4);
    g.fillStyle = '#a06a18';                // bottom shadow
    g.fillRect(left, t + BLOCK_H - 4, wi, 4);
    g.fillStyle = '#c4881e';                // side bevels
    g.fillRect(left, t + 4, 3, BLOCK_H - 8);
    g.fillRect(left + wi - 3, t + 4, 3, BLOCK_H - 8);

    // window grid — fits any block dimensions
    const padX = 5;
    const padTop = 6;
    const padBot = 6;
    const slotW = 5;
    const slotH = 7;
    const gapX = 3;
    const gapY = 4;

    const innerW = wi - padX * 2;
    const innerH = BLOCK_H - 4 /* top highlight */ - padTop - padBot;
    if (innerW < slotW || innerH < slotH) return;

    const cols = Math.max(1, Math.floor((innerW + gapX) / (slotW + gapX)));
    const rows = Math.max(1, Math.floor((innerH + gapY) / (slotH + gapY)));
    const totalW = cols * slotW + (cols - 1) * gapX;
    const totalH = rows * slotH + (rows - 1) * gapY;
    const startX = left + padX + Math.floor((innerW - totalW) / 2);
    const startY = t + 4 + padTop + Math.floor((innerH - totalH) / 2);

    for (let r = 0; r < rows; r++) {
      const wy = startY + r * (slotH + gapY);
      for (let c = 0; c < cols; c++) {
        const wx = startX + c * (slotW + gapX);
        g.fillStyle = '#2a3a78';
        g.fillRect(wx, wy, slotW, slotH);
        g.fillStyle = '#7ec0ff';            // window glint
        g.fillRect(wx, wy, slotW, 2);
      }
    }
  }

  _drawTowerWithTilt(g) {
    if (this.blocks.length === 0) return;
    const angle = this._swayVisualAngle();
    const base = this.blocks[0];
    const pivotX = base.x;
    const pivotY = this.groundWorldY;

    g.save();
    g.translate(pivotX, pivotY);
    g.rotate(angle);
    g.translate(-pivotX, -pivotY);

    for (const b of this.blocks) {
      this._drawBlock(g, b.x, b.worldY, b.w);
    }
    g.restore();
  }

  _drawFallingPasts(g) {
    for (const f of this.fallingPasts) {
      g.save();
      g.translate(f.x, f.worldY + BLOCK_H / 2);
      g.rotate(f.rot);
      this._drawBlock(g, 0, -BLOCK_H / 2, f.w);
      g.restore();
    }
  }

  _drawToppleParts(g) {
    for (const p of this.toppleParts) {
      g.save();
      g.translate(p.x, p.y + BLOCK_H / 2);
      g.rotate(p.rot);
      this._drawBlock(g, 0, -BLOCK_H / 2, p.w);
      g.restore();
    }
  }

  _drawCrane(g) {
    if (!this.activeBlock) return;
    const a = this.activeBlock;
    const anchorX = this.w / 2;
    const anchorY = CRANE_Y;

    // horizontal jib
    g.fillStyle = '#2a1410';
    g.fillRect(8, anchorY - 4, this.w - 16, 2);
    g.fillStyle = '#ffd23f';
    g.fillRect(8, anchorY - 14, this.w - 16, 10);
    g.fillStyle = '#d6a015';
    g.fillRect(8, anchorY - 6, this.w - 16, 2);
    g.fillStyle = '#2a1410';
    g.fillRect(6, anchorY - 16, 4, 14);
    g.fillRect(this.w - 10, anchorY - 16, 4, 14);

    // hook anchor housing
    g.fillStyle = '#ff5757';
    g.fillRect(anchorX - 10, anchorY - 14, 20, 8);
    g.fillStyle = '#a01818';
    g.fillRect(anchorX - 10, anchorY - 8, 20, 2);
    g.fillStyle = '#2a1410';
    g.fillRect(anchorX - 2, anchorY - 6, 4, 4);

    // swinging cable
    const bx = a.x;
    const by = a.screenY;
    g.strokeStyle = '#2a1410';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(anchorX, anchorY - 2);
    g.lineTo(bx, by);
    g.stroke();

    // hook
    g.fillStyle = '#2a1410';
    g.fillRect(bx - 4, by - 2, 8, 4);

    // hanging or falling block (screen-space)
    this._drawBlock(g, bx, by, a.w);
  }

  _drawParticles(g) {
    for (const p of this.particles) {
      g.globalAlpha = Math.min(1, p.life / 20);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
  }

  _drawFlash(g) {
    g.globalAlpha = this.flashTimer / 30;
    g.fillStyle = this.flashColor || '#ffffff';
    g.fillRect(0, 0, this.w, this.h);
    g.globalAlpha = 1;
  }

  _drawTiltMeter(g) {
    const tilt = Math.abs(this.tiltAngle);
    if (tilt < MAX_TILT_RAD * 0.35) return;

    const pct = Math.min(1, tilt / MAX_TILT_RAD);
    const w = 88;
    const h = 8;
    const x = 12;
    const y = this.h - 22;

    g.fillStyle = '#000';
    g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.fillStyle = '#262e60';
    g.fillRect(x, y, w, h);

    const c = pct > 0.85 ? '#ff3030' : pct > 0.6 ? '#ffaa30' : '#ffd23f';
    g.fillStyle = c;
    g.fillRect(x, y, w * pct, h);

    g.fillStyle = pct > 0.85 ? '#ff8080' : '#fff';
    g.font = '8px "Press Start 2P", monospace';
    g.fillText(pct > 0.85 ? '!! TILT !!' : 'TILT', x, y - 4);
  }
}

// ============================================================
// Game controller
// ============================================================
const game = {
  mode: '1p',
  fields: [],
  running: false,
  rafId: null,
};

function t(key, vars) {
  return (window.I18N && window.I18N.get) ? window.I18N.get(key, vars) : key;
}

function applyHudLabels() {
  hud.p1Label.textContent = game.mode === '1p' ? t('player') : t('player1');
}

const isTouchOnly = (() => {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia && window.matchMedia('(hover: none)').matches;
  return Boolean(coarse || noHover);
})();
if (isTouchOnly) document.body.classList.add('touch-only');

function startGame(mode) {
  // On touch-only devices, 2P (which needs S + ↓ keys) isn't playable, so coerce.
  if (mode === '2p' && isTouchOnly) mode = '1p';
  game.mode = mode;
  game.fields = [];
  const hudEl = document.querySelector('.hud');
  if (mode === '1p') {
    game.fields.push(new Field(0, LOGICAL_W));
    hud.p2Wrap.classList.add('hidden');
    hudEl.classList.remove('mode-2p');
  } else {
    const halfW = LOGICAL_W / 2;
    // Player 1 plays on the right half, Player 2 plays on the left half.
    game.fields.push(new Field(halfW, halfW));   // index 0 = P1
    game.fields.push(new Field(0, halfW));        // index 1 = P2
    hud.p2Wrap.classList.remove('hidden');
    hudEl.classList.add('mode-2p');
  }
  applyHudLabels();
  game.running = true;
  showScreen('game');
  loop();
}

document.addEventListener('langchange', () => {
  if (game.running) applyHudLabels();
});

function stopGame() {
  game.running = false;
  if (game.rafId) cancelAnimationFrame(game.rafId);
}

function loop() {
  if (!game.running) return;
  for (const f of game.fields) f.update();
  draw();
  updateHud();
  checkEnd();
  game.rafId = requestAnimationFrame(loop);
}

function draw() {
  ctx.fillStyle = '#0a0e2a';
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  for (const f of game.fields) f.draw(ctx);
}

function updateHud() {
  hud.p1Floors.textContent = game.fields[0].blocks.length;
  hud.p1Score.textContent  = game.fields[0].score;
  if (game.fields[1]) {
    hud.p2Floors.textContent = game.fields[1].blocks.length;
    hud.p2Score.textContent  = game.fields[1].score;
  }
}

function checkEnd() {
  if (game.mode === '1p') {
    const f = game.fields[0];
    if (f.gameOver && f.toppleParts.length === 0) {
      endGame(
        t('towerCollapsed'),
        t('detailFloorsBuilt', { floors: f.peakFloors, score: f.score }),
      );
    }
  } else {
    const p1 = game.fields[0], p2 = game.fields[1];
    const bothDone = p1.gameOver && p2.gameOver
      && p1.toppleParts.length === 0 && p2.toppleParts.length === 0;
    if (!bothDone) return;

    let winKey;
    if (p1.peakFloors === p2.peakFloors) {
      winKey = p1.score === p2.score ? 'tie' : (p1.score > p2.score ? 'p1Wins' : 'p2Wins');
    } else {
      winKey = p1.peakFloors > p2.peakFloors ? 'p1Wins' : 'p2Wins';
    }
    endGame(t(winKey), t('detailBoth', {
      p1floors: p1.peakFloors, p1score: p1.score,
      p2floors: p2.peakFloors, p2score: p2.score,
    }));
  }
}

function endGame(title, detail) {
  stopGame();
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-detail').textContent = detail;
  showScreen('end');
}

// ---------- Input ----------
window.addEventListener('keydown', (e) => {
  if (!game.running) return;
  if (e.key === 'ArrowDown' || e.code === 'ArrowDown') {
    e.preventDefault();
    game.fields[0]?.drop();
  } else if (e.key === 's' || e.key === 'S') {
    if (game.mode === '2p') {
      e.preventDefault();
      game.fields[1]?.drop();
    }
  } else if (e.key === 'Escape') {
    showScreen('menu');
    stopGame();
  }
});

canvas.addEventListener('pointerdown', (e) => {
  if (!game.running) return;
  if (game.mode === '1p') {
    game.fields[0]?.drop();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  // P1 plays right, P2 plays left.
  if (x < rect.width / 2) game.fields[1]?.drop();
  else game.fields[0]?.drop();
});

// ---------- Menu wiring ----------
document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => startGame(btn.dataset.mode));
});
document.getElementById('btn-back').addEventListener('click', () => {
  stopGame();
  showScreen('menu');
});
document.getElementById('btn-again').addEventListener('click', () => {
  startGame(game.mode);
});
document.getElementById('btn-menu').addEventListener('click', () => {
  showScreen('menu');
});

})();
