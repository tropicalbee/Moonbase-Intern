import * as THREE from 'three';
import { SPACE_BACKGROUND } from './HabitatEnclosure.js';
import { LUNAR_LANDING_PAD } from './LunarEnvironment.js';
import { LunarShuttle } from './vehicles/LunarShuttle.js';
import { buildArrivalLandingSite } from './ArrivalLandingSite.js';
import { ARRIVAL_DURATION, RETURN_ARRIVAL_DURATION, ARRIVAL_SKIP_DELAY, sampleArrival } from './ArrivalChoreography.js';

export { ARRIVAL_DURATION, RETURN_ARRIVAL_DURATION, ARRIVAL_SKIP_DELAY, arrivalShot } from './ArrivalChoreography.js';
export const ARRIVAL_SPAWN = Object.freeze([-5.5, 0, 18.8]);

function mesh(parent, geometry, material, position, rotation) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  if (rotation) object.rotation.set(...rotation);
  parent.add(object);
  return object;
}

export class ArrivalSequence {
  constructor(scene, camera, floorHeight, onComplete, { interiorRoots = [] } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.onComplete = onComplete;
    this.active = false;
    this.started = false;
    this.elapsed = 0;
    this.duration = ARRIVAL_DURATION;
    this.overlay = document.querySelector('#arrival');
    this.caption = document.querySelector('#arrival-caption');
    this.controls = document.querySelector('#arrival-controls');
    this.phase = document.querySelector('#arrival-phase');
    this.skipButton = document.querySelector('#arrival-skip');
    this.fade = document.querySelector('#arrival-fade');
    this.savedBackground = scene.background;
    this.savedFov = camera.fov;
    this.muted = false;
    this.currentStage = null;
    this.hiddenDetails = [];
    this.interiorRoots = interiorRoots.map(object => [object, object.visible]);
    this._skipHandler = () => this.skip();
    this._muteHandler = () => this.toggleMute();
    this.skipButton.addEventListener('click', this._skipHandler);
    document.querySelector('#arrival-mute').addEventListener('click', this._muteHandler);
    this.group = new THREE.Group();
    this.group.name = 'Lunar arrival staging';
    this.group.visible = false;
    scene.add(this.group);
    this.landed = new THREE.Group();
    this.landed.name = 'Completed lunar arrival';
    this.landed.visible = false;
    scene.add(this.landed);
    const white = new THREE.MeshStandardMaterial({ color: 0xcbd5d9, metalness: .45, roughness: .4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x243846, metalness: .6, roughness: .45 });
    const amber = new THREE.MeshBasicMaterial({ color: 0xffbf6b });
    const blue = new THREE.MeshBasicMaterial({ color: 0x8cf0ff });
    const pad = LUNAR_LANDING_PAD;
    this.exterior = buildArrivalLandingSite({ white, dark, amber, blue,
      deck: new THREE.MeshStandardMaterial({color:0x697275,roughness:.92,metalness:.12}),
      foundation: new THREE.MeshStandardMaterial({color:0x7d817d,roughness:1}),
      metal: new THREE.MeshStandardMaterial({color:0x8c9da4,roughness:.48,metalness:.65}),
    });
    this.group.add(this.exterior);
    this.airlock = new THREE.Group();
    this.baseY = floorHeight(ARRIVAL_SPAWN[0], ARRIVAL_SPAWN[2]);
    this.airlock.position.set(ARRIVAL_SPAWN[0], this.baseY, 0);
    this.group.add(this.airlock);
    for (const x of [-2.5, 2.5]) mesh(this.airlock, new THREE.BoxGeometry(.25, 4.7, 3), dark, [x, 2.2, 19]);
    mesh(this.airlock, new THREE.BoxGeometry(5.2, .2, 3), dark, [0, 4.6, 19]);
    mesh(this.airlock, new THREE.BoxGeometry(5.2, .12, 3), white, [0, -.07, 19]);
    mesh(this.airlock, new THREE.BoxGeometry(3.5, .06, .3), blue, [0, 4.45, 18.7]);
    this.doors = [-1, 1].map(side => mesh(this.airlock, new THREE.BoxGeometry(2.45, 4.4, .16), white, [side * 1.225, 2.2, 17.55]));
    const positions = [];
    for (let i = 0; i < 400; i++) {
      // Deterministic backdrop, separate from future run randomness.
      const angle = i * 2.399963;
      const y = 1 - 2 * (i + .5) / 400;
      const radius = Math.sqrt(1 - y * y);
      positions.push(Math.cos(angle) * radius * 190, y * 190, Math.sin(angle) * radius * 190);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.group.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xd5e9ff, size: .25, sizeAttenuation: true })));
    this.stars = this.group.children.find(object => object.isPoints);
    // Soft contact footprint only, independent of frozen gameplay shadow maps.
    const shadowData=new Uint8Array(64*64*4);
    for(let y=0;y<64;y++)for(let x=0;x<64;x++) {
      const i=(y*64+x)*4;
      const radius=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5);
      shadowData[i+3]=Math.round(255*Math.max(0,1-radius)**1.5);
    }
    const shadowTexture=new THREE.DataTexture(shadowData,64,64);
    shadowTexture.magFilter=THREE.LinearFilter; shadowTexture.needsUpdate=true;
    this.contactShadow=mesh(this.exterior,new THREE.PlaneGeometry(7,12),
      new THREE.MeshBasicMaterial({color:0x000000,map:shadowTexture,transparent:true,opacity:0,depthWrite:false}),
      [pad.x,pad.top+.02,pad.z],[-Math.PI/2,0,0]);
    this.resources={geometries:new Set(),materials:new Set(),textures:new Set([shadowTexture])};
    this.group.traverse(object=>{
      if(object.geometry)this.resources.geometries.add(object.geometry);
      if(object.material)this.resources.materials.add(object.material);
    });
    this.shuttle=new LunarShuttle();
    this.touchdownY=pad.top+this.shuttle.landingHeight;
    this.group.add(this.shuttle.group);
    this.shuttle.group.position.set(pad.x,this.touchdownY,pad.z);
  }

  _engineLighting(visible) {
    this.shuttle.group.traverse(object => { if (object.isLight) object.visible=visible; });
  }

  async prepare(renderer) {
    // Warm full-flight shaders (including transparent exhaust), then the gameplay
    // variant with engine lights off, while the loading screen still covers both.
    this.group.visible=true;
    this.shuttle.setThrusterIntensity(.75,.6);
    this._engineLighting(true);
    const compile=async()=>{
      if(renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(this.scene,this.camera);
      else renderer.compile(this.scene,this.camera);
    };
    await compile();
    this.shuttle.setThrusterIntensity(0,0);
    this._engineLighting(false);
    await compile();
    renderer.render(this.scene,this.camera);
    this.group.visible=false;
  }

  start(short = false) {
    if (this.started || this.disposed) return;
    this.started=this.active=true;
    this.short=short;
    this.duration=short ? RETURN_ARRIVAL_DURATION : ARRIVAL_DURATION;
    this.savedFov=this.camera.fov;
    this.savedBackground=this.scene.background;
    this.elapsed=0;
    this.group.visible=true;
    this.overlay.hidden=false;
    this.scene.background=new THREE.Color(SPACE_BACKGROUND);
    this._engineLighting(!short);
    this.update(0);
  }

  get canSkip() { return this.active && this.elapsed>=ARRIVAL_SKIP_DELAY; }

  skip() {
    if (!this.canSkip) return false;
    this.finish();
    return true;
  }

  unlockAudio() {
    try {
      if (!this.audio) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return;
        this.audio = new Audio();
        this.gain = this.audio.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(this.audio.destination);
        const engine = this.audio.createOscillator();
        engine.type = 'sine';
        engine.frequency.value = 48;
        engine.connect(this.gain);
        engine.start();
        this.engine = engine;
        this.radioGain = this.audio.createGain();
        this.radioGain.gain.value = this.muted ? 0 : .008;
        this.radioGain.connect(this.audio.destination);
        // Filtered noise supplies engine texture and the pressure hiss.
        const buffer = this.audio.createBuffer(1, this.audio.sampleRate * 2, this.audio.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
        const noise = this.audio.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        this.filter = this.audio.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 180;
        noise.connect(this.filter).connect(this.gain);
        noise.start();
      }
      this.audio.resume().catch(() => {});
    } catch { /* Audio is optional; the sequence must still be playable. */ }
  }

  toggleMute() {
    if (!this.audio) this.unlockAudio();
    this.muted = !this.muted;
    const button = document.querySelector('#arrival-mute');
    button.textContent = this.muted ? '[M] UNMUTE AUDIO' : '[M] MUTE AUDIO';
    button.setAttribute('aria-pressed', String(this.muted));
    if (this.gain && this.muted) this.gain.gain.setTargetAtTime(0, this.audio.currentTime, .05);
    if (this.radioGain) this.radioGain.gain.setTargetAtTime(this.muted ? 0 : .008, this.audio.currentTime, .03);
    this.onMuteChange?.(this.muted);
  }

  _radioCue() {
    if (!this.audio || this.muted || this.audio.state !== 'running') return;
    const oscillator = this.audio.createOscillator();
    const envelope = this.audio.createGain();
    const time = this.audio.currentTime;
    oscillator.frequency.value = 780;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(.8, time + .015);
    envelope.gain.linearRampToValueAtTime(0, time + .105);
    oscillator.connect(envelope).connect(this.radioGain);
    oscillator.start(time); oscillator.stop(time + .12);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  pauseAudio() {
    if (this.gain) this.gain.gain.setTargetAtTime(0, this.audio.currentTime, .05);
  }


  update(delta) {
    if (!this.active) return;
    if (Number.isFinite(delta) && delta>0) this.elapsed=Math.min(this.duration,this.elapsed+delta);
    const shot=sampleArrival(this.elapsed/this.duration*ARRIVAL_DURATION,
      {touchdownY:this.touchdownY,baseY:this.baseY,short:this.short,handoverFov:this.savedFov});
    this.shot=shot;
    this.shuttle.group.position.fromArray(shot.craftPosition);
    this.shuttle.group.rotation.set(...shot.craftRotation,'YXZ');
    this.shuttle.setLandingGear(shot.gear);
    this.shuttle.setThrusterIntensity(shot.mainThrust,shot.liftThrust);
    this.shuttle.update(this.elapsed);
    this.airlock.visible=shot.stage==='airlock';
    this.exterior.visible=this.shuttle.group.visible=this.stars.visible=shot.stage!=='airlock';
    this.contactShadow.material.opacity=.38*(1-THREE.MathUtils.smoothstep(this.shuttle.group.position.y-this.touchdownY,0,5));
    for(const [object,visible] of this.interiorRoots) object.visible=visible;
    for(const [object,visible] of this.hiddenDetails) object.visible=shot.stage==='airlock'?visible:false;
    this.doors.forEach((door,i)=>{door.position.x=(i===0?-1:1)*(1.225+shot.doorOpening*2.5);});
    this.camera.position.fromArray(shot.cameraPosition);
    this.camera.lookAt(...shot.cameraTarget);
    if(this.camera.fov!==shot.fov){this.camera.fov=shot.fov;this.camera.updateProjectionMatrix();}
    this.fade.style.opacity=String(shot.fade);
    this.overlay.dataset.stage=shot.stage;
    const captionKey=shot.label;
    if(captionKey!==this.currentStage){
      this.currentStage=captionKey;
      this.caption.textContent=shot.caption;
      this.controls.textContent=shot.controls;
      if(this.phase)this.phase.textContent=shot.label;
      this._radioCue();
    }
    this.skipButton.disabled=!this.canSkip;
    this.skipButton.textContent=this.canSkip?'[SPACE] SKIP ARRIVAL':'SKIP IN '+Math.ceil(ARRIVAL_SKIP_DELAY-this.elapsed)+'s';
    if(this.audio){
      this.engine.frequency.setTargetAtTime(48+shot.mainThrust*18+shot.liftThrust*9,this.audio.currentTime,.12);
      const hiss=shot.stage==='airlock' && shot.doorOpening<.9;
      this.filter.frequency.setTargetAtTime(hiss?900:140+shot.liftThrust*170,this.audio.currentTime,.12);
      const engine=.012+shot.mainThrust*.015+shot.liftThrust*.017;
      this.gain.gain.setTargetAtTime(this.muted ? 0 : hiss ? .022 : shot.stage==='airlock' ? 0 : engine,this.audio.currentTime,.12);
    }
    if(this.elapsed>=this.duration)this.finish();
  }

  finish() {
    if(!this.active)return;
    this.active=false;
    for(const [object,visible] of [...this.hiddenDetails,...this.interiorRoots])object.visible=visible;
    this.pauseAudio();
    this.audio?.close().catch(()=>{});
    this.group.visible=false;
    const pad=LUNAR_LANDING_PAD;
    this.shuttle.group.position.set(pad.x,this.touchdownY,pad.z);
    this.shuttle.group.rotation.set(0,0,0);
    this.shuttle.setLandingGear(1);
    this.shuttle.setThrusterIntensity(0,0);
    this._engineLighting(false);
    this.contactShadow.material.opacity=.38;
    this.exterior.visible=this.shuttle.group.visible=this.landed.visible=true;
    this.landed.add(this.exterior,this.shuttle.group);
    this.overlay.hidden=true;
    this.scene.background=this.savedBackground;
    this.camera.fov=this.savedFov;
    this.camera.updateProjectionMatrix();
    this.onComplete();
  }

  dispose() {
    if(this.disposed)return;
    if(this.active)this.finish();
    this.disposed=true;
    this.skipButton.removeEventListener('click',this._skipHandler);
    document.querySelector('#arrival-mute').removeEventListener('click',this._muteHandler);
    this.shuttle.dispose();
    for(const resources of Object.values(this.resources))for(const resource of resources)resource.dispose();
    this.group.removeFromParent();this.landed.removeFromParent();
  }
}
