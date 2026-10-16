import {authoredChoice,faultReaction,repairDiagnostic} from './FaultDialogue.js';
/** Authored commentary. No simulation randomness, gameplay mutations or remote AI calls. */
const faultLines={
  power:'Watt has lost the primary feed. Please demonstrate why we hired something with hands.',
  oxygen:'Oxygen circulation is failing. Breathing remains a mandatory workplace activity.',
  cooling:'Patch is overheating. The research should be groundbreaking, not molten.',
  communications:'Relay lost the carrier. Please reconnect us before management assumes this was deliberate.',
  rover:'Scout has a drive overload. He has submitted a complaint against one of his own wheels.'
};
const criticalLines={
  power:'Power reserve critical. The emergency lighting is not a new aesthetic choice.',
  oxygen:'Oxygen reserve critical. Repair Capsule now; the suggestion box can wait.',
  cooling:'Thermal limit approaching. Please stop the lab from becoming an outdoor lab.',
  communications:'Carrier lock is failing. Our last message should not be buffering.',
  rover:'Scout’s drive is approaching shutdown. Please intervene before the survey becomes a parking exercise.'
};
const recoveredLines={
  power:'Power restored. Your continued employment has been provisionally reconnected.',
  oxygen:'Oxygen restored. Everyone may resume their regularly scheduled breathing.',
  cooling:'Cooling restored. The lab is once again suitable for research rather than toast.',
  communications:'Uplink verified. Management can hear us again. Please act pleased.',
  rover:'Scout is rolling again. He has withdrawn one of his six complaints.'
};
const stages={pressure:'Multiple incidents may overlap. Multitasking has been added to your job description retroactively.',chaos:'Priority review: life support first. Scout can complain while parked.',final:'Final inspection in sixty seconds. Panic is not a repair procedure.'};
const recoveryAlternates={power:'Power restored. Watt has agreed to continue this working relationship.',oxygen:'Oxygen restored. Capsule has withdrawn the immediate breathing complaint.',cooling:'Cooling restored. Patch can return to research instead of heat management.',communications:'Uplink verified. Relay is transmitting, and management has resumed listening.',rover:'Scout is rolling again. Survey samples may now arrive without a towing request.'};
const stageAlternates={pressure:'Incident load is increasing. Please prioritize deadlines over whichever alarm is most annoying.',chaos:'Overlapping incidents expected. Protect life support before the survey schedule.',final:'One minute until handover. Resolve outstanding incidents; a confident wave will not pass inspection.'};
const criticalLead={power:'Power reserve critical.',oxygen:'Oxygen reserve critical.',cooling:'Thermal limit approaching.',communications:'Carrier lock is failing.',rover:'Drive shutdown imminent.'};

export function urgentContext(context){
  return Object.entries(context?.systems??{}).some(([id,system])=>{
    const remaining=id==='power'&&system?.status==='blackout' ? context?.shift?.lockdownRemaining??0 : system?.secondsRemaining??system?.outageSeconds;
    return ['power','oxygen','cooling'].includes(id)&&system?.needsRepair&&Number.isFinite(remaining)&&remaining<=8;
  });
}

/** Dialogue policy only; these helpers never change the simulation. */
export function criticalContext(context){
  return urgentContext(context)||Object.entries(context?.systems??{}).some(([id,system])=>
    ['power','oxygen','cooling'].includes(id)&&system?.needsRepair&&['critical','blackout','depleted','overheated'].includes(system.status));
}

export function dialogueContextKey(context){
  return JSON.stringify([context?.shift?.difficultyStage?.id??null,
    Object.entries(context?.systems??{}).map(([id,system])=>[id,system?.status??null,!!system?.needsRepair,repairDiagnostic(system)?.variant??null])]);
}

