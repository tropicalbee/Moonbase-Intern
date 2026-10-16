import { alarmSamples } from './AlarmSamples.js';

const clamp = value => Number.isFinite(value) ? Math.min(1,Math.max(0,value)) : 0;

/** Small, bounded Web Audio mix. Arrival and terminal compositions retain their owners. */
export class EmergencyAudio {
  constructor({ createContext = () => { const Audio = globalThis.window?.AudioContext ?? globalThis.window?.webkitAudioContext; return Audio ? new Audio() : null; }, fetchSample = (url, options) => fetch(url, options) } = {}) {
    this.createContext = createContext; this.context = null; this.voices = new Set();
    this.active = false; this.muted = false; this.masterVolume = .7; this.alertVolume = .7;
    this.elapsed = 0; this.nextAlarm = 0; this.bedKey = null; this.snapshot = null; this.disposed = false; this.resumeAlarm = false;
    this.fetchSample = fetchSample; this.sampleBuffers = new Map(); this.sampleVoice = null;
  }

  unlock() {
    if (this.disposed) return;
    try {
      if (!this.context) {
        this.context = this.createContext();
        if (!this.context) return;
        const audio = this.context;
        this.master = audio.createGain(); this.alert = audio.createGain();
        this.ambience = audio.createGain(); this.transient = audio.createGain();
        this.alert.connect(this.master); this.ambience.connect(this.master); this.transient.connect(this.master);
        this.master.connect(audio.destination);
        this.master.gain.value = this.masterVolume; this.alert.gain.value = this.alertVolume;
        this.ambience.gain.value = .12; this.transient.gain.value = .6;
        const buffer = audio.createBuffer(1,audio.sampleRate,audio.sampleRate), samples = buffer.getChannelData(0);
        let seed = 0x6c756e61;
        for (let i=0;i<samples.length;i++) { seed=(Math.imul(seed,1664525)+1013904223)>>>0; samples[i]=seed/2147483648-1; }
        this.noiseBuffer = buffer;
      }
      const resumed = this.context.resume();
      this.loadSamples();
      resumed?.then(() => { if (!this.disposed) this.rebuild(); }).catch(() => {});
      this.rebuild();
    } catch { this.stop(true);for(const node of [this.master,this.alert,this.ambience,this.transient])node?.disconnect();this.context?.close()?.catch(()=>{});this.context=null;this.noiseBuffer=null; }
  }

