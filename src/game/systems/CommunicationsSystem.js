import {validateRepairDiagnostic} from './RepairVariants.js';
/** Local carrier tuning and orbital handover availability. */
export class CommunicationsSystem {
  constructor({onEvent=()=>{}}={}){this.onEvent=onEvent;this.reset(false);}
  get needsRepair(){return ['fault','critical','lost'].includes(this.status);}
  get secondsRemaining(){return this.needsRepair?this.reserve/2:null;}
  get routingReady(){return this.setting?.variant==='relay-mismatch'?this.selectedRelay===this.setting.relay:this.setting?.variant==='phase-inversion'?this.polarity===this.setting.polarity:true;}
  get strength(){return this.setting?Math.max(0,100-Math.abs(this.frequency-this.setting.frequency)*10-Math.abs(this.phase-this.setting.phase)*8-(this.routingReady?0:35)):100;}
  get carrierLocked(){return this.routingReady&&this.frequency===this.setting?.frequency&&this.phase===this.setting?.phase;}
  get repairBoundary(){return this.handshaking?Math.max(0,2-this.handshakeElapsed):Infinity;}
  setPowerAvailable(available){
    this.powerAvailable=!!available;
    if(!this.powerAvailable){this.handshaking=false;this.handshakeElapsed=0;}
  }
  emit(type){this.onEvent({type,state:Object.freeze({status:this.status,reserve:this.reserve,frequency:this.frequency,phase:this.phase,strength:this.strength,setting:this.setting})});}
  triggerFault(setting){
    if(this.needsRepair)return false;
    validateRepairDiagnostic('communications',setting);
    if(!setting||!['frequency','phase'].every(key=>Number.isInteger(setting[key])&&setting[key]>=2&&setting[key]<=8))throw new Error('Invalid uplink setting');
    this.setting=Object.freeze({...setting});this.selectedRelay=null;this.polarity=setting.variant==='phase-inversion'?-setting.polarity:1;this.frequency=4;this.phase=4;this.reserve=100;this.status='fault';this.handshaking=false;this.handshakeElapsed=0;this.interlock=0;this.emit('communications-fault');return true;
  }
  beginRepair(){if(!this.needsRepair||this.repairing)return false;this.repairing=true;return true;}
  tune(channel,amount){
    if(!this.repairing||this.handshaking||!['frequency','phase'].includes(channel)||![1,-1].includes(amount))return false;
    this[channel]=Math.max(1,Math.min(9,this[channel]+amount));return true;
  }
  confirm(){
    if(!this.repairing||this.handshaking)return 'unavailable';if(!this.powerAvailable)return 'unpowered';if(this.interlock>0)return 'interlocked';
    if(!this.carrierLocked){this.interlock=1;this.emit('communications-rejected');return 'weak';}
    this.handshaking=true;this.handshakeElapsed=0;this.emit('communications-handshake');return 'handshaking';
  }
  selectRelay(index){
    if(!this.repairing||this.handshaking||this.interlock>0||this.setting?.variant!=='relay-mismatch'||!Number.isInteger(index)||index<0||index>2)return false;
    if(index!==this.setting.relay){this.interlock=1;this.emit('communications-rejected');return false;}
    this.selectedRelay=index;return true;
  }
  invertPolarity(){if(!this.repairing||this.handshaking||this.setting?.variant!=='phase-inversion')return false;this.polarity=-this.polarity;return true;}
  cancelRepair(){this.repairing=false;this.handshaking=false;this.handshakeElapsed=0;}
  update(delta){
    if(!Number.isFinite(delta)||delta<0)return false;if(!this.needsRepair)return true;
    const used=Math.min(delta,this.repairBoundary);this.interlock=Math.max(0,this.interlock-used);
    this.reserve=Math.max(0,this.reserve-used*2);if(this.reserve<1e-9)this.reserve=0;
    if(this.status==='fault'&&this.reserve<=20){this.status='critical';this.emit('communications-critical');}
    if(this.status!=='lost'&&this.reserve===0){this.status='lost';this.emit('communications-lost');}
    if(this.handshaking){this.handshakeElapsed+=used;if(this.handshakeElapsed>=2-1e-9){this.status='recovered';this.reserve=100;this.cancelRepair();this.emit('communications-restored');}}
    return true;
  }
  reset(notify=true){this.status='nominal';this.reserve=100;this.setting=null;this.selectedRelay=null;this.polarity=1;this.frequency=4;this.phase=4;this.interlock=0;this.powerAvailable=true;this.cancelRepair();if(notify)this.emit('communications-reset');}
}
