import {validateRepairDiagnostic} from './RepairVariants.js';
/** Fictional coolant temperature and pump synchronization, advanced by active time. */
export class CoolingSystem {
  constructor({onEvent=()=>{}}={}){this.onEvent=onEvent;this.reset(false);}
  get needsRepair(){return ['fault','critical','overheated'].includes(this.status);}
  get heatRate(){return this.powerAvailable?1:1.5;}
  get secondsRemaining(){return this.needsRepair?Math.max(0,110-this.temperature)/this.heatRate:null;}
  setPowerAvailable(available){this.powerAvailable=!!available;}
  get marker(){return .5+.5*Math.sin(this.phase*Math.PI*2);}
  get inWindow(){const [start,end]=this.setting?.window??[.35,.65];return this.marker>=start&&this.marker<=end;}
  emit(type){this.onEvent({type,state:Object.freeze({status:this.status,temperature:this.temperature,setting:this.setting,vented:this.vented,interlock:this.interlock,powerAvailable:this.powerAvailable})});}
  triggerFault(setting){
    if(this.needsRepair)return false;
    validateRepairDiagnostic('cooling',setting);
    if(!setting||!Number.isInteger(setting.hotValve)||setting.hotValve<0||setting.hotValve>2||!Array.isArray(setting.pressures)||setting.pressures.length!==3||setting.pressures.some(value=>!Number.isFinite(value)||value<0)||setting.pressures.filter(value=>value===Math.max(...setting.pressures)).length!==1||setting.pressures[setting.hotValve]!==Math.max(...setting.pressures)||!Number.isFinite(setting.phase)||setting.phase<0||setting.phase>=1)throw new Error('Invalid cooling diagnostics');
    this.setting=Object.freeze({...setting,pressures:Object.freeze([...setting.pressures])});this.actionStep=0;this.phase=setting.phase;this.temperature=70;this.status='fault';this.vented=false;this.interlock=0;this.emit('cooling-fault');return true;
  }
  beginRepair(){if(!this.needsRepair||this.status==='overheated'||this.repairing)return false;this.repairing=true;return true;}
  cancelRepair(){this.repairing=false;}
  reject(){this.interlock=1.5;this.emit('cooling-rejected');return 'wrong';}
  vent(index){
    if(!this.repairing||this.status==='overheated')return 'unavailable';
    if(!Number.isInteger(index)||index<0||index>2)return 'invalid';
    if(this.interlock>0)return 'interlocked';
    if(this.vented)return 'already-complete';
    const actions=this.setting.actions??[this.setting.hotValve];
    if(index!==actions[this.actionStep])return this.reject();
    this.actionStep++;this.vented=this.actionStep===actions.length;this.emit(this.vented?'cooling-vented':'cooling-calibrated');return 'correct';
  }
  engage(){
    if(!this.repairing||this.status==='overheated'||!this.vented)return 'unavailable';
    if(!this.powerAvailable)return 'unpowered';
    if(this.interlock>0)return 'interlocked';
    if(!this.inWindow)return this.reject();
    this.status='recovered';this.temperature=40;this.repairing=false;this.emit('cooling-restored');return 'complete';
  }
  update(delta){
    if(!Number.isFinite(delta)||delta<0)return false;
    if(!this.needsRepair||this.status==='overheated')return true;
    this.interlock=Math.max(0,this.interlock-delta);this.phase=(this.phase+delta/(this.setting?.period??2.8))%1;
    this.temperature=Math.min(110,this.temperature+delta*this.heatRate);if(110-this.temperature<1e-9)this.temperature=110;
    if(this.status==='fault'&&this.temperature>=95){this.status='critical';this.emit('cooling-critical');}
    if(this.temperature===110){this.status='overheated';this.repairing=false;this.emit('cooling-overheated');}
    return true;
  }
  reset(notify=true){this.status='nominal';this.temperature=40;this.setting=null;this.actionStep=0;this.phase=0;this.vented=false;this.interlock=0;this.repairing=false;this.powerAvailable=true;if(notify)this.emit('cooling-reset');}
}
