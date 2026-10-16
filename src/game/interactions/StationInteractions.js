import { InteractionManager } from './InteractionManager.js';
import { AutomaticDialogue } from '../dialogue/AutomaticDialogue.js';
import { DialogueManager } from '../dialogue/DialogueManager.js';
import { dialogueData, dialogueRoster, dialogueLine, orientationIntroduction } from '../dialogue/dialogueData.js';
import { SpeakerMarker, speakerAnchor } from '../ui/SpeakerMarker.js';
import { SpeakerHighlight } from '../ui/SpeakerHighlight.js';
import { SpeakerConnector } from '../ui/SpeakerConnector.js';
import { DialogueAnchors } from '../ui/DialogueAnchors.js';
import { DialoguePresentation } from '../ui/DialoguePresentation.js';
import {StationPersonality,personalityLine,criticalContext,dialogueContextKey,urgentInstruction} from '../dialogue/StationPersonality.js';
import {EasterEggManager,discoveryClue,DISCOVERY_RETURN_SECONDS,CACTUS_VISITS} from '../secrets/EasterEggManager.js';
import {ConsoleArchive} from '../secrets/ConsoleArchive.js';
import {SkyWatch,SKY_WATCH_SECONDS} from '../secrets/SkyWatch.js';

/** Gameplay-only UI and registrations around the existing scene/render loop. */
export class StationInteractions {
  constructor({ scene, camera, models, host, getContext=()=>({}), reducedMotion=false }) {
    this.camera = camera;
    this.getContext=getContext;this.personality=new StationPersonality();this.secrets=new EasterEggManager();
    this.active = false;
    this.scanElapsed = 0;
    this.counts = new Map();
    this.clues = new Map();
    this.automaticIds = new Set();
    this.sources = new Map();
    this.speakerVisible = false;
    this.visibilityEpoch = 0;
    this.scanVisibility = new Map();
    this.scanningVisibility = false;
    this.scanAnchors = [];
    this.scanAnchorCount = 0;
    this.root = document.createElement('div');
    this.root.className = 'interaction-ui';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="interaction-prompt" hidden><kbd>E</kbd><span></span></div>
      <section class="interaction-dialogue" aria-live="polite" aria-atomic="true" hidden>
        <div class="dialogue-surface"><header class="dialogue-heading"><i class="dialogue-icon" aria-hidden="true"></i><span></span></header><p></p></div>
        <svg class="speaker-connector" aria-hidden="true"><path/></svg>
      </section>`;
    host.append(this.root);
    this.marker = new SpeakerMarker();
    this.prompt = this.root.querySelector('.interaction-prompt');
    this.promptText = this.prompt.querySelector('span');
    const container = this.root.querySelector('.interaction-dialogue');
    this.connector = new SpeakerConnector(container.querySelector('.speaker-connector'));
    this.highlight = new SpeakerHighlight();
    this.dialogue = new DialogueManager({ container, speaker: container.querySelector('span'), text: container.querySelector('p') });
    this.presentation = new DialoguePresentation({ container, root:this.root, host, marker:this.marker, connector:this.connector, reducedMotion });
    this.archive=new ConsoleArchive({secrets:this.secrets,reveal:()=>this.revealArchive(),
      waitingForMessage:()=>['important','urgent'].includes(this.dialogue.current?.kind)||!!this.dialogue.suspended,
      urgentMessage:()=>this.dialogue.current?.kind==='urgent'});
    this.manager = new InteractionManager({ onFocus: focus => {
      this.prompt.hidden = !focus || this.automaticIds.has(focus.id);
      this.promptText.textContent = focus ? `${focus.action} — ${focus.label}` : '';
    } });
    this.automatic = new AutomaticDialogue({ canSee: id => this.canSeeSource(id) });
    for (const { model, id, radius, anchor, visibilityId } of dialogueRoster) {
      const object = models.get(model), nearbyObject = models.get(anchor ?? model);
      if (!object || !nearbyObject) continue;
      const anchorPoint = speakerAnchor(nearbyObject);
      const anchors = new DialogueAnchors(nearbyObject, id);
      this.sources.set(id, { object, visibilityId, nearbyObject, anchorPoint, anchors });
      this.automaticIds.add(id);
      const speak = () => this.speakCharacter(id);
      this.manager.register(object, { id, label: dialogueData[id].role, onInteract: speak });
      const discoverySource=['cactus','console'].includes(id);
      this.automatic.register({ id, object: nearbyObject, radius, speak,
        cooldown:discoverySource?DISCOVERY_RETURN_SECONDS:this.automatic.cooldown,waitForCooldown:discoverySource });
    }
    // Cache existing world meshes once, including lab glass and moving doors.
    // This runs before the menu title is staged; arrival props aren't targets.
    this.manager.setOccluders(scene.children);
    this.skyWatch=new SkyWatch({secrets:this.secrets,occluders:this.manager.occluders,reveal:()=>this.speakRadio('SECRET FOUND / TOUCH GRASS. Twenty seconds of sky watching logged. Unfortunately, there is none.',false)});
  }

  canSeeSource(id) {
    const source = this.sources.get(id);
    if (!source) return false;
    for (let ancestor = source.object; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return false;
    const targetId = source.visibilityId ?? id;
    let visible = this.scanningVisibility ? this.scanVisibility.get(targetId) : undefined;
    if (visible === undefined) {
      visible = this.manager.canSee(targetId, this.camera);
      if (this.scanningVisibility) this.scanVisibility.set(targetId, visible);
    }
    if (!visible) return false;
    source.anchors.refresh(this.camera, this.visibilityEpoch,
      (point, inside) => this.anchorVisibility(targetId, point, inside));
    return !!source.anchors.choose(this.camera, this.manager.focus?.id === targetId ? this.manager.focusPoint : null);
  }

  anchorVisibility(id, point, inside) {
    if (!this.scanningVisibility) return this.manager.canSeeAnchor(id, this.camera, point, inside);
    for (let index = 0; index < this.scanAnchorCount; index++) {
      const entry = this.scanAnchors[index];
      if (entry.id === id && entry.inside === inside && entry.point.equals(point)) return entry.visible;
    }
    const entry = this.scanAnchors[this.scanAnchorCount] ?? (this.scanAnchors[this.scanAnchorCount] = {point:point.clone()});
    this.scanAnchorCount++;entry.id = id;entry.inside = inside;entry.point.copy(point);
    entry.visible = this.manager.canSeeAnchor(id, this.camera, point, inside);
    return entry.visible;
  }

  setReducedMotion(reducedMotion) { this.presentation.setReducedMotion(reducedMotion); }

  speakCharacter(id) {
    if (!this.active || !this.sources.has(id)) return false;
    const context = this.getContext();
    if (criticalContext(context) || (context.shift && context.shift.status !== 'running')) return false;
    if (!this.canSeeSource(id)) return false;
    const data = dialogueData[id], count = this.counts.get(id) ?? 0;
    const secretLine = id === 'cactus' && count > 0 ? this.secrets.cactusLine(context) : null;
    const reaction = personalityLine(id, count, context);
    const discovery = secretLine?.startsWith('SECRET FOUND / PRIORITIES');
    const clue = this.secrets.canReveal(context)&&!discovery&&!this.clueFound(id)
      ? secretLine??discoveryClue(id,count) : null;
    const hint=clue&&!secretLine?` ${clue}`:'';
    const key = dialogueContextKey(context);
    const orientation = orientationIntroduction(context);
    if (!this.dialogue.show({ speaker: `${data.speaker} / ${data.role}`,
      text: (secretLine ?? reaction ?? dialogueLine(id, count, context)) + hint, sourceId: id,
      id: discovery ? 'discovery/priorities' : `character/${id}/${count}`,
      kind: discovery ? 'important' : count === 0 ? 'introduction' : secretLine || reaction ? 'contextual' : 'ambient',
      validWhile: current => dialogueContextKey(current) === key && (count !== 0 || orientationIntroduction(current) === orientation),
    })) return false;
    if (id === 'cactus') this.secrets.recordCactus(context);
    if(clue)this.clues.set(id,clue);
    this.counts.set(id, count + 1);
    this.radioActive = false;
    this.syncSpeaker();
    return true;
  }

  // Restore existing source cues when protected speech returns after repair/radio.
  syncSpeaker() {
    const id = this.dialogue.sourceId, source = this.sources.get(id);
    if (!source) {
      this.marker.clear(); this.highlight.clear(); this.connector.hide();
      this.speakerVisible = false; this.visualSourceId = null;
      return;
    }
    if (this.visualSourceId !== id) {
      const data = dialogueData[id], object = source.nearbyObject;
      this.marker.select({ object, anchor: source.anchorPoint, anchors:source.anchors,
        label: source.visibilityId ? `RADIO VIA WATT \u00b7 ${data.speaker}` : `${id === 'astronaut' ? 'ASTRONAUT' : data.role} \u00b7 ${data.speaker}` });
      this.highlight.select(object);
      this.visualSourceId = id;
      this.speakerVisible = this.automatic.canSee(id);
    }
  }

  reconcileDialogue(context) {
    if(context.shift&&context.shift.status!=='running'){
      this.archive.reset();
      this.skyWatch.reset();
      this.dialogue.clear();this.syncSpeaker();return;
    }
    this.dialogue.reconcile(context, {
      chatterBlocked: criticalContext(context),
      importantBlocked: Object.values(context.systems ?? {}).some(system => system?.needsRepair),
    });
    this.syncSpeaker();
  }

  archiveEligible(){return this.active&&this.manager.focus?.id==='console'&&(this.counts.get('console')??0)>0;}

  clueFound(id){
    const secret=id==='cactus'?'priorities':id==='console'?'archive-4173':
      ['tortoise','astronaut','dish'].includes(id)?'touch-grass':null;
    return secret&&this.secrets.has(secret);
  }

  revealCactus(){
    const context=this.getContext();
    if(!this.active||this.secrets.cactusVisits<CACTUS_VISITS||this.secrets.has('priorities')||
      !this.secrets.canReveal(context)||criticalContext(context)||
      ['important','urgent'].includes(this.dialogue.current?.kind)||this.dialogue.suspended)return false;
    this.manager.update(this.camera);if(this.manager.focus?.id!=='cactus')return false;
    if(!this.dialogue.show({speaker:'SPIKE / PIPE ORGAN CACTUS',text:this.secrets.cactusLine(context),
      sourceId:'cactus',kind:'important',id:'discovery/priorities',manual:true}))return false;
    this.secrets.recordCactus(context);this.syncSpeaker();this.radioActive=false;return true;
  }

  recallClue(){
    const context=this.getContext(),id=this.manager.focus?.id;
    if(!this.secrets.canReveal(context)||criticalContext(context)||
      ['important','urgent'].includes(this.dialogue.current?.kind)||this.dialogue.suspended)return false;
    const sky=!id&&this.skyWatch.looking&&!this.secrets.has('touch-grass');
    const text=sky?discoveryClue('sky',1):this.clueFound(id)?null:this.clues.get(id);
    if(!text)return false;
    const data=sky?{speaker:'STATION AI',role:'HABITAT INTERCOM'}:dialogueData[id];
    if(!this.dialogue.show({speaker:`${data.speaker} / ${data.role}`,text,sourceId:sky?null:id,
      kind:'contextual',manual:true,validWhile:current=>this.secrets.canReveal(current)}))return false;
    this.syncSpeaker();this.radioActive=false;return true;
  }

  renderDiscoveryPrompt(context){
    if(!this.manager.focus||this.automaticIds.has(this.manager.focus.id))this.prompt.hidden=true;
    this.renderArchivePrompt(context);
    if(this.manager.focus?.id==='console')return;
    if(!this.active||context?.shift?.status!=='running'||criticalContext(context)||this.dialogue.current?.kind==='urgent')return;
    const id=this.manager.focus?.id,entry=this.automatic.entries.find(entry=>entry.id===id);
    let text=null;
    if(id==='cactus'&&this.secrets.cactusVisits>0&&!this.secrets.has('priorities')){
      const progress=`Spike / visits ${this.secrets.cactusVisits} / ${CACTUS_VISITS}`;
      text=!this.secrets.canReveal(context)?`${progress} retained / repair station faults`
        :this.secrets.cactusVisits===CACTUS_VISITS?`${progress} / waiting for the announcement`
        :entry?.pending?`${progress} / ${entry.remaining>0?`next visit in ${Math.ceil(entry.remaining)}s`:'waiting for the conversation'}`
        :`${progress} / step away and return${entry?.remaining>0?` in ${Math.ceil(entry.remaining)}s`:''} / [H] clue`;
    }else if(this.skyWatch.looking&&!this.secrets.has('touch-grass')){
      const progress=`Sky observation / ${Math.floor(this.skyWatch.elapsed)} / ${SKY_WATCH_SECONDS}s`;
      text=!this.secrets.canReveal(context)?`${progress} retained / repair station faults`
        :this.skyWatch.elapsed===SKY_WATCH_SECONDS?`${progress} / waiting for the announcement`
        :`${progress} / clear sky / [H] clue`;
    }else if(this.clues.has(id)&&!this.clueFound(id))text=`${dialogueData[id].speaker} / [H] recall clue`;
    if(text){this.prompt.hidden=false;this.prompt.querySelector('kbd').textContent=this.secrets.canReveal(context)?'H':'—';this.promptText.textContent=text;}
  }

  renderArchivePrompt(context){
    const focused=this.active&&this.manager.focus?.id==='console';
    if(!focused||context?.shift?.status!=='running'||this.secrets.has('archive-4173')){
      this.prompt.querySelector('kbd').textContent='E';
      if(this.automaticIds.has(this.manager.focus?.id))this.prompt.hidden=true;
      return;
    }
    this.prompt.hidden=false;this.prompt.querySelector('kbd').textContent='0–9';
    if(!this.archiveEligible()){
      this.prompt.querySelector('kbd').textContent='—';
      this.promptText.textContent=this.archive.safetyBlocked(context)
        ?'Patch archive / Safety lock / repair urgent fault before meeting Patch'
        :'Patch archive / Locked / meet Patch first';return;
    }
    const waiting=this.archive.digits==='4173';
    const protectedMessage=this.dialogue?.current?.kind==='important';
    const safety=this.archive.safetyBlocked(context),fault=!this.secrets.canReveal(context);
    if(safety||(waiting&&fault))this.prompt.querySelector('kbd').textContent='—';
    else if(waiting&&protectedMessage)this.prompt.querySelector('kbd').textContent='↵';
    const progress=waiting?'Code accepted':`enter 4-digit code / ${this.archive.digits.padEnd(4,'_')}`;
    if(safety){
      this.promptText.textContent=`Patch archive / Safety lock / repair urgent fault${this.archive.digits?' / entry retained':''}`;return;
    }
    if(fault){
      this.promptText.textContent=`Patch archive / ${this.archive.notice||progress} / repair station faults to open`;return;
    }
    const status=this.archive.notice||(waiting
      ? protectedMessage?'Code accepted / finish the message with Enter':'Code accepted / waiting for the announcement'
      : `enter 4-digit code / ${this.archive.digits.padEnd(4,'_')}`);
    this.promptText.textContent=`Patch archive / ${status}${!this.archive.digits&&!this.archive.notice&&this.clues?.has('console')?' / [H] clue':''}`;
  }

  revealArchive(){
    if(!this.active||!this.sources.has('console'))return false;
    this.manager.update(this.camera);
    if(!this.archiveEligible()||!this.secrets.canReveal(this.getContext()))return false;
    // Completing the code is an explicit selection. Ordinary greetings/banter
    // yield immediately; unread discoveries and urgent instructions keep priority.
    if(['important','urgent'].includes(this.dialogue.current?.kind))return false;
    if(!this.dialogue.show({speaker:'PATCH / RESEARCH CONSOLE',text:'SECRET FOUND / LEGACY CHANNEL. Archive 4173: this station used to be a portfolio. Management has since added oxygen requirements.',sourceId:'console',kind:'important',id:'discovery/archive-4173',manual:true}))return false;
    this.syncSpeaker();this.radioActive=false;return true;
  }

  handleKey(event){
    if(!this.active)return false;
    if(['Enter','NumpadEnter'].includes(event.code)&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing&&this.dialogue?.current?.kind==='important'&&!this.dialogue.container.hidden){
      event.preventDefault();
      if(!event.repeat){this.dialogue.acknowledge();this.syncSpeaker();}
      return true;
    }
    this.manager.update(this.camera);
    if(event.code==='KeyH'&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.shiftKey&&!event.isComposing){
      if(event.repeat)return false;
      if(!this.recallClue())return false;
      event.preventDefault();this.renderDiscoveryPrompt(this.getContext());return true;
    }
    const context=this.getContext(),handled=this.archive.handleKey(event,this.archiveEligible(),context);
    this.renderDiscoveryPrompt(context);return handled;
  }

  observeRun(){
    const context=this.getContext();this.personality.observe(context);
    this.reconcileDialogue(context);
    const instruction=urgentInstruction(context);
    const key=instruction?`urgent/${instruction.id}/${instruction.status}/${instruction.variant??'classic'}`:null;
    if(!key)this.lastUrgentKey=null;
    if(this.active&&key&&key!==this.lastUrgentKey&&this.dialogue.show({
      speaker:'STATION AI / HABITAT INTERCOM',text:instruction.text,duration:4,kind:'urgent',id:key,
      validWhile:current=>{const next=urgentInstruction(current);return next?.id===instruction.id&&next.status===instruction.status&&next.variant===instruction.variant;},
    })){this.lastUrgentKey=key;this.radioActive=false;this.syncSpeaker();}
  }

  speakRadio(text,personality=true,entry=null){
    if(!this.active||criticalContext(this.getContext()))return false;
    if(!personality&&!this.secrets.canReveal(this.getContext()))return false;
    if(!this.dialogue.show({speaker:'STATION AI / HABITAT INTERCOM',text,duration:4,
      kind:personality?'contextual':'important',id:personality?null:'discovery/touch-grass',
      validWhile:personality?context=>this.personality.relevant(context,entry):null,
    }))return false;
    // The AI is heard remotely; don't point a world bubble at a nearby prop.
    this.syncSpeaker();this.radioActive=personality;return true;
  }

  setActive(active, { reason = 'pause' } = {}) {
    active = !!active;
    const changed = active !== this.active || reason !== this.interruptionReason;
    this.interruptionReason = reason;
    this.dialogue.setActive(active, { reason });
    if (!active && reason === 'repair' && changed) this.lastUrgentKey = null;
    if (!changed) return;
    this.active = active;
    this.root.hidden = !active;
    this.manager.setEnabled(active);
    if(reason==='terminal'){this.archive.reset();this.skyWatch.reset();}
    if (!active) { this.skyWatch.looking=false;this.prompt.hidden=true;this.marker.element.hidden = true; this.presentation.hide(); this.highlight.setVisible(false); }
    if (active) { this.visibilityEpoch++;this.manager.update(this.camera);const context=this.getContext();this.reconcileDialogue(context);this.renderDiscoveryPrompt(context); }
  }

  update(position, delta, { deferProjection = false } = {}) {
    if (!this.active) return;
    this.dialogue.update(delta);
    this.syncSpeaker();
    this.personality.update(this.getContext(),(text,entry)=>this.speakRadio(text,true,entry));
    this.scanElapsed += delta;
    if (this.scanElapsed >= .1) {
      this.visibilityEpoch++;
      this.manager.update(this.camera);
      const context=this.getContext();
      if(!this.secrets.has('touch-grass'))this.skyWatch.update(this.scanElapsed,this.skyWatch.lookingAtSky(this.camera),context);
      else this.skyWatch.reset();
      // Geometry cannot move during this synchronous scan. Share repeated
      // Watt/Relay and speaker queries, then discard results before input or
      // the next frame so moving doors and equipment are checked afresh.
      this.scanVisibility.clear();this.scanAnchorCount = 0;this.scanningVisibility = true;
      try {
        this.automatic.update(position, this.scanElapsed);
        this.speakerVisible = !!this.dialogue.sourceId && this.automatic.canSee(this.dialogue.sourceId);
      } finally { this.scanningVisibility = false;this.scanVisibility.clear();this.scanAnchorCount = 0; }
      if(this.dialogue.sourceId&&!this.speakerVisible&&this.dialogue.current.kind!=='important'){
        this.dialogue.interrupt();this.syncSpeaker();
      }
      this.scanElapsed = 0;
    }
    // Pending input must not finish after the player turns away between scans.
    if(this.archive.digits)this.manager.update(this.camera);
    const context=this.getContext();
    this.archive.update(delta,this.archiveEligible(),context);this.revealCactus();this.renderDiscoveryPrompt(context);
    if(!deferProjection)this.projectDialogue(delta);
  }

  projectDialogue(delta=0) {
    if (!this.dialogue.sourceId) {
      if (this.marker.source) { this.marker.clear(); this.highlight.clear(); }
      this.connector.hide();
    } else {
      const source = this.sources.get(this.dialogue.sourceId);
      const targetId = source.visibilityId ?? this.dialogue.sourceId;
      this.marker.update(this.camera, this.root.clientWidth, this.root.clientHeight, this.speakerVisible,
        this.manager.focus?.id === targetId ? this.manager.focusPoint : null);
      // Frustum/behind-camera rejection is immediate, even between raycast scans.
      if(this.marker.element.hidden&&this.dialogue.current.kind!=='important'){
        this.dialogue.interrupt();this.syncSpeaker();
      }
      this.highlight.setVisible(!this.marker.element.hidden);
    }
    this.presentation.update(this.dialogue, delta);
    if(this.dialogue.current?.sourceId&&this.dialogue.current.kind!=='important'&&this.dialogue.container.hidden){
      this.dialogue.interrupt();this.syncSpeaker();
    }
  }

  interact() {
    if (!this.active) return false;
    this.manager.update(this.camera);
    // E remains available for future explicit equipment actions, not chatter.
    if (this.automaticIds.has(this.manager.focus?.id)) return false;
    return this.manager.interact(this.camera);
  }

  reset() {
    this.counts.clear();
    this.clues.clear();
    this.personality.reset();
    this.secrets.reset();
    this.archive.reset();
    this.skyWatch.reset();
    this.radioActive=false;
    this.lastUrgentKey=null;this.visualSourceId=null;this.interruptionReason=null;
    this.dialogue.reset();
    this.presentation.reset();
    for (const source of this.sources.values()) source.anchors.reset();
    this.visibilityEpoch++;
    this.marker.clear();
    this.highlight.clear();
    this.connector.hide();
    this.speakerVisible = false;
    this.automatic.reset();
    this.manager.setFocus(null);
    this.scanElapsed = 0;
  }
}
