import * as THREE from 'three';
import {TrainingSession,TRAINING_MODULES} from './TrainingSession.js';

const HUD_LESSONS={
  timer:['.training-step','A real shift lasts 07:00. At 00:00, every system must be repaired. Its stages progress from orientation to pressure, chaos and the final minute, with more overlapping faults. Training has no deadline.'],
  reserve:['.warning-board','Reserves and temperature show consequences of delay. In training reserves are protected. In a shift oxygen depletion, containment failure or prolonged blackout ends the run.'],
  priority:['.warning-board','Read the leading warning and its action. Amber marks a fault, red marks critical life support, and neutral confirmation text acknowledges recovery. Blackout can require repairing Watt before cooling or uplink verification. Rover and uplink still matter at handover.'],
  score:['.training-status','The end report rewards repairs and station integrity. Link outage and rover stall cost points. Records and seeds belong to real shifts; practice writes none.'],
};
const compactInstructions=[
  'Keep the habitat stable until handover. Practice has no deadline or score.',
  'Walk, look and sprint. At Watt, press E to open service, then Backspace to leave.',
  'Press 1–4 to learn the timer, reserves, priorities and score.',
  'At Watt: isolate the tripped feed, match backup voltage, then Enter. Wait for each interlock.',
  'At Capsule: match both flow targets, then hold E for two seconds.',
  'At Patch: vent the highest-pressure loop (1–3), then Space in the timing window.',
  'At Watt: A/D tunes frequency; W/S improves phase. At 100%, press E once.',
  'At Scout: select the 12 A wheel (1–6), then hold E for three seconds.',
  'Restore Watt before running Patch’s pump. Both repairs are required.',
  'Repair Capsule, then Watt and Relay. There is no failure deadline.',
];

