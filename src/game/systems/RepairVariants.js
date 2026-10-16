import {seededRandom} from './SeededRandom.js';
import {createDifficultyPlan} from './DifficultyPlan.js';
import {createPowerCircuit} from './PowerCircuit.js';

export const REPAIR_VARIANTS=Object.freeze(Object.fromEntries(Object.entries({
  power:['feed-trip','bank-short','bus-isolation'],
  oxygen:['flow-balance','filter-bypass','valve-purge'],
  cooling:['pressure-lock','return-blockage','sensor-drift'],
  communications:['carrier-drift','relay-mismatch','phase-inversion'],
  rover:['motor-overload','brake-lock','encoder-drift'],
}).map(([system,variants])=>[system,Object.freeze(variants)])));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const fields={power:'circuit',oxygen:'regulator',cooling:'coolant',communications:'carrier',rover:'drive'};

/** Authored rules with seeded evidence; only planning/training calls consume randomness. */
export function createRepairDiagnostic(system,variant,random){
  if(!REPAIR_VARIANTS[system]?.includes(variant))throw Error('Unknown repair variant');
  const draw=()=>{const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw Error('Invalid diagnostic random value');return value;};
  const pick=count=>Math.floor(draw()*count),target=pick(system==='rover'?6:3);
  if(system==='power'){
    const circuit=createPowerCircuit(draw),{requiredVoltage}=circuit;
    let sequence=[circuit.feeds[circuit.damaged].id,circuit.banks[circuit.backup].id,'restore'];
    let stages=[{kind:'feeds',title:'Isolate the tripped feed',instruction:'Open the feed whose fuse is tripped.'},{kind:'banks',title:'Connect backup power',instruction:`Match the backup bank to the ${requiredVoltage} V lab bus.`},{kind:'restore',title:'Verify and restore',instruction:'Isolation and backup checks accepted. Press Enter to restore.'}];
    let feeds=circuit.feeds,banks=circuit.banks;
    if(variant==='bank-short'){
      feeds=feeds.map((feed,i)=>({...feed,tripped:false,voltage:[24,48,72][([24,48,72].indexOf(requiredVoltage)+i-circuit.damaged+3)%3]}));
      banks=banks.map((bank,i)=>({...bank,leakage:i===target?12:2+i}));
      sequence=[banks[target].id,feeds[circuit.damaged].id,'restore'];
      stages=[{kind:'banks',readout:'leakage',title:'Isolate the shorted bank',instruction:'A healthy bank leaks at most 4 mA. Disconnect the bank above that limit.'},{kind:'feeds',readout:'voltage',title:'Reconnect a healthy feed',instruction:`Select the live feed matching the ${requiredVoltage} V bus.`},{kind:'restore',title:'Verify and restore',instruction:'Shorted bank isolated and live feed matched. Press Enter to restore.'}];
    }
    if(variant==='bus-isolation'){
      const second=(target+1)%3;feeds=feeds.map((feed,i)=>({...feed,tripped:false,leakage:i===target?12:i===second?9:2}));
      sequence=[feeds[target].id,feeds[second].id,banks[circuit.backup].id,'restore'];
      stages=[{kind:'feeds',readout:'leakage',title:'Clear the bus back-feed',instruction:'Open the two leaking feeds, highest leakage first. A healthy feed is below 5 mA.'},{kind:'feeds',readout:'leakage',title:'Isolate the second leaking feed',instruction:'Open the remaining feed above 5 mA.'},{kind:'banks',title:'Restore the isolated bus',instruction:`Both back-feeds isolated. Select the ${requiredVoltage} V backup bank.`},{kind:'restore',title:'Verify and restore',instruction:'Bus isolation and backup checks accepted. Press Enter to restore.'}];
    }
    return freeze({...circuit,variant,label:{'feed-trip':'Primary feed trip','bank-short':'Backup bank short','bus-isolation':'Bus back-feed'}[variant],feeds,banks,sequence,stages,instruction:stages[0].instruction});
  }
  if(system==='oxygen'){
    const intake=35+pick(7)*5,readings=[4,6,5].map((v,i)=>i===target?18:v),second=(target+1)%3;
    if(variant==='valve-purge')readings[second]=12;
    const serviceSequence=variant==='filter-bypass'?[target]:variant==='valve-purge'?[target,second]:[];
    return freeze({variant,intake,returnFlow:100-intake,readings,serviceSequence,
      label:{'flow-balance':'Circulation imbalance','filter-bypass':'Blocked filter','valve-purge':'Trapped pressure'}[variant],
      instruction:variant==='filter-bypass'?'Bypass the filter above 10 kPa, then balance both flows and hold E to prime.':variant==='valve-purge'?'Purge both valves above 10 kPa, highest pressure first. Then balance both flows and hold E.':'Match both required flows, then hold E for two seconds.'});
  }
  if(system==='cooling'){
    const sensor=(target+1)%3,pressures=[4,6,5].map((v,i)=>i===target?12:v),flows=[7,9,8].map((v,i)=>i===target?2:v),reference=60+pick(10);
    const probes=[reference,reference,reference].map((v,i)=>i===sensor?v+20:v);
    const actions=variant==='sensor-drift'?[sensor,target]:[target],windowStart=[.2,.35,.5][pick(3)];
    return freeze({variant,hotValve:target,pressures,flows,probes,reference,actions,phase:draw(),period:2.8,window:[windowStart,windowStart+.3],
      label:{'pressure-lock':'Pressure lock','return-blockage':'Blocked return','sensor-drift':'Probe calibration drift'}[variant],
      instruction:variant==='return-blockage'?'Open the return loop below 4 L/s, then synchronize the pump.':variant==='sensor-drift'?`Calibrate the probe that disagrees with the ${reference}° reference. Then vent the highest-pressure loop and synchronize.`:'Vent the highest-pressure loop, then synchronize the pump.'});
  }
  if(system==='communications'){
    const frequency=2+pick(7);let phase=2+pick(7);if(frequency===4&&phase===4)phase=5;
    const relays=[25,35,30].map((v,i)=>i===target?90:v),polarity=pick(2)?1:-1;
    return freeze({variant,frequency,phase,relays,relay:target,polarity,
      label:{'carrier-drift':'Carrier drift','relay-mismatch':'Relay routing fault','phase-inversion':'Signal polarity inversion'}[variant],
      instruction:variant==='relay-mismatch'?'Route the relay above 80% quality, tune frequency and phase, then verify.':variant==='phase-inversion'?`Match reference polarity (${polarity>0?'+':'−'}), tune frequency and phase, then verify.`:'Match the tallest spectrum bar, tune phase to 100%, then verify.'});
  }
  const currents=Array.from({length:6},(_,i)=>i===target?12:3+pick(4)),torques=Array.from({length:6},(_,i)=>i===target?42:4+pick(4));
  const error=(2+pick(4))*(pick(2)?1:-1),errors=Array.from({length:6},(_,i)=>i===target?error:0);
  return freeze({variant,wheel:target,currents,torques,errors,
    label:{'motor-overload':'Motor overcurrent','brake-lock':'Brake locked','encoder-drift':'Encoder drift'}[variant],
    instruction:variant==='brake-lock'?'Select the wheel above 20 N brake drag, release its brake with Space, then hold E to verify.':variant==='encoder-drift'?'Select the wheel with nonzero encoder error. Use A/D to apply the opposite trim, then hold E.':'Select the 12 A motor, then hold E for three seconds.'});
}

