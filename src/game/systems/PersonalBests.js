import {SECRET_IDS} from '../secrets/EasterEggManager.js';
import {SCORE_VERSION} from './ScoreSystem.js';

export const BESTS_KEY=`moonbase-intern.results.v${SCORE_VERSION}`;
const achievements=Object.freeze({'first-handover':'Still employed','clean-handover':'No interruptions','all-secrets':'Curiosity department'});
const validNumber=value=>Number.isFinite(value)&&value>=0&&value<=1000000;
const empty=()=>({version:SCORE_VERSION,plans:{},secrets:[],achievements:[],recent:[]});

/** Bounded local records; denied or corrupt storage never blocks play. */
export class PersonalBests {
  constructor(getStorage=()=>globalThis.localStorage){this.getStorage=getStorage;this.available=true;this.data=this.read();}
  read(){
    try{
      const raw=this.getStorage()?.getItem(BESTS_KEY);if(!raw)return empty();
      const value=JSON.parse(raw);if(value?.version!==SCORE_VERSION)return empty();
      const result=empty();
      for(const [version,best] of Object.entries(value.plans??{}))if(/^[1-8]$/.test(version)&&['score','survival','integrity'].every(key=>validNumber(best?.[key]))){
        result.plans[version]={score:best.score,survival:Math.min(420,best.survival),integrity:Math.min(100,best.integrity)};
      }
      result.secrets=SECRET_IDS.filter(id=>Array.isArray(value.secrets)&&value.secrets.includes(id));
      result.achievements=Object.keys(achievements).filter(id=>Array.isArray(value.achievements)&&value.achievements.includes(id));
      result.recent=Array.isArray(value.recent)?value.recent.filter(entry=>typeof entry?.id==='string'&&entry.id.length<=80&&typeof entry.seed==='string'&&/^LUNA-[A-Z0-9-]{1,48}$/.test(entry.seed)&&Number.isInteger(entry.planVersion)&&entry.planVersion>=1&&entry.planVersion<=8&&validNumber(entry.score)).slice(-10):[];
      return result;
    }catch{this.available=false;return empty();}
  }
  record(report,id){
    if(this.data.recent.some(entry=>entry.id===id))return {best:this.data.plans[report.planVersion],isBest:false,unlocked:[],saved:this.available};
    const previous=this.data.plans[report.planVersion]??{score:0,survival:0,integrity:0},isBest=report.score>previous.score;
    const best={score:Math.max(previous.score,report.score),survival:Math.max(previous.survival,report.elapsed),integrity:Math.max(previous.integrity,report.integrity)};
    this.data.plans[report.planVersion]=best;
    this.data.secrets=SECRET_IDS.filter(secret=>this.data.secrets.includes(secret)||report.secrets.includes(secret));
    const earned=[];
    if(report.complete)earned.push('first-handover');
    if(report.complete&&Object.values(report.outage).every(seconds=>seconds===0))earned.push('clean-handover');
    if(this.data.secrets.length===SECRET_IDS.length)earned.push('all-secrets');
    const unlocked=earned.filter(achievement=>!this.data.achievements.includes(achievement));
    this.data.achievements=[...new Set([...this.data.achievements,...earned])];
    this.data.recent.push({id,seed:report.seed,planVersion:report.planVersion,score:report.score});this.data.recent=this.data.recent.slice(-10);
    try{this.getStorage().setItem(BESTS_KEY,JSON.stringify(this.data));this.available=true;}catch{this.available=false;}
    return {best,isBest,unlocked:unlocked.map(id=>achievements[id]),saved:this.available};
  }
}
