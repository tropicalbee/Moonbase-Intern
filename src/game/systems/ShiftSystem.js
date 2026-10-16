export const SHIFT_FAULT_TIMES = Object.freeze([45,150,255,345]);
import {EventScheduler} from './EventScheduler.js';
const DEADLINE_EPSILON = 1e-9;

/** Active-time run rules. Boundary splitting makes deadlines independent of frame size. */
export class ShiftSystem {
  constructor(power, {oxygen=null,cooling=null,communications=null,rover=null,duration=420, blackoutGrace=20, faultTimes=SHIFT_FAULT_TIMES, events=null, stages=[], dependenciesEnabled=false, seed=null, onEvent=()=>{}}={}) {
    if(!power || !Number.isFinite(duration)||duration<=0 || !Number.isFinite(blackoutGrace)||blackoutGrace<=0 ||
      !Array.isArray(faultTimes)||faultTimes.some((time,index)=>!Number.isFinite(time)||time<0||time>=duration||(index>0&&time<=faultTimes[index-1]))) throw new Error('Invalid shift configuration');
    Object.assign(this,{power,oxygen,cooling,communications,rover,duration,blackoutGrace,onEvent,seed,dependenciesEnabled:!!dependenciesEnabled});
    this.stageScheduler=new EventScheduler(stages,duration);
    this.scheduler=new EventScheduler(events??faultTimes.map((at,index)=>({id:`power-${index+1}`,system:'power',at})),duration);
    this.faultTimes=this.scheduler.events.map(event=>event.at);this.reset();
  }
  get remaining(){return Math.max(0,this.duration-this.elapsed);}
  get terminal(){return ['failed','complete'].includes(this.status);}
  get lockdownRemaining(){return this.power.status==='blackout' ? Math.max(0,this.blackoutGrace-this.blackoutElapsed) : null;}
  get snapshot(){return Object.freeze({status:this.status,elapsed:this.elapsed,remaining:this.remaining,blackoutElapsed:this.blackoutElapsed,lockdownRemaining:this.lockdownRemaining,faults:this.faultIndex,repairs:this.repairs,seed:this.seed,failureReason:this.failureReason,linkLostElapsed:this.linkLostElapsed,roverStalledElapsed:this.roverStalledElapsed,difficultyStage:this.difficultyStage});}
  emit(type,details={}){this.onEvent({type,state:this.snapshot,...details});}
  syncDependencies(){
    const powered=!this.dependenciesEnabled||this.power.status!=='blackout';
    this.cooling?.setPowerAvailable(powered);this.communications?.setPowerAvailable(powered);
    this.power.setOxygenPumpLoad(this.dependenciesEnabled&&this.oxygen?.needsRepair&&this.oxygen.repairing&&this.oxygen.balanced&&this.oxygen.holding);
  }
  reset(){this.status='idle';this.elapsed=0;this.blackoutTotalElapsed=0;this.blackoutElapsed=0;this.linkLostElapsed=0;this.roverStalledElapsed=0;this.faultIndex=0;this.repairs=0;this.finalMinute=false;this.failureReason=null;this.lastPowerStatus=this.power.status;this.lastOxygenStatus=this.oxygen?.status;this.lastCoolingStatus=this.cooling?.status;this.lastCommunicationsStatus=this.communications?.status;this.lastRoverStatus=this.rover?.status;this.scheduler.reset();this.stageScheduler.reset();this.difficultyStage=null;this.cooling?.setPowerAvailable(true);this.communications?.setPowerAvailable(true);this.power.setOxygenPumpLoad(false);}
  setPlan(plan){
    if(this.status!=='idle')throw new Error('Cannot replace a running plan');
    const scheduler=new EventScheduler(plan.events,this.duration),stageScheduler=new EventScheduler(plan.stages??[],this.duration);
    this.scheduler=scheduler;this.stageScheduler=stageScheduler;this.difficultyStage=null;this.faultTimes=this.scheduler.events.map(event=>event.at);this.seed=plan.seed;this.dependenciesEnabled=!!plan.dependenciesEnabled;
  }
  start(){if(this.status!=='idle')return false;this.status='running';this.syncDependencies();this.difficultyStage=this.stageScheduler.takeDue(0).at(-1)??null;this.emit('shift-start');return true;}
  finish(status,reason=null){if(this.status!=='running')return;this.status=status;this.failureReason=reason;this.emit(status==='failed'?'shift-failed':'shift-complete');}
  countRepairs(){
    if(this.power.status==='recovered'&&this.lastPowerStatus!=='recovered')this.repairs++;
    if(this.oxygen?.status==='recovered'&&this.lastOxygenStatus!=='recovered')this.repairs++;
    if(this.cooling?.status==='recovered'&&this.lastCoolingStatus!=='recovered')this.repairs++;
    if(this.communications?.status==='recovered'&&this.lastCommunicationsStatus!=='recovered')this.repairs++;
    if(this.rover?.status==='recovered'&&this.lastRoverStatus!=='recovered')this.repairs++;
    this.lastPowerStatus=this.power.status;this.lastOxygenStatus=this.oxygen?.status;this.lastCoolingStatus=this.cooling?.status;
    this.lastCommunicationsStatus=this.communications?.status;this.lastRoverStatus=this.rover?.status;
  }
  update(delta){
    if(this.status!=='running'||!Number.isFinite(delta)||delta<0||!Number.isFinite(this.elapsed+delta))return false;
    this.countRepairs();
    if(this.power.status!=='blackout')this.blackoutElapsed=0;
    let left=delta;
    while(this.status==='running'){
      for(const stage of this.stageScheduler.takeDue(this.elapsed)){this.difficultyStage=stage;this.emit('shift-stage',{stage});}
      for(const event of this.scheduler.takeDue(this.elapsed)){
        let triggered=false;
        if(event.system==='power'){
          if(this.power.status==='recovered')triggered=this.power.triggerNextFault(event.circuit);
          else if(!this.power.needsRepair)triggered=this.power.triggerFault(event.circuit);
          this.lastPowerStatus=this.power.status;
        }
        if(event.system==='oxygen'&&this.oxygen){triggered=this.oxygen.triggerFault(event.regulator);this.lastOxygenStatus=this.oxygen.status;}
        if(event.system==='cooling'&&this.cooling){triggered=this.cooling.triggerFault(event.coolant);this.lastCoolingStatus=this.cooling.status;}
        if(event.system==='communications'&&this.communications){triggered=this.communications.triggerFault(event.carrier);this.lastCommunicationsStatus=this.communications.status;}
        if(event.system==='rover'&&this.rover){triggered=this.rover.triggerFault(event.drive);this.lastRoverStatus=this.rover.status;}
        if(triggered)this.faultIndex++;
        this.emit('shift-event',{event,triggered});
      }
      this.syncDependencies();
      if(!this.finalMinute && this.remaining<=60+DEADLINE_EPSILON){this.finalMinute=true;this.emit('shift-final-minute');}
      // Failure takes precedence if both deadlines fall on the same instant.
      if(this.oxygen?.status==='depleted'){this.finish('failed','oxygen-depleted');break;}
      if(this.cooling?.status==='overheated'){this.finish('failed','cooling-overheated');break;}
      if(this.power.status==='blackout'&&this.blackoutElapsed>=this.blackoutGrace-DEADLINE_EPSILON){this.finish('failed','power-lockdown');break;}
      if(this.remaining<=DEADLINE_EPSILON){this.elapsed=this.duration;const unresolved=this.power.needsRepair||this.oxygen?.needsRepair||this.cooling?.needsRepair||this.communications?.needsRepair||this.rover?.needsRepair;this.finish(unresolved?'failed':'complete',this.communications?.needsRepair?'communications-unresolved':this.rover?.needsRepair?'rover-unresolved':'handover');break;}
      if(left<=0)break;
      const faultBoundary=this.scheduler.nextTime-this.elapsed;
      const stageBoundary=this.stageScheduler.nextTime-this.elapsed;
      const outageBoundary=this.power.needsRepair&&this.power.health>0?this.power.outageSeconds:Infinity;
      const lockdownBoundary=this.power.status==='blackout'?this.blackoutGrace-this.blackoutElapsed:Infinity;
      const finalBoundary=!this.finalMinute&&this.remaining>60?this.remaining-60:Infinity;
      const oxygenBoundary=this.oxygen?.needsRepair?this.oxygen.secondsRemaining:Infinity;
      const linkBoundary=this.communications?.needsRepair&&this.communications.status!=='lost'?this.communications.secondsRemaining:Infinity;
      const roverBoundary=this.rover?.needsRepair&&this.rover.status!=='stalled'?this.rover.secondsRemaining:Infinity;
      const step=Math.min(left,this.remaining,faultBoundary,stageBoundary,outageBoundary,lockdownBoundary,finalBoundary,oxygenBoundary,this.oxygen?.repairBoundary??Infinity,this.cooling?.needsRepair?this.cooling.secondsRemaining:Infinity,linkBoundary,this.communications?.repairBoundary??Infinity,roverBoundary,this.rover?.repairBoundary??Infinity);
      if(!(step>0))break;
      const wasBlackout=this.power.status==='blackout';
      const wasLinkLost=this.communications?.status==='lost';
      const wasRoverStalled=this.rover?.status==='stalled';
      // The scheduler owns faults; the power model only drains supply here.
      this.power.update(step,false);this.elapsed+=step;left-=step;
      this.oxygen?.update(step);this.cooling?.update(step);this.communications?.update(step);this.rover?.update(step);this.countRepairs();
      if(wasBlackout){this.blackoutElapsed+=step;this.blackoutTotalElapsed+=step;}
      if(wasLinkLost)this.linkLostElapsed+=step;
      if(wasRoverStalled)this.roverStalledElapsed+=step;
    }
    return true;
  }
}
