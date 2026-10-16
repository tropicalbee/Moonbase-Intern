import { createPowerCircuit } from './PowerCircuit.js';
import {validateRepairDiagnostic} from './RepairVariants.js';

/** Phase 3 rules only: caller supplies active gameplay time, UI and lighting. */
export class PowerSystem {
  constructor({ failureDelay = 45, drainRate = 2, criticalHealth = 20, random = Math.random, onEvent = () => {} } = {}) {
    if (!Number.isFinite(failureDelay) || failureDelay < 0 || !Number.isFinite(drainRate) || drainRate <= 0 ||
        !Number.isFinite(criticalHealth) || criticalHealth <= 0 || criticalHealth >= 60 || typeof onEvent !== 'function' || typeof random !== 'function') {
      throw new Error('Invalid power-system configuration');
    }
    Object.assign(this, { failureDelay, drainRate, criticalHealth, random, onEvent });
    this.reset(false);
  }

  get needsRepair() { return ['fault', 'critical', 'blackout'].includes(this.status); }
  get drainMultiplier() { return this.oxygenPumpLoad ? 1.5 : 1; }
  get outageSeconds() { return this.needsRepair ? this.health/(this.drainRate*this.drainMultiplier) : null; }
  setOxygenPumpLoad(active) { this.oxygenPumpLoad=!!active; }

  get snapshot() {
    return Object.freeze({ status: this.status, health: this.health, elapsed: this.elapsed,
      timeUntilFault: this.faultTriggered ? null : Math.max(0, this.failureDelay - this.elapsed),
      repairing: this.repairing, repairStep: this.repairStep, faultTriggered: this.faultTriggered,
      outageSeconds:this.outageSeconds, interlock:this.interlock, circuit:this.circuit, oxygenPumpLoad:this.oxygenPumpLoad });
  }

  emit(type, details = {}) { this.onEvent(Object.freeze({ type, ...details, state: this.snapshot })); }

  triggerFault(circuit = null) {
    if (this.faultTriggered) return false;
    if(circuit)validateRepairDiagnostic('power',circuit);
    this.circuit = circuit ?? createPowerCircuit(this.random, this.previousCircuit);
    this.previousCircuit = this.circuit;
    this.faultTriggered = true;
    this.status = 'fault'; this.health = 60;
    this.emit('power-fault');
    return true;
  }

  triggerNextFault(circuit = null) {
    if(this.status!=='recovered'||this.repairing)return false;
    this.faultTriggered=false;
    return this.triggerFault(circuit);
  }

  update(delta, autoFault = true) {
    if (!Number.isFinite(delta) || delta < 0 || !Number.isFinite(this.elapsed + delta)) return false;
    const start = this.elapsed;
    this.elapsed += delta;
    this.interlock = Math.max(0, this.interlock-delta);
    let faultTime = delta;
    if (autoFault && !this.faultTriggered && this.elapsed >= this.failureDelay) {
      this.triggerFault();
      // Charge only the portion of this frame after the fault began.
      faultTime = this.elapsed - Math.max(start, this.failureDelay);
    }
    if (this.needsRepair) {
      this.health = Math.max(0, this.health - this.drainRate * this.drainMultiplier * faultTime);
      if(this.health<1e-9)this.health=0;
      if (this.status === 'fault' && this.health <= this.criticalHealth) {
        this.status = 'critical'; this.emit('power-critical');
      }
      if (this.status !== 'blackout' && this.health === 0) {
        this.status = 'blackout'; this.emit('power-blackout');
      }
    }
    return true;
  }

  beginRepair() {
    if (!this.needsRepair || this.repairing) return false;
    this.repairing = true; this.repairStep = 0; this.completed = [];
    this.emit('repair-started');
    return true;
  }
  get repairSequence(){return this.circuit?.sequence??(this.circuit?[this.circuit.feeds[this.circuit.damaged].id,this.circuit.banks[this.circuit.backup].id,'restore']:[]);}
  get repairCompleteStage(){return this.repairSequence[this.repairStep]==='restore';}

  selectRepairStep(id) {
    if (!this.repairing || !this.needsRepair) return 'unavailable';
    if (![...this.circuit.feeds,...this.circuit.banks].some(option=>option.id===id) && id!=='restore') return 'invalid';
    if (this.interlock>0) return 'interlocked';
    if (this.completed.includes(id)) return 'already-complete';
    const expected = this.repairSequence[this.repairStep];
    if (id !== expected) {
      this.repairStep = 0; this.completed = []; this.interlock = 2;
      this.emit('repair-wrong-step');
      return 'wrong';
    }
    this.completed.push(id);
    this.repairStep++;
    if (this.repairStep < this.repairSequence.length) {
      this.interlock = .65;
      this.emit('repair-step', { completed: id });
      return 'correct';
    }
    this.status = 'recovered'; this.health = 100;
    this.repairing = false; this.repairStep = 0; this.completed = [];
    this.emit('power-restored');
    return 'complete';
  }

  cancelRepair() {
    if (!this.repairing) return false;
    this.repairing = false; this.repairStep = 0;
    this.emit('repair-cancelled');
    return true;
  }

  reset(notify = true) {
    this.elapsed = 0; this.health = 100; this.status = 'nominal';
    this.faultTriggered = false; this.repairing = false; this.repairStep = 0;
    this.interlock = 0; this.completed = []; this.circuit = null;
    this.oxygenPumpLoad = false;
    if (notify) this.emit('power-reset');
  }
}
