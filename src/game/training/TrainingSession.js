import {createPowerCircuit} from '../systems/PowerCircuit.js';
import {REPAIR_VARIANTS,createRepairDiagnostic} from '../systems/RepairVariants.js';
import {seededRandom} from '../systems/SeededRandom.js';

export const TRAINING_MODULES=Object.freeze([
  {id:'welcome',title:'Welcome, intern',text:'Keep the habitat stable for seven minutes, then hand over with every system repaired. This practice has no deaths, random faults or score. You can take your time.',hint:'Press N to continue. F1 pauses practice and gives you a cursor for the training controls.'},
  {id:'movement',title:'Move, look and interact',text:'Walk with WASD, look with the mouse and sprint with Shift. Follow the guide to Watt, aim at it and press E. Leave the panel with Backspace.',hint:'Watt is the small upright power cell on the east side. Move at least 3 metres, turn your view, sprint, and open then close its service panel.'},
  {id:'hud',title:'Read the station',text:'The timer ends at handover. Warning cards show the fault, consequence and repair action. Life support comes first. Score is reported after a real shift; training never records a score.',hint:'Use the four HUD lesson buttons in training controls (F1), or press 1, 2, 3 and 4 here. Read each explanation.'},
  {id:'power',title:'Watt · restore power',text:'Approach Watt and press E. Choose the feed marked FUSE TRIPPED (1–3). Wait for the interlock. Match a backup voltage to the lab bus, wait, then press Enter.',hint:'Read the fuse and voltage labels. The two correct intermediate steps each need a 0.65-second interlock; wrong routing resets the steps. Training protects the reserve.'},
  {id:'oxygen',title:'Capsule · balance and prime',text:'Find the tall pod on the west side. Press E. A/D changes intake; W/S changes return. Match BOTH required percentages, then hold E continuously for two seconds.',hint:'D raises intake; A lowers it. W raises return; S lowers it. Watch the prime progress bar. Releasing E resets the hold, while your flow settings stay saved.'},
  {id:'cooling',title:'Patch · vent and synchronize',text:'Enter the lab through its sliding door and approach the cockpit control panel. Press E. Vent the highest-pressure loop with 1–3, then press Space when the needle enters the marked window.',hint:'The lab entrance is left of centre at the back of the habitat. Venting saves progress but does not stop heating. The pump requires power. In training the needle moves more slowly.'},
  {id:'communications',title:'Relay · acquire the carrier',text:'Return to Watt for Relay. Press E. Match the tallest spectrum bar using A/D. Follow the phase hint using W/S until signal is 100%. Press E once and wait two seconds.',hint:'A lowers frequency, D raises it. S lowers phase, W raises it. A lower percentage after a tap means you moved away from the target. The panel tells you which key improves it.'},
  {id:'rover',title:'Scout · verify the drive',text:'Scout is parked for this exercise. Find the survey rover, aim at it and press E. Read the wheel currents, select the 12 A wheel with 1–6, then hold E for three uninterrupted seconds.',hint:'In a real shift Scout slows during a drive fault, stalls after 30 seconds, and parks during service. A wrong wheel is rejected. Keep E down until the verification bar finishes.'},
  {id:'priority',title:'Two faults · choose the dependency',text:'Power and cooling have failed together. You may vent Patch first, but its pump cannot run in blackout. Restore Watt, then finish Patch. Follow the action on the leading warning card.',hint:'Blackout does not turn off guidance. Leave Patch with Backspace, repair Watt, return to the already-vented loop and synchronize its pump. Both repairs are required.'},
  {id:'practice',title:'Your practice handover',text:'First restore Capsule. Then handle a power fault and an uplink fault at Watt. Choose life support first. Use hints if needed; there is no time limit or score penalty.',hint:'Capsule: match both flows and hold E. Watt: tripped feed, matching voltage, Enter. Relay: tallest bar, 100% signal, E once. Finish all three to complete training.'},
]);

