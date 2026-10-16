import { urgentContext } from '../dialogue/StationPersonality.js';

const priorities = Object.freeze({id:'priorities',name:'Priorities',description:'You chose the cactus. The cactus chose to document it.'});
const archive = Object.freeze({id:'archive-4173',name:'Legacy Channel',description:'An old preview port still answers on the Moon.'});
const sky = Object.freeze({id:'touch-grass',name:'Touch Grass',description:'Unfortunately, there is none.'});
export const SECRET_IDS=Object.freeze([priorities.id,archive.id,sky.id]);
export const DISCOVERY_RETURN_SECONDS=12;
export const CACTUS_VISITS=5;
const cactusHints = [
  'A second visit? My visitor ledger counts returns, not standing here. Take a lap; I will remember.',
  'Three visits logged. There are life-support systems here, yet you keep interviewing the plant.',
  'Four visits logged. Come back once more and I am putting your priorities in writing.'
];

/** Hints are authored evidence, not extra discoveries or seeded repair entropy. */
export function discoveryClue(id,encounter=0){
  if(id==='cactus')return 'I keep a visitor ledger. Come back after your rounds; lingering does not count twice.';
  if(id==='console')return encounter===0
    ? 'An old four-digit archive still answers here. Its label has two halves; ask me again after your rounds.'
    :encounter===1 ? 'The archive label begins with 41. Come back for the other half.'
    :'The archive label reads 41 / 73, left to right. Type its four digits while looking at me.';
  if(['tortoise','astronaut','dish','sky'].includes(id))return encounter===0
    ? 'The station logs open-sky observations. Look beyond the glass when duty gives you a moment.'
    :'Twenty seconds of clear sky, in your own time. Duty can interrupt; the station keeps what you logged.';
  return null;
}

/** Run-local discoveries, separate from seeded faults and repair metrics. */
export class EasterEggManager {
  constructor(){this.reset();}
  reset(){this.cactusVisits=0;this.discoveries=[];}
  get found(){return this.discoveries.map(secret=>({...secret}));}
  has(id){return this.discoveries.some(secret=>secret.id===id);}
  canVisit(context){return context?.shift?.status==='running'&&!urgentContext(context);}
  canReveal(context){return this.canVisit(context)&&!Object.values(context.systems??{}).some(system=>system?.needsRepair);}
  cactusLine(context){
    // Introductions and live fault advice keep priority over secret hints.
    if(!this.canReveal(context)||this.cactusVisits===0||this.has(priorities.id))return null;
    if(this.cactusVisits>=4)return 'SECRET FOUND / PRIORITIES. You chose the cactus. I have issued you an honorary spine. It comes with no salary.';
    return cactusHints[this.cactusVisits-1];
  }
  recordCactus(context){
    if(!this.canVisit(context))return false;
    const reveal=this.cactusVisits>=4&&this.canReveal(context)&&!this.has(priorities.id);
    this.cactusVisits=Math.min(CACTUS_VISITS,this.cactusVisits+1);
    if(reveal)this.discoveries.push(priorities);
    return reveal;
  }
  recordConsole(context){
    if(!this.canReveal(context)||this.has(archive.id))return false;
    this.discoveries.push(archive);return true;
  }
  recordSky(context){
    if(!this.canReveal(context)||this.has(sky.id))return false;
    this.discoveries.push(sky);return true;
  }
}

export function secretReport(secrets){
  return `SECRETS FOUND / ${secrets.length}${secrets.length?` · ${secrets.map(secret=>secret.name).join(', ')}`:''}`;
}
