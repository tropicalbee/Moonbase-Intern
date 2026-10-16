import {CommunicationsSystem} from './CommunicationsSystem.js';
import {InteractionManager} from '../interactions/InteractionManager.js';

export function communicationsTuningHint(model){
  if(!model.powerAvailable)return 'Restore Watt first. Your tuning is saved.';
  if(model.handshaking)return 'Verifying link — wait two seconds. No key needs to be held.';
  if(model.interlock>0)return 'Confirmation needs 100% signal. Wait for the interlock, then keep tuning.';
  if(!model.routingReady&&model.setting?.variant==='relay-mismatch')return 'Select the relay above 80% quality with 1–3, then tune the carrier.';
  if(!model.routingReady&&model.setting?.variant==='phase-inversion')return 'Press 1 to match the reference polarity, then tune the carrier.';
  if(model.frequency!==model.setting?.frequency)return 'Step 1: match the tallest bar. A lowers frequency; D raises it.';
  if(model.phase>model.setting?.phase)return 'Frequency matched. Step 2: tap S to lower phase until signal reaches 100%.';
  if(model.phase<model.setting?.phase)return 'Frequency matched. Step 2: tap W to raise phase until signal reaches 100%.';
  return '100% signal — step 3: press E to verify the link. Wait two seconds.';
}