export function urgentInstruction(context){
  if(context?.shift?.status!=='running')return null;
  const candidates=Object.entries(context.systems??{}).filter(([id,system])=>
    ['power','oxygen','cooling'].includes(id)&&system?.needsRepair&&criticalContext({shift:context.shift,systems:{[id]:system}}));
  const deadline=([id,system])=>id==='power'&&system.status==='blackout'?context.shift.lockdownRemaining??0:system.secondsRemaining??system.outageSeconds??Infinity;
  candidates.sort((a,b)=>deadline(a)-deadline(b));
  if(!candidates.length)return null;
  const [id,system]=candidates[0];
  const variant=repairDiagnostic(system)?.variant;
  const preparation={'filter-bypass':'Bypass the blocked filter, then balance and prime Capsule now.','valve-purge':'Purge both trapped-pressure valves, then balance and prime Capsule now.','sensor-drift':'Calibrate the drifting probe, vent the hot loop, then synchronize at Patch.','return-blockage':'Open the blocked return, then synchronize the pump at Patch.'}[variant];
  const text=id==='power' ? system.status==='blackout' ? 'Lab power is offline. Restore Watt before safety lockdown.' : 'Power reserve critical. Restore the circuit at Watt.'
    :preparation ? `${id==='oxygen'?'Atmosphere reserve critical.':'Thermal limit approaching.'}${id==='cooling'&&system.powerAvailable===false?' Restore Watt first; the pump has no power.':''} ${preparation}`
    :id==='oxygen' ? 'Atmosphere reserve critical. Balance and prime the regulator at Capsule now.'
    :'Thermal limit approaching. Restore cooling at Patch; the backup pump requires power.';
  return {id,status:system.status,variant,text};
}

/** Small event queue: active-time cooldown, relevance checks and bounded expiry. */
export class StationPersonality {
  constructor(){this.reset();}
  reset(){this.queue=[];this.statuses={};this.diagnostics={};this.occurrences={};this.stage=null;this.lastSpoken=-Infinity;this.current=null;}
  observe(context){
    const shift=context?.shift;if(shift?.status!=='running'||!Number.isFinite(shift.elapsed)){this.queue=[];return;}
    const at=shift.elapsed,stage=shift.difficultyStage?.id;
    if(stage&&stage!==this.stage){this.stage=stage;if(stages[stage])this.enqueue({key:`stage/${stage}`,text:authoredChoice([stages[stage],stageAlternates[stage]],shift.seed,stage),priority:20,at,stage});}
    for(const [id,system] of Object.entries(context.systems??{})){
      const diagnostic=repairDiagnostic(system),changed=this.diagnostics[id]!==diagnostic;
      if(!system||this.statuses[id]===system.status&&!changed)continue;
      const previous=this.statuses[id];this.statuses[id]=system.status;
      this.diagnostics[id]=diagnostic;
      const status=system.status,critical=['critical','blackout','lost','stalled'].includes(status);
      const occurrenceKey=`${id}/${diagnostic?.variant??'classic'}`;
      if(status==='fault')this.occurrences[occurrenceKey]=(this.occurrences[occurrenceKey]??0)+1;
      const ordinal=Math.max(0,(this.occurrences[occurrenceKey]??1)-1),reaction=faultReaction(system,shift.seed,ordinal);
      const lead=status==='stalled'?'Scout is immobilized.':status==='lost'?'Uplink offline.':status==='blackout'?'Lab power is offline.':criticalLead[id];
      const text=status==='fault'?reaction??faultLines[id]:critical?reaction?`${lead} ${reaction}`:criticalLines[id]:status==='recovered'&&previous&&previous!=='nominal'?authoredChoice([recoveredLines[id],recoveryAlternates[id]],shift.seed,`recovery/${id}`,ordinal):null;
      if(text)this.enqueue({key:id,text,priority:critical?80:status==='recovered'?10:50,at,id,status,diagnostic});
    }
    this.prune(context);
  }
  enqueue(entry){this.queue=this.queue.filter(item=>item.key!==entry.key);this.queue.push(entry);this.queue.sort((a,b)=>b.priority-a.priority||a.at-b.at);this.queue=this.queue.slice(0,3);}
  prune(context){
    this.queue=this.queue.filter(entry=>this.relevant(context,entry));
  }
  relevant(context,entry){const shift=context?.shift;return !!entry&&shift?.status==='running'&&shift.elapsed-entry.at<=12&&(entry.stage?shift.difficultyStage?.id===entry.stage:context.systems?.[entry.id]?.status===entry.status&&repairDiagnostic(context.systems?.[entry.id])===entry.diagnostic);}
  update(context,speak){
    this.prune(context);const at=context?.shift?.elapsed;
    if(!Number.isFinite(at)||at-this.lastSpoken<12||urgentContext(context)||!this.queue.length)return false;
    if(!speak(this.queue[0].text,this.queue[0]))return false;
    this.current=this.queue.shift();this.lastSpoken=at;return true;
  }
}

