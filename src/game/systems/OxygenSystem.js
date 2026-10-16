import {validateRepairDiagnostic} from './RepairVariants.js';
/** Fictional circulation reserve, not a medical oxygen saturation measurement. */
export class OxygenSystem {
  constructor({onEvent=()=>{}}={}){this.onEvent=onEvent;this.reset(false);}
  get needsRepair(){return ['fault','critical','depleted'].includes(this.status);}
  get secondsRemaining(){return this.needsRepair?this.reserve/2:null;}
  get balanced(){return this.intake===this.setting?.intake&&this.returnFlow===this.setting?.returnFlow;}
  get serviceReady(){return this.serviceStep>=(this.setting?.serviceSequence?.length??0);}
  get repairBoundary(){return this.repairing&&this.holding&&this.balanced&&this.serviceReady?Math.max(0,2-this.holdElapsed):Infinity;}
  get snapshot(){return Object.freeze({status:this.status,reserve:this.reserve,setting:this.setting,intake:this.intake,returnFlow:this.returnFlow,repairing:this.repairing,holding:this.holding,holdElapsed:this.holdElapsed,secondsRemaining:this.secondsRemaining});}
  emit(type){this.onEvent({type,state:this.snapshot});}
  triggerFault(setting){
    if(this.needsRepair)return false;
    validateRepairDiagnostic('oxygen',setting);
    if(!setting||!Number.isFinite(setting.intake)||!Number.isFinite(setting.returnFlow)||setting.intake+setting.returnFlow!==100||setting.intake<30||setting.intake>70||setting.intake%5!==0||setting.returnFlow%5!==0)throw new Error('Invalid regulator setting');
    this.setting=Object.freeze({...setting});this.serviceStep=0;this.interlock=0;this.intake=20;this.returnFlow=80;this.reserve=90;this.status='fault';this.emit('oxygen-fault');return true;
  }
  beginRepair(){if(!this.needsRepair||this.status==='depleted'||this.repairing)return false;this.repairing=true;this.holding=false;this.holdElapsed=0;this.emit('oxygen-repair-started');return true;}
  setFlow(channel,value){
    if(!this.repairing||!this.serviceReady||!['intake','returnFlow'].includes(channel)||!Number.isFinite(value)||value<0||value>100||value%5!==0)return false;
    this[channel]=value;this.holdElapsed=0;this.emit('oxygen-flow');return true;
  }
  setHolding(held){
    this.holding=!!held&&this.repairing&&this.balanced&&this.serviceReady&&this.interlock===0&&this.status!=='depleted';
    if(!this.holding)this.holdElapsed=0;
    return this.holding;
  }
  cancelRepair(){this.repairing=false;this.holding=false;this.holdElapsed=0;}
  service(index){
    if(!this.repairing||this.status==='depleted'||this.serviceReady)return false;
    if(this.interlock>0||!Number.isInteger(index)||index<0||index>2)return false;
    if(index!==this.setting.serviceSequence[this.serviceStep]){this.serviceStep=0;this.interlock=1;this.emit('oxygen-rejected');return false;}
    this.serviceStep++;this.emit('oxygen-service');return true;
  }
  update(delta){
    if(!Number.isFinite(delta)||delta<0)return false;
    if(!this.needsRepair||this.status==='depleted')return true;
    const used=Math.min(delta,this.repairBoundary);
    this.interlock=Math.max(0,this.interlock-used);
    this.reserve=Math.max(0,this.reserve-used*2);if(this.reserve<1e-9)this.reserve=0;
    if(this.status==='fault'&&this.reserve<=30){this.status='critical';this.emit('oxygen-critical');}
    if(this.reserve===0){this.status='depleted';this.cancelRepair();this.emit('oxygen-depleted');return true;}
    if(this.repairing&&this.holding&&this.balanced){
      this.holdElapsed+=used;
      if(this.holdElapsed>=2-1e-9){this.reserve=100;this.status='recovered';this.cancelRepair();this.emit('oxygen-restored');}
    }
    return true;
  }
  reset(notify=true){this.status='nominal';this.reserve=100;this.setting=null;this.serviceStep=0;this.interlock=0;this.intake=20;this.returnFlow=80;this.cancelRepair();if(notify)this.emit('oxygen-reset');}
}