export class CommunicationsGameplay {
  constructor({scene,camera,player,target,host,power,canRepair,onInputChange}){
    Object.assign(this,{camera,player,power,canRepair,onInputChange});this.active=false;this.repairOpen=false;this.scanElapsed=0;this.recoveryTime=0;
    this.root=document.createElement('div');this.root.className='comms-ui';this.root.hidden=true;
    this.root.innerHTML=`<section class="comms-warning" role="status" aria-live="polite" hidden><b></b><strong class="comms-deadline" aria-live="off"></strong><p></p><p class="comms-dependency system-dependency" hidden>Blackout: uplink verification unavailable. Restore power at Watt, then confirm the handshake.</p><small>LOCAL ALERTS REMAIN ACTIVE · [M] ALARM MUTE</small></section>
      <div class="comms-prompt" hidden><kbd>E</kbd> Restore Relay uplink — Watt</div>
      <section class="comms-repair" role="dialog" aria-modal="true" aria-labelledby="comms-repair-title" tabindex="-1" hidden>
        <header><span class="power-label">RELAY / GROUND UPLINK AT WATT</span><h2 id="comms-repair-title">Restore the uplink</h2><p>Match the tallest bar, tune phase to 100% signal, then press E.</p></header>
        <div class="comms-body">
        <div class="comms-routing repair-choices" hidden>${[0,1,2].map(index=>`<button type="button" data-comms-relay="${index}"><kbd>${index+1}</kbd><span></span></button>`).join('')}</div><button type="button" class="comms-polarity" hidden></button>
        <div class="comms-spectrum" aria-label="Frequency spectrum">${Array.from({length:9},(_,i)=>`<div data-channel="${i+1}"><i></i><span>${i+1}</span></div>`).join('')}</div>
        <div class="comms-tuning"><div><span>Frequency <output class="comms-frequency-value"></output></span><button type="button" data-comms-tune="frequency" data-comms-step="-1" aria-label="Lower frequency">A · −</button><button type="button" data-comms-tune="frequency" data-comms-step="1" aria-label="Raise frequency">D · +</button></div>
        <div><span>Phase <output class="comms-phase-value"></output></span><button type="button" data-comms-tune="phase" data-comms-step="-1" aria-label="Lower phase">S · −</button><button type="button" data-comms-tune="phase" data-comms-step="1" aria-label="Raise phase">W · +</button></div></div>
        <p class="comms-readout"></p><progress class="comms-strength" max="100" value="0" aria-label="Carrier signal strength"></progress>
        </div><footer><p class="comms-feedback" role="status"></p><button type="button" class="comms-confirm">[E] VERIFY LINK · 2 SECONDS</button><progress class="comms-handshake" max="2" value="0" aria-label="Handshake progress"></progress>
        <button type="button" class="comms-cancel">BACKSPACE — LEAVE SERVICE (TUNING SAVED)</button></footer>
      </section>`;
    host.append(this.root);this.warning=this.root.querySelector('.comms-warning');this.panel=this.root.querySelector('.comms-repair');this.prompt=this.root.querySelector('.comms-prompt');
    this.model=new CommunicationsSystem({onEvent:event=>this.onEvent(event)});this.manager=new InteractionManager();
    this.manager.register(target,{id:'relay-uplink',label:'Relay uplink',action:'Restore',onInteract:()=>this.openRepair()});this.manager.setOccluders(scene.children);
    this.panel.querySelector('.comms-confirm').addEventListener('click',()=>this.model.confirm());this.panel.querySelector('.comms-cancel').addEventListener('click',()=>this.closeRepair());
    for(const button of this.panel.querySelectorAll('[data-comms-tune]'))button.addEventListener('click',()=>{this.model.tune(button.dataset.commsTune,Number(button.dataset.commsStep));this.render();});
    for(const button of this.panel.querySelectorAll('[data-comms-relay]'))button.addEventListener('click',()=>{this.model.selectRelay(Number(button.dataset.commsRelay));this.render();});
    this.panel.querySelector('.comms-polarity').addEventListener('click',()=>{this.model.invertPolarity();this.render();});
  }
  setActive(active){active=!!active;if(active===this.active)return;this.active=active;this.root.hidden=!active;this.manager.setEnabled(active);if(!active)this.closeRepair();else this.render(true);}
  onEvent(event){
    const messages={
      'communications-fault':['ORBITAL LINK DEGRADING','Reach Relay’s ground uplink at Watt on the east side. Tune frequency and phase before the link collapses.'],
      'communications-critical':['CARRIER LOCK FAILING','Ten seconds of link reserve remain. Local station alarms are still operational.'],
      'communications-lost':['STATION LINK OFFLINE','Orbital handover unavailable. Restore Relay at Watt before your shift ends.'],
      'communications-restored':['ORBITAL LINK RESTORED','Station telemetry and handover channel verified.'],
    };
    if(messages[event.type]){const [title,text]=messages[event.type];this.warning.querySelector('b').textContent=title;this.warning.querySelector('p').textContent=text;this.warning.hidden=false;}
    if(['communications-fault','communications-critical','communications-lost'].includes(event.type))this.power.playAlarm({frequency:880,alternate:620});
    if(event.type==='communications-restored'){this.recoveryTime=6;this.closeRepair();}
    if(event.type==='communications-reset')this.warning.hidden=true;
    this.render();
  }
  update(delta){if(!this.active||!Number.isFinite(delta)||delta<0)return;this.recoveryTime=Math.max(0,this.recoveryTime-delta);if(this.model.status==='recovered'&&this.recoveryTime===0)this.warning.hidden=true;this.scanElapsed+=delta;const scan=this.scanElapsed>=.1;if(scan)this.scanElapsed=0;this.render(scan);}
  render(scan=false){
    if(scan)this.manager.update(this.camera);
    this.prompt.hidden=!this.active||this.repairOpen||this.power.model?.needsRepair||!this.canRepair()||!this.model.needsRepair||!this.manager.focus;
    this.warning.dataset.critical=String(['critical','lost'].includes(this.model.status));if(!this.presentation)this.warning.querySelector('.comms-deadline').textContent=this.model.status==='lost'?'RESTORE BEFORE HANDOVER':this.model.needsRepair?`LINK RESERVE ${Math.ceil(this.model.secondsRemaining)}s`:'LINK VERIFIED';
    this.warning.querySelector('.comms-dependency').hidden=!this.model.needsRepair||this.model.powerAvailable;
    if(!this.repairOpen)return;
    const setting=this.model.setting;
    this.panel.querySelector('h2').textContent=setting.label??'Restore the uplink';
    this.panel.querySelector('header > p').textContent=setting.instruction??'Match the tallest bar, tune phase to 100% signal, then press E.';
    this.panel.querySelector('.comms-routing').hidden=setting.variant!=='relay-mismatch';
    for(const button of this.panel.querySelectorAll('[data-comms-relay]')){const i=Number(button.dataset.commsRelay);button.querySelector('span').textContent=`Relay ${['A','B','C'][i]} · ${setting.relays?.[i]??0}% quality${this.model.selectedRelay===i?' · SELECTED':''}`;button.disabled=this.model.handshaking||this.model.interlock>0;}
    const polarity=this.panel.querySelector('.comms-polarity');polarity.hidden=setting.variant!=='phase-inversion';polarity.disabled=this.model.handshaking;polarity.textContent=`[1] INVERT POLARITY · ${this.model.polarity>0?'+':'−'} / reference ${setting.polarity>0?'+':'−'}`;
    for(const bar of this.panel.querySelectorAll('[data-channel]')){const channel=Number(bar.dataset.channel);bar.querySelector('i').style.height=`${Math.max(6,100-Math.abs(channel-this.model.setting.frequency)*14)}%`;bar.dataset.selected=String(channel===this.model.frequency);}
    this.panel.querySelector('.comms-frequency-value').textContent=String(this.model.frequency);
    this.panel.querySelector('.comms-phase-value').textContent=String(this.model.phase);
    this.panel.querySelector('.comms-readout').textContent=`SIGNAL ${this.model.strength}% / TARGET 100%`;
    this.panel.querySelector('.comms-strength').value=this.model.strength;this.panel.querySelector('.comms-handshake').value=this.model.handshakeElapsed;
    const feedback=this.panel.querySelector('.comms-feedback');
    const message=communicationsTuningHint(this.model);
    if(feedback.textContent!==message)feedback.textContent=message;
    const confirm=this.panel.querySelector('.comms-confirm');
    confirm.disabled=!this.model.powerAvailable||this.model.handshaking||this.model.interlock>0;
    confirm.textContent=this.model.handshaking?'VERIFYING LINK…':this.model.carrierLocked?'[E] VERIFY LINK · 2 SECONDS':'[E] CONFIRM · 100% SIGNAL REQUIRED';
    for(const button of this.panel.querySelectorAll('[data-comms-tune]'))button.disabled=this.model.handshaking;
  }
  openRepair(){if(!this.active||!this.canRepair()||!this.model.beginRepair())return false;this.repairOpen=true;this.panel.hidden=false;this.player.clearInput();this.player.inputEnabled=false;this.panel.focus();this.onInputChange();this.render();return true;}
  closeRepair(){this.model.cancelRepair();if(!this.repairOpen)return;this.repairOpen=false;this.panel.hidden=true;this.player.clearInput();this.player.inputEnabled=true;this.onInputChange();}
  handleKey(event){
    if(!this.active||event.ctrlKey||event.altKey||event.metaKey)return false;
    if(this.repairOpen){
      if(event.code==='Escape'){this.closeRepair();return false;}
      if(event.code==='Tab'){const controls=[...this.panel.querySelectorAll('button')].filter(button=>!button.disabled&&button.getClientRects().length),first=controls[0],last=controls.at(-1);if(event.shiftKey&&[first,this.panel].includes(document.activeElement)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return true;}
      const index=['Digit1','Digit2','Digit3'].indexOf(event.code.replace('Numpad','Digit'));
      if(index>=0&&this.model.setting.variant!=='carrier-drift'&&this.model.setting.variant){event.preventDefault();if(!event.repeat){if(this.model.setting.variant==='relay-mismatch')this.model.selectRelay(index);else if(index===0)this.model.invertPolarity();}this.render();return true;}
      const controls={KeyA:['frequency',-1],KeyD:['frequency',1],KeyW:['phase',1],KeyS:['phase',-1]};
      if(controls[event.code]){event.preventDefault();if(!event.repeat)this.model.tune(...controls[event.code]);this.render();return true;}
      if(['KeyE','KeyR','Backspace'].includes(event.code)){event.preventDefault();if(event.repeat)return true;if(event.code==='KeyE')this.model.confirm();else if(event.code==='KeyR')this.player.reset();else this.closeRepair();return true;}
    }
    if(event.code!=='KeyE'||event.repeat||!this.model.needsRepair||!this.canRepair())return false;this.manager.update(this.camera);if(!this.manager.focus)return false;event.preventDefault();return this.manager.interact(this.camera);
  }
  reset(){this.closeRepair();this.model.reset();this.recoveryTime=0;this.prompt.hidden=true;}
}