/** The same habitat, controllers and repair panels, with a separate learning overlay. */
export class TrainingGuide {
  constructor({host,player,controllers,resetSystems,onScenario,onExit,onRealShift,onPause,onResume,isPaused=()=>!player.locked}){
    Object.assign(this,{host,player,controllers,onExit,onRealShift,onPause,onResume,isPaused});
    this.session=new TrainingSession({systems:Object.fromEntries(Object.entries(controllers).map(([id,c])=>[id,c.model])),resetSystems,onModule:onScenario});
    this.root=document.createElement('section');this.root.className='training-guide';this.root.hidden=true;this.root.setAttribute('aria-label','Interactive station training');
    this.root.innerHTML=`<div class="training-heading" aria-hidden="true"><span>SAFE PRACTICE · NO SCORE</span><b></b><small>F1 controls / N next / H hint</small></div>
      <span class="training-announcement sr-only" role="status"></span><aside class="training-card" tabindex="-1"><span class="training-step"></span><h2></h2><p class="training-overview"></p><p class="training-route" aria-live="off"></p><p class="training-status" aria-live="off"></p><p class="training-hint" aria-live="polite" hidden></p>
      <div class="training-hud-lessons" hidden>${Object.entries(HUD_LESSONS).map(([id],i)=>`<button type="button" data-training-hud="${id}">${i+1}. ${id}</button>`).join('')}</div>
      <div class="training-quick"><button type="button" data-training="next">[N] Next</button><button type="button" data-training="hint">[H] Hint</button><button type="button" data-training="variant" hidden>[V] Another fault</button><button type="button" data-training="controls" aria-expanded="false">[F1] Controls</button></div>
      <details class="training-menu"><summary>Instructions & controls</summary><p class="training-instruction"></p><div class="training-actions"><button type="button" data-training="resume">RESUME PRACTICE</button><button type="button" data-training="previous">PREVIOUS</button><button type="button" data-training="next">NEXT [N]</button><button type="button" data-training="hint">HINT [H]</button><button type="button" data-training="repeat">REPEAT MODULE</button><button type="button" data-training="skip">SKIP MODULE</button><button type="button" data-training="restart">RESTART TRAINING</button><button type="button" data-training="real">SKIP TRAINING & START SHIFT</button><button type="button" data-training="exit">MAIN MENU</button></div></details>
      <div class="training-completion" hidden><button type="button" data-training="real">START REAL SHIFT</button><button type="button" data-training="replay">REPLAY TRAINING</button><button type="button" data-training="exit">MAIN MENU</button></div></aside>`;
    host.append(this.root);this.card=this.root.querySelector('.training-card');this.worldPoint=new THREE.Vector3();this.box=new THREE.Box3();this.targetDirection=new THREE.Vector3();
    for(const button of this.root.querySelectorAll('[data-training]'))button.addEventListener('click',()=>this.action(button.dataset.training));
    for(const button of this.root.querySelectorAll('[data-training-hud]'))button.addEventListener('click',()=>this.inspectHud(button.dataset.trainingHud));
    this.menu=this.root.querySelector('.training-menu');
    this.menu.addEventListener('toggle',()=>this.root.querySelector('[data-training="controls"]').setAttribute('aria-expanded',String(this.menu.open)));
    this.root.addEventListener('keydown',event=>{if(!this.player.locked&&event.code==='Tab'){const buttons=[...this.root.querySelectorAll('button,summary')].filter(b=>!b.disabled&&b.getClientRects().length),first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&[first,this.card].includes(document.activeElement)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
  }
  get active(){return this.session.active;}
  get shiftContext(){return this.session.shiftContext;}
  pose(){return {x:this.player.position.x,z:this.player.position.z,yaw:this.player.yaw,pitch:this.player.pitch,sprinting:this.player.keys.has('ShiftLeft')||this.player.keys.has('ShiftRight')};}
  start(){this.clearHighlight();this.session.start(this.pose());this.host.classList.add('training-active');this.root.hidden=false;this.render();}
  finish(real=false){this.clearHighlight();this.session.stop();this.host.classList.remove('training-active');this.root.hidden=true;(real?this.onRealShift:this.onExit)();}
  inspectHud(id){if(!this.session.inspectHud(id))return;this.clearHighlight();const [selector,text]=HUD_LESSONS[id];this.highlight=this.host.querySelector(selector);this.highlight?.classList.add('training-highlight');this.root.querySelector('.training-hint').textContent=text;this.root.querySelector('.training-hint').hidden=false;this.render();}
  clearHighlight(){this.highlight?.classList.remove('training-highlight');this.highlight=null;}
  action(id){
    if(!this.active)return;
    if(id==='exit'||id==='real')return this.finish(id==='real');
    if(id==='controls'){if(this.player.locked||!this.isPaused())this.onPause();else this.menu.open=!this.menu.open;return;}
    if(id==='resume')return this.onResume();
    if(id==='hint'){const hint=this.root.querySelector('.training-hint');hint.textContent=this.session.practiceDiagnostic?.instruction??this.session.module?.hint??'Training complete. Try a real shift or replay any lesson.';hint.hidden=!hint.hidden;return;}
    this.clearHighlight();this.root.querySelector('.training-hint').hidden=true;
    if(id==='next'||id==='skip')this.session.next(this.pose(),{skip:id==='skip'});
    if(id==='previous')this.session.enter(this.session.index-1,this.pose());
    if(id==='repeat')this.session.enter(this.session.index,this.pose());
    if(id==='variant')this.session.cycleVariant(this.pose());
    if(id==='restart'||id==='replay')this.session.start(this.pose());
    if(this.session.finished&&id==='next')this.onPause();
    this.render();
  }
  handleKey(event){
    if(!this.active||event.ctrlKey||event.altKey||event.metaKey||event.repeat)return false;
    if(event.code==='F1'){event.preventDefault();this.player.locked||!this.isPaused()?this.onPause():this.onResume();return true;}
    const repairOpen=Object.values(this.controllers).some(c=>c.repairOpen);
    if(!repairOpen&&event.code==='KeyN'){event.preventDefault();this.action('next');return true;}
    if(!repairOpen&&event.code==='KeyV'&&this.session.variantSystem){event.preventDefault();this.action('variant');return true;}
    if(event.code==='KeyH'){event.preventDefault();this.action('hint');return true;}
    if(!repairOpen&&this.session.index===2&&/^Digit[1-4]$/.test(event.code)){event.preventDefault();this.inspectHud(Object.keys(HUD_LESSONS)[Number(event.code.slice(-1))-1]);return true;}
    return false;
  }
  update(delta){if(!this.active)return;this.session.update(delta,this.pose(),{powerOpen:this.controllers.power.repairOpen});}
  target(){
    const s=this.session,i=s.index;
    const id=[1,2,3,6].includes(i)?'power':i===4?'oxygen':i===5?'cooling':i===7?'rover':i===8?s.systems.power.needsRepair?'power':'cooling':i===9?s.practiceStage===0?'oxygen':s.systems.power.needsRepair?'power':'communications':null;
    if(!id||s.ready)return null;
    return {id,object:this.controllers[id].manager.targets.values().next().value.object};
  }
  routeText(){
    if(Object.values(this.controllers).some(c=>c.repairOpen))return 'Service panel open. Backspace leaves service; the panel explains each repair step.';
    const target=this.target();if(!target)return this.session.index===2?'Read each HUD lesson: press 1–4.':'';
    target.object.updateWorldMatrix(true,true);this.box.setFromObject(target.object);this.box.getCenter(this.worldPoint);
    this.targetDirection.copy(this.worldPoint).sub(this.player.position);
    const distance=Math.hypot(this.targetDirection.x,this.targetDirection.z),bearing=Math.atan2(-this.targetDirection.x,-this.targetDirection.z)-this.player.yaw,angle=Math.atan2(Math.sin(bearing),Math.cos(bearing));
    const direction=Math.abs(angle)<.3?'Ahead':Math.abs(angle)>2.6?'Behind you':angle>0?'Turn left':'Turn right';
    const name={power:'Watt · east side',oxygen:'Capsule · west side',cooling:'Patch · inside the lab',communications:'Relay · at Watt',rover:'Scout · survey rover'}[target.id];
    if(target.id==='cooling'&&this.player.position.z>-15)return `${name}. Reach the sliding lab door at the back, left of centre; then approach the cockpit.`;
    return `${direction} → ${name} · ${Math.round(distance)} m to equipment centre. Aim at its surface and press E when the service prompt appears.`;
  }
  render(delta=Infinity){
    const s=this.session;if(!this.active)return;
    this.uiElapsed=(this.uiElapsed??0)+delta;if(this.uiElapsed<.1)return;this.uiElapsed=0;
    const text=(selector,value)=>{const node=this.root.querySelector(selector);if(node.textContent!==value)node.textContent=value;};
    const repairOpen=Object.values(this.controllers).some(c=>c.repairOpen),paused=this.isPaused(),cursorPaused=paused&&!this.player.locked;this.root.dataset.repair=String(repairOpen);this.root.dataset.paused=String(cursorPaused);
    if(cursorPaused!==this.wasCursorPaused)this.menu.open=cursorPaused;
    text('.training-heading b',s.finished?'TRAINING COMPLETE':`${s.index+1} / ${TRAINING_MODULES.length} · ${s.module.title}`);
    text('.training-step',s.finished?'READY FOR YOUR FIRST SHIFT':`${String(s.index+1).padStart(2,'0')} / ${TRAINING_MODULES.length} · SAFE PRACTICE`);
    text('h2',s.finished?'Practice complete':s.module.title);
    text('.training-overview',s.finished?`Completed ${s.completed.size} lessons; skipped ${s.skipped.size}. Choose a real shift or replay training.`:s.practiceDiagnostic?`${s.practiceDiagnostic.label} / ${s.practiceDiagnostic.instruction}`:s.variantSystem?`${compactInstructions[s.index]} V tries another fault type.`:compactInstructions[s.index]);
    text('.training-instruction',s.finished?`Completed ${s.completed.size} lessons; skipped ${s.skipped.size}. A real shift has draining reserves and overlapping seeded faults. Pause whenever you need to check the controls.`:s.practiceDiagnostic?.instruction??s.module.text);
    const route=this.routeText(),node=this.root.querySelector('.training-route');if(node.textContent!==route)node.textContent=route;
    const status=s.finished?'No score or personal record was changed. Choose a real shift, replay training or return to the menu.':paused?this.player.locked?'PHOTO PAUSED · P resumes; F1 opens training controls.':'PRACTICE PAUSED · Click Resume to move and look.':s.ready?'OBJECTIVE COMPLETE · Press N for the next lesson.':s.index===1?`Walk ${Math.min(3,s.progress.distance).toFixed(1)}/3 m · look ${s.progress.look>=.5?'✓':'…'} · sprint ${s.progress.sprint>=1?'✓':'…'} · open/close ${s.progress.closed?'✓':'…'}`:'Take your time. F1 pauses for training controls; H shows a hint.';
    const statusNode=this.root.querySelector('.training-status');if(statusNode.textContent!==status)statusNode.textContent=status;
    this.root.querySelector('.training-hud-lessons').hidden=s.index!==2;
    this.root.querySelector('[data-training="variant"]').hidden=!s.variantSystem;
    for(const button of this.root.querySelectorAll('[data-training-hud]'))button.setAttribute('aria-pressed',String(s.hudLessons.has(button.dataset.trainingHud)));
    this.root.querySelector('.training-actions').hidden=s.finished;this.root.querySelector('.training-completion').hidden=!s.finished;
    this.menu.hidden=s.finished;this.root.querySelector('.training-quick').hidden=s.finished;
    for(const button of this.root.querySelectorAll('[data-training="next"]'))button.disabled=!s.ready;
    this.root.querySelector('[data-training="previous"]').disabled=s.index===0;
    this.root.querySelector('[data-training="resume"]').hidden=!paused;
    const announcement=`${s.index}/${s.ready}/${paused?this.player.locked?'photo':'menu':'active'}`;
    if(announcement!==this.announced){this.announced=announcement;text('.training-announcement',`${s.finished?'Training complete.':s.module.title+'.'} ${paused?this.player.locked?'Photo paused. P resumes; F1 opens training controls.':'Practice paused.':s.ready?'Objective complete. Press N to continue.':'Practice active.'}`);}
    if(cursorPaused&&(!this.wasCursorPaused||s.finished!==this.wasFinished))this.root.querySelector(s.finished?'.training-completion [data-training="real"]':'[data-training="resume"]').focus();
    this.wasCursorPaused=cursorPaused;this.wasFinished=s.finished;
  }
  dispose(){this.clearHighlight();if(this.active)this.session.stop();this.root.remove();}
}
