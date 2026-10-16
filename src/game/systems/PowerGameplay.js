import { PowerSystem } from './PowerSystem.js';
import { PowerLighting } from './PowerLighting.js';
import { InteractionManager } from '../interactions/InteractionManager.js';

/** Integrates one power event without owning the render loop or character dialogue. */
export class PowerGameplay {
  constructor({ scene, camera, player, target, host, onInputChange, isMuted = () => false, canRepair = () => true, onMuteChange=()=>{} }) {
    Object.assign(this, { camera, player, onInputChange, isMuted, canRepair, onMuteChange });
    this.active = false; this.repairOpen = false; this.scanElapsed = 0; this.recoveryRemaining = 0;
    this.announcementRemaining = 0; this.alarmNodes = []; this.muted = null; this.audio = null;
    this.lighting = new PowerLighting(scene);
    this.root = document.createElement('div'); this.root.className = 'power-ui'; this.root.hidden = true;
    this.root.innerHTML = `<div class="power-fault-announcement" hidden aria-hidden="true"><span>PRIMARY FEED LOST</span><strong>LAB POWER FAILURE</strong><small>Reach Watt. Restore the circuit.</small></div>
      <section class="power-warning" role="status" aria-live="polite" hidden><b></b><strong class="power-countdown" aria-live="off"></strong><p></p><div class="power-reserve" aria-hidden="true"><i></i></div><button class="power-alarm-toggle" type="button">[M] MUTE ALARM</button></section>
      <div class="power-prompt" hidden><kbd>E</kbd> Repair power cell — Watt</div>
      <section class="power-repair" role="dialog" aria-modal="true" aria-labelledby="power-repair-title" tabindex="-1" hidden>
        <span class="power-label">WATT / LOCAL SERVICE PANEL</span><h2 id="power-repair-title">Reroute lab power</h2>
        <p class="power-diagnosis"></p>
        <div class="power-switches">${[1,2,3].map(number=>`<button type="button" data-power-index="${number-1}"><kbd>${number}</kbd><span></span></button>`).join('')}</div>
        <p class="power-repair-feedback" role="status" aria-live="polite"></p>
        <button class="power-cancel" type="button">BACKSPACE — CANCEL</button>
      </section>`;
    host.append(this.root);
    this.warning = this.root.querySelector('.power-warning'); this.prompt = this.root.querySelector('.power-prompt');
    this.panel = this.root.querySelector('.power-repair'); this.feedback = this.root.querySelector('.power-repair-feedback');
    this.announcement = this.root.querySelector('.power-fault-announcement');
    this.model = new PowerSystem({ onEvent: event => this.onEvent(event) });
    this.manager = new InteractionManager();
    this.manager.register(target, { id: 'power-repair', label: 'Watt', action: 'Repair', onInteract: () => this.openRepair() });
    this.manager.setOccluders(scene.children);
    for (const button of this.root.querySelectorAll('[data-power-index]')) button.addEventListener('click', () => this.chooseIndex(Number(button.dataset.powerIndex)));
    this.root.querySelector('.power-cancel').addEventListener('click', () => this.closeRepair(true));
    this.root.querySelector('.power-alarm-toggle').addEventListener('click', () => this.toggleAlarm());
  }

  setActive(active) {
    active = !!active;
    if (active === this.active) return;
    this.active = active; this.root.hidden = !active; this.manager.setEnabled(active);
    if (!active) { this.closeRepair(true); this.prompt.hidden = true; this.stopAlarm(); }
    else this.scan();
  }

  scan() {
    this.manager.update(this.camera);
    this.prompt.hidden = !this.active || this.repairOpen || !this.canRepair() || !this.model.needsRepair || !this.manager.focus;
  }

  update(delta, advanceModel = true) {
    if (!this.active) return;
    if (!Number.isFinite(delta)||delta<0 || (advanceModel && !this.model.update(delta))) return;
    if(!this.presentation)this.lighting.update(this.model, delta);
    this.announcementRemaining = Math.max(0,this.announcementRemaining-delta);
    this.announcement.hidden = this.announcementRemaining===0;
    if (this.recoveryRemaining > 0) {
      this.recoveryRemaining = Math.max(0,this.recoveryRemaining-delta);
      if (this.recoveryRemaining === 0 && this.model.status === 'recovered') this.warning.hidden = true;
    }
    this.scanElapsed += delta;
    if (this.scanElapsed >= .1) { this.scanElapsed = 0; this.scan(); this.renderWarning(); if(this.repairOpen)this.renderSteps(); }
  }

