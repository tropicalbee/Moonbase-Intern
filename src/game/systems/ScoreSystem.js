import {SCORE_RATING_NAMES} from '../dialogue/StationPersonality.js';
import {SECRET_IDS} from '../secrets/EasterEggManager.js';

export const SCORE_VERSION=2;
export const GRADE_VERSION=1;
const GRADE_WEIGHTS=Object.freeze({survival:.4,repairs:.4,score:.2});
const bounded=(value,max=Number.MAX_SAFE_INTEGER)=>Number.isFinite(value)?Math.max(0,Math.min(max,value)):0;
const healthy=system=>!!system&&!system.needsRepair;

/** Terminal snapshots only; no live mutations or invented repair metrics. */
export function calculateScore({shift,systems,plan,secrets=[]}){
  if(!['failed','complete'].includes(shift?.status))throw new Error('Scores require a finished shift');
  const duration=bounded(shift.duration)||420,elapsed=bounded(shift.elapsed,duration),repairs=Math.floor(bounded(shift.repairs,plan.events.length));
  const discovered=[...new Set(secrets.map(secret=>secret.id).filter(id=>SECRET_IDS.includes(id)))];
  const lifeSupport=[
    systems.power?(healthy(systems.power)?1:bounded(systems.power.health,60)/60):null,
    systems.oxygen?(healthy(systems.oxygen)?1:bounded(systems.oxygen.reserve,90)/90):null,
    systems.cooling?(healthy(systems.cooling)?1:bounded(110-systems.cooling.temperature,40)/40):null,
  ].filter(value=>value!==null);
  const integrity=shift.failureReason==='cooling-overheated'?0:Math.round(100*lifeSupport.reduce((sum,value)=>sum+value,0)/Math.max(1,lifeSupport.length));
  const unresolved=Object.values(systems).filter(system=>system?.needsRepair).length;
  const outage={power:bounded(shift.blackoutTotalElapsed,elapsed),communications:bounded(shift.linkLostElapsed,elapsed),rover:bounded(shift.roverStalledElapsed,elapsed)};
  const complete=shift.status==='complete';
  const parts={survival:Math.floor(elapsed*10),repairs:repairs*500,handover:complete?5000:0,integrity:integrity*20,secrets:discovered.length*250,
    outages:-Math.round(outage.power*20+outage.communications*3+outage.rover*3),unresolved:-unresolved*750,
    termination:complete?0:shift.failureReason==='cooling-overheated'?-2500:-1500};
  const score=Math.max(0,Object.values(parts).reduce((sum,value)=>sum+value,0));
  const reference=duration*10+plan.events.length*500+5000+2000;
  const faults=Math.floor(bounded(shift.faultIndex??plan.events.length,plan.events.length));
  const survival=elapsed/duration,repairRate=faults?bounded(repairs/faults,1):complete?1:0,scoreRatio=bounded(score/reference,1);
  const value=survival*GRADE_WEIGHTS.survival+repairRate*GRADE_WEIGHTS.repairs+scoreRatio*GRADE_WEIGHTS.score;
  const earnedGrade=value>=.97?'S':value>=.85?'A':value>=.65?'B':value>=.45?'C':value>=.25?'D':'F';
  const grade=!complete&&['S','A'].includes(earnedGrade)?'B':earnedGrade;
  const performance=Object.freeze({version:GRADE_VERSION,value,survival,repairRate,scoreRatio,reference,weights:GRADE_WEIGHTS,maximumGrade:complete?'S':'B'});
  return Object.freeze({version:SCORE_VERSION,score,grade,rating:SCORE_RATING_NAMES[grade],integrity,elapsed,repairs,faults,complete,performance,
    rover:systems.rover?(systems.rover.status==='stalled'?'Immobilized':systems.rover.needsRepair?'Drive faulty':'Operational'):'Not scheduled',
    communications:systems.communications?(systems.communications.status==='lost'?'Offline':systems.communications.needsRepair?'Unverified':'Verified'):'Not scheduled',
    seed:plan.seed,planVersion:plan.version,secrets:Object.freeze(discovered),outage:Object.freeze(outage),parts:Object.freeze(parts)});
}

/** One explanation for the debrief and copied report; point scoring stays version 2. */
export function performanceExplanation(report){
  const p=report.performance;if(!p)return '';
  const percent=value=>`${Math.round(value*1000)/10}%`;
  return `Performance ${percent(p.value)}: survival ${percent(p.survival)} (40%), repairs ${report.repairs}/${report.faults} (40%), score ${report.score.toLocaleString('en-US')}/${p.reference.toLocaleString('en-US')} (20%). Grades: S ≥97%, A ≥85%, B ≥65%, C ≥45%, D ≥25%, F below 25%.${report.complete?'':' Failed shifts are capped at B; S and A require success.'}`;
}

export function scoreBreakdown(report){
  if(!report.parts)return [];
  const labels={survival:'Survival',repairs:'Completed repairs',handover:'Successful handover',integrity:'Station integrity',secrets:'Secrets',outages:'Outage penalties',unresolved:'Unresolved systems',termination:'Termination penalty'};
  const rows=Object.entries(labels).map(([id,label])=>({id,label,points:report.parts[id]??0}));
  const floor=report.score-rows.reduce((sum,row)=>sum+row.points,0);
  return [...rows,{id:'floor',label:'Minimum score adjustment',points:floor},{id:'total',label:'Total score',points:report.score}];
}

export function shareResult(report){
  const seconds=Math.ceil(report.elapsed),time=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  return ['MOONBASE INTERN',report.complete?'SHIFT COMPLETE':'SHIFT TERMINATED',`Score: ${report.score.toLocaleString('en-US')}`,
    `Rating: ${report.grade} — ${report.rating}`,`Active time: ${time}`,`Repairs: ${report.repairs}`,`Station integrity: ${report.integrity}%`,
    `Rover: ${report.rover}`,`Uplink: ${report.communications}`,`Secrets: ${report.secrets.length}/${SECRET_IDS.length}`,
    `Mission outcome: ${report.complete?'SUCCESS':'FAILED'}`,
    ...(report.performance?[`Performance: grading v${report.performance.version}`,performanceExplanation(report)]:[]),
    ...scoreBreakdown(report).filter(row=>row.id!=='floor'||row.points!==0).map(row=>`${row.label}: ${row.points>0&&row.id!=='total'?'+':''}${row.points.toLocaleString('en-US')}`),
    ...(Number.isFinite(report.faults)?[`Faults triggered: ${report.faults} (equipment incidents, not player mistakes)`]:[]),
    `Seed: ${report.seed}`,`Plan: ${report.planVersion} · Scoring: ${report.version}`].join('\n');
}
