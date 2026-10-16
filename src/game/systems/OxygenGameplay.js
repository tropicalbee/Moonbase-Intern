import {OxygenSystem} from './OxygenSystem.js';
import {InteractionManager} from '../interactions/InteractionManager.js';

/** Equipment action at Capsule; character dialogue and intro remain separate. */
export class OxygenGameplay {
  constructor({scene,camera,player,target,host,power,canvas,onInputChange,canRepair=()=>true}){
    Object.assign(this,{camera,player,power,canvas,onInputChange,canRepair});this.active=false;this.repairOpen=false;this.recoveryTime=0;this.scanElapsed=0;
    this.root=document.createElement('div');this.root.className='oxygen-ui';this.root.hidden=true;
    this.root.innerHTML=`<div class="oxygen-vignette" aria-hidden="true"></div>
      <section class="oxygen-warning" role="status" aria-live="polite" hidden><b></b><strong class="oxygen-deadline" aria-live="off"></strong><p></p><small>[M] ALARM MUTE</small></section>
      <div class="oxygen-prompt" hidden><kbd>E</kbd> Service oxygen regulator — Capsule</div>
      <section class="oxygen-repair" role="dialog" aria-modal="true" aria-labelledby="oxygen-repair-title" tabindex="-1" hidden>
        <span class="power-label">CAPSULE / ATMOSPHERE SERVICE PORT</span><h2 id="oxygen-repair-title">Balance circulation</h2>
        <p class="oxygen-target"></p>
        <div class="oxygen-service repair-choices" hidden>${[0,1,2].map(index=>`<button type="button" data-oxygen-service="${index}"><kbd>${index+1}</kbd><span></span></button>`).join('')}</div>
        <label>Intake <output class="oxygen-intake-value"></output><input type="range" data-flow="intake" min="0" max="100" step="5" value="20" aria-label="Intake flow"></label>
        <label>Return <output class="oxygen-return-value"></output><input type="range" data-flow="returnFlow" min="0" max="100" step="5" value="80" aria-label="Return flow"></label>
        <p class="oxygen-key-guide">A / D — intake · W / S — return<br>Match both gauges, then hold E for 2 seconds.</p>
        <button type="button" class="oxygen-prime">HOLD E — PRIME REGULATOR</button><progress class="oxygen-prime-progress" max="2" value="0" aria-label="Regulator priming progress"></progress>
        <p class="oxygen-feedback" role="status" aria-live="polite"></p><button type="button" class="oxygen-cancel">BACKSPACE — CANCEL</button>
      </section>`;
    host.append(this.root);this.warning=this.root.querySelector('.oxygen-warning');this.panel=this.root.querySelector('.oxygen-repair');this.prompt=this.root.querySelector('.oxygen-prompt');
    this.model=new OxygenSystem({onEvent:event=>this.onEvent(event)});this.manager=new InteractionManager();
    this.manager.register(target,{id:'oxygen-regulator',label:'Capsule regulator',action:'Service',onInteract:()=>this.openRepair()});this.manager.setOccluders(scene.children);
    for(const input of this.panel.querySelectorAll('input'))input.addEventListener('input',()=>{this.model.setFlow(input.dataset.flow,Number(input.value));this.render();});
    for(const button of this.panel.querySelectorAll('[data-oxygen-service]'))button.addEventListener('click',()=>{this.model.service(Number(button.dataset.oxygenService));this.render();});
    this.panel.querySelector('.oxygen-cancel').addEventListener('click',()=>this.closeRepair());
    const prime=this.panel.querySelector('.oxygen-prime');prime.addEventListener('pointerdown',()=>this.hold());
    prime.addEventListener('pointerup',()=>this.release());prime.addEventListener('pointerleave',()=>this.release());
    document.addEventListener('pointerup',()=>this.release());
  }
  setActive(active){
    active=!!active;if(active===this.active)return;this.active=active;this.root.hidden=!active;this.manager.setEnabled(active);
    if(!active){this.closeRepair();this.clearEffects();}else this.render(true);
  }
  onEvent(event){
    const messages={
      'oxygen-fault':['OXYGEN CIRCULATION LOST','Reach Capsule, the tall research pod on the west side. Balance its intake and return flows.'],
      'oxygen-critical':['ATMOSPHERE CRITICAL','Emergency reserve nearly empty. Prime the regulator at Capsule now.'],
      'oxygen-depleted':['ATMOSPHERE FAILURE','Circulation reserve exhausted.'],
      'oxygen-restored':['CIRCULATION RESTORED','Habitat atmosphere supply stable.'],
    };
    if(messages[event.type]){const [title,text]=messages[event.type];this.warning.querySelector('b').textContent=title;this.warning.querySelector('p').textContent=text;this.warning.hidden=false;}
    if(['oxygen-fault','oxygen-critical'].includes(event.type))this.power.playAlarm({frequency:660,alternate:440});
    if(event.type==='oxygen-restored'){this.recoveryTime=6;this.closeRepair();this.clearEffects();}
    if(event.type==='oxygen-reset')this.warning.hidden=true;
    this.render();
  }
  update(delta){
    if(!this.active||!Number.isFinite(delta)||delta<0)return;
    this.recoveryTime=Math.max(0,this.recoveryTime-delta);
    if(this.model.status==='recovered'&&this.recoveryTime===0)this.warning.hidden=true;
    this.scanElapsed+=delta;const scan=this.scanElapsed>=.1;if(scan)this.scanElapsed=0;
    this.render(scan);
  }
  render(scan=false){
    if(scan)this.manager.update(this.camera);
    this.prompt.hidden=!this.active||this.repairOpen||this.power.repairOpen||!this.canRepair()||!this.model.needsRepair||!this.manager.focus;
    this.warning.dataset.critical=String(['critical','depleted'].includes(this.model.status));
    if(!this.presentation)this.warning.querySelector('.oxygen-deadline').textContent=this.model.needsRepair?`RESERVE ${Math.ceil(this.model.secondsRemaining)}s`:'SUPPLY STABLE';
    const severity=this.active&&this.model.needsRepair?Math.max(0,(30-this.model.reserve)/30):0;
    if(!this.presentation){this.root.querySelector('.oxygen-vignette').style.opacity=String(severity*.75);
      this.canvas.style.filter=severity>0?`grayscale(${severity*.65})`:'';}
    if(!this.repairOpen)return;
    const setting=this.model.setting,ready=this.model.serviceReady;
    this.panel.querySelector('h2').textContent=ready?'Balance circulation':setting.variant==='filter-bypass'?'Bypass the blocked filter':'Purge trapped pressure';
    this.panel.querySelector('.oxygen-target').textContent=`${setting.label?`${setting.label} / ${setting.instruction} `:''}Required flow: intake ${setting.intake}% · return ${setting.returnFlow}%.`;
    this.panel.querySelector('.oxygen-service').hidden=ready;
    for(const button of this.panel.querySelectorAll('[data-oxygen-service]')){const i=Number(button.dataset.oxygenService);button.querySelector('span').textContent=`${setting.variant==='filter-bypass'?'Filter':'Valve'} ${['A','B','C'][i]} · ${setting.readings?.[i]??0} kPa`;button.disabled=this.model.interlock>0;}
    this.panel.querySelector('.oxygen-intake-value').textContent=`${this.model.intake}%`;
    this.panel.querySelector('.oxygen-return-value').textContent=`${this.model.returnFlow}%`;
    for(const input of this.panel.querySelectorAll('input')){input.value=String(this.model[input.dataset.flow]);input.disabled=!ready;}
    this.panel.querySelector('.oxygen-prime').disabled=!ready||this.model.interlock>0;
    this.panel.querySelector('.oxygen-prime-progress').value=this.model.holdElapsed;
    const feedback=this.panel.querySelector('.oxygen-feedback'),message=this.model.interlock>0?'Preparation rejected. One-second interlock; recheck the readings.':!ready?`${setting.instruction} Checks ${this.model.serviceStep}/${setting.serviceSequence.length}.`:this.model.holding?'Priming — keep E held for the full two seconds.':this.model.balanced?'Flows balanced. Hold E to prime.':this.presentation?.snapshot.training?'Practice reserve protected. Match both required flow gauges.':'Circulation unstable. Match both gauges; reserve continues to drain.';
    if(feedback.textContent!==message)feedback.textContent=message;
  }
  clearEffects(){if(!this.presentation){this.canvas.style.filter='';this.root.querySelector('.oxygen-vignette').style.opacity='0';}}
  openRepair(){
    if(!this.active||this.power.repairOpen||!this.canRepair()||!this.model.beginRepair())return false;
    this.repairOpen=true;this.panel.hidden=false;this.player.clearInput();this.player.inputEnabled=false;this.panel.focus();this.onInputChange();this.render();return true;
  }
  closeRepair(){
    this.model.cancelRepair();if(!this.repairOpen)return;
    this.repairOpen=false;this.panel.hidden=true;this.player.clearInput();this.player.inputEnabled=true;this.onInputChange();
  }
  hold(){this.model.setHolding(true);this.render();}
  release(){this.model.setHolding(false);}
  handleKey(event){
    if(!this.active||event.ctrlKey||event.altKey||event.metaKey)return false;
    if(this.repairOpen){
      if(event.code==='Escape'){this.closeRepair();return false;}
      if(event.code==='Tab'){
        const controls=[...this.panel.querySelectorAll('input,button')].filter(control=>!control.disabled&&control.getClientRects().length),first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&[this.panel,first].includes(document.activeElement)){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return true;
      }
      const changes={KeyA:['intake',-5],KeyD:['intake',5],KeyW:['returnFlow',5],KeyS:['returnFlow',-5]};
      const index=['Digit1','Digit2','Digit3'].indexOf(event.code.replace('Numpad','Digit'));
      if(index>=0&&!this.model.serviceReady){event.preventDefault();if(!event.repeat)this.model.service(index);this.render();return true;}
      if(changes[event.code]){event.preventDefault();const [channel,amount]=changes[event.code];this.model.setFlow(channel,Math.min(100,Math.max(0,this.model[channel]+amount)));this.render();return true;}
      if(['KeyE','KeyR','Backspace','Space'].includes(event.code)){
        event.preventDefault();if(event.repeat)return true;
        if(event.code==='KeyR')this.player.reset();else if(event.code==='Backspace')this.closeRepair();else if(event.code==='KeyE'||document.activeElement===this.panel.querySelector('.oxygen-prime'))this.hold();return true;
      }
    }
    if(event.code!=='KeyE'||event.repeat||!this.model.needsRepair||this.power.repairOpen||!this.canRepair())return false;
    this.manager.update(this.camera);if(!this.manager.focus)return false;event.preventDefault();return this.manager.interact(this.camera);
  }
  reset(){this.closeRepair();this.model.reset();this.recoveryTime=0;this.clearEffects();this.prompt.hidden=true;}
}
