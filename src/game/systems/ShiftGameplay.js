import { ShiftSystem } from './ShiftSystem.js';
import {createRunPlan,LATEST_PLAN_VERSION} from './RunPlan.js';
import {createRunSeed,normalizeRunSeed} from './SeededRandom.js';
import {FailureSequence} from './FailureSequence.js';
import {sampleEnding} from './EndingChoreography.js';
import {EndingAudio} from './EndingAudio.js';
import {supervisorRemark} from '../dialogue/StationPersonality.js';
import {secretReport,SECRET_IDS} from '../secrets/EasterEggManager.js';
import {calculateScore,shareResult,performanceExplanation,scoreBreakdown} from './ScoreSystem.js';
import {PersonalBests} from './PersonalBests.js';

export function formatShiftTime(seconds){const value=Math.ceil(Math.max(0,seconds));return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;}
export const HANDOVER_REPORT_TIME=sampleEnding(null,0).duration;
export function reportTelemetry(report,shift){return {outcome:report.complete?'SUCCESS':'FAILED',time:formatShiftTime(report.elapsed),repairs:String(report.repairs),integrity:`${report.integrity}%`,rover:report.rover,uplink:report.communications,secrets:`${report.secrets.length} / ${SECRET_IDS.length}`,seed:report.seed,plan:`${report.planVersion} · SCORING ${report.version}`,faults:String(report.faults??shift.faultIndex),link:shift.linkLostElapsed>0?formatShiftTime(shift.linkLostElapsed):null,drive:shift.roverStalledElapsed>0?formatShiftTime(shift.roverStalledElapsed):null};}

