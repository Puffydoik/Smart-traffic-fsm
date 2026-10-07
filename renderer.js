/* ═══════════════════════════════════════════════════════════════
   renderer.js  –  Canvas-based Intersection Renderer
   
   Draws a top-down 560×560 intersection with:
   • Four-way road layout
   • Traffic lights on all four corners (main N/S, side E/W)
   • Zebra crossings on all four arms
   • Animated cars on main road and side road
   • Pedestrian signals + animated pedestrian walker
   • Emergency vehicle animation
═══════════════════════════════════════════════════════════════ */

'use strict';

class IntersectionRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    this.W      = this.canvas.width;
    this.H      = this.canvas.height;

    /* Last FSM snapshot */
    this._snap  = null;

    /* Car positions (each car: { x, y, dir, lane, active }) */
    this._cars  = this._initCars();

    /* Pedestrian walker state */
    this._ped   = { x: 0, y: 0, t: 0, active: false, side: 0 }; // side 0=N→S, 1=S→N

    /* Emergency vehicle */
    this._emVeh = { x: 0, y: 0, t: 0, active: false, dir: 'main' };

    /* Animation loop */
    this._raf   = null;
    this._last  = 0;

    /* Road geometry constants */
    this.CX     = this.W / 2;
    this.CY     = this.H / 2;
    this.ROAD_W = 110;  // total road width (both lanes)
    this.LANE_W = this.ROAD_W / 2;
    this.STOP_OFFSET = 55; // distance from centre to stop line

    this._loop = this._loop.bind(this);
  }

  start() { this._raf = requestAnimationFrame(this._loop); }

  stop()  { cancelAnimationFrame(this._raf); }

  /** Called by FSM tick with a snapshot */
  update(snap) { this._snap = snap; }

  /* ── Animation Loop ────────────────────────────────────── */

  _loop(ts) {
    const dt = Math.min((ts - this._last) / 1000, 0.1); // cap at 100 ms
    this._last = ts;

    if (this._snap) {
      const speed = this._snap.speedFactor ?? 1;
      this._updateCars(dt * speed);
      this._updatePed(dt * speed);
      this._updateEmVeh(dt * speed);
    }

    this._draw();
    this._raf = requestAnimationFrame(this._loop);
  }

  /* ── Car Management ─────────────────────────────────────── */

  _initCars() {
    const cars = [];
    /* Main road: N→S (going south) */
    for (let i = 0; i < 3; i++) {
      cars.push({ id: i, dir: 'NS', x: this.W/2 - 20, y: -40 - i * 130, speed: 70, road: 'main', stopped: false });
    }
    /* Main road: S→N (going north) */
    for (let i = 0; i < 3; i++) {
      cars.push({ id: i+3, dir: 'SN', x: this.W/2 + 20, y: this.H + 40 + i * 130, speed: 70, road: 'main', stopped: false });
    }
    /* Side road: W→E (going east) */
    for (let i = 0; i < 3; i++) {
      cars.push({ id: i+6, dir: 'WE', x: -40 - i * 130, y: this.H/2 - 20, speed: 70, road: 'side', stopped: false });
    }
    /* Side road: E→W (going west) */
    for (let i = 0; i < 3; i++) {
      cars.push({ id: i+9, dir: 'EW', x: this.W + 40 + i * 130, y: this.H/2 + 20, speed: 70, road: 'side', stopped: false });
    }
    return cars;
  }

  _updateCars(dt) {
    const snap = this._snap;
    const CX = this.CX, CY = this.CY;
    const STOP = this.STOP_OFFSET + 5;

    this._cars.forEach(car => {
      const green = (car.road === 'main' && snap.mainSignal === 'GREEN') ||
                    (car.road === 'side' && snap.sideSignal === 'GREEN');

      /* Emergency override: if emergency is on this road's direction */
      const emGreen = snap.emActive && snap.emDirection === car.road;

      const canMove = green || emGreen;

      /* Compute stop line position for this direction */
      let stopX, stopY, pastStop;
      switch (car.dir) {
        case 'NS': stopX = null; stopY = CY - STOP; pastStop = car.y >= stopY; break;
        case 'SN': stopX = null; stopY = CY + STOP; pastStop = car.y <= stopY; break;
        case 'WE': stopY = null; stopX = CX - STOP; pastStop = car.x >= stopX; break;
        case 'EW': stopY = null; stopX = CX + STOP; pastStop = car.x <= stopX; break;
      }

      car.stopped = !canMove && !pastStop;

      if (car.stopped) return;

      /* Advance */
      const spd = (snap.speedFactor ?? 1) === 1 ? car.speed :
                  car.speed; // speed is already multiplied in loop

      switch (car.dir) {
        case 'NS': car.y += spd * dt; if (car.y > this.H + 80) car.y = -80; break;
        case 'SN': car.y -= spd * dt; if (car.y < -80)          car.y = this.H + 80; break;
        case 'WE': car.x += spd * dt; if (car.x > this.W + 80) car.x = -80; break;
        case 'EW': car.x -= spd * dt; if (car.x < -80)          car.x = this.W + 80; break;
      }
    });
  }

  /* ── Pedestrian Management ──────────────────────────────── */

  _updatePed(dt) {
    const snap = this._snap;
    if (!snap) return;

    if (snap.pedWalk && !this._ped.active) {
      this._ped.active = true;
      this._ped.side   = (Date.now() % 2 === 0) ? 0 : 1;
      this._ped.t      = 0;
      if (this._ped.side === 0) {
        this._ped.x = this.CX + 70;
        this._ped.y = this.CY - 80;
      } else {
        this._ped.x = this.CX - 70;
        this._ped.y = this.CY + 80;
      }
    }

    if (!snap.pedWalk) {
      this._ped.active = false;
      return;
    }

    if (this._ped.active) {
      this._ped.t += dt * 40; // walking speed
      if (this._ped.side === 0) {
        this._ped.y += dt * 40;
        if (this._ped.y > this.CY + 80) {
          this._ped.y = this.CY - 80;
          this._ped.x = this.CX + 70 + (Math.random() - 0.5) * 20;
        }
      } else {
        this._ped.y -= dt * 40;
        if (this._ped.y < this.CY - 80) {
          this._ped.y = this.CY + 80;
          this._ped.x = this.CX - 70 + (Math.random() - 0.5) * 20;
        }
      }
    }
  }

  /* ── Emergency Vehicle ──────────────────────────────────── */

  _updateEmVeh(dt) {
    const snap = this._snap;
    if (!snap) return;

    if (snap.emActive && !this._emVeh.active) {
      this._emVeh.active = true;
      this._emVeh.dir    = snap.emDirection;
      if (snap.emDirection === 'main') {
        this._emVeh.x = this.CX - 15;
        this._emVeh.y = -60;
        this._emVeh.dx = 0;
        this._emVeh.dy = 1;
      } else {
        this._emVeh.x = -60;
        this._emVeh.y = this.CY - 15;
        this._emVeh.dx = 1;
        this._emVeh.dy = 0;
      }
    }

    if (!snap.emActive) {
      this._emVeh.active = false;
      return;
    }

    if (this._emVeh.active) {
      const spd = 90;
      this._emVeh.x += this._emVeh.dx * spd * dt;
      this._emVeh.y += this._emVeh.dy * spd * dt;

      /* Wrap around */
      if (this._emVeh.y > this.H + 60) {
        this._emVeh.y = -60;
        this._emVeh.x = this.CX - 15;
      }
      if (this._emVeh.x > this.W + 60) {
        this._emVeh.x = -60;
        this._emVeh.y = this.CY - 15;
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     DRAWING
  ═══════════════════════════════════════════════════════════ */

  _draw() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    ctx.clearRect(0, 0, W, H);

    this._drawBackground();
    this._drawRoads();
    this._drawZebraCrossings();
    this._drawLaneMarkings();
    this._drawCars();
    if (this._ped.active)   this._drawPedestrian();
    if (this._emVeh.active) this._drawEmergencyVehicle();
    this._drawTrafficLights();
    this._drawPedSignals();
    this._drawOverlays();
  }

  /* ── Background ── */
  _drawBackground() {
    const ctx = this.ctx;
    /* Grass / surroundings */
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(0, 0, this.W, this.H);

    /* Sidewalk blocks (corners) */
    ctx.fillStyle = '#2a2a3a';
    const CX = this.CX, CY = this.CY, R = this.ROAD_W / 2;
    ctx.fillRect(0,      0,      CX-R, CY-R);
    ctx.fillRect(CX+R,   0,      CX-R, CY-R);
    ctx.fillRect(0,      CY+R,   CX-R, CY-R);
    ctx.fillRect(CX+R,   CY+R,   CX-R, CY-R);
  }

  /* ── Roads ── */
  _drawRoads() {
    const ctx = this.ctx;
    const CX = this.CX, CY = this.CY, R = this.ROAD_W / 2;

    ctx.fillStyle = '#3a3a3a';
    /* Vertical (main) road */
    ctx.fillRect(CX - R, 0, this.ROAD_W, this.H);
    /* Horizontal (side) road */
    ctx.fillRect(0, CY - R, this.W, this.ROAD_W);

    /* Road surface texture – subtle noise lines */
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < this.H; i += 20) {
      ctx.beginPath(); ctx.moveTo(CX - R, i); ctx.lineTo(CX + R, i); ctx.stroke();
    }
    for (let i = 0; i < this.W; i += 20) {
      ctx.beginPath(); ctx.moveTo(i, CY - R); ctx.lineTo(i, CY + R); ctx.stroke();
    }

    /* Intersection box */
    ctx.fillStyle = '#404040';
    ctx.fillRect(CX - R, CY - R, this.ROAD_W, this.ROAD_W);
  }

  /* ── Zebra Crossings ── */
  _drawZebraCrossings() {
    const ctx = this.ctx;
    const CX = this.CX, CY = this.CY, R = this.ROAD_W / 2;
    const STRIPE_W = 8, STRIPE_H = 18;

    ctx.fillStyle = 'rgba(255,255,255,0.25)';

    /* North crossing (horizontal stripes on vertical road, above intersection) */
    const northY = CY - R - 28;
    for (let sx = CX - R + 4; sx < CX + R - 4; sx += STRIPE_W * 2) {
      ctx.fillRect(sx, northY, STRIPE_W, STRIPE_H);
    }

    /* South crossing */
    const southY = CY + R + 8;
    for (let sx = CX - R + 4; sx < CX + R - 4; sx += STRIPE_W * 2) {
      ctx.fillRect(sx, southY, STRIPE_W, STRIPE_H);
    }

    /* West crossing (vertical stripes on horizontal road) */
    const westX = CX - R - 28;
    for (let sy = CY - R + 4; sy < CY + R - 4; sy += STRIPE_W * 2) {
      ctx.fillRect(westX, sy, STRIPE_H, STRIPE_W);
    }

    /* East crossing */
    const eastX = CX + R + 8;
    for (let sy = CY - R + 4; sy < CY + R - 4; sy += STRIPE_W * 2) {
      ctx.fillRect(eastX, sy, STRIPE_H, STRIPE_W);
    }
  }

  /* ── Lane Centre Lines ── */
  _drawLaneMarkings() {
    const ctx = this.ctx;
    const CX = this.CX, CY = this.CY, R = this.ROAD_W / 2;

    ctx.strokeStyle = 'rgba(255,255,200,0.5)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([22, 14]);

    /* Vertical centre */
    ctx.beginPath(); ctx.moveTo(CX, 0); ctx.lineTo(CX, CY - R); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX, CY + R); ctx.lineTo(CX, this.H); ctx.stroke();

    /* Horizontal centre */
    ctx.beginPath(); ctx.moveTo(0, CY); ctx.lineTo(CX - R, CY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX + R, CY); ctx.lineTo(this.W, CY); ctx.stroke();

    ctx.setLineDash([]);
  }

  /* ── Cars ── */
  _drawCars() {
    this._cars.forEach(c => this._drawCar(c));
  }

  _drawCar(car) {
    const ctx = this.ctx;
    const isVert = car.dir === 'NS' || car.dir === 'SN';
    const cw = isVert ? 20 : 28;
    const ch = isVert ? 28 : 20;

    ctx.save();
    ctx.translate(car.x, car.y);

    /* Rotate for direction */
    const angles = { NS: 0, SN: Math.PI, WE: Math.PI / 2, EW: -Math.PI / 2 };
    ctx.rotate(angles[car.dir] ?? 0);

    /* Body */
    const colors = { main: '#4a90d9', side: '#d9a04a' };
    ctx.fillStyle = colors[car.road] ?? '#888';
    this._roundRect(ctx, -cw/2, -ch/2, cw, ch, 5);
    ctx.fill();

    /* Windshield */
    ctx.fillStyle = 'rgba(150,220,255,0.6)';
    ctx.fillRect(-cw/2 + 3, -ch/2 + 4, cw - 6, ch * 0.35);

    /* Tail lights */
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-cw/2 + 2, ch/2 - 5, 5, 3);
    ctx.fillRect(cw/2 - 7,  ch/2 - 5, 5, 3);

    /* Headlights */
    ctx.fillStyle = '#fffde8';
    ctx.fillRect(-cw/2 + 2, -ch/2 + 2, 5, 3);
    ctx.fillRect(cw/2 - 7,  -ch/2 + 2, 5, 3);

    ctx.restore();
  }

  /* ── Pedestrian Walker ── */
  _drawPedestrian() {
    const ctx = this.ctx;
    const x = this._ped.x;
    const y = this._ped.y;
    const bob = Math.sin(this._ped.t * 0.2) * 2;

    ctx.save();
    ctx.translate(x, y + bob);

    /* Shadow */
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 14, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Body */
    ctx.fillStyle = '#2dd4bf';
    ctx.beginPath(); ctx.roundRect(-5, -2, 10, 14, 3); ctx.fill();

    /* Head */
    ctx.fillStyle = '#f0d0a0';
    ctx.beginPath(); ctx.arc(0, -8, 6, 0, Math.PI * 2); ctx.fill();

    /* Legs */
    const legAnim = Math.sin(this._ped.t * 0.3) * 6;
    ctx.strokeStyle = '#2dd4bf';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-2, 12); ctx.lineTo(-2 + legAnim, 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 12);  ctx.lineTo(2 - legAnim, 22);  ctx.stroke();

    /* Arms */
    ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(-12, 8 + legAnim * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, 2);  ctx.lineTo(12, 8 - legAnim * 0.5);  ctx.stroke();

    ctx.restore();
  }

  /* ── Emergency Vehicle ── */
  _drawEmergencyVehicle() {
    const ctx = this.ctx;
    const v = this._emVeh;
    const isVert = v.dir === 'main';
    const cw = isVert ? 24 : 34;
    const ch = isVert ? 34 : 24;
    const flash = (Date.now() % 600) < 300;

    ctx.save();
    ctx.translate(v.x, v.y);
    if (!isVert) ctx.rotate(Math.PI / 2);

    /* Body */
    ctx.fillStyle = '#e8e8e8';
    this._roundRect(ctx, -cw/2, -ch/2, cw, ch, 5);
    ctx.fill();

    /* Red/White stripe */
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-cw/2, -ch/4, cw, ch/4);

    /* Siren lights */
    ctx.fillStyle = flash ? '#ff3b30' : '#3b82f6';
    ctx.beginPath(); ctx.arc(-cw/4, -ch/2 + 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = flash ? '#3b82f6' : '#ff3b30';
    ctx.beginPath(); ctx.arc(cw/4, -ch/2 + 4, 4, 0, Math.PI * 2); ctx.fill();

    /* Cross symbol */
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-2, -ch/4 + 4, 4, 10);
    ctx.fillRect(-6, -ch/4 + 7, 12, 4);

    ctx.restore();

    /* Siren glow */
    const grd = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 40);
    grd.addColorStop(0, flash ? 'rgba(255,59,48,0.25)' : 'rgba(59,130,246,0.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(v.x, v.y, 40, 0, Math.PI * 2); ctx.fill();
  }

  /* ── Traffic Lights ── */
  _drawTrafficLights() {
    const snap = this._snap;
    if (!snap) return;

    const CX = this.CX, CY = this.CY, R = this.ROAD_W / 2;

    /* Main road lights – North-west and South-east corners */
    this._drawLightPole(CX - R - 22, CY - R - 22, snap.mainSignal, 'V');
    this._drawLightPole(CX + R + 22, CY + R + 22, snap.mainSignal, 'V');

    /* Side road lights – North-east and South-west corners */
    this._drawLightPole(CX + R + 22, CY - R - 22, snap.sideSignal, 'H');
    this._drawLightPole(CX - R - 22, CY + R + 22, snap.sideSignal, 'H');
  }

  /**
   * Draw a traffic light unit.
   * orientation: 'V' = vertical pole (for N/S roads), 'H' = horizontal
   */
  _drawLightPole(x, y, signal, orientation) {
    const ctx = this.ctx;
    const bw = 18, bh = 46, bpad = 3, br = 4;

    ctx.save();
    ctx.translate(x, y);

    /* Housing */
    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1.5;
    this._roundRect(ctx, -bw/2, -bh/2, bw, bh, br);
    ctx.fill();
    ctx.stroke();

    /* Three lamps */
    const lamps = [
      { label: 'RED',    cy: -bh/2 + 8,  on: signal === 'RED',    color: '#ff3b30' },
      { label: 'YELLOW', cy: 0,           on: signal === 'YELLOW', color: '#ffcc00' },
      { label: 'GREEN',  cy: bh/2 - 8,   on: signal === 'GREEN',  color: '#34c759' },
    ];

    lamps.forEach(lamp => {
      const r = 5;
      /* Glow */
      if (lamp.on) {
        const grd = ctx.createRadialGradient(0, lamp.cy, 0, 0, lamp.cy, r * 2.5);
        grd.addColorStop(0, lamp.color + 'cc');
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(0, lamp.cy, r * 2.5, 0, Math.PI * 2); ctx.fill();
      }
      /* Lamp circle */
      ctx.fillStyle = lamp.on ? lamp.color : '#0d0d0d';
      ctx.strokeStyle = lamp.on ? lamp.color : '#2a2a2a';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, lamp.cy, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });

    ctx.restore();
  }

  /* ── Pedestrian Signals ── */
  _drawPedSignals() {
    const snap = this._snap;
    if (!snap) return;
    const walk = snap.pedWalk;
    const CX = this.CX, CY = this.CY, R = this.ROAD_W / 2;

    /* Two ped signal posts (west and east of vertical crossing) */
    this._drawPedSignal(CX - R - 6, CY - R - 40, walk);
    this._drawPedSignal(CX + R + 6, CY - R - 40, walk);
  }

  _drawPedSignal(x, y, walk) {
    const ctx = this.ctx;
    const blink = walk && (Date.now() % 800) < 400;

    ctx.save();
    ctx.translate(x, y);

    /* Box */
    ctx.fillStyle = '#111';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    this._roundRect(ctx, -10, -16, 20, 32, 3);
    ctx.fill(); ctx.stroke();

    /* Don't Walk (red hand) */
    ctx.fillStyle = (!walk || blink) ? '#ff3b30' : '#330000';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✋', 0, -4);

    /* Walk (green man) */
    ctx.fillStyle = walk ? '#34c759' : '#003300';
    ctx.fillText('🚶', 0, 12);

    ctx.restore();
  }

  /* ── Overlay Text ── */
  _drawOverlays() {
    const snap = this._snap;
    if (!snap) return;
    const ctx = this.ctx;

    if (!snap.running) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.fillStyle = '#e6edf3';
      ctx.font = 'bold 22px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Simulation Stopped', this.W/2, this.H/2 - 14);
      ctx.font = '14px Segoe UI, sans-serif';
      ctx.fillStyle = '#8b949e';
      ctx.fillText('Press ▶ Start to begin', this.W/2, this.H/2 + 14);
      return;
    }

    if (snap.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 24px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⏸ PAUSED', this.W/2, this.H/2);
      return;
    }

    /* State label */
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this._roundRect(ctx, this.W/2 - 90, 8, 180, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 12px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`State: ${snap.state} – ${snap.stateName}`, this.W/2, 26);
    ctx.restore();

    /* Countdown */
    const rem = Math.ceil(snap.remaining);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this._roundRect(ctx, this.W/2 - 28, this.H - 40, 56, 28, 6);
    ctx.fill();
    ctx.fillStyle = rem <= 3 ? '#ff3b30' : '#ffcc00';
    ctx.font = 'bold 16px Courier New, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${rem}s`, this.W/2, this.H - 20);
    ctx.restore();

    /* Emergency label */
    if (snap.emActive) {
      const em = snap.emVehicle || 'Vehicle';
      const dir = snap.emDirection === 'main' ? 'Main Rd' : 'Side Rd';
      ctx.save();
      ctx.fillStyle = 'rgba(80,0,0,0.8)';
      this._roundRect(ctx, 8, 8, 200, 24, 5);
      ctx.fill();
      ctx.fillStyle = '#ff6b6b';
      ctx.font = 'bold 11px Segoe UI, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`🚨 ${em} → ${dir}`, 14, 24);
      ctx.restore();
    }
  }

  /* ── Utility: rounded rect ── */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

window.IntersectionRenderer = IntersectionRenderer;
