import {validateRepairDiagnostic} from './RepairVariants.js';
/** Survey drive degradation and a continuous, interruptible motor verification. */
export class RoverSystem {
  constructor({onEvent=()=>{}}={}){this.onEvent=onEvent;this.reset(false);}
  get needsRepair(){return ['fault','critical','stalled'].includes(this.status);}
  get secondsRemaining(){return this.needsRepair?Math.max(0,30-this.faultElapsed):null;}
  get speedMultiplier(){return this.repairing||this.status==='stalled'?0:(this.needsRepair ? .35 : 1);}
  get repairBoundary(){return this.holding?Math.max(0,3-this.verifyElapsed):Infinity;}
  get diagnosticReady(){return this.drive?.variant==='brake-lock'?this.brakeReleased:this.drive?.variant==='encoder-drift'?this.trim===-this.drive.errors[this.drive.wheel]:true;}
  emit(type){this.onEvent({type});}
  triggerFault(drive){
    if(this.needsRepair)return false;
    validateRepairDiagnostic('rover',drive);
    if(!drive||!Number.isInteger(drive.wheel)||drive.wheel<0||drive.wheel>5||!Array.isArray(drive.currents)||drive.currents.length!==6||drive.currents.some((v,i)=>!Number.isFinite(v)||v<=0||(i===drive.wheel?v!==12:v>=12)))throw new Error('Invalid rover drive');
    this.drive=Object.freeze({...drive,currents:Object.freeze([...drive.currents])});this.brakeReleased=false;this.trim=0;this.status='fault';this.faultElapsed=0;this.selected=null;this.interlock=0;this.emit('rover-fault');return true;
  }
  beginRepair(){if(!this.needsRepair||this.repairing)return false;this.repairing=true;return true;}
  select(wheel){
    if(!this.repairing||this.holding||this.interlock>0||!Number.isInteger(wheel)||wheel<0||wheel>5)return false;
    if(wheel!==this.drive.wheel){this.selected=null;this.interlock=1;this.emit('rover-rejected');return false;}
    this.selected=wheel;this.emit('rover-isolated');return true;
  }
  setHolding(holding){
    this.holding=!!holding&&this.repairing&&this.selected===this.drive?.wheel&&this.diagnosticReady&&this.interlock===0;
    if(!this.holding)this.verifyElapsed=0;return this.holding;
  }
  cancelRepair(){this.repairing=false;this.holding=false;this.verifyElapsed=0;}
  releaseBrake(){if(!this.repairing||this.holding||this.selected!==this.drive?.wheel||this.interlock>0||this.drive?.variant!=='brake-lock')return false;this.brakeReleased=true;return true;}
  adjustTrim(amount){if(!this.repairing||this.holding||this.selected!==this.drive?.wheel||this.drive?.variant!=='encoder-drift'||![1,-1].includes(amount))return false;this.trim=Math.max(-8,Math.min(8,this.trim+amount));return true;}
  update(delta){
    if(!Number.isFinite(delta)||delta<0)return false;if(!this.needsRepair)return true;
    const used=Math.min(delta,this.repairBoundary);this.interlock=Math.max(0,this.interlock-used);this.faultElapsed=Math.min(30,this.faultElapsed+used);
    if(this.status==='fault'&&this.faultElapsed>=20-1e-9){this.status='critical';this.emit('rover-critical');}
    if(this.status!=='stalled'&&this.faultElapsed>=30-1e-9){this.faultElapsed=30;this.status='stalled';this.emit('rover-stalled');}
    if(this.holding){this.verifyElapsed+=used;if(this.verifyElapsed>=3-1e-9){this.status='recovered';this.cancelRepair();this.emit('rover-restored');}}
    return true;
  }
  reset(notify=true){this.status='nominal';this.drive=null;this.brakeReleased=false;this.trim=0;this.faultElapsed=0;this.selected=null;this.interlock=0;this.cancelRepair();if(notify)this.emit('rover-reset');}
}
