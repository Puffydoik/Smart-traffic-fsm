/* ═══════════════════════════════════════════════════════════════
   renderer.js  –  Canvas-based Intersection Renderer
   
   Supports 4 approaches (N, S, E, W), 2 lanes each (Left, Straight/Right)
═══════════════════════════════════════════════════════════════ */

'use strict';

class IntersectionRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    this.W      = this.canvas.width;
    this.H      = this.canvas.height;
    this._snap  = null;

    this.CX     = this.W / 2;
    this.CY     = this.H / 2;
    this.ROAD_W = 120; // 4 lanes total per road (30px each)
    this.STOP_OFFSET = 60; 

    this._cars  = this._initCars();
    this._ped   = { x: 0, y: 0, t: 0, active: false, side: 0 };
    this._emVeh = { x: 0, y: 0, t: 0, active: false, dir: 'main' };

    this._raf   = null;
    this._last  = 0;
    this._loop  = this._loop.bind(this);
  }

  start() { this._raf = requestAnimationFrame(this._loop); }
  stop()  { cancelAnimationFrame(this._raf); }
  update(snap) { this._snap = snap; }

  _loop(ts) {
    const dt = Math.min((ts - this._last) / 1000, 0.1); 
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

  _initCars() {
    const cars = [];
    const setup = [
      { app: 'N', lane: 'L' }, { app: 'N', lane: 'SR' },
      { app: 'S', lane: 'L' }, { app: 'S', lane: 'SR' },
      { app: 'E', lane: 'L' }, { app: 'E', lane: 'SR' },
      { app: 'W', lane: 'L' }, { app: 'W', lane: 'SR' }
    ];
    setup.forEach((s, i) => {
      cars.push(this._spawnCar(s.app, s.lane, i, 90));
      cars.push(this._spawnCar(s.app, s.lane, i + 8, 220)); 
    });
    return cars;
  }

  _randomColor() {
    const colors = ['#4a90d9', '#d9a04a', '#a65ba6', '#72b362', '#b36262', '#e0e0e0'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  _spawnCar(app, laneType, id, offset) {
    let turn = 'S';
    if (laneType === 'L') turn = 'L';
    else turn = Math.random() > 0.5 ? 'S' : 'R';
    
    let x, y, dx, dy;
    if (app === 'N') { x = turn === 'L' ? this.CX - 15 : this.CX - 45; y = -offset; dx = 0; dy = 1; }
    if (app === 'S') { x = turn === 'L' ? this.CX + 15 : this.CX + 45; y = this.H + offset; dx = 0; dy = -1; }
    if (app === 'E') { y = turn === 'L' ? this.CY - 15 : this.CY - 45; x = this.W + offset; dx = -1; dy = 0; }
    if (app === 'W') { y = turn === 'L' ? this.CY + 15 : this.CY + 45; x = -offset; dx = 1; dy = 0; }
    
    return {
       id, app, laneType, turn, x, y, dx, dy,
       speed: 60 + Math.random() * 20,
       pivoted: false, stopped: false,
       color: this._randomColor()
    };
  }

  _updateCars(dt) {
    const snap = this._snap;
    const STOP = this.STOP_OFFSET;

    const greenLanes = {
      N: { L: snap.nsL === 'GREEN' || (snap.emActive && snap.emDirection === 'main'), 
           SR: snap.nsSR === 'GREEN' || (snap.emActive && snap.emDirection === 'main') },
      S: { L: snap.nsL === 'GREEN' || (snap.emActive && snap.emDirection === 'main'), 
           SR: snap.nsSR === 'GREEN' || (snap.emActive && snap.emDirection === 'main') },
      E: { L: snap.ewL === 'GREEN' || (snap.emActive && snap.emDirection === 'side'), 
           SR: snap.ewSR === 'GREEN' || (snap.emActive && snap.emDirection === 'side') },
      W: { L: snap.ewL === 'GREEN' || (snap.emActive && snap.emDirection === 'side'), 
           SR: snap.ewSR === 'GREEN' || (snap.emActive && snap.emDirection === 'side') },
    };

    this._cars.forEach(car => {
       let distToStop = 999;
       let pastStop = false;
       if (car.app === 'N') { distToStop = (this.CY - STOP) - car.y; pastStop = car.y >= (this.CY - STOP); }
       if (car.app === 'S') { distToStop = car.y - (this.CY + STOP); pastStop = car.y <= (this.CY + STOP); }
       if (car.app === 'E') { distToStop = car.x - (this.CX + STOP); pastStop = car.x <= (this.CX + STOP); }
       if (car.app === 'W') { distToStop = (this.CX - STOP) - car.x; pastStop = car.x >= (this.CX - STOP); }

       const isGreen = greenLanes[car.app][car.laneType];
       let shouldStop = !isGreen && !pastStop && distToStop < 25 && distToStop > -5; 

       // Collision avoidance
       this._cars.forEach(other => {
         if (other !== car && other.app === car.app && !car.pivoted && !other.pivoted && other.laneType === car.laneType) {
            if (car.app === 'N' && other.y > car.y && other.y - car.y < 40) shouldStop = true;
            if (car.app === 'S' && other.y < car.y && car.y - other.y < 40) shouldStop = true;
            if (car.app === 'E' && other.x < car.x && car.x - other.x < 40) shouldStop = true;
            if (car.app === 'W' && other.x > car.x && other.x - car.x < 40) shouldStop = true;
         }
       });

       car.stopped = shouldStop;

       if (!shouldStop) {
         car.x += car.dx * car.speed * dt;
         car.y += car.dy * car.speed * dt;

         // Turn Pivots
         if (car.turn === 'L' || car.turn === 'R') {
            if (!car.pivoted) {
               let pivotReached = false;
               if (car.app === 'N') {
                  if (car.turn === 'L' && car.y >= this.CY + 15) { car.y = this.CY + 15; car.dx = 1; car.dy = 0; pivotReached = true; }
                  if (car.turn === 'R' && car.y >= this.CY - 45) { car.y = this.CY - 45; car.dx = -1; car.dy = 0; pivotReached = true; }
               }
               if (car.app === 'S') {
                  if (car.turn === 'L' && car.y <= this.CY - 15) { car.y = this.CY - 15; car.dx = -1; car.dy = 0; pivotReached = true; }
                  if (car.turn === 'R' && car.y <= this.CY + 45) { car.y = this.CY + 45; car.dx = 1; car.dy = 0; pivotReached = true; }
               }
               if (car.app === 'E') {
                  if (car.turn === 'L' && car.x <= this.CX - 15) { car.x = this.CX - 15; car.dx = 0; car.dy = 1; pivotReached = true; }
                  if (car.turn === 'R' && car.x <= this.CX + 45) { car.x = this.CX + 45; car.dx = 0; car.dy = -1; pivotReached = true; }
               }
               if (car.app === 'W') {
                  if (car.turn === 'L' && car.x >= this.CX + 15) { car.x = this.CX + 15; car.dx = 0; car.dy = -1; pivotReached = true; }
                  if (car.turn === 'R' && car.x >= this.CX - 45) { car.x = this.CX - 45; car.dx = 0; car.dy = 1; pivotReached = true; }
               }
               if (pivotReached) car.pivoted = true;
            }
         }

         if (car.x < -100 || car.x > this.W + 100 || car.y < -100 || car.y > this.H + 100) {
            Object.assign(car, this._spawnCar(car.app, car.laneType, car.id, 50));
         }
       }
    });
  }

  _updatePed(dt) {
    const snap = this._snap;
    if (!snap) return;

    if (snap.pedWalk && !this._ped.active) {
      this._ped.active = true;
      this._ped.side   = (Date.now() % 2 === 0) ? 0 : 1;
      this._ped.t      = 0;
      if (this._ped.side === 0) {
        this._ped.x = this.CX + 75;
        this._ped.y = this.CY - 85;
      } else {
        this._ped.x = this.CX - 75;
        this._ped.y = this.CY + 85;
      }
    }
    if (!snap.pedWalk) {
      this._ped.active = false;
      return;
    }
    if (this._ped.active) {
      this._ped.t += dt * 40;
      if (this._ped.side === 0) {
        this._ped.y += dt * 40;
        if (this._ped.y > this.CY + 85) {
          this._ped.y = this.CY - 85;
          this._ped.x = this.CX + 75 + (Math.random() - 0.5) * 20;
        }
      } else {
        this._ped.y -= dt * 40;
        if (this._ped.y < this.CY - 85) {
          this._ped.y = this.CY + 85;
          this._ped.x = this.CX - 75 + (Math.random() - 0.5) * 20;
        }
      }
    }
  }

  _updateEmVeh(dt) {
    const snap = this._snap;
    if (!snap) return;

    if (snap.emActive && !this._emVeh.active) {
      this._emVeh.active = true;
      this._emVeh.dir    = snap.emDirection;
      if (snap.emDirection === 'main') {
        this._emVeh.x = this.CX - 25;
        this._emVeh.y = -60;
        this._emVeh.dx = 0;
        this._emVeh.dy = 1;
      } else {
        this._emVeh.x = -60;
        this._emVeh.y = this.CY - 25;
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
      if (this._emVeh.y > this.H + 60) { this._emVeh.y = -60; this._emVeh.x = this.CX - 25; }
      if (this._emVeh.x > this.W + 60) { this._emVeh.x = -60; this._emVeh.y = this.CY - 25; }
    }
  }

  _draw() {
    this.ctx.clearRect(0, 0, this.W, this.H);
    this._drawBackground();
    this._drawRoads();
    this._drawZebraCrossings();
    this._drawLaneMarkings();
    this._drawArrows();
    this._drawCars();
    if (this._ped.active)   this._drawPedestrian();
    if (this._emVeh.active) this._drawEmergencyVehicle();
    this._drawTrafficLights();
    this._drawPedSignals();
    this._drawOverlays();
  }

  _drawBackground() {
    const ctx = this.ctx;
    ctx.fillStyle = '#1a2e1a';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.fillStyle = '#2a2a3a';
    const CX = this.CX, CY = this.CY, R = this.ROAD_W / 2;
    ctx.fillRect(0, 0, CX-R, CY-R);
    ctx.fillRect(CX+R, 0, this.W, CY-R);
    ctx.fillRect(0, CY+R, CX-R, this.H);
    ctx.fillRect(CX+R, CY+R, this.W, this.H);
  }

  _drawRoads() {
    const ctx = this.ctx;
    const CX = this.CX, CY = this.CY, R = this.ROAD_W / 2;
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(CX - R, 0, this.ROAD_W, this.H);
    ctx.fillRect(0, CY - R, this.W, this.ROAD_W);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < this.H; i += 20) {
      ctx.beginPath(); ctx.moveTo(CX - R, i); ctx.lineTo(CX + R, i); ctx.stroke();
    }
    for (let i = 0; i < this.W; i += 20) {
      ctx.beginPath(); ctx.moveTo(i, CY - R); ctx.lineTo(i, CY + R); ctx.stroke();
    }
    ctx.fillStyle = '#404040';
    ctx.fillRect(CX - R, CY - R, this.ROAD_W, this.ROAD_W);
  }

  _drawZebraCrossings() {
    const ctx = this.ctx;
    const CX = this.CX, CY = this.CY, R = this.ROAD_W / 2;
    const STRIPE_W = 8, STRIPE_H = 18;
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    const northY = CY - R - 28, southY = CY + R + 8;
    const westX = CX - R - 28, eastX = CX + R + 8;

    for (let sx = CX - R + 4; sx < CX + R - 4; sx += STRIPE_W * 2) {
      ctx.fillRect(sx, northY, STRIPE_W, STRIPE_H);
      ctx.fillRect(sx, southY, STRIPE_W, STRIPE_H);
    }
    for (let sy = CY - R + 4; sy < CY + R - 4; sy += STRIPE_W * 2) {
      ctx.fillRect(westX, sy, STRIPE_H, STRIPE_W);
      ctx.fillRect(eastX, sy, STRIPE_H, STRIPE_W);
    }
  }

  _drawLaneMarkings() {
    const ctx = this.ctx;
    const CX = this.CX, CY = this.CY, R = this.ROAD_W / 2;
    
    // Double Yellow Center lines
    ctx.strokeStyle = '#e6b800';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(CX - 2, 0); ctx.lineTo(CX - 2, CY - R); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX + 2, 0); ctx.lineTo(CX + 2, CY - R); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX - 2, CY + R); ctx.lineTo(CX - 2, this.H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX + 2, CY + R); ctx.lineTo(CX + 2, this.H); ctx.stroke();

    ctx.beginPath(); ctx.moveTo(0, CY - 2); ctx.lineTo(CX - R, CY - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, CY + 2); ctx.lineTo(CX - R, CY + 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX + R, CY - 2); ctx.lineTo(this.W, CY - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX + R, CY + 2); ctx.lineTo(this.W, CY + 2); ctx.stroke();

    // White dashed lane dividers
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([15, 15]);
    
    // N/S dividers (approx center of each direction's half)
    ctx.beginPath(); ctx.moveTo(CX - 30, 0); ctx.lineTo(CX - 30, CY - R); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX + 30, CY + R); ctx.lineTo(CX + 30, this.H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX + 30, 0); ctx.lineTo(CX + 30, CY - R); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX - 30, CY + R); ctx.lineTo(CX - 30, this.H); ctx.stroke();

    // E/W dividers
    ctx.beginPath(); ctx.moveTo(0, CY - 30); ctx.lineTo(CX - R, CY - 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX + R, CY + 30); ctx.lineTo(this.W, CY + 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, CY + 30); ctx.lineTo(CX - R, CY + 30); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CX + R, CY - 30); ctx.lineTo(this.W, CY - 30); ctx.stroke();

    ctx.setLineDash([]);
  }

  _drawArrows() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // N Approach (driving south)
    ctx.fillText('↰', this.CX - 15, this.CY - 100);
    ctx.fillText('↓', this.CX - 45, this.CY - 100);
    
    // S Approach (driving north)
    ctx.fillText('↱', this.CX + 15, this.CY + 100);
    ctx.fillText('↑', this.CX + 45, this.CY + 100);
    
    // E Approach (driving west)
    ctx.fillText('↰', this.CX + 100, this.CY - 15);
    ctx.fillText('←', this.CX + 100, this.CY - 45);

    // W Approach (driving east)
    ctx.fillText('↱', this.CX - 100, this.CY + 15);
    ctx.fillText('→', this.CX - 100, this.CY + 45);
  }

  _drawCars() {
    this._cars.forEach(c => this._drawCar(c));
  }

  _drawCar(car) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(car.x, car.y);

    let angle = 0;
    if (car.dx === 1) angle = Math.PI/2;
    if (car.dx === -1) angle = -Math.PI/2;
    if (car.dy === 1) angle = Math.PI;
    if (car.dy === -1) angle = 0;
    ctx.rotate(angle);

    ctx.fillStyle = car.color;
    this._roundRect(ctx, -10, -14, 20, 28, 4);
    ctx.fill();

    ctx.fillStyle = 'rgba(150,220,255,0.6)';
    ctx.fillRect(-7, -8, 14, 6);

    ctx.fillStyle = car.stopped ? '#ff0000' : '#880000';
    ctx.fillRect(-8, 12, 4, 2);
    ctx.fillRect(4, 12, 4, 2);

    ctx.fillStyle = '#fffde8';
    ctx.fillRect(-8, -14, 4, 2);
    ctx.fillRect(4, -14, 4, 2);

    ctx.restore();
  }

  _drawPedestrian() {
    const ctx = this.ctx;
    const x = this._ped.x, y = this._ped.y;
    const bob = Math.sin(this._ped.t * 0.2) * 2;

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 14, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2dd4bf';
    ctx.beginPath(); ctx.roundRect(-5, -2, 10, 14, 3); ctx.fill();
    ctx.fillStyle = '#f0d0a0';
    ctx.beginPath(); ctx.arc(0, -8, 6, 0, Math.PI * 2); ctx.fill();
    
    const legAnim = Math.sin(this._ped.t * 0.3) * 6;
    ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-2, 12); ctx.lineTo(-2 + legAnim, 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 12);  ctx.lineTo(2 - legAnim, 22);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(-12, 8 + legAnim * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, 2);  ctx.lineTo(12, 8 - legAnim * 0.5);  ctx.stroke();
    ctx.restore();
  }

  _drawEmergencyVehicle() {
    const ctx = this.ctx;
    const v = this._emVeh;
    const flash = (Date.now() % 600) < 300;

    ctx.save();
    ctx.translate(v.x, v.y);
    let angle = 0;
    if (v.dx === 1) angle = Math.PI/2;
    if (v.dx === -1) angle = -Math.PI/2;
    if (v.dy === 1) angle = Math.PI;
    if (v.dy === -1) angle = 0;
    ctx.rotate(angle);

    ctx.fillStyle = '#e8e8e8';
    this._roundRect(ctx, -12, -18, 24, 36, 5);
    ctx.fill();

    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-12, -9, 24, 9);

    ctx.fillStyle = flash ? '#ff3b30' : '#3b82f6';
    ctx.beginPath(); ctx.arc(-6, -16, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = flash ? '#3b82f6' : '#ff3b30';
    ctx.beginPath(); ctx.arc(6, -16, 4, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  _drawTrafficLights() {
    const snap = this._snap;
    if (!snap) return;
    const CX = this.CX, CY = this.CY, R = this.ROAD_W / 2;

    // NW and SE corners (Main Road signals)
    this._drawLightCluster(CX - R - 25, CY - R - 25, snap.nsSR, snap.nsL);
    this._drawLightCluster(CX + R + 25, CY + R + 25, snap.nsSR, snap.nsL);

    // NE and SW corners (Side Road signals)
    this._drawLightCluster(CX + R + 25, CY - R - 25, snap.ewSR, snap.ewL);
    this._drawLightCluster(CX - R - 25, CY + R + 25, snap.ewSR, snap.ewL);
  }

  _drawLightCluster(x, y, srSignal, lSignal) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);

    // Housing (wider to fit two signal columns: left arrow, straight/right circle)
    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1.5;
    this._roundRect(ctx, -18, -23, 36, 46, 4);
    ctx.fill(); ctx.stroke();

    const colors = { RED: '#ff3b30', YELLOW: '#ffcc00', GREEN: '#34c759' };
    
    // Helper to draw lamp
    const drawLamp = (lx, ly, on, typeColor, symbol) => {
      ctx.fillStyle = on ? typeColor : '#0d0d0d';
      ctx.strokeStyle = on ? typeColor : '#2a2a2a';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      
      if (on && symbol) {
         ctx.fillStyle = '#111';
         ctx.font = '6px Arial';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         ctx.fillText(symbol, lx, ly);
      }
      
      if (on) {
        const grd = ctx.createRadialGradient(lx, ly, 0, lx, ly, 12);
        grd.addColorStop(0, typeColor + 'cc');
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(lx, ly, 12, 0, Math.PI * 2); ctx.fill();
      }
    };

    // Left Column (Left Turn)
    drawLamp(-8, -14, lSignal === 'RED', colors.RED, '←');
    drawLamp(-8,   0, lSignal === 'YELLOW', colors.YELLOW, '←');
    drawLamp(-8,  14, lSignal === 'GREEN', colors.GREEN, '←');

    // Right Column (Straight/Right)
    drawLamp( 8, -14, srSignal === 'RED', colors.RED, '');
    drawLamp( 8,   0, srSignal === 'YELLOW', colors.YELLOW, '');
    drawLamp( 8,  14, srSignal === 'GREEN', colors.GREEN, '');

    ctx.restore();
  }

  _drawPedSignals() {
    const snap = this._snap;
    if (!snap) return;
    const walk = snap.pedWalk;
    const CX = this.CX, CY = this.CY, R = this.ROAD_W / 2;
    this._drawPedSignal(CX - R - 6, CY - R - 40, walk);
    this._drawPedSignal(CX + R + 6, CY - R - 40, walk);
  }

  _drawPedSignal(x, y, walk) {
    const ctx = this.ctx;
    const blink = walk && (Date.now() % 800) < 400;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#111';
    ctx.strokeStyle = '#333';
    this._roundRect(ctx, -10, -16, 20, 32, 3);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = (!walk || blink) ? '#ff3b30' : '#330000';
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✋', 0, -4);
    ctx.fillStyle = walk ? '#34c759' : '#003300';
    ctx.fillText('🚶', 0, 12);
    ctx.restore();
  }

  _drawOverlays() {
    const snap = this._snap;
    if (!snap) return;
    const ctx = this.ctx;
    if (!snap.running) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, this.W, this.H);
      ctx.fillStyle = '#e6edf3'; ctx.font = 'bold 22px Segoe UI, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Simulation Stopped', this.W/2, this.H/2 - 14);
      ctx.font = '14px Segoe UI, sans-serif'; ctx.fillStyle = '#8b949e';
      ctx.fillText('Press ▶ Start to begin', this.W/2, this.H/2 + 14);
      return;
    }
    if (snap.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, this.W, this.H);
      ctx.fillStyle = '#ffcc00'; ctx.font = 'bold 24px Segoe UI, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('⏸ PAUSED', this.W/2, this.H/2);
      return;
    }
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this._roundRect(ctx, this.W/2 - 100, 8, 200, 28, 6); ctx.fill();
    ctx.fillStyle = '#e6edf3'; ctx.font = 'bold 12px Segoe UI, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`State: ${snap.state} – ${snap.stateName}`, this.W/2, 26);
    ctx.restore();
    const rem = Math.ceil(snap.remaining);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this._roundRect(ctx, this.W/2 - 28, this.H - 40, 56, 28, 6); ctx.fill();
    ctx.fillStyle = rem <= 3 ? '#ff3b30' : '#ffcc00';
    ctx.font = 'bold 16px Courier New, monospace'; ctx.textAlign = 'center';
    ctx.fillText(`${rem}s`, this.W/2, this.H - 20);
    ctx.restore();
    if (snap.emActive) {
      const em = snap.emVehicle || 'Vehicle';
      const dir = snap.emDirection === 'main' ? 'Main Rd' : 'Side Rd';
      ctx.save();
      ctx.fillStyle = 'rgba(80,0,0,0.8)'; this._roundRect(ctx, 8, 8, 200, 24, 5); ctx.fill();
      ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 11px Segoe UI, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`🚨 ${em} → ${dir}`, 14, 24);
      ctx.restore();
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
}

window.IntersectionRenderer = IntersectionRenderer;
