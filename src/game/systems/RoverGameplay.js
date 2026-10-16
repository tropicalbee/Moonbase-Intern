import {RoverSystem} from './RoverSystem.js';
import {InteractionManager} from '../interactions/InteractionManager.js';

export class RoverGameplay {
  constructor({scene,camera,player,target,host,power,canRepair,onInputChange}){
    Object.assign(this,{camera,player,power,canRepair,onInputChange});this.active=false;this.repairOpen=false;this.scanElapsed=0;this.recoveryTime=0;
    this.root=document.createElement('div');this.root.className='rover-ui';this.root.hidden=true;
    this.root.innerHTML=`<section class="rover-warning" role="status" aria-live="polite" hidden><b></b><strong class="rover-deadline" aria-live="off"></strong><p></p><small>[M] ALARM MUTE</small></section>
      <div class="rover-prompt" hidden><kbd>E</kbd> Service survey rover</div>
      <section class="rover-repair" role="dialog" aria-modal="true" aria-labelledby="rover-repair-title" tabindex="-1" hidden>
        <span class="power-label">SURVEY ROVER / DRIVE SERVICE</span><h2 id="rover-repair-title">Recover the drive</h2><p class="rover-instruction">The overloaded wheel draws 12 A. Isolate its motor, then hold E for a three-second verification. The rover remains parked during service.</p>
        <div class="rover-wheels">${Array.from({length:6},(_,i)=>`<button type="button" data-wheel="${i}"><b>${i+1}</b><span></span></button>`).join('')}</div>
        <button type="button" class="rover-brake" hidden>[SPACE] RELEASE BRAKE</button><div class="rover-trim" hidden><p></p><button type="button" data-rover-trim="-1">A · − trim</button><button type="button" data-rover-trim="1">D · + trim</button></div>
        <progress class="rover-verify" max="3" value="0" aria-label="Drive verification progress"></progress><p class="rover-feedback" role="status"></p>
        <button type="button" class="rover-hold">HOLD E — VERIFY DRIVE</button><button type="button" class="rover-cancel">BACKSPACE — CANCEL</button>
      </section>`;
    host.append(this.root);this.warning=this.root.querySelector('.rover-warning');this.panel=this.root.querySelector('.rover-repair');this.prompt=this.root.querySelector('.rover-prompt');
    this.model=new RoverSystem({onEvent:event=>this.onEvent(event)});this.manager=new InteractionManager();
    this.manager.register(target,{id:'rover-drive',label:'Survey rover',action:'Service',onInteract:()=>this.openRepair()});this.manager.setOccluders(scene.children);
    for(const button of this.panel.querySelectorAll('[data-wheel]'))button.addEventListener('click',()=>{this.model.select(Number(button.dataset.wheel));this.render();});
    this.panel.querySelector('.rover-brake').addEventListener('click',()=>{this.model.releaseBrake();this.render();});
    for(const button of this.panel.querySelectorAll('[data-rover-trim]'))button.addEventListener('click',()=>{this.model.adjustTrim(Number(button.dataset.roverTrim));this.render();});
    const hold=this.panel.querySelector('.rover-hold');hold.addEventListener('pointerdown',event=>{if(event.button!==0)return;hold.setPointerCapture(event.pointerId);this.model.setHolding(true);});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])hold.addEventListener(type,()=>this.model.setHolding(false));
    document.addEventListener('keyup',event=>{if(event.code==='KeyE')this.model.setHolding(false);});
    this.panel.querySelector('.rover-cancel').addEventListener('click',()=>this.closeRepair());
  }
  setActive(active){active=!!active;if(active===this.active)return;this.active=active;this.root.hidden=!active;this.manager.setEnabled(active);if(!active)this.closeRepair();else this.render(true);}
  onEvent(event){
    const messages={
      'rover-fault':['ROVER DRIVE OVERLOAD','Survey speed reduced. Reach the moving rover and isolate its overloaded wheel.'],
      'rover-critical':['ROVER DRIVE FAILING','Drive shutdown imminent. Stop beside the rover and open service.'],
      'rover-stalled':['SURVEY ROVER IMMOBILIZED','Survey delivery halted. Recover the drive before shift handover.'],
      'rover-restored':['ROVER DRIVE RESTORED','Motor verified. Survey route and sample delivery resumed.'],
    };
    if(messages[event.type]){const [title,text]=event.type==='rover-fault'&&this.model.drive?.variant?[`ROVER ${this.model.drive.label.toUpperCase()}`,this.model.drive.instruction]:messages[event.type];this.warning.querySelector('b').textContent=title;this.warning.querySelector('p').textContent=text;this.warning.hidden=false;}
    if(['rover-fault','rover-critical','rover-stalled'].includes(event.type))this.power.playAlarm({frequency:520,alternate:390});
    if(event.type==='rover-restored'){this.recoveryTime=6;this.closeRepair();}
    if(event.type==='rover-reset')this.warning.hidden=true;this.render();
  }
  update(delta){if(!this.active||!Number.isFinite(delta)||delta<0)return;this.recoveryTime=Math.max(0,this.recoveryTime-delta);if(this.model.status==='recovered'&&this.recoveryTime===0)this.warning.hidden=true;this.scanElapsed+=delta;const scan=this.scanElapsed>=.1;if(scan)this.scanElapsed=0;this.render(scan);}
  render(scan=false){
    if(scan)this.manager.update(this.camera);
    this.prompt.hidden=!this.active||this.repairOpen||!this.canRepair()||!this.model.needsRepair||!this.manager.focus;
    this.warning.dataset.critical=String(['critical','stalled'].includes(this.model.status));if(!this.presentation)this.warning.querySelector('.rover-deadline').textContent=this.model.status==='stalled'?'RESTORE BEFORE HANDOVER':this.model.needsRepair?`DRIVE STOP IN ${Math.ceil(this.model.secondsRemaining)}s`:'SURVEY RESUMED';
    if(!this.repairOpen)return;
    const drive=this.model.drive;
    this.panel.querySelector('h2').textContent=drive.label??'Recover the drive';this.panel.querySelector('.rover-instruction').textContent=drive.instruction??'Select the 12 A motor, then hold E for three seconds. The rover stays parked during service.';
    for(const button of this.panel.querySelectorAll('[data-wheel]')){const i=Number(button.dataset.wheel);button.querySelector('span').textContent=`Wheel ${i+1} · ${drive.variant==='brake-lock'?`${drive.torques[i]} N drag`:drive.variant==='encoder-drift'?`${drive.errors[i]>0?'+':''}${drive.errors[i]} encoder error`:`${drive.currents[i]} A`}`;button.dataset.selected=String(i===this.model.selected);button.disabled=this.model.holding||this.model.interlock>0;}
    const brake=this.panel.querySelector('.rover-brake');brake.hidden=drive.variant!=='brake-lock';brake.disabled=this.model.selected===null||this.model.brakeReleased;brake.textContent=this.model.brakeReleased?'BRAKE RELEASED':'[SPACE] RELEASE BRAKE';
    const trim=this.panel.querySelector('.rover-trim');trim.hidden=drive.variant!=='encoder-drift';trim.querySelector('p').textContent=`Applied trim ${this.model.trim>0?'+':''}${this.model.trim}. Cancel the selected wheel’s encoder error.`;
    for(const button of this.panel.querySelectorAll('[data-rover-trim]'))button.disabled=this.model.holding||this.model.selected===null;
    this.panel.querySelector('.rover-hold').disabled=this.model.selected===null||!this.model.diagnosticReady||this.model.interlock>0;
    this.panel.querySelector('.rover-verify').value=this.model.verifyElapsed;
    this.panel.querySelector('.rover-feedback').textContent=this.model.interlock>0?'Selection rejected. Recheck the diagnostic readings.':this.model.holding?'Verifying drive response. Keep holding E.':this.model.selected!==null?!this.model.diagnosticReady?drive.instruction:'Preparation accepted. Hold E continuously to verify.':'Select the faulty wheel with 1–6 using the diagnostic readings.';
  }
  openRepair(){if(!this.active||!this.canRepair()||!this.model.beginRepair())return false;this.repairOpen=true;this.panel.hidden=false;this.player.clearInput();this.player.inputEnabled=false;this.panel.focus();this.onInputChange();this.render();return true;}
  closeRepair(){this.model.cancelRepair();if(!this.repairOpen)return;this.repairOpen=false;this.panel.hidden=true;this.player.clearInput();this.player.inputEnabled=true;this.onInputChange();}
  handleKey(event){
    if(!this.active||event.ctrlKey||event.altKey||event.metaKey)return false;
    if(this.repairOpen){
      if(event.code==='Escape'){this.closeRepair();return false;}
      if(event.code==='Tab'){const buttons=[...this.panel.querySelectorAll('button:not(:disabled)')].filter(button=>button.getClientRects().length),first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&[first,this.panel].includes(document.activeElement)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return true;}
      if(/^(Digit|Numpad)[1-6]$/.test(event.code)){event.preventDefault();if(!event.repeat)this.model.select(Number(event.code.slice(-1))-1);this.render();return true;}
      if((event.code==='Space'&&this.model.drive.variant==='brake-lock')||(['KeyA','KeyD'].includes(event.code)&&this.model.drive.variant==='encoder-drift')){event.preventDefault();if(!event.repeat){if(event.code==='Space')this.model.releaseBrake();else this.model.adjustTrim(event.code==='KeyA'?-1:1);}this.render();return true;}
      if(['KeyE','KeyR','Backspace'].includes(event.code)){event.preventDefault();if(event.repeat)return true;if(event.code==='KeyE')this.model.setHolding(true);else if(event.code==='KeyR')this.player.reset();else this.closeRepair();return true;}
    }
    if(event.code!=='KeyE'||event.repeat||!this.model.needsRepair||!this.canRepair())return false;this.manager.update(this.camera);if(!this.manager.focus)return false;event.preventDefault();return this.manager.interact(this.camera);
  }
  reset(){this.closeRepair();this.model.reset();this.recoveryTime=0;this.prompt.hidden=true;}
}