const cactusTree={
  cooling:["I asked for sunlight. Nobody ordered a second Sun. Patch needs you.","If the lab gets any hotter, I am filing for desert overtime."],
  oxygen:["I cannot fix Capsule. My qualifications are mostly standing here.","Oxygen first, intern. My career advice works better on living employees."],
  chaos:["I have six hundred spines and still fewer problems than this station.","You handle the blinking equipment. I will continue guarding this exact patch of floor."],
  recovered:["You fixed something. I have upgraded your clearance from suspicious to cautiously suspicious.","Good work. Please do not celebrate by watering the electronics."],
  repeated:["Back again? I have not moved. This is a very affordable security service.","If this is my performance review, please mention my excellent attendance.","Yes, still a cactus. No, still not a repair station."]
};
const roverTree={
  stalled:["My wheels have gone on strike. Find the overloaded motor; I cannot negotiate with it.","I am not sightseeing. I am broken. Twelve amps is the wheel you want."],
  fault:["One motor is drawing twelve amps. That is a complaint, not enthusiasm.","I can still crawl. Please service my drive before I become station furniture."],
  recovered:["Drive verified. Back to collecting rocks and avoiding performance reviews.","Thanks for the repair. I will try to hit fewer rocks. No promises about interns."],
  final:["You handle handover. I will make the rock delivery look intentional.","If anyone asks, the scenic route was essential research."],
  repeated:["You again. Are you supervising me, or am I supervising you?","Another lap, another rock. My promotion prospects remain geological."]
};

export function personalityLine(id,encounter,context){
  if(encounter<=0||context?.shift?.status!=='running')return null;
  const systems=context.systems??{},stage=context.shift.difficultyStage?.id;let branch,tree;
  const systemId={rover:'rover',console:'cooling',pod:'oxygen','power-cell':'power',dish:'communications'}[id];
  if(systemId&&systems[systemId]?.needsRepair){
    const reaction=faultReaction(systems[systemId],context.shift.seed,encounter-1,true);
    if(reaction)return `${systems[systemId].status==='stalled'?'I am immobilized. ':''}${reaction}`;
  }
  if(id==='cactus'){
    tree=cactusTree;branch=systems.oxygen?.needsRepair?'oxygen':systems.cooling?.needsRepair?'cooling':['chaos','final'].includes(stage)?'chaos':context.shift.repairs>0?'recovered':'repeated';
  }else if(id==='rover'){
    tree=roverTree;branch=systems.rover?.status==='stalled'?'stalled':systems.rover?.needsRepair?'fault':systems.rover?.status==='recovered'?'recovered':stage==='final'?'final':'repeated';
  }else return null;
  return tree[branch][(encounter-1)%tree[branch].length];
}

export const SCORE_RATING_NAMES=Object.freeze({S:'Suspiciously competent',A:'Hireable',B:'Requires supervision',C:'Probation extended',D:'Decorative staff',F:'Former intern'});
export function supervisorRemark(reason){
  return ({'cooling-overheated':'The lab is now technically open plan. Your contract is not.', 'power-lockdown':'You have been promoted to a non-electrical role.', 'oxygen-depleted':'Breathing was in the job description. We checked.', 'communications-unresolved':'Management called. Unfortunately, that was the problem.', 'rover-unresolved':'Scout has requested a different intern.',handover:'The station failed inspection. Your paperwork was impeccable.'})[reason]??'Nothing exploded. We are calling this professional development.';
}
