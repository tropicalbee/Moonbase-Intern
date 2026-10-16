import {THERMAL_IMPACT_TIME} from './EndingChoreography.js';

// Supplied recordings with bounded procedural fallbacks through the station master bus.
// Times follow the cinematic, including a silent breath after a failed transmission.
export function endingAudioCues(kind,{samples=new Set(),reason=null}={}){
  const cues=[
    {at:.25,duration:.12,frequency:760,to:620,peak:.025},
    {at:.37,duration:1.45,noise:true,frequency:1100,to:750,peak:.012},
    {at:1.88,duration:.16,frequency:620,to:kind==='success'?780:310,peak:.022}
  ];
  if(kind==='success')return samples.has('shiftComplete')?[...cues,{at:2.7,duration:3.5,sample:'shiftComplete'}]:[...cues,
    ...[130.81,196,261.63].map((frequency,i)=>({at:2.7+i*.18,duration:3.4,frequency,to:frequency,peak:.018})),
    {at:4.2,duration:1.6,frequency:392,to:523.25,peak:.018}];
  if(kind==='thermal')return [...cues,
    {at:.05,duration:1.75,frequency:88,to:56,peak:.035},
    ...(samples.has('explosion')?[{at:THERMAL_IMPACT_TIME,duration:4.1,sample:'explosion'}]:[
      {at:THERMAL_IMPACT_TIME,duration:1.8,frequency:95,to:28,peak:.07},
      {at:THERMAL_IMPACT_TIME,duration:2.2,noise:true,frequency:1100,to:90,peak:.085}])];
  if(kind==='oxygen')return [...cues,
    ...(samples.has('oxygenLoss')?[{at:.05,duration:2.1,sample:'oxygenLoss'}]:[{at:.05,duration:1.7,noise:true,frequency:1800,to:350,peak:.032}]),
    {at:2.85,duration:2.35,frequency:156,to:78,peak:.025}];
  if(kind==='blackout')return [...cues,
    {at:.05,duration:1.5,frequency:72,to:24,peak:.04},
    ...(samples.has('powerFailure')?[{at:.05,duration:1.25,sample:'powerFailure'}]:[{at:.9,duration:.28,noise:true,frequency:650,to:150,peak:.018}])];
  const sample=reason==='communications-unresolved'?'uplinkFailure':reason==='rover-unresolved'?'roverFailure':null;
  if(samples.has(sample))return [...cues,{at:2.85,duration:sample==='roverFailure'?2.1:1.6,sample}];
  return [...cues,{at:2.85,duration:.7,frequency:220,to:110,peak:.025}];
}

function envelope(cue,age,attack=.05){
  return cue.peak*Math.max(0,Math.min(1,age/attack,(cue.duration-age)/Math.min(.5,cue.duration*.45)));
}

/** No new context, timers or render loop. Pause/mute resume only the remaining score. */
export class EndingAudio {
  constructor({getAudio,getOutput,getNoise=()=>null,getSample=()=>null}){Object.assign(this,{getAudio,getOutput,getNoise,getSample});this.voices=new Set();this.running=false;}
  get nodes(){return [...this.voices].map(voice=>voice.source);}
  sync(pose,elapsed,{muted=false,reducedMotion=false}={}){
    if(muted||reducedMotion||pose.reportReady){this.stop();return;}
    const audio=this.getAudio();
    if(!audio||audio.state!=='running'){this.stop();return;}
    try{
      const output=this.getOutput()??audio.destination;
      if(!this.running){
        // Freeze the choice for this playback segment, so a late decode cannot double a cue.
        this.samples=new Map(['explosion','oxygenLoss','powerFailure','uplinkFailure','roverFailure','shiftComplete'].map(key=>[key,this.getSample(key)]).filter(([,sample])=>sample));
        this.cues=endingAudioCues(pose.kind,{samples:new Set(this.samples.keys()),reason:pose.reason});
        this.started=new Set();this.running=true;
      }
      for(const [index,definition] of this.cues.entries()){
        // Dispatch on the frame that applies the matching visual state, never on a future audio clock.
        if(this.started.has(index)||definition.at>elapsed)continue;
        this.started.add(index);
        const sample=definition.sample?this.samples.get(definition.sample):null;
        const cue=sample?{...definition,duration:Math.min(definition.duration,sample.duration),peak:sample.gain}:definition;
        if(cue.at+cue.duration<=elapsed)continue;
        const age=Math.max(0,elapsed-cue.at),start=audio.currentTime,end=start+cue.duration-age;
        const owned=[];let voice;
        try{
          const source=cue.noise||sample?audio.createBufferSource():audio.createOscillator();owned.push(source);
          const gain=audio.createGain();owned.push(gain);
          voice={source,nodes:owned};this.voices.add(voice);
          let pitch;
          if(sample){source.buffer=sample.buffer;source.loop=false;source.connect(gain);}
          else if(cue.noise){
            if(!this.noiseBuffer||this.noiseContext!==audio){
              this.noiseContext=audio;this.noiseBuffer=this.getNoise();
              if(!this.noiseBuffer){
                this.noiseBuffer=audio.createBuffer(1,audio.sampleRate,audio.sampleRate);
                const samples=this.noiseBuffer.getChannelData(0);let seed=0x51a7;
                for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=seed/2147483648-1;}
              }
            }
            source.buffer=this.noiseBuffer;source.loop=true;
            const filter=audio.createBiquadFilter();owned.push(filter);
            filter.type=cue.at===.37?'bandpass':'lowpass';filter.Q.value=.6;pitch=filter.frequency;
            source.connect(filter);filter.connect(gain);
          }else{source.type='sine';pitch=source.frequency;source.connect(gain);}
          if(pitch){pitch.setValueAtTime(cue.frequency*(cue.to/cue.frequency)**(age/cue.duration),start);pitch.exponentialRampToValueAtTime(cue.to,end);}
          const attack=Math.min(cue.sample==='explosion' ? .005 : .05,Math.max(.005,(end-start)/4)),release=Math.min(.5,cue.duration*.45);
          gain.gain.setValueAtTime(0,start);
          gain.gain.linearRampToValueAtTime(envelope(cue,Math.min(cue.duration,age+attack),attack),start+attack);
          const releaseAt=end-release;
          if(releaseAt>start+attack)gain.gain.setValueAtTime(cue.peak,releaseAt);
          gain.gain.linearRampToValueAtTime(0,end);
          gain.connect(output);
          source.onended=()=>this.release(voice);
          if(sample)source.start(start,age);else source.start(start);
          source.stop(end+.01);
        }catch(error){
          if(voice){try{voice.source.stop();}catch{}this.release(voice);}else for(const node of owned)node.disconnect();
          throw error;
        }
      }
    }catch{this.stop();} // Audio unavailable must never interrupt the ending/report.
  }
  release(voice){if(!this.voices.delete(voice))return;for(const node of voice.nodes)node.disconnect();}
  stop(){
    for(const voice of [...this.voices]){try{voice.source.stop();}catch{}this.release(voice);}
    this.running=false;
  }
}