  loadSamples() {
    if (this.sampleLoad || !this.context?.decodeAudioData) return;
    const context = this.context;
    this.sampleAbort = new AbortController();
    // Decode once after user activation; retain only short excerpts, never the long recordings.
    this.sampleLoad = Promise.all(Object.entries(alarmSamples).map(async ([key, definition]) => {
      try {
        const response = await this.fetchSample(definition.url, { signal: this.sampleAbort.signal });
        if (!response.ok) throw Error('Audio recording unavailable');
        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        if (this.disposed || this.context !== context) return;
        // Skip a quiet lead-in, keeping 30 ms before the first audible block.
        let offset = 0;
        const intro = decoded.getChannelData(0), scanEnd = Math.min(decoded.length, decoded.sampleRate * 8);
        for (let start = 0; start < scanEnd; start += 256) {
          const end = Math.min(start + 256, scanEnd); let energy = 0;
          for (let i = start; i < end; i++) energy += intro[i] * intro[i];
          if (energy / (end - start) > .00001) { offset = Math.max(0, start - Math.ceil(decoded.sampleRate * .03)); break; }
        }
        const length = Math.min(decoded.length - offset, Math.ceil(decoded.sampleRate * definition.seconds));
        if (!length) return;
        const buffer = context.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
        let peak = 0;
        for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
          const samples = decoded.getChannelData(channel).subarray(offset, offset + length);
          buffer.getChannelData(channel).set(samples);
          for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
        }
        this.sampleBuffers.set(key, { buffer, duration: length / decoded.sampleRate, gain: Math.min(1, definition.peak / Math.max(.01, peak)) });
      } catch { /* Keep the existing bounded fallback when a recording cannot load/decode. */ }
    }));
  }

  retire(voice, hard = false) {
    if (!voice) return;
    if (!hard) this.ramp(voice.gain, 0, .03);
    try { voice.source.stop((this.context?.currentTime ?? 0) + (hard ? 0 : .04)); } catch {}
    if (hard) { for (const node of voice.nodes) node.disconnect(); this.voices.delete(voice); }
    if (this.sampleVoice === voice) this.sampleVoice = null;
  }

  recording(key, system, channel = 'alert', seconds = null, volume = 1) {
    const sample = this.sampleBuffers.get(key);
    if (!sample || !this.audible) return false;
    if (this.sampleVoice?.system === system && this.sampleVoice.key === key) return true;
    this.retire(this.sampleVoice);
    if (this.voices.size >= 10) return true;
    const source = this.context.createBufferSource(), gain = this.context.createGain(), at = this.context.currentTime;
    const duration = Math.min(seconds ?? sample.duration, sample.duration);
    source.buffer = sample.buffer; source.connect(gain); gain.connect(this[channel]);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(sample.gain * volume, at + Math.min(.04, duration / 4));
    gain.gain.setValueAtTime(sample.gain * volume, at + Math.max(.04, duration - .09));
    gain.gain.linearRampToValueAtTime(0, at + duration);
    this.sampleVoice = Object.assign(this.own(source, [source, gain], channel), { key, system });
    source.start(at); source.stop(at + duration);
    return true;
  }

  ramp(gain,value,time=.04) {
    if (!gain || !this.context) return;
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(gain.gain.value,now);
    gain.gain.linearRampToValueAtTime(value,now+time);
  }

  setVolumes(master,alert) {
    this.masterVolume = clamp(master); this.alertVolume = clamp(alert);
    this.ramp(this.master,this.muted ? 0 : this.masterVolume); this.ramp(this.alert,this.alertVolume);
  }

  setMuted(muted) {
    const unmuting = this.muted && !muted;
    this.muted = !!muted;
    if (this.muted) this.resumeAlarm = false;
    else if (unmuting) this.resumeAlarm = true;
    this.ramp(this.master,this.muted ? 0 : this.masterVolume);
    if (this.muted) this.stop(); else this.rebuild();
  }

  setActive(active,snapshot) {
    this.active = !!active; this.snapshot = snapshot;
    this.bedKey = null; this.nextAlarm = this.elapsed + .15;
    if (!this.active) this.stop(); else this.rebuild();
  }

  get audible() { return this.active && !this.muted && this.context?.state === 'running' && !this.disposed; }

  rebuild() {
    if (!this.audible || this.ambientVoices?.length) return;
    this.ambientVoices = [this.noise(.02,0,true,180,'ambience'),this.tone(52,'sine',.02,0,true,'ambience')].filter(Boolean);
    this.nextAlarm = this.elapsed + .15;
  }

  own(source,nodes,channel) {
    const voice = { source,nodes,channel,gain:nodes.find(node=>node.gain) };
    this.voices.add(voice);
    source.onended = () => { for (const node of nodes) node.disconnect(); this.voices.delete(voice); if (this.sampleVoice === voice) this.sampleVoice = null; };
    return voice;
  }

  tone(frequency,type,peak,duration,loop=false,channel='alert',offset=0,endFrequency=frequency) {
    if (!this.audible || this.voices.size >= 10) return null;
    const audio = this.context, source = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime+offset;
    source.type=type; source.frequency.setValueAtTime(frequency,at);
    if (!loop) source.frequency.exponentialRampToValueAtTime(endFrequency,at+duration);
    source.connect(gain); gain.connect(this[channel]);
    gain.gain.setValueAtTime(0,at); gain.gain.linearRampToValueAtTime(peak,at+.025);
    if (!loop) gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    const voice = this.own(source,[source,gain],channel); source.start(at);
    if (!loop) source.stop(at+duration+.02);
    return voice;
  }

  noise(peak,duration,loop=false,frequency=700,channel='transient') {
    if (!this.audible || this.voices.size >= 10) return null;
    const audio=this.context, source=audio.createBufferSource(), gain=audio.createGain(), filter=audio.createBiquadFilter(), at=audio.currentTime;
    source.buffer=this.noiseBuffer; source.loop=loop; filter.type=loop?'lowpass':'bandpass';filter.frequency.value=frequency;filter.Q.value=.6;
    source.connect(filter);filter.connect(gain);gain.connect(this[channel]);
    gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(peak,at+.02);
    if(!loop)gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    const voice=this.own(source,[source,filter,gain],channel);source.start(at);
    if(!loop)source.stop(at+duration+.02);
    return voice;
  }

  motif(system,critical=false,transition=false) {
    const key = critical && ['power','oxygen','cooling'].includes(system) ? 'emergency'
      : system === 'power' ? 'power' : ['oxygen','cooling'].includes(system) ? 'emergency' : 'equipment';
    if (this.recording(key, system, ['communications','rover'].includes(system) ? 'transient' : 'alert', critical ? null : system === 'power' ? null : .85, critical ? 1 : .65)) return;
    if(system==='power') {
      if(transition){this.noise(critical?.04:.025,.17,false,550);this.tone(critical?175:240,'triangle',.055,.35,false,'alert',0,80);}
      else {this.tone(140,'triangle',.04,.18);if(critical)this.tone(140,'triangle',.035,.18,false,'alert',.25);}
    } else if(system==='oxygen') {
      this.tone(510,'sine',.06,.14);this.tone(410,'sine',.055,.2,false,'alert',.18);
    } else if(system==='cooling') {
      this.tone(195,'triangle',.065,.4,false,'alert',0,145);this.noise(.025,.24,false,310,'alert');
    } else if(system==='communications') {
      this.tone(1150,'sine',.025,.07,false,'transient',0,650);
      this.tone(850,'sine',.02,.09,false,'transient',.11,420);
    } else if(system==='rover') {
      this.tone(125,'sawtooth',.022,.22,false,'transient',0,55);this.noise(.02,.09,false,240);
    }
  }

  update(snapshot,delta,events=[]) {
    this.snapshot=snapshot;
    if (!this.active || !Number.isFinite(delta) || delta < 0) return;
    this.elapsed+=delta;
    if(!this.audible)return;
    this.rebuild();
    const power=snapshot.incidents.find(i=>i.system==='power');
    this.ramp(this.ambience,power?.status==='blackout'?.025:snapshot.category==='CRITICAL'?.05:snapshot.incidents.some(i=>i.system==='oxygen')?.075:.12,.18);
    this.ramp(this.transient,snapshot.category==='CRITICAL'?.15:.6);
    const dominant=snapshot.dominant;
    // Life support keeps a restrained warning cadence, including protected practice.
    // Equipment still gets brief cues rather than a continuous alarm.
    const bed=dominant && (dominant.severity==='critical'||dominant.lethal) ? dominant : null;
    const key=bed?`${bed.id}/${bed.status}`:null;
    if(key!==this.bedKey){this.retire(this.sampleVoice);this.bedKey=key;this.nextAlarm=this.elapsed;}
    if(this.sampleVoice && this.sampleVoice.system !== 'recovery' && !snapshot.incidents.some(i=>i.system===this.sampleVoice.system))this.retire(this.sampleVoice);
    const candidates=events.filter(e=>!e.type.endsWith('-restored')&&(!Number.isFinite(e.at)||snapshot.elapsed-e.at<=.8));
    const cue=candidates.find(e=>e.id===dominant?.id)??(snapshot.category==='CRITICAL'?null:candidates[0]);
    if(cue){this.motif(cue.system,snapshot.category==='CRITICAL',cue.type.endsWith('-fault'));this.nextAlarm=this.elapsed+1.8;}
    else if(dominant&&(this.resumeAlarm||bed&&this.elapsed>=this.nextAlarm)){this.motif(dominant.system,dominant.severity==='critical');this.nextAlarm=this.elapsed+(dominant.severity==='critical'?(dominant.deadline<=8?1.2:1.8):4);}
    this.resumeAlarm = false;
    if(snapshot.category==='NORMAL'&&events.some(e=>e.type.endsWith('-restored'))){
      if (!this.recording('equipment','recovery','transient',.4,.35)) this.tone(390,'sine',.03,.18,false,'transient',0,590);
    }
  }

  stop(hard=false) {
    const at=(this.context?.currentTime??0)+(hard?0:.04);
    for(const voice of this.voices){
      if(!hard)this.ramp(voice.gain,0,.03);
      try{voice.source.stop(at);}catch{}
      // Remove ownership immediately, so resume cannot mistake stopping voices for live ambience.
      for(const node of voice.nodes)if(hard)node.disconnect();
    }
    if(hard)this.voices.clear();
    this.ambientVoices=null;
    this.sampleVoice=null;
  }

  terminate(){this.active=false;this.stop(true);this.bedKey=null;this.resumeAlarm=false;}
  reset(){this.terminate();this.elapsed=0;this.nextAlarm=0;this.snapshot=null;}
  dispose(){if(this.disposed)return;this.reset();this.disposed=true;this.sampleAbort?.abort();this.sampleBuffers.clear();for(const node of [this.master,this.alert,this.ambience,this.transient])node?.disconnect();this.context?.close()?.catch(()=>{});this.context=null;this.noiseBuffer=null;}
}
