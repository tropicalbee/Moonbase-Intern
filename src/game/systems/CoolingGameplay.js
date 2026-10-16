import * as THREE from 'three';
import {CoolingSystem} from './CoolingSystem.js';
import {InteractionManager} from '../interactions/InteractionManager.js';

export class CoolingGameplay {
  constructor({scene,camera,player,target,host,power,canRepair,onInputChange}){
    Object.assign(this,{camera,player,power,canRepair,onInputChange});this.active=false;this.repairOpen=false;this.scanElapsed=0;this.recoveryTime=0;
    this.lights=power.lighting.lights.map(({object})=>({object,color:object.color.clone()}));this.hotColor=new THREE.Color(0xb86b67);
    this.root=document.createElement('div');this.root.className='cooling-ui';this.root.hidden=true;
    this.root.innerHTML=`<section class="cooling-warning" role="status" aria-live="polite" hidden><b></b><strong class="cooling-deadline" aria-live="off"></strong><p></p><p class="cooling-dependency system-dependency" hidden>Blackout: heating 50% faster. Restore power at Watt before engaging the backup pump.</p><small>[M] ALARM MUTE</small></section>
      <div class="cooling-prompt" hidden><kbd>E</kbd> Service coolant loop — Patch</div>
      <section class="cooling-repair" role="dialog" aria-modal="true" aria-labelledby="cooling-repair-title" tabindex="-1" hidden>
        <span class="power-label">PATCH / LAB COOLANT CONTROL</span><h2 id="cooling-repair-title">Vent the hot loop</h2><p class="cooling-instruction">Vent the loop with the highest pressure. Then synchronize the backup pump.</p>
        <div class="cooling-valves">${[0,1,2].map(index=>`<button type="button" data-valve="${index}"><kbd>${index+1}</kbd><span></span></button>`).join('')}</div>
        <div class="cooling-sync" hidden><p>Press SPACE while the needle is inside the stable window.</p><div class="cooling-track" role="meter" aria-label="Pump synchronization" aria-valuemin="0" aria-valuemax="100"><span class="cooling-window"></span><i class="cooling-needle"></i></div><small>STABLE WINDOW</small><button class="cooling-engage" type="button">[SPACE] ENGAGE BACKUP PUMP</button></div>
        <p class="cooling-feedback" role="status"></p><button type="button" class="cooling-cancel">BACKSPACE — CANCEL</button>
      </section>`;
    host.append(this.root);this.warning=this.root.querySelector('.cooling-warning');this.panel=this.root.querySelector('.cooling-repair');this.prompt=this.root.querySelector('.cooling-prompt');
    this.model=new CoolingSystem({onEvent:event=>this.onEvent(event)});this.manager=new InteractionManager();
    this.manager.register(target,{id:'coolant-control',label:'Patch coolant control',action:'Service',onInteract:()=>this.openRepair()});this.manager.setOccluders(scene.children);
    for(const button of this.panel.querySelectorAll('[data-valve]'))button.addEventListener('click',()=>this.model.vent(Number(button.dataset.valve)));
    this.panel.querySelector('.cooling-engage').addEventListener('click',()=>this.model.engage());
    this.panel.querySelector('.cooling-cancel').addEventListener('click',()=>this.closeRepair());
  }
  setActive(active){active=!!active;if(active===this.active)return;this.active=active;this.root.hidden=!active;this.manager.setEnabled(active);if(!active){this.closeRepair();this.clearLights();}else this.render(true);}
  onEvent(event){
    const messages={
      'cooling-fault':['LAB COOLING FAILURE','Reach Patch, the control panel inside the lab. Vent the trapped coolant and engage backup circulation.'],
      'cooling-critical':['THERMAL LIMIT APPROACHING','Coolant temperature critical. Synchronize the backup pump at Patch now.'],
      'cooling-overheated':['LAB CONTAINMENT FAILURE','Thermal limit exceeded; containment lost.'],
      'cooling-restored':['COOLING RESTORED','Lab coolant loop stable.'],
    };
    if(messages[event.type]){const [title,text]=messages[event.type];this.warning.querySelector('b').textContent=title;this.warning.querySelector('p').textContent=text;this.warning.hidden=false;}
    if(['cooling-fault','cooling-critical'].includes(event.type))this.power.playAlarm({frequency:580,alternate:320});
    if(event.type==='cooling-rejected')this.panel.querySelector('.cooling-feedback').textContent='Pressure/synchronization rejected. Safety interlock: 1.5 seconds. Recheck the indicator.';
    if(event.type==='cooling-calibrated')this.panel.querySelector('.cooling-feedback').textContent='Probe calibrated. Read the pressure gauges and vent the hot loop.';
    if(event.type==='cooling-vented')this.panel.querySelector('.cooling-feedback').textContent='Preparation complete. Watch the stable window, then press Space.';
    if(event.type==='cooling-restored'){this.recoveryTime=6;this.closeRepair();this.clearLights();}
    if(event.type==='cooling-reset')this.warning.hidden=true;
    this.render();
  }
  update(delta){
    if(!this.active||!Number.isFinite(delta)||delta<0)return;
    this.recoveryTime=Math.max(0,this.recoveryTime-delta);if(this.model.status==='recovered'&&this.recoveryTime===0)this.warning.hidden=true;
    this.scanElapsed+=delta;const scan=this.scanElapsed>=.1;if(scan)this.scanElapsed=0;this.render(scan);
  }
  render(scan=false){
    if(scan)this.manager.update(this.camera);
    this.prompt.hidden=!this.active||this.repairOpen||!this.canRepair()||!this.model.needsRepair||!this.manager.focus;
    this.warning.dataset.critical=String(['critical','overheated'].includes(this.model.status));
    if(!this.presentation)this.warning.querySelector('.cooling-deadline').textContent=this.model.needsRepair?`${Math.floor(this.model.temperature)}° · TRIP IN ${Math.ceil(this.model.secondsRemaining)}s`:'LOOP STABLE';
    this.warning.querySelector('.cooling-dependency').hidden=!this.model.needsRepair||this.model.powerAvailable;
    const heat=this.active&&this.model.needsRepair?Math.max(0,(this.model.temperature-85)/25)*.6:0;
    if(!this.presentation)for(const {object,color} of this.lights)object.color.copy(color).lerp(this.hotColor,heat);
    if(!this.repairOpen)return;
    const setting=this.model.setting,calibrating=setting.variant==='sensor-drift'&&this.model.actionStep===0;
    this.panel.querySelector('h2').textContent=this.model.vented?'Synchronize the pump':calibrating?'Calibrate the drifting probe':setting.variant==='return-blockage'?'Open the blocked return':'Vent the hot loop';
    this.panel.querySelector('.cooling-instruction').textContent=this.model.vented?'Preparation complete. Press Space inside the visible window to synchronize the backup pump.':calibrating?setting.instruction:setting.variant==='return-blockage'?setting.instruction:'Vent the loop with the highest pressure. Then synchronize the backup pump.';
    this.panel.querySelector('.cooling-valves').hidden=this.model.vented;
    this.panel.querySelector('.cooling-sync').hidden=!this.model.vented;
    for(const [index,button] of [...this.panel.querySelectorAll('[data-valve]')].entries())button.querySelector('span').textContent=`Loop ${['A','B','C'][index]} · ${calibrating?`${setting.probes[index]}° probe`:setting.variant==='return-blockage'?`${setting.flows[index]} L/s return`:`${setting.pressures[index]} bar`}`;
    const [windowStart,windowEnd]=setting.window??[.35,.65];this.panel.querySelector('.cooling-window').style.left=`${windowStart*100}%`;this.panel.querySelector('.cooling-window').style.width=`${(windowEnd-windowStart)*100}%`;
    this.panel.querySelector('.cooling-needle').style.left=`${this.model.marker*100}%`;
    this.panel.querySelector('.cooling-track').setAttribute('aria-valuenow',String(Math.round(this.model.marker*100)));
    this.panel.dataset.interlocked=String(this.model.interlock>0);
    if(this.model.interlock>0)this.panel.querySelector('.cooling-feedback').textContent=`Pressure/synchronization rejected. Safety interlock: ${this.model.interlock.toFixed(1)}s remaining.`;
    else if(this.wasInterlocked)this.panel.querySelector('.cooling-feedback').textContent=this.model.vented?'Interlock cleared. Watch the stable window and press Space.':'Interlock cleared. Recheck the pressure readings and vent the hot loop.';
    this.wasInterlocked=this.model.interlock>0;
    this.panel.querySelector('.cooling-engage').disabled=!this.model.powerAvailable;
    if(!this.model.powerAvailable)this.panel.querySelector('.cooling-feedback').textContent='Backup pump has no power. Venting is available. Press Backspace, restore Watt, then return to engage the pump.';
    else if(this.wasUnpowered)this.panel.querySelector('.cooling-feedback').textContent=this.model.vented?'Power restored. Your vented loop is retained; synchronize the pump.':'Power restored. Vent the hot loop, then synchronize the pump.';
    this.wasUnpowered=!this.model.powerAvailable;
  }
  clearLights(){if(!this.presentation)for(const {object,color} of this.lights)object.color.copy(color);}
  openRepair(){
    if(!this.active||!this.canRepair()||!this.model.beginRepair())return false;
    this.repairOpen=true;this.panel.hidden=false;this.panel.querySelector('.cooling-feedback').textContent=this.model.vented?'Loop already vented. Synchronize the pump.':'Use 1 / 2 / 3 to vent a loop. Temperature continues rising.';
    if(this.presentation?.snapshot.training)this.panel.querySelector('.cooling-feedback').textContent=this.model.vented?'Loop already vented. Synchronize the pump; practice temperature is protected.':'Practice temperature protected. Use 1 / 2 / 3 to vent the highest-pressure loop.';
    if(this.model.setting.variant)this.panel.querySelector('.cooling-feedback').textContent=this.model.setting.instruction;
    this.player.clearInput();this.player.inputEnabled=false;this.panel.focus();this.onInputChange();this.render();return true;
  }
  closeRepair(){this.model.cancelRepair();if(!this.repairOpen)return;this.repairOpen=false;this.panel.hidden=true;this.player.clearInput();this.player.inputEnabled=true;this.onInputChange();}
  handleKey(event){
    if(!this.active||event.ctrlKey||event.altKey||event.metaKey)return false;
    if(this.repairOpen){
      if(event.code==='Escape'){this.closeRepair();return false;}
      if(event.code==='Tab'){
        const controls=[...this.panel.querySelectorAll('button')].filter(button=>!button.disabled&&button.getClientRects().length),first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&[first,this.panel].includes(document.activeElement)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}return true;
      }
      const index=['Digit1','Digit2','Digit3'].indexOf(event.code.replace('Numpad','Digit'));
      if(index>=0||['Space','KeyE','KeyR','Backspace'].includes(event.code)){
        event.preventDefault();if(event.repeat)return true;
        if(index>=0)this.model.vent(index);else if(event.code==='Space')this.model.engage();else if(event.code==='KeyR')this.player.reset();else if(event.code==='Backspace')this.closeRepair();return true;
      }
    }
    if(event.code!=='KeyE'||event.repeat||!this.model.needsRepair||!this.canRepair())return false;
    this.manager.update(this.camera);if(!this.manager.focus)return false;event.preventDefault();return this.manager.interact(this.camera);
  }
  reset(){this.closeRepair();this.model.reset();this.recoveryTime=0;this.wasInterlocked=false;this.wasUnpowered=false;this.clearLights();this.prompt.hidden=true;}
}