/** Scenario/progression only. Repairs and their events remain owned by the real models. */
export class TrainingSession {
  constructor({systems,resetSystems,onModule=()=>{}}){Object.assign(this,{systems,resetSystems,onModule});this.active=false;this.index=0;this.elapsed=0;this.completed=new Set();this.skipped=new Set();}
  get module(){return TRAINING_MODULES[this.index];}
  get finished(){return this.index===TRAINING_MODULES.length;}
  get shiftContext(){return {status:'running',training:true,elapsed:this.elapsed,remaining:420,lockdownRemaining:20,blackoutGrace:20,dependenciesEnabled:true,difficultyStage:{id:'orientation',label:'TRAINING'}};}
  start(pose){this.active=true;this.elapsed=0;this.completed.clear();this.skipped.clear();this.enter(0,pose);}
  enter(index,pose,{variant=null}={}){
    if(!this.active)return false;
    this.resetSystems();this.index=Math.max(0,Math.min(TRAINING_MODULES.length,index));this.ready=false;this.hudLessons=new Set();this.progress={distance:0,look:0,sprint:0,opened:false,closed:false};this.lastPose=pose?{...pose}:null;this.practiceStage=0;
    const {power,oxygen,cooling,communications,rover}=this.systems;this.practiceVariant=variant;
    const diagnostic=system=>createRepairDiagnostic(system,variant,seededRandom('LUNA-00000001',`training/${system}/${variant}`));
    if([1,2,3,8].includes(this.index))power.triggerFault(variant?diagnostic('power'):createPowerCircuit(()=>.4));
    if(this.index===4||this.index===9)oxygen.triggerFault(variant?diagnostic('oxygen'):{intake:50,returnFlow:50});
    if(this.index===5||this.index===8)cooling.triggerFault(variant?diagnostic('cooling'):{hotValve:1,pressures:[4,12,6],phase:0});
    if(this.index===6)communications.triggerFault(variant?diagnostic('communications'):{frequency:2,phase:6});
    if(this.index===7){rover.triggerFault(variant?diagnostic('rover'):{wheel:2,currents:[3,4,12,5,6,3]});rover.update(30);}
    if(this.index===8){power.update(30,false);cooling.setPowerAvailable(false);communications.setPowerAvailable(false);}
    this.ready=this.index===0||this.finished;
    this.onModule(this.index);
    return true;
  }
  get variantSystem(){return this.index>=3&&this.index<=7?['power','oxygen','cooling','communications','rover'][this.index-3]:null;}
  get practiceDiagnostic(){const model=this.systems[this.variantSystem];return this.practiceVariant?(model?.circuit??model?.setting??model?.drive):null;}
  cycleVariant(pose){
    if(!this.active||!this.variantSystem)return false;
    const variants=REPAIR_VARIANTS[this.variantSystem],index=variants.indexOf(this.practiceVariant??variants[0]);
    return this.enter(this.index,pose,{variant:variants[(index+1)%variants.length]});
  }
  inspectHud(id){if(this.index!==2||!['timer','reserve','priority','score'].includes(id))return false;this.hudLessons.add(id);this.ready=this.hudLessons.size===4;return true;}
  next(pose,{skip=false}={}){if(!this.active||this.finished||(!this.ready&&!skip))return false;const id=this.module.id;if(skip){if(!this.completed.has(id))this.skipped.add(id);}else{this.completed.add(id);this.skipped.delete(id);}return this.enter(this.index+1,pose);}
  stop(){this.active=false;this.resetSystems();}
  update(delta,pose,{powerOpen=false}={}){
    if(!this.active||!Number.isFinite(delta)||delta<0)return;
    this.elapsed+=delta;
    const {power,oxygen,cooling,communications,rover}=this.systems;
    // Protect learning reserves, while advancing the actual interlocks, holds,
    // carrier handshake and drive state. No scheduler or score writer runs here.
    if(power.needsRepair&&power.status!=='blackout')power.health=60;
    if(oxygen.needsRepair)oxygen.reserve=90;
    if(cooling.needsRepair)cooling.temperature=70;
    if(communications.needsRepair)communications.reserve=100;
    power.setOxygenPumpLoad(oxygen.holding);
    cooling.setPowerAvailable(power.status!=='blackout');communications.setPowerAvailable(power.status!=='blackout');
    power.update(delta,false);oxygen.update(delta);
    const phase=cooling.phase;
    cooling.update(delta);
    if(cooling.needsRepair)cooling.phase=(phase+delta/5.6)%1;
    communications.update(delta);rover.update(delta);
    if(power.needsRepair&&power.status!=='blackout')power.health=60;
    if(oxygen.needsRepair)oxygen.reserve=90;
    if(cooling.needsRepair)cooling.temperature=70;
    if(communications.needsRepair)communications.reserve=100;
    if(this.index===1&&pose){
      if(this.lastPose){const distance=Math.hypot(pose.x-this.lastPose.x,pose.z-this.lastPose.z);this.progress.distance+=distance;this.progress.look+=Math.abs(pose.yaw-this.lastPose.yaw)+Math.abs(pose.pitch-this.lastPose.pitch);if(pose.sprinting)this.progress.sprint+=distance;}
      this.lastPose={...pose};if(powerOpen)this.progress.opened=true;else if(this.progress.opened)this.progress.closed=true;
      this.ready=this.progress.distance>=3&&this.progress.look>=.5&&this.progress.sprint>=1&&this.progress.closed;
    }
    const repaired=id=>this.systems[id].status==='recovered';
    if(this.index>=3&&this.index<=7)this.ready=repaired(['power','oxygen','cooling','communications','rover'][this.index-3]);
    if(this.index===8)this.ready=repaired('power')&&repaired('cooling');
    if(this.index===9){
      if(this.practiceStage===0&&repaired('oxygen')){this.practiceStage=1;power.triggerFault(createPowerCircuit(()=>.7));communications.triggerFault({frequency:6,phase:3});}
      this.ready=this.practiceStage===1&&repaired('power')&&repaired('communications');
    }
  }
}