/** Validate added evidence before changing a live model. Classic diagnostics remain untouched. */
export function validateRepairDiagnostic(system,data){
  if(!data?.variant)return;
  const vector=(values,length)=>Array.isArray(values)&&values.length===length&&values.every(Number.isFinite);
  const index=(value,max=3)=>Number.isInteger(value)&&value>=0&&value<max;
  let valid=REPAIR_VARIANTS[system]?.includes(data.variant);
  if(system==='power')valid&&=Array.isArray(data.sequence)&&Array.isArray(data.stages)&&data.sequence.length===data.stages.length&&data.sequence.length>=3&&data.sequence.at(-1)==='restore'&&new Set(data.sequence).size===data.sequence.length&&data.sequence.every(id=>id==='restore'||[...data.feeds,...data.banks].some(option=>option.id===id))&&data.stages.every(stage=>['feeds','banks','restore'].includes(stage.kind));
  if(system==='oxygen')valid&&=vector(data.readings,3)&&Array.isArray(data.serviceSequence)&&data.serviceSequence.every(value=>index(value))&&data.serviceSequence.length===(data.variant==='flow-balance'?0:data.variant==='filter-bypass'?1:2);
  if(system==='cooling')valid&&=vector(data.flows,3)&&vector(data.probes,3)&&Number.isFinite(data.reference)&&Array.isArray(data.actions)&&data.actions.every(value=>index(value))&&data.actions.length===(data.variant==='sensor-drift'?2:1)&&vector(data.window,2)&&data.window[0]>=0&&data.window[1]<=1&&data.window[1]>data.window[0]&&Number.isFinite(data.period)&&data.period>0;
  if(system==='communications')valid&&=vector(data.relays,3)&&index(data.relay)&&[1,-1].includes(data.polarity);
  if(system==='rover')valid&&=vector(data.torques,6)&&vector(data.errors,6)&&index(data.wheel,6)&&(data.variant!=='encoder-drift'||(Number.isInteger(data.errors[data.wheel])&&Math.abs(data.errors[data.wheel])>0&&Math.abs(data.errors[data.wheel])<=8));
  if(!valid)throw Error(`Invalid ${system} repair variant`);
}

export function createVariantPlan(seed){
  const base=createDifficultyPlan(seed),counts={},orders={};
  for(const [system,variants] of Object.entries(REPAIR_VARIANTS)){
    const random=seededRandom(seed,`repair-order-v8/${system}`),order=[...variants];
    for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
    orders[system]=order;
  }
  const events=base.events.map(event=>{
    const count=counts[event.system]??0;counts[event.system]=count+1;
    const variant=orders[event.system][count%orders[event.system].length];
    return freeze({...event,[fields[event.system]]:createRepairDiagnostic(event.system,variant,seededRandom(seed,`repair-evidence-v8/${event.system}/${count}`))});
  });
  return freeze({...base,version:8,dependenciesEnabled:true,events});
}