  onEvent(event) {
    const messages = {
      'power-fault': ['LAB POWER FAILURE', 'Reach Watt on the east side of the habitat. Diagnose the damaged feed before backup runs out.'],
      'power-critical': ['LAB POWER CRITICAL', 'Lab supply nearly exhausted. Reroute power at Watt.'],
      'power-blackout': ['LAB BLACKOUT', 'Emergency circuit active. Watt can still restore the lab supply.'],
      'power-restored': ['POWER RESTORED', 'Lab supply recovered.'],
    };
    if (messages[event.type]) {
      const [title,text] = messages[event.type];
      this.warning.querySelector('b').textContent = title; this.warning.querySelector('p').textContent = text;
      this.warning.dataset.severity = ['power-critical','power-blackout'].includes(event.type) ? 'critical' : 'normal';
      this.warning.hidden = false;
    }
    if (['power-fault','power-critical','power-blackout'].includes(event.type)) {
      this.announcement.querySelector('span').textContent=this.model.circuit?.variant?this.model.circuit.label.toUpperCase():'PRIMARY FEED LOST';
      this.announcementRemaining = event.type==='power-fault' ? 4 : 0;
      this.announcement.hidden = this.announcementRemaining===0;
      this.playAlarm();
    }
    if (event.type === 'power-restored') { this.recoveryRemaining = 6; this.closeRepair(false); }
    if (['power-restored','power-reset'].includes(event.type)) { this.stopAlarm(); this.announcementRemaining=0; this.announcement.hidden=true; }
    if (event.type === 'power-reset') this.warning.hidden = true;
    if (event.type === 'repair-wrong-step') this.feedback.textContent = 'Routing rejected. Safety interlock: 2 seconds. Recheck the fuse and voltage readouts.';
    if (event.type === 'repair-step') this.feedback.textContent = this.model.circuit.stages?'Check accepted. Read the next diagnostic before continuing.':event.state.repairStep===1 ? 'Damaged feed isolated. Check the lab bus voltage before routing backup.' : 'Backup connected. Verify the isolated feed and supply, then press Enter to restore.';
    this.renderWarning();
    if (['repair-started','repair-step','repair-wrong-step','power-reset'].includes(event.type)) this.renderSteps();
  }

  renderSteps() {
    const circuit=this.model.circuit;if(!circuit)return;
    const stage=this.model.repairStep;
    const diagnostic=circuit.stages?.[stage],restore=this.model.repairCompleteStage;
    this.panel.querySelector('h2').textContent = diagnostic?.title??['Isolate the fault','Route backup power','Verify and restore'][stage];
    this.panel.querySelector('.power-diagnosis').textContent = diagnostic?`${circuit.label} / ${diagnostic.instruction}`:[
      'Open the tripped feed. Read the fuse indicators; the other feeds are still live.',
      `Lab bus requires ${circuit.requiredVoltage} V. Connect a backup with matching voltage.`,
      `${circuit.feeds[circuit.damaged].label} isolated. ${circuit.banks[circuit.backup].label} connected at ${circuit.requiredVoltage} V. Restore the lab supply.`,
    ][stage];
    this.panel.dataset.stage=String(stage);
    const options=this.options;
    for (const [index,button] of [...this.root.querySelectorAll('[data-power-index]')].entries()) {
      const option=options[index];button.hidden=!option;if(!option)continue;
      button.querySelector('kbd').textContent=restore?'ENTER':String(index+1);
      button.querySelector('span').textContent=restore?'Restore lab circuit':diagnostic?.readout==='leakage'?`${option.label} · leakage ${option.leakage} mA`:diagnostic?`${option.label} · ${option.voltage} V${diagnostic.kind==='feeds'&&circuit.variant==='feed-trip'?` · ${option.tripped?'FUSE TRIPPED':'FUSE CLOSED'}`:''}`:stage===0 ? `${option.label} · ${option.voltage} V · ${option.tripped?'FUSE TRIPPED':'FUSE CLOSED'}` : `${option.label} · ${option.voltage} V`;
      const completed=this.model.completed.includes(option.id);if(completed)button.querySelector('span').textContent+=' · ISOLATED';
      button.disabled=completed||this.model.interlock>0;button.setAttribute('aria-disabled',String(button.disabled));
      button.dataset.state=completed?'complete':this.model.interlock>0?'locked':'ready';
    }
    this.panel.dataset.interlocked=String(this.model.interlock>0);
  }

  get options() { const circuit=this.model.circuit,kind=circuit?.stages?.[this.model.repairStep]?.kind;return kind==='restore'||this.model.repairCompleteStage?[{id:'restore'}]:kind?circuit[kind]:this.model.repairStep===0?circuit.feeds:circuit.banks; }

  renderWarning() {
    const seconds=this.model.outageSeconds;
    if(!this.presentation)this.warning.querySelector('.power-countdown').textContent=seconds===null ? 'SUPPLY STABLE' : seconds===0 ? 'LAB SUPPLY OFFLINE' : `OUTAGE IN ${String(Math.ceil(seconds)).padStart(2,'0')}s`;
    this.warning.querySelector('.power-reserve i').style.width=`${this.model.needsRepair ? this.model.health/60*100 : 100}%`;
    this.warning.querySelector('.power-alarm-toggle').textContent=this.alarmMuted?'[M] UNMUTE ALARM':'[M] MUTE ALARM';
  }

