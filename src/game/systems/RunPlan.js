import {normalizeRunSeed,seededRandom} from './SeededRandom.js';
import {createPowerCircuit} from './PowerCircuit.js';
import {createDifficultyPlan} from './DifficultyPlan.js';
import {createVariantPlan} from './RepairVariants.js';
export const LATEST_PLAN_VERSION=8;

const WINDOWS=Object.freeze([[40,60],[135,165],[245,275],[340,355]]);

/** Generate everything before play; input, frame rate and cancellation consume no RNG. */
export function createRunPlan(seed,{version=7}={}) {
  if(![1,2,3,4,5,6,7,8].includes(version))throw new Error('Invalid plan version');
  const canonical=normalizeRunSeed(seed);if(!canonical)throw new Error('Invalid run seed');
  if(version===8)return createVariantPlan(canonical);
  if(version===6)return createDifficultyPlan(canonical);
  if(version===7)return Object.freeze({...createDifficultyPlan(canonical),version:7,dependenciesEnabled:true});
  const timing=seededRandom(canonical,'power-timing-v1');let previous=null;
  const events=WINDOWS.map(([minimum,maximum],index)=>{
    const at=minimum+Math.floor(timing()*(maximum-minimum+1));
    if(version>=4&&index===3){
      const carrier=seededRandom(canonical,`communications-carrier-v4/${index}`),frequency=2+Math.floor(carrier()*7);let phase=2+Math.floor(carrier()*7);
      if(frequency===4&&phase===4)phase=5;
      return Object.freeze({id:'communications-1',system:'communications',at,carrier:Object.freeze({frequency,phase})});
    }
    if(version>=2&&index%2===1){
      const regulator=seededRandom(canonical,`oxygen-regulator-v2/${index}`),intake=40+Math.floor(regulator()*5)*5;
      return Object.freeze({id:`oxygen-${index+1}`,system:'oxygen',at,regulator:Object.freeze({intake,returnFlow:100-intake})});
    }
    if(version>=3&&index===2){
      const coolant=seededRandom(canonical,`cooling-loop-v3/${index}`),hotValve=Math.floor(coolant()*3);
      const pressures=Object.freeze([4,6,5].map((value,i)=>i===hotValve?12:value));
      return Object.freeze({id:'cooling-1',system:'cooling',at,coolant:Object.freeze({hotValve,pressures,phase:coolant()})});
    }
    const circuit=createPowerCircuit(seededRandom(canonical,`power-circuit-v1/${index}`),previous);
    previous=circuit;
    return Object.freeze({id:`power-${index+1}`,system:'power',at,circuit});
  });
  if(version===5){
    const random=seededRandom(canonical,'rover-drive-v5'),at=300+Math.floor(random()*6),wheel=Math.floor(random()*6);
    const currents=Object.freeze(Array.from({length:6},(_,i)=>i===wheel?12:3+Math.floor(random()*4)));
    events.push(Object.freeze({id:'rover-1',system:'rover',at,drive:Object.freeze({wheel,currents})}));
    events.sort((a,b)=>a.at-b.at);
  }
  return Object.freeze({version,seed:canonical,events:Object.freeze(events)});
}