/** Run HUD, safety deadline and a composed exterior ending; arrival is untouched. */
export class ShiftGameplay {
  constructor({scene,power,oxygen=null,cooling=null,communications=null,rover=null,player,camera,renderer,host,onFinish,onRetry,onTitle,reducedMotion=false,seed=null,planVersion=LATEST_PLAN_VERSION,getSecrets=()=>[],presentation=null}){
    this.presentation=presentation;
    Object.assign(this,{power,oxygen,cooling,communications,rover,player,camera,renderer,onFinish,onRetry,onTitle,reducedMotion,getSecrets});
    this.active=false;this.bannerTime=0;this.endingTime=0;
    this.endingAudio=new EndingAudio({getAudio:()=>this.presentation?.audio?.context??this.power.audio,
      getOutput:()=>this.presentation?.audio?.master,getNoise:()=>this.presentation?.audio?.noiseBuffer,
      getSample:key=>this.presentation?.audio?.sampleBuffers?.get(key)});
    this.bests=new PersonalBests();this.report=null;
    const destructionRoots=scene.children.filter(object=>!object.isLight&&!object.isPoints&&object.name!=='Lunar surface backdrop');
    this.failureSequence=new FailureSequence({scene,camera,renderer,reducedMotion,destructionRoots,labSurfaces:power.lighting?.surfaces});
    this.plan=createRunPlan(normalizeRunSeed(seed)??createRunSeed(),{version:planVersion});this.replayRequested=false;
    this.root=document.createElement('div');this.root.className='shift-ui';
    this.root.innerHTML=`<section class="shift-clock" hidden><span>SHIFT REMAINING</span><strong>07:00</strong><small>Keep station systems stable until handover.</small><span class="shift-stage" hidden></span></section>
      <section class="shift-dependencies" role="status" aria-live="polite" hidden></section>
      <section class="shift-banner" role="status" hidden><span class="mission-channel">HABITAT 07 / MISSION CONTROL</span><b></b><p></p></section>
      <section class="shift-lockdown" role="alert" hidden><span>EMERGENCY RESERVE EXHAUSTED</span><strong></strong><p>Restore power at Watt to stop the safety lockdown.</p></section>
      <section class="shift-end" hidden aria-label="Shift result"><div class="shift-end-shade"></div><div class="shift-end-fade"></div><div class="shift-ending-vignette"></div>
        <section class="shift-ending-caption" role="status" hidden><b></b><p></p></section>
        <div class="shift-ending-controls" hidden><button type="button" class="shift-ending-mute">[M] MUTE AUDIO</button><button type="button" class="shift-ending-skip" disabled>[SPACE] SKIP ENDING</button></div>
        <div class="shift-result" role="dialog" aria-modal="true" aria-labelledby="shift-result-title" hidden tabindex="-1">
          <span>LUNAR STATION 07 / MISSION REPORT</span><h2 id="shift-result-title"></h2><p class="shift-result-reason"></p>
          <div class="shift-report-grid"><div class="shift-report-assessment"><section class="shift-score" aria-label="Score"><small class="shift-score-label">SCORE</small><strong></strong><small class="shift-score-label">PERFORMANCE</small><span class="shift-rating"><b class="shift-rating-grade"></b><span class="shift-rating-name"></span></span><small class="shift-personal-best"></small></section><p class="shift-result-comment"></p></div>
          <dl class="shift-telemetry">${Object.entries({outcome:'Mission outcome',time:'Active time',repairs:'Repairs',integrity:'Station integrity',rover:'Rover',uplink:'Uplink',secrets:'Secrets',seed:'Seed',plan:'Plan',faults:'Faults triggered',link:'Link outage',drive:'Rover stopped'}).map(([id,label])=>`<div data-telemetry-row="${id}"><dt>${label}</dt><dd data-telemetry="${id}"></dd></div>`).join('')}</dl></div>
          <details class="shift-score-details"><summary>Score &amp; grade details</summary><p class="shift-grade-explanation"></p><dl class="shift-score-breakdown">${scoreBreakdown({score:0,parts:{}}).map(({id,label})=>`<div data-score-row="${id}"><dt>${label}</dt><dd data-score-part="${id}"></dd></div>`).join('')}</dl><p>Faults count triggered equipment incidents, not wrong repair attempts or difficulty changes.</p></details>
          <p class="shift-result-condition sr-only" aria-hidden="true"></p><p class="shift-result-stats sr-only" aria-hidden="true"></p><p class="shift-result-secrets"></p><p class="shift-result-seed sr-only" aria-hidden="true"></p>
          <p class="shift-result-achievements" role="status"></p>
          <div class="shift-result-actions"><button type="button" class="shift-retry">RETRY SHIFT</button><button type="button" class="shift-replay">REPLAY SEED</button><button type="button" class="shift-title">RETURN TO TITLE</button><button type="button" class="shift-copy">COPY RESULT</button></div>
          <p class="shift-copy-status" role="status" aria-live="polite"></p><textarea class="shift-copy-fallback" aria-label="Result text — select and copy" readonly hidden></textarea>
          <small>Retry begins in the habitat. Arrival will not replay.</small>
        </div></section>`;
    host.append(this.root);
    this.clock=this.root.querySelector('.shift-clock');this.banner=this.root.querySelector('.shift-banner');
    this.lockdown=this.root.querySelector('.shift-lockdown');this.end=this.root.querySelector('.shift-end');this.result=this.root.querySelector('.shift-result');
    this.endingCaption=this.root.querySelector('.shift-ending-caption');this.endingControls=this.root.querySelector('.shift-ending-controls');
    this.root.querySelector('.shift-ending-skip').addEventListener('click',()=>this.skipEnding());
    this.root.querySelector('.shift-ending-mute').addEventListener('click',()=>this.toggleEndingMute());
    this.model=new ShiftSystem(power.model,{oxygen:oxygen?.model,cooling:cooling?.model,communications:communications?.model,rover:rover?.model,events:this.plan.events,stages:this.plan.stages,dependenciesEnabled:this.plan.dependenciesEnabled,seed:this.plan.seed,onEvent:event=>this.onEvent(event)});
    this.root.querySelector('.shift-retry').addEventListener('click',onRetry);
    this.root.querySelector('.shift-replay').addEventListener('click',()=>{this.replayRequested=true;onRetry();});
    this.root.querySelector('.shift-title').addEventListener('click',onTitle);
    this.root.querySelector('.shift-copy').addEventListener('click',()=>this.copyResult());
    this.result.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.code!=='Tab')return;
      const buttons=[...this.result.querySelectorAll('button,summary,textarea')].filter(control=>!control.hidden),first=buttons[0],last=buttons.at(-1);
      if(event.shiftKey&&[first,this.result].includes(document.activeElement)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    window.addEventListener('blur',()=>this.stopOutcome());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stopOutcome();});
  }
  start(){return this.model.start();}
  setActive(active){this.active=!!active&&this.model.status==='running';this.render();}
  update(delta){
    if(!this.active)return;
    this.model.update(delta);
    this.bannerTime=Math.max(0,this.bannerTime-delta);
    this.render();
  }
  render(){
    this.clock.hidden=!this.active;
    const time=this.clock.querySelector('strong'),timeText=formatShiftTime(this.model.remaining);
    if(time.textContent!==timeText)time.textContent=timeText;
    this.clock.dataset.urgent=String(this.model.remaining<=60);
    const stage=this.clock.querySelector('.shift-stage');stage.hidden=!this.model.difficultyStage;
    const stageText=this.model.difficultyStage?.label??'';if(stage.textContent!==stageText)stage.textContent=stageText;
    const dependencies=this.root.querySelector('.shift-dependencies'),messages=[];
    if(this.model.dependenciesEnabled){
      if(this.cooling?.model.needsRepair&&!this.cooling.model.powerAvailable)messages.push('BLACKOUT → COOLING: heating 50% faster. Restore Watt before engaging the pump.');
      if(this.communications?.model.needsRepair&&!this.communications.model.powerAvailable)messages.push('BLACKOUT → UPLINK: tuning retained. Restore Watt before confirming the handshake.');
      if(this.power.model.needsRepair&&this.power.model.oxygenPumpLoad)messages.push('OXYGEN PRIME → POWER: backup supply drains 50% faster while priming.');
    }
    const dependencyText=messages.join('\n');
    if(dependencies.textContent!==dependencyText)dependencies.textContent=dependencyText;
    dependencies.hidden=!this.active||messages.length===0;
    this.banner.hidden=!this.active||this.bannerTime===0;
    this.banner.dataset.departing=String(this.bannerTime>0&&this.bannerTime<=.3&&!this.reducedMotion);
    const remaining=this.model.lockdownRemaining;
    this.lockdown.hidden=!this.active||remaining===null||!!this.presentation;
    if(remaining!==null)this.lockdown.querySelector('strong').textContent=`SAFETY LOCKDOWN IN ${Math.ceil(remaining)}s`;
  }
  onEvent(event){
    this.presentation?.collect('shift',event);
    if(event.type==='shift-stage'&&event.stage.id!=='final'){
      this.banner.dataset.phase=event.stage.id;
      this.bannerTime=5;this.banner.querySelector('b').textContent=`DIFFICULTY / ${event.stage.label}`;
      this.banner.querySelector('p').textContent=event.stage.message;
    }
    if(event.type==='shift-start'||event.type==='shift-final-minute'){
      this.bannerTime=event.type==='shift-start'?7:5;
      this.banner.dataset.phase=event.type==='shift-start'?'initiation':'handover';
      this.banner.querySelector('b').textContent=event.type==='shift-start'?'SHIFT INITIATED':'HANDOVER / 60 SECONDS';
      this.banner.querySelector('p').textContent=event.type==='shift-start'?'Maintain station integrity until handover.':this.model.difficultyStage?.message??'Stabilize life support. Verify Scout and the uplink.';
    }
    if(event.type==='shift-failed'||event.type==='shift-complete')this.finish(event.type==='shift-failed');
  }
  finish(failed){
    this.presentation?.terminate();
    this.savedExposure=this.renderer.toneMappingExposure;this.savedFov=this.camera.fov;
    this.endingTime=0;this.active=false;this.render();
    this.power.setActive(false);this.oxygen?.setActive(false);this.cooling?.setActive(false);this.communications?.setActive(false);this.rover?.setActive(false);this.player.inputEnabled=false;this.player.clearInput();
    this.end.hidden=false;this.end.dataset.outcome=failed?'failed':'complete';this.end.dataset.report='false';this.result.hidden=true;
    this.result.querySelector('h2').textContent=failed?'SHIFT TERMINATED':'SHIFT COMPLETE';
    this.result.querySelector('.shift-result-reason').textContent=failed
      ? this.model.failureReason==='communications-unresolved'?'Orbital handover failed. Relay’s station link was not restored before the shift deadline.':this.model.failureReason==='rover-unresolved'?'Survey handover failed. The rover drive was not recovered before the shift deadline.':this.model.failureReason==='cooling-overheated'?'Lab thermal cascade breached containment and destroyed the habitat.':this.model.failureReason==='oxygen-depleted'?'Atmosphere circulation reserve exhausted. You did not restore the regulator in time.':this.model.failureReason==='power-lockdown'?'Lab power remained offline. Automatic safety lockdown ended your shift.':'Handover failed: a station system was still unstable at the deadline.'
      :'Station systems stable. Habitat secure. You are still employed.';
    this.result.querySelector('.shift-result-comment').textContent=`SUPERVISOR / ${supervisorRemark(failed?this.model.failureReason:null)}`;
    this.result.querySelector('.shift-result-stats').textContent=`ACTIVE TIME ${formatShiftTime(this.model.elapsed)}   /   REPAIRS ${this.model.repairs}   /   FAULTS ${this.model.faultIndex}`;
    if(this.model.linkLostElapsed>0)this.result.querySelector('.shift-result-stats').textContent+=`   /   LINK OUTAGE ${formatShiftTime(this.model.linkLostElapsed)}`;
    if(this.model.roverStalledElapsed>0)this.result.querySelector('.shift-result-stats').textContent+=`   /   ROVER STOPPED ${formatShiftTime(this.model.roverStalledElapsed)}`;
    this.result.querySelector('.shift-result-seed').textContent=`RUN SEED / ${this.plan.seed} · PLAN ${this.plan.version}`;
    this.result.querySelector('.shift-result-secrets').textContent=secretReport(this.getSecrets());
    this.renderScore();
    this.failureSequence.start(failed?this.model.failureReason:null);
    this.renderEnding();this.onFinish();document.exitPointerLock();
    this.endingAudio.sync(this.failureSequence.pose,0,{muted:this.power.alarmMuted,reducedMotion:this.reducedMotion});
  }
  renderScore(){
    this.report=calculateScore({shift:this.model,systems:{power:this.power.model,oxygen:this.oxygen?.model,cooling:this.cooling?.model,communications:this.communications?.model,rover:this.rover?.model},plan:this.plan,secrets:this.getSecrets()});
    const record=this.bests.record(this.report,globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`),score=this.result.querySelector('.shift-score');
    score.querySelector('strong').textContent=this.report.score.toLocaleString('en-US');
    score.querySelector('.shift-rating-grade').textContent=this.report.grade;
    score.querySelector('.shift-rating-name').textContent=`— ${this.report.rating}`;
    const details=this.result.querySelector('.shift-score-details');details.open=false;
    details.querySelector('.shift-grade-explanation').textContent=performanceExplanation(this.report);
    for(const {id,points} of scoreBreakdown(this.report)){
      details.querySelector(`[data-score-row="${id}"]`).hidden=id==='floor'&&points===0;
      details.querySelector(`[data-score-part="${id}"]`).textContent=`${points>0&&id!=='total'?'+':''}${points.toLocaleString('en-US')}`;
    }
    score.querySelector('.shift-personal-best').textContent=`${record.isBest?'NEW PERSONAL BEST':'PERSONAL BEST'} / ${record.best.score.toLocaleString('en-US')}${record.saved?'':' · available this visit only'}`;
    for(const [id,value] of Object.entries(reportTelemetry(this.report,this.model))){
      this.result.querySelector(`[data-telemetry-row="${id}"]`).hidden=value===null;
      this.result.querySelector(`[data-telemetry="${id}"]`).textContent=value??'';
    }
    this.result.querySelector('.shift-result-condition').textContent=`STATION INTEGRITY ${this.report.integrity}% / ROVER ${this.report.rover} / UPLINK ${this.report.communications}`;
    this.result.querySelector('.shift-result-achievements').textContent=record.unlocked.length?`UNLOCKED / ${record.unlocked.join(' · ')}`:'';
    this.result.querySelector('.shift-copy-status').textContent='';this.result.querySelector('.shift-copy-fallback').hidden=true;
  }
  async copyResult(){
    const report=this.report;if(!report||this.result.hidden)return;
    const text=shareResult(report),status=this.result.querySelector('.shift-copy-status');
    try{
      if(!globalThis.navigator?.clipboard?.writeText)throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);if(this.report!==report)return;
      status.textContent='Result copied. Share it with your next replacement.';
      this.result.querySelector('.shift-copy-fallback').hidden=true;
    }catch{
      if(this.report!==report)return;
      const fallback=this.result.querySelector('.shift-copy-fallback');fallback.value=text;fallback.hidden=false;fallback.focus();fallback.select();
      status.textContent='Select the report and press Ctrl+C (Command+C on Mac).';
    }
  }
  updateEnding(delta){
    if(!this.model.terminal||!this.result.hidden||document.hidden||!document.hasFocus()||!Number.isFinite(delta)||delta<0)return;
    const pose=this.failureSequence.update(delta);if(!pose)return;
    this.endingTime=this.failureSequence.elapsed;
    this.endingAudio.sync(pose,this.endingTime,{muted:this.power.alarmMuted,reducedMotion:this.reducedMotion});
    this.renderEnding();
  }
  renderEnding(){
    const pose=this.failureSequence.pose;
    this.end.dataset.ending=pose.kind;this.end.dataset.report=String(pose.reportReady);
    this.root.querySelector('.shift-end-fade').style.opacity=pose.fade;
    this.root.querySelector('.shift-ending-vignette').style.opacity=pose.vignette;
    this.endingCaption.hidden=pose.reportReady||!pose.captionVisible;
    this.endingCaption.style.opacity=pose.captionOpacity;
    this.endingCaption.querySelector('b').textContent=pose.title;this.endingCaption.querySelector('p').textContent=pose.caption;
    this.endingControls.hidden=pose.reportReady;this.root.querySelector('.shift-ending-skip').disabled=!pose.canSkip;
    this.root.querySelector('.shift-ending-mute').textContent=this.power.alarmMuted?'[M] UNMUTE AUDIO':'[M] MUTE AUDIO';
    if(pose.reportReady){this.stopOutcome();if(this.result.hidden){this.result.hidden=false;this.root.querySelector('.shift-retry').focus();}}
  }
  skipEnding(){
    if(document.hidden||!document.hasFocus()||!this.model.terminal||!this.result.hidden||!this.failureSequence.skip())return false;
    this.endingTime=this.failureSequence.elapsed;this.stopOutcome();this.renderEnding();return true;
  }
  toggleEndingMute(){this.power.toggleAlarm();if(this.power.alarmMuted)this.stopOutcome();else this.updateEnding(0);this.renderEnding();}
  handleEndingKey(event){
    if(!this.model.terminal||event.ctrlKey||event.altKey||event.metaKey)return false;
    if(['Space','KeyM'].includes(event.code)){event.preventDefault();if(!event.repeat){if(event.code==='Space'&&this.result.hidden)this.skipEnding();if(event.code==='KeyM')this.toggleEndingMute();}return true;}
    return false;
  }
  get outcomeNodes(){return this.endingAudio.nodes;}
  stopOutcome(){this.endingAudio.stop();}
  resetEnding(){
    this.stopOutcome();this.failureSequence.reset();this.endingCaption.hidden=true;this.endingControls.hidden=true;
    this.root.querySelector('.shift-ending-vignette').style.opacity=0;delete this.end.dataset.ending;delete this.end.dataset.report;
  }
  reset({preserveSeed=false}={}){
    this.report=null;this.result.querySelector('.shift-copy-fallback').hidden=true;
    this.resetEnding();
    this.presentation?.reset();
    if(this.savedExposure!==undefined){this.renderer.toneMappingExposure=this.savedExposure;this.camera.fov=this.savedFov;this.camera.updateProjectionMatrix();this.savedExposure=undefined;}
    this.end.hidden=true;this.result.hidden=true;this.root.querySelector('.shift-end-fade').style.opacity=0;
    if(!preserveSeed&&!this.replayRequested)this.plan=createRunPlan(createRunSeed(this.plan.seed),{version:this.plan.version});
    this.replayRequested=false;
    this.model.reset();this.model.setPlan(this.plan);this.active=false;this.bannerTime=0;this.player.inputEnabled=true;this.render();
  }
}