  get alarmMuted() { return this.muted ?? this.isMuted(); }
  unlockAudio() {
    if(this.presentation){this.presentation.audio.unlock();this.audio=this.presentation.audio.context;return;}
    // Called only from the existing Start/Resume click, never from an automatic fault.
    try {
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      if(!this.audio)this.audio=new Audio();
      this.audio.resume().catch(()=>{});
    } catch { /* Silent play remains fully functional when audio is unavailable. */ }
  }

  playAlarm({frequency=520,alternate=390}={}) {
    if(this.presentation)return;
    const audio=this.audio;if(!audio||audio.state!=='running'||this.alarmMuted||!this.active)return;
    this.stopAlarm();
    for(let i=0;i<3;i++) {
      const oscillator=audio.createOscillator(),gain=audio.createGain(),start=audio.currentTime+i*.38;
      oscillator.type='sine';oscillator.frequency.value=i%2 ? alternate : frequency;
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.045,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+.22);
      oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(start);oscillator.stop(start+.25);
      this.alarmNodes.push(oscillator);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();this.alarmNodes=this.alarmNodes.filter(node=>node!==oscillator);};
    }
  }

  stopAlarm() { for(const node of this.alarmNodes){try{node.stop();}catch{}} this.alarmNodes=[]; }
  toggleAlarm() { this.muted=!this.alarmMuted;this.stopAlarm();this.renderWarning();this.onMuteChange(this.muted); }

  openRepair() {
    if (!this.active || !this.canRepair() || !this.model.beginRepair()) return false;
    this.repairOpen = true; this.panel.hidden = false; this.prompt.hidden = true;
    this.feedback.textContent = this.presentation?.snapshot.training ? 'Practice reserve protected. Choose a circuit with 1, 2 or 3. Incorrect routing requires a 2-second interlock.' : 'Choose a circuit with 1, 2 or 3. Power continues to fall. Incorrect routing costs 2 seconds.';
    this.player.clearInput(); this.player.inputEnabled = false;
    this.panel.focus(); this.onInputChange();
    this.renderSteps();
    return true;
  }

  closeRepair(cancel) {
    if (!this.repairOpen) return;
    this.repairOpen = false; this.panel.hidden = true;
    if (cancel) this.model.cancelRepair();
    this.player.clearInput(); this.player.inputEnabled = true;
    this.onInputChange();
  }

  choose(id) {
    if (!this.active || !this.repairOpen) return 'unavailable';
    const result=this.model.selectRepairStep(id);if(result==='already-complete')this.feedback.textContent='That circuit is already isolated. Choose the remaining circuit.';return result;
  }
  chooseIndex(index) { const option=this.options[index];if(option)return this.choose(option.id);return 'invalid'; }

  handleKey(event) {
    if (!this.active || event.ctrlKey || event.metaKey || event.altKey) return false;
    if(event.code==='KeyM'&&!event.repeat){event.preventDefault();this.toggleAlarm();return true;}
    if (this.repairOpen) {
      if (event.code === 'Escape') { this.closeRepair(true); return false; }
      if (event.code === 'Tab') {
        const buttons=[...this.panel.querySelectorAll('button')].filter(button=>!button.hidden&&!button.disabled),first=buttons[0],last=buttons.at(-1);
        if (event.shiftKey && [this.panel,first].includes(document.activeElement)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); }
        return true;
      }
      const index = ['Digit1','Digit2','Digit3'].indexOf(event.code.replace('Numpad','Digit'));
      if (index >= 0 || ['Enter','NumpadEnter','Backspace','KeyE','KeyR'].includes(event.code)) {
        event.preventDefault(); if (event.repeat) return true;
        if (index >= 0) { if(!this.model.repairCompleteStage)this.chooseIndex(index); }
        else if(['Enter','NumpadEnter'].includes(event.code)) { if(this.model.repairCompleteStage)this.choose('restore'); }
        else if (event.code === 'Backspace') this.closeRepair(true);
        else if (event.code === 'KeyR') this.player.reset();
        return true;
      }
      return false;
    }
    if (event.code !== 'KeyE' || event.repeat || !this.model.needsRepair) return false;
    // Revalidate actual aim/range/glass occlusion on the key press.
    this.manager.update(this.camera);
    if (!this.manager.focus) return false;
    event.preventDefault(); return this.manager.interact(this.camera);
  }

  reset() {
    this.closeRepair(true); this.model.reset(); this.lighting.reset(); this.recoveryRemaining = 0;
    this.prompt.hidden = true; this.scanElapsed = 0;
  }
}
