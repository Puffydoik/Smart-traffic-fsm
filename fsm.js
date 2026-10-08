/* ═══════════════════════════════════════════════════════════════
   fsm.js  –  Finite State Machine Core for Traffic Light Controller
   
   Permanent Pedestrian Phase & Protected Left Turns
═══════════════════════════════════════════════════════════════ */

'use strict';

const SIG = Object.freeze({ OFF: 'OFF', RED: 'RED', YELLOW: 'YELLOW', GREEN: 'GREEN' });

/* 
  16 normal cycle states + 1 emergency state
  NS = North/South, EW = East/West
  SR = Straight/Right, L = Left Turn
*/
const STATES = {
  S0:  { id: 'S0',  name: 'NS Straight/Right Green', color: '#3fb950' },
  S1:  { id: 'S1',  name: 'NS Straight/Right Yellow',color: '#d29922' },
  S2:  { id: 'S2',  name: 'All-Red Clearance',       color: '#6e7681' },
  S3:  { id: 'S3',  name: 'NS Left Turn Green',      color: '#58a6ff' },
  S4:  { id: 'S4',  name: 'NS Left Turn Yellow',     color: '#e3731a' },
  S5:  { id: 'S5',  name: 'All-Red Clearance',       color: '#6e7681' },
  S6:  { id: 'S6',  name: 'Pedestrian Crossing',     color: '#2dd4bf' },
  S7:  { id: 'S7',  name: 'All-Red Clearance',       color: '#6e7681' },
  S8:  { id: 'S8',  name: 'EW Straight/Right Green', color: '#3fb950' },
  S9:  { id: 'S9',  name: 'EW Straight/Right Yellow',color: '#d29922' },
  S10: { id: 'S10', name: 'All-Red Clearance',       color: '#6e7681' },
  S11: { id: 'S11', name: 'EW Left Turn Green',      color: '#58a6ff' },
  S12: { id: 'S12', name: 'EW Left Turn Yellow',     color: '#e3731a' },
  S13: { id: 'S13', name: 'All-Red Clearance',       color: '#6e7681' },
  S14: { id: 'S14', name: 'Pedestrian Crossing',     color: '#2dd4bf' },
  S15: { id: 'S15', name: 'All-Red Clearance',       color: '#6e7681' },
  S_EM:{ id: 'S_EM',name: 'Emergency Priority',      color: '#f85149' }
};

const DEFAULT_TIMERS = {
  green:     10,
  yellow:    3,
  allRed:    2,
  pedestrian:8,
  emergency: 12,
};

class TrafficFSM {
  constructor(onTick) {
    this.onTick = onTick;
    this.timers = { ...DEFAULT_TIMERS };

    this._state          = 'S0';
    this._elapsed        = 0;
    this._duration       = 0;
    this._running        = false;
    this._paused         = false;
    this._speedFactor    = 1;
    this._manualMode     = false;

    this._emRequested    = false;
    this._emVehicle      = '';
    this._emDirection    = 'main';
    this._resumeState    = null;

    this.stats = { cycles: 0, pedCrossings: 0, emEvents: 0, uptime: 0 };
    this.history = [];
    this._interval = null;
    this._tickMs = 100;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._paused  = false;
    this._setState('S0');
    this.stats.uptime = 0;
    this._interval = setInterval(this._tick, this._tickMs);
  }

  pause() { this._paused = true; }
  resume() { this._paused = false; }
  
  reset() {
    clearInterval(this._interval);
    this._interval    = null;
    this._running     = false;
    this._paused      = false;
    this._state       = 'S0';
    this._elapsed     = 0;
    this._duration    = 0;
    this._emRequested = false;
    this._emVehicle   = '';
    this._emDirection = 'main';
    this._resumeState = null;
    this.stats        = { cycles:0, pedCrossings:0, emEvents:0, uptime:0 };
    this.history      = [];
    this._emit();
  }

  triggerEmergency(vehicle, direction) {
    if (!this._running || this._paused) return;
    this._emRequested  = true;
    this._emVehicle    = vehicle;
    this._emDirection  = direction;
  }

  clearEmergency() {
    this._emRequested = false;
    if (this._state === 'S_EM') {
      // Go to All-Red, then resume
      this._resumeState = 'S0';
      this._setState('S15'); // Use S15 as a safe all-red exit from emergency
    }
  }

  setSpeed(factor) { this._speedFactor = factor; }
  setManualMode(on) { this._manualMode = on; }

  manualNext() {
    if (!this._running || !this._manualMode) return;
    this._elapsed = this._duration; 
    this._advanceState();
  }

  applyTimers(cfg) {
    Object.assign(this.timers, cfg);
    this._duration = this._phaseDuration(this._state);
    if (this._elapsed > this._duration) this._elapsed = 0;
  }

  snapshot() {
    const s = this._state;
    const signals = this._getSignals(s);
    return {
      state:        s,
      stateName:    STATES[s]?.name ?? s,
      elapsed:      this._elapsed,
      duration:     this._duration,
      remaining:    Math.max(0, this._duration - this._elapsed),
      nsSR:         signals.nsSR,
      nsL:          signals.nsL,
      ewSR:         signals.ewSR,
      ewL:          signals.ewL,
      pedWalk:      signals.pedWalk,
      running:      this._running,
      paused:       this._paused,
      manualMode:   this._manualMode,
      speedFactor:  this._speedFactor,
      emActive:     this._state === 'S_EM',
      emVehicle:    this._emVehicle,
      emDirection:  this._emDirection,
      stats:        { ...this.stats },
      history:      [...this.history],
    };
  }

