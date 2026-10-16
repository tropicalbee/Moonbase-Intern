import {seededRandom} from './SeededRandom.js';
import {createPowerCircuit} from './PowerCircuit.js';

export const DIFFICULTY_STAGES=Object.freeze([
  {id:'orientation',at:0,label:'ORIENTATION',message:'One incident at a time. Learn the repair stations.'},
  {id:'pressure',at:90,label:'PRESSURE',message:'Faults arrive closer together. Oxygen and the uplink may need attention together.'},
  {id:'chaos',at:210,label:'CHAOS',message:'Overlapping incidents expected. Check life support and power deadlines before servicing the rover.'},
  {id:'final',at:360,label:'FINAL MINUTE',message:'Final inspection in 60 seconds. Expect new faults; restore every system before handover.'},
].map(stage=>Object.freeze(stage)));

// Nonintersecting windows preserve event order. Different systems share response
// windows, but repeat incidents never replace an outstanding diagnosis.
const SLOTS=Object.freeze([
  ['power',45,55],
  ['oxygen',105,115],['communications',128,138],['rover',180,190],
  ['cooling',220,226],['power',238,244],['oxygen',282,288],
  ['communications',300,306],['rover',330,336],
  ['power',362,366],['cooling',372,376],['oxygen',382,386],['communications',392,396],
].map(slot=>Object.freeze(slot)));

export function createDifficultyPlan(seed){
  const timing=seededRandom(seed,'difficulty-timing-v6'),counts={};let previousCircuit=null;
  const events=SLOTS.map(([system,minimum,maximum])=>{
    const index=counts[system]=(counts[system]??0)+1;
    const at=minimum+Math.floor(timing()*(maximum-minimum+1));
    const random=seededRandom(seed,`difficulty-diagnostics-v6/${system}/${index}`);
    const event={id:`${system}-${index}`,system,at};
    if(system==='power'){event.circuit=createPowerCircuit(random,previousCircuit);previousCircuit=event.circuit;}
    if(system==='oxygen'){const intake=40+Math.floor(random()*5)*5;event.regulator=Object.freeze({intake,returnFlow:100-intake});}
    if(system==='cooling'){
      const hotValve=Math.floor(random()*3);
      event.coolant=Object.freeze({hotValve,pressures:Object.freeze([4,6,5].map((value,i)=>i===hotValve?12:value)),phase:random()});
    }
    if(system==='communications'){
      const frequency=2+Math.floor(random()*7);let phase=2+Math.floor(random()*7);
      if(frequency===4&&phase===4)phase=5;
      event.carrier=Object.freeze({frequency,phase});
    }
    if(system==='rover'){
      const wheel=Math.floor(random()*6);
      event.drive=Object.freeze({wheel,currents:Object.freeze(Array.from({length:6},(_,i)=>i===wheel?12:3+Math.floor(random()*4)))});
    }
    return Object.freeze(event);
  });
  return Object.freeze({version:6,seed,stages:DIFFICULTY_STAGES,events:Object.freeze(events)});
}