  _tick() {
    if (this._paused || !this._running) {
      this._emit();
      return;
    }
    const dtSec = (this._tickMs / 1000) * this._speedFactor;
    this._elapsed += dtSec;
    this.stats.uptime += dtSec;

    if (!this._manualMode && this._elapsed >= this._duration) {
      this._advanceState();
    }
    this._emit();
  }

  _advanceState() {
    this._elapsed = 0;
    const cur = this._state;

    /* Emergency interruption logic */
    if (this._emRequested && cur !== 'S_EM') {
      const sig = this._getSignals(cur);
      const isGreen = sig.nsSR==='GREEN' || sig.nsL==='GREEN' || sig.ewSR==='GREEN' || sig.ewL==='GREEN';
      
      if (isGreen) {
        // Find appropriate yellow state to safely transition
        const yellowMap = { S0:'S1', S3:'S4', S8:'S9', S11:'S12' };
        if (yellowMap[cur]) {
          this._resumeState = 'S_EM';
          this._setState(yellowMap[cur]);
          return;
        }
      }
      
      // If currently in a yellow or all-red state, let it finish naturally into all-red, or override
      if (cur === 'S1' || cur === 'S4' || cur === 'S9' || cur === 'S12') {
        this._resumeState = 'S_EM'; // Will go to all-red next
        // Let normal transition handle it
      } else if (cur === 'S6' || cur === 'S14') {
        // Pedestrian active, force to all red
        this._resumeState = 'S_EM';
        this._setState('S7'); 
        return;
      } else if (['S2','S5','S7','S10','S13','S15'].includes(cur)) {
        // We are in all-red, safe to go to EM
        if (this._resumeState === 'S_EM') {
          this.stats.emEvents++;
          this._resumeState = null;
          this._setState('S_EM');
          return;
        }
      }
    }

    /* Process normal sequence */
    if (cur === 'S15' && this._resumeState === 'S0') {
      this._resumeState = null;
      this._setState('S0');
      return;
    }

    // Normal ring
    const nextMap = {
      S0:'S1', S1:'S2', S2:'S3', S3:'S4', S4:'S5', S5:'S6', S6:'S7', S7:'S8',
      S8:'S9', S9:'S10', S10:'S11', S11:'S12', S12:'S13', S13:'S14', S14:'S15', S15:'S0'
    };

    let next = nextMap[cur];
    
    // Intercept if heading to EM
    if (this._resumeState === 'S_EM' && ['S2','S5','S7','S10','S13','S15'].includes(next)) {
       // We are entering an all-red, we will stay here then go to EM
       this._setState(next);
       return;
    }
    
    // Safety check: if currently in All-Red and resumeState is EM, go to EM
    if (['S2','S5','S7','S10','S13','S15'].includes(cur) && this._resumeState === 'S_EM') {
       this.stats.emEvents++;
       this._resumeState = null;
       this._setState('S_EM');
       return;
    }

    if (cur === 'S15') this.stats.cycles++;
    if (cur === 'S5' || cur === 'S13') this.stats.pedCrossings++;

    // Prevent progressing out of S_EM if EM is not cleared
    if (cur === 'S_EM') return; 

    this._setState(next);
  }

  _setState(id) {
    this._state    = id;
    this._elapsed  = 0;
    this._duration = this._phaseDuration(id);

    this.history.unshift({ id, name: STATES[id]?.name ?? id, ts: Date.now() });
    if (this.history.length > 20) this.history.pop();
  }

  _phaseDuration(id) {
    switch (id) {
      case 'S0': case 'S3': case 'S8': case 'S11': return this.timers.green;
      case 'S1': case 'S4': case 'S9': case 'S12': return this.timers.yellow;
      case 'S6': case 'S14': return this.timers.pedestrian;
      case 'S_EM': return this.timers.emergency;
      default: return this.timers.allRed; // S2, S5, S7, S10, S13, S15
    }
  }

  _getSignals(state) {
    let nsSR = SIG.RED, nsL = SIG.RED, ewSR = SIG.RED, ewL = SIG.RED, pedWalk = false;
    
    switch (state) {
      case 'S0': nsSR = SIG.GREEN; break;
      case 'S1': nsSR = SIG.YELLOW; break;
      case 'S3': nsL = SIG.GREEN; break;
      case 'S4': nsL = SIG.YELLOW; break;
      case 'S6': 
      case 'S14': pedWalk = true; break;
      case 'S8': ewSR = SIG.GREEN; break;
      case 'S9': ewSR = SIG.YELLOW; break;
      case 'S11': ewL = SIG.GREEN; break;
      case 'S12': ewL = SIG.YELLOW; break;
      case 'S_EM':
        if (this._emDirection === 'main') {
          nsSR = SIG.GREEN;
          nsL = SIG.GREEN;
        } else {
          ewSR = SIG.GREEN;
          ewL = SIG.GREEN;
        }
        break;
    }
    return { nsSR, nsL, ewSR, ewL, pedWalk };
  }

  _emit() {
    if (this.onTick) this.onTick(this.snapshot());
  }
}

window.TrafficFSM = TrafficFSM;
window.SIG        = SIG;
window.STATES     = STATES;
