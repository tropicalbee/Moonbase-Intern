import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { signals } from './content.js';
import { FirstPersonController } from './FirstPersonController.js';
import { MainMenu } from './MainMenu.js';
import { MenuScene } from './MenuScene.js';
import { StationInteractions } from './game/interactions/StationInteractions.js';
import { PowerGameplay } from './game/systems/PowerGameplay.js';
import { EmergencyPresentation } from './game/presentation/EmergencyPresentation.js';
import { EmergencyAudio } from './game/presentation/EmergencyAudio.js';
import { CameraFeedback } from './game/presentation/CameraFeedback.js';
import { EquipmentIndicators } from './game/presentation/EquipmentIndicators.js';
import { EnvironmentalFeedback } from './game/presentation/EnvironmentalFeedback.js';
import { ScreenFeedback } from './game/presentation/ScreenFeedback.js';
import { advanceActiveFrame } from './FrameIntegration.js';
import { FramePacer } from './FramePacer.js';
import { AdaptiveQuality } from './AdaptiveQuality.js';
import { ShiftGameplay } from './game/systems/ShiftGameplay.js';
import {OxygenGameplay} from './game/systems/OxygenGameplay.js';
import {CoolingGameplay} from './game/systems/CoolingGameplay.js';
import {CommunicationsGameplay} from './game/systems/CommunicationsGameplay.js';
import {RoverGameplay} from './game/systems/RoverGameplay.js';
import { advanceDoorOpening, updateDoorColliders } from './DoorCollision.js';
import { createRoverCollision, moveRoverSafely } from './RoverCollision.js';
import { LAB } from './LabLayout.js';
import { clearStationArcs, insideStationStructure } from './StationClearance.js';
import { ArrivalSequence, ARRIVAL_SPAWN } from './ArrivalSequence.js';
import { buildHabitatEnclosure, SPACE_BACKGROUND } from './HabitatEnclosure.js';
import { buildLunarEnvironment } from './LunarEnvironment.js';
import {WarningBoard} from './game/ui/WarningBoard.js';
import {EquipmentPrompt} from './game/ui/EquipmentPrompt.js';
import {renderQuality} from './RenderQuality.js';
import {assetFiles} from './AssetManifest.js';
import {TrainingGuide} from './game/training/TrainingGuide.js';
import {RepairInput} from './game/interactions/RepairInput.js';

const $ = (selector) => document.querySelector(selector);
const host = $('#scene');
const loading = $('#loading');
const loadingCount = $('#loading-count');
const hudControls = $('.hud-controls');
const defaultHudControls = hudControls.textContent.replace('R RESET','R RESTART SHIFT');
const panel = $('#panel');
const panelContent = $('#panel-content');
const panelLabel = $('#panel-label');
const panelBackdrop = $('#panel-backdrop');
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stationScale = 1.24;
const gameMode = true;

const views = [
  {
    type: 'RESEARCH HABITAT / 01',
    title: 'The research habitat',
    description: 'A desert experiment inside an orbital station.',
    position: [0, 11, 38],
    target: [0, 4, -7]
  },
  {
    type: 'EXTERIOR / 02',
    title: 'Beyond the canopy',
    description: 'The station passes beyond the habitat windows.',
    position: [2, 5, 20],
    target: [0, 23, -43]
  },
  {
    type: 'OPERATIONS / 03',
    title: 'The operations room',
    description: 'A sealed control room overlooks the habitat.',
    position: [-16, 8, 14],
    target: [0, 3, -23]
  },
  {
    type: 'LAB / 04',
    title: 'The sample lab',
    description: 'Samples pass from the rover through a sealed hatch.',
    position: [-6.85, 3.7, -10],
    target: [-6.85, 2.7, -23.5]
  },
  {
    type: 'CONTROL ROOM / 05',
    title: 'Inside the lab',
    description: 'A closer look at the station equipment.',
    position: [-6.2, 3.1, -20.2],
    target: [1, 2.2, -23.3]
  },
  {
    type: 'CONSOLE / 06',
    title: 'At the controls',
    description: 'A closer view of the station cockpit.',
    position: [4.7, 2.8, -19.3],
    target: [1, 2.2, -23.3]
  },
  {
    type: 'SURVEY / 07',
    title: 'Following the rover',
    description: 'The rover moves across the habitat on its survey route.',
    position: [20, 6, 4],
    target: [1, 2, -2]
  }
];

// These are authored shots, not offsets or scaled copies of the desktop path.
const portraitShots = {
  phone: [
    { position: [0, 10, 41], target: [0, 4, -7], fov: 64 },
    { position: [4, 18, 16], target: [-3, 21, -38], fov: 62 },
    { position: [-14, 8, 17], target: [-6, 3, -19], fov: 66 },
    { position: [-6.85, 4, -5.5], target: [-6.85, 3, -18.5], fov: 62 },
    { position: [-7.2, 4, -19.2], target: [1, 2.3, -21.5], fov: 66 },
    { position: [9.5, 4, -18.2], target: [1, 2.4, -23.3], fov: 62 },
    { position: [14, 7, 23], target: [6, 1, -2], fov: 66 }
  ],
  tablet: [
    { position: [3, 8, 29], target: [0, 2, -6], fov: 56 },
    { position: [7, 17, 10], target: [-2, 21, -38], fov: 54 },
    { position: [-11, 6, 10], target: [-6, 3, -17], fov: 56 },
    { position: [-7.3, 4.4, -8], target: [-6.85, 3, -18.5], fov: 54 },
    { position: [-4.2, 3.5, -19.4], target: [1, 2.2, -20.7], fov: 58 },
    { position: [6, 3.3, -18.6], target: [1, 2.3, -23.3], fov: 56 },
    { position: [13, 6, 18], target: [6, 1.4, 5], fov: 58 }
  ]
};

// Phone-only control points keep the journey moving through space rather than
// sliding along straight lines between seven otherwise static camera shots.
const phoneArcs = [
  { position: [[0, 13, 35], [3, 19, 27]], target: [[0, 5, -15], [-2, 16, -30]] },
  { position: [[2, 19, 10], [-8, 17, 8]], target: [[-3, 20, -38], [-6, 6, -20]] },
  { position: [[-13, 8, 10], [-8, 5, -1]], target: [[-6, 3, -18], [-6.85, 3, -18]] },
  null,
  { position: [[-4, 4.3, -18.9], [5.5, 4.3, -18.6]], target: [[1, 2.3, -21], [1, 2.4, -23.5]] }
];

function cameraCurve(positionPoints, targetPoints, amount) {
  const point = (points) => {
    const [start, controlA, controlB, end] = points;
    const remaining = 1 - amount;
    return new THREE.Vector3(...start.map((_, axis) =>
      remaining ** 3 * start[axis] +
      3 * remaining ** 2 * amount * controlA[axis] +
      3 * remaining * amount ** 2 * controlB[axis] +
      amount ** 3 * end[axis]
    ));
  };
  desiredPosition.copy(point(positionPoints));
  desiredTarget.copy(point(targetPoints));
}

// Only the listed GLBs can appear in each settled portrait shot. Architecture
// remains visible to provide foreground, middle distance, and background.
const portraitCast = {
  phone: [
    ['portraitRover', 'pod'],
    ['portraitShip'],
    ['commandPod'],
    ['controlCenter'],
    ['astronautPoly', 'controlCenter'],
    ['controlCenter'],
    ['portraitRover', 'desertCactus']
  ],
  tablet: [
    ['portraitRover', 'pod', 'desertCactus'],
    ['portraitShip', 'moon'],
    ['commandPod'],
    ['controlCenter', 'astronautPoly'],
    ['astronautPoly', 'controlCenter'],
    ['controlCenter'],
    ['portraitRover']
  ]
};

let renderer;
let scene;
let camera;
let player;
let arrival;
let arrivalRenderState;
let mainMenu;
let menuScene;
let interactions;
let powerGameplay;
let shiftGameplay;
let oxygenGameplay;
let coolingGameplay;
let communicationsGameplay;
let roverGameplay;
let warningBoard;
let equipmentPrompts;
let emergencyPresentation;
let cameraFeedback;
let training;
let trainingPending=false;
let trainingWorldState;
let repairInput;
function presentationShift(){return training?.active?training.shiftContext:{...shiftGameplay?.model.snapshot,blackoutGrace:shiftGameplay?.model.blackoutGrace};}
function beginTraining(){trainingWorldState={simulationTime,roverTime,tortoiseTime,actors:[rover,tortoise].map(actor=>actor?{position:actor.position.clone(),rotation:actor.rotation.clone()}:null)};training.start();}
function leaveTrainingWorld(){
  player.clearInput();player.position.set(...ARRIVAL_SPAWN);player.yaw=0;player.pitch=0;player.eyeY=undefined;player.updateCamera();
  if(trainingWorldState){
    ({simulationTime,roverTime,tortoiseTime}=trainingWorldState);
    for(const [i,actor,collision] of [[0,rover,roverCollision],[1,tortoise,tortoiseCollision]]){
      const saved=trainingWorldState.actors[i];if(!actor||!saved)continue;
      actor.position.copy(saved.position);actor.rotation.copy(saved.rotation);
      // Reset is a discontinuous scene transition; refresh the existing collider
      // at the restored pose rather than sweeping through the practice route.
      if(collision)moveRoverSafely(actor,collision,saved.position,saved.rotation.y,null,0);
      actor.updateWorldMatrix(true,true);
    }
    trainingWorldState=null;
  }
}
function parkTrainingRover(){
  if(!rover||!roverCollision)return;
  const clearance=Math.hypot(roverCollision.box.halfX,roverCollision.box.halfZ)+player.radius+.5;
  const pad=[[2,-10],[-3,2],[8,4]].find(([x,z])=>Math.hypot(player.position.x-x,player.position.z-z)>clearance);
  if(!pad)return;
  const [x,z]=pad;rover.position.set(x,floorHeight(x,z)+.06,z);
  moveRoverSafely(rover,roverCollision,rover.position,0,null,0);rover.updateWorldMatrix(true,true);
}

function refreshPowerGameplay() {
  powerGameplay?.setActive(!!arrival?.started && !arrival.active && (!!player?.locked||repairInput?.active) &&
    !photoPaused && !document.hidden && document.hasFocus() && (training?.active||shiftGameplay?.model.status==='running'));
  shiftGameplay?.setActive(powerGameplay?.active&&!training?.active);
  oxygenGameplay?.setActive(powerGameplay?.active);
  coolingGameplay?.setActive(powerGameplay?.active);
  communicationsGameplay?.setActive(powerGameplay?.active);
  roverGameplay?.setActive(powerGameplay?.active);
  warningBoard?.setActive(powerGameplay?.active);
  emergencyPresentation?.setActive(powerGameplay?.active);
}

function refreshInteractions() {
  const exploring = (!!player?.locked||repairInput?.active) && !arrival?.active && !photoPaused &&
    !document.hidden && document.hasFocus() && !shiftGameplay?.model.terminal;
  interactions?.setActive(exploring && player.inputEnabled, {
    reason: shiftGameplay?.model.terminal ? 'terminal' : exploring && !player.inputEnabled ? 'repair' : 'pause',
  });
}
let sunLight;
let sceneProfile = 'desktop';
let quality;
let renderPixelRatio = 1;
const adaptiveQuality = new AdaptiveQuality();
const stagedModels = new Map();
const desktopTransforms = new Map();
const loadedAssets = {};
const pendingAssetLoads = new Map();
let modelsReady = false;
let currentView = 0;
let journeyProgress = 0;
let currentTarget = new THREE.Vector3();
let desiredPosition = new THREE.Vector3();
let desiredTarget = new THREE.Vector3();
let ship;
let rover;
let roverCollision;
let roverTime = 0;
let tortoise;
let tortoiseCollision;
let tortoiseTime = 0;
const tortoisePosition = new THREE.Vector3();
const plantColliders = new Map();
let astronautCollision;
let solarPanelCollision;
let portraitShip;
let portraitRover;
const labDoorPanels = [];
const labDoorColliders = [];
const movingColliders = [];
let labDoorOpen = 0;
let labDoorTarget = 0;
const roverRoute = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-5, 0, -7),
  new THREE.Vector3(2, 0, -10),
  new THREE.Vector3(6, 0, -13),
  new THREE.Vector3(10, 0, -5),
  new THREE.Vector3(11, 0, 3),
  new THREE.Vector3(4, 0, 10),
  new THREE.Vector3(-6, 0, 7),
  new THREE.Vector3(-10, 0, 0)
], true, 'centripetal');
const tortoiseStops = [
  new THREE.Vector3(12, 0, 8),
  new THREE.Vector3(12.8, 0, 8.5),
  new THREE.Vector3(13.5, 0, 8.2),
  new THREE.Vector3(13.2, 0, 7.5),
  new THREE.Vector3(12.3, 0, 7.7)
];
const tortoisePauses = [3, 2, 4, 2, 3];
const tortoiseTravel = [9, 8, 10, 7, 9];
const tortoiseLoopTime = tortoisePauses.reduce((total, pause, index) => total + pause + tortoiseTravel[index], 0);
let lastFocus = null;
const clock = new THREE.Clock();
const framePacer = new FramePacer();
let simulationTime = 0;
let photoPaused = false;

function getSceneProfile() {
  if (window.innerWidth < 600) return 'phone';
  if (window.innerWidth < 1200 || (window.innerWidth < 1400 && matchMedia('(pointer: coarse)').matches)) return 'tablet';
  return 'desktop';
}

function getQuality(profile) {
  const lowHardware = (navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4) ||
    (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4);
  return renderQuality(profile,{lowHardware,mode:$('#render-quality').value});
}

function shotFor(index) {
  return sceneProfile === 'desktop' ? { ...views[index], fov: 61 } : portraitShots[sceneProfile][index];
}

function updateCast(progress) {
  if (gameMode) {
    for (const [key, model] of stagedModels) model.visible = !['portraitShip', 'portraitRover', 'moon', 'ship'].includes(key);
    return;
  }
  if (sceneProfile === 'desktop') {
    for (const [key, model] of stagedModels) model.visible = key !== 'portraitShip' && key !== 'portraitRover';
    return;
  }
  const visible = new Set();
  portraitCast[sceneProfile].forEach((cast, index) => {
    if (Math.abs(progress - index) < .61) cast.forEach((key) => visible.add(key));
  });
  for (const [key, model] of stagedModels) model.visible = visible.has(key);
}

function applySceneProfile() {
  scene.fog = gameMode || sceneProfile === 'desktop' ? null : new THREE.Fog(0x082b40, 45, 115);
  if (gameMode) return;
  for (const key of ['pod', 'commandPod', 'cactus', 'desertCactus']) {
    const model = stagedModels.get(key);
    const original = desktopTransforms.get(key);
    if (!model || !original) continue;
    model.position.copy(original.position);
    model.rotation.copy(original.rotation);
    model.scale.copy(original.scale);
  }
  if (sceneProfile === 'phone') {
    stagedModels.get('pod')?.position.set(5.5, floorHeight(5.5, -13), -13);
    stagedModels.get('commandPod')?.position.set(-9, .22, -10);
    stagedModels.get('desertCactus')?.position.set(9, floorHeight(9, 1), 1);
  } else if (sceneProfile === 'tablet') {
    stagedModels.get('commandPod')?.position.set(-12, .22, -9);
    stagedModels.get('desertCactus')?.position.set(-7, floorHeight(-7, -6), -6);
  }
  if (portraitShip) {
    portraitShip.scale.setScalar(sceneProfile === 'tablet' ? 1.3 : 1);
    portraitShip.position.set(sceneProfile === 'tablet' ? -2 : -3, sceneProfile === 'tablet' ? 22 : 21, -38);
  }
  if (portraitRover) portraitRover.scale.setScalar(sceneProfile === 'tablet' ? 1.08 : 1);
}

function showView(index) {
  currentView = Math.max(0, Math.min(views.length - 1, index));
  const view = views[currentView];
  $('#view-type').textContent = view.type;
  $('#view-title').textContent = view.title;
  $('#view-description').textContent = view.description;
  $('#view-count').textContent = `${String(currentView + 1).padStart(2, '0')} / ${String(views.length).padStart(2, '0')}`;
  document.querySelectorAll('#view-progress button').forEach((button, number) => {
    button.classList.toggle('active', number === currentView);
    button.setAttribute('aria-current', number === currentView ? 'true' : 'false');
  });
}

function setView(index) {
  const next = Math.max(0, Math.min(views.length - 1, index));
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  window.scrollTo({ top: maxScroll * next / (views.length - 1), behavior: reducedMotion ? 'auto' : 'smooth' });
}

function updateJourney(immediate = false) {
  if (!camera) return;
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = THREE.MathUtils.clamp(window.scrollY / maxScroll * (views.length - 1), 0, views.length - 1);
  journeyProgress = progress;
  const enteringLab = sceneProfile === 'desktop'
    ? THREE.MathUtils.smoothstep(progress, 2.6, 3.5)
    : THREE.MathUtils.smoothstep(progress, 2.2, 3.1);
  const leavingLab = sceneProfile === 'desktop'
    ? 1 - THREE.MathUtils.smoothstep(progress, 5.65, 6)
    : 1 - THREE.MathUtils.smoothstep(progress, 5.85, 6.2);
  labDoorTarget = Math.min(enteringLab, leavingLab);
  const first = Math.floor(progress);
  const second = Math.min(first + 1, views.length - 1);
  const mix = progress - first;
  const shotA = shotFor(first);
  const shotB = shotFor(second);
  const positionA = shotA.position;
  const positionB = shotB.position;
  const targetA = shotA.target;
  const targetB = shotB.target;
  desiredPosition.lerpVectors(new THREE.Vector3(...positionA), new THREE.Vector3(...positionB), mix);
  desiredTarget.lerpVectors(new THREE.Vector3(...targetA), new THREE.Vector3(...targetB), mix);
  camera.fov = THREE.MathUtils.lerp(shotA.fov, shotB.fov, mix);
  camera.updateProjectionMatrix();
  if (sceneProfile === 'phone' && first < views.length - 1) {
    if (first === 3) {
      const outsideDoor = [-6.85, 3.2, -16];
      const insideDoor = [-6.85, 3.2, -18.8];
      const doorLook = [-6.85, 2.7, -21];
      if (mix < .35) {
        cameraCurve(
          [positionA, [-6.85, 4, -10], [-6.85, 3.3, -14], outsideDoor],
          [targetA, [-6.85, 2.9, -19], [-6.85, 2.7, -20], doorLook],
          mix / .35
        );
      } else if (mix < .7) {
        desiredPosition.lerpVectors(new THREE.Vector3(...outsideDoor), new THREE.Vector3(...insideDoor), (mix - .35) / .35);
        desiredTarget.set(...doorLook);
      } else {
        cameraCurve(
          [insideDoor, [-6.85, 3.5, -19.2], [-7.1, 3.9, -19.3], positionB],
          [doorLook, [-5, 2.6, -21.5], [-1, 2.4, -21.5], targetB],
          (mix - .7) / .3
        );
      }
    } else if (first === 5) {
      const insideDoor = [-6.85, 3.2, -18.8];
      const outsideDoor = [-6.85, 3.5, -12.4];
      const insideLook = [-6.85, 2.6, -16];
      const outsideLook = [-4, 2, -4];
      if (mix < .4) {
        cameraCurve(
          [positionA, [6, 4, -18.3], [-6.85, 3.2, -19.3], insideDoor],
          [targetA, [1, 2.4, -22], [-5, 2.6, -18], insideLook],
          mix / .4
        );
      } else if (mix < .65) {
        const throughDoor = (mix - .4) / .25;
        desiredPosition.lerpVectors(new THREE.Vector3(...insideDoor), new THREE.Vector3(...outsideDoor), throughDoor);
        desiredTarget.lerpVectors(new THREE.Vector3(...insideLook), new THREE.Vector3(...outsideLook), throughDoor);
      } else {
        cameraCurve(
          [outsideDoor, [-3, 5, -1], [8, 7, 11], positionB],
          [outsideLook, [0, 2, -3], [4, 1.5, -2], targetB],
          (mix - .65) / .35
        );
      }
    } else {
      const arc = phoneArcs[first];
      cameraCurve([positionA, ...arc.position, positionB], [targetA, ...arc.target, targetB], mix);
    }
  }
  if (sceneProfile === 'desktop' && first === 4 && second === 5) {
    const windowSide = new THREE.Vector3(.8, 3.3, -18.3);
    const consoleLook = new THREE.Vector3(1, 2.2, -23.3);
    if (mix < .5) {
      desiredPosition.lerpVectors(new THREE.Vector3(...positionA), windowSide, mix * 2);
      desiredTarget.lerpVectors(new THREE.Vector3(...targetA), consoleLook, mix * 2);
    } else {
      desiredPosition.lerpVectors(windowSide, new THREE.Vector3(...positionB), (mix - .5) * 2);
      desiredTarget.lerpVectors(consoleLook, new THREE.Vector3(...targetB), (mix - .5) * 2);
    }
  }
  if (sceneProfile === 'tablet' && first === 3 && second === 4) {
    const outsideDoor = new THREE.Vector3(-6.85, 3.2, -16);
    const insideDoor = new THREE.Vector3(-6.85, 3.2, -18.8);
    const doorLook = new THREE.Vector3(-6.85, 2.7, -21);
    if (mix < .35) {
      desiredPosition.lerpVectors(new THREE.Vector3(...positionA), outsideDoor, mix / .35);
      desiredTarget.lerpVectors(new THREE.Vector3(...targetA), doorLook, mix / .35);
    } else if (mix < .65) {
      desiredPosition.lerpVectors(outsideDoor, insideDoor, (mix - .35) / .3);
      desiredTarget.copy(doorLook);
    } else {
      desiredPosition.lerpVectors(insideDoor, new THREE.Vector3(...positionB), (mix - .65) / .35);
      desiredTarget.lerpVectors(doorLook, new THREE.Vector3(...targetB), (mix - .65) / .35);
    }
  }
  if (sceneProfile !== 'phone' && first === 5 && second === 6) {
    const insideDoor = sceneProfile === 'desktop'
      ? new THREE.Vector3(-6.85, 3.1, -19.3)
      : new THREE.Vector3(-6.85, 3.2, -18.8);
    const outsideDoor = sceneProfile === 'desktop'
      ? new THREE.Vector3(...views[3].position)
      : new THREE.Vector3(-6.85, 3.5, -12.4);
    const insideLook = new THREE.Vector3(-6.85, 2.6, -16);
    const outsideLook = new THREE.Vector3(-4, 2, -4);
    if (mix < .35) {
      desiredPosition.lerpVectors(new THREE.Vector3(...positionA), insideDoor, mix / .35);
      desiredTarget.lerpVectors(new THREE.Vector3(...targetA), insideLook, mix / .35);
    } else if (mix < .7) {
      desiredPosition.lerpVectors(insideDoor, outsideDoor, (mix - .35) / .35);
      desiredTarget.lerpVectors(insideLook, outsideLook, (mix - .35) / .35);
    } else {
      desiredPosition.lerpVectors(outsideDoor, new THREE.Vector3(...positionB), (mix - .7) / .3);
      desiredTarget.lerpVectors(outsideLook, new THREE.Vector3(...targetB), (mix - .7) / .3);
    }
  }
  updateCast(progress);
  if (reducedMotion) movePortraitRover(0);
  const nearest = Math.round(progress);
  if (nearest !== currentView || immediate) showView(nearest);
  if (immediate) {
    camera.position.copy(desiredPosition);
    currentTarget.copy(desiredTarget);
    camera.lookAt(currentTarget);
  }
}

function projectMarkup(project) {
  const tags = (project.tags || []).map((tag) => `<span>${tag}</span>`).join(' / ');
  const links = [
    project.demoUrl ? `<a class="project-link" href="${project.demoUrl}" target="_blank" rel="noopener noreferrer">DEMO &nearr;</a>` : '',
    project.repoUrl ? `<a class="project-link" href="${project.repoUrl}" target="_blank" rel="noopener noreferrer">GITHUB &nearr;</a>` : ''
  ].join('');
  return `<div class="work-item"><div class="work-item-top"><h3>${project.title}</h3><span class="number">${tags}</span></div><p>${project.summary}</p>${links}</div>`;
}

function panelMarkup(kind) {
  if (kind === 'skills') {
    return `<h2>Skills</h2><p>The areas I work across.</p>
      <div class="skills-list"><span>AI / ML</span><span>Agentic AI</span><span>Full-stack development</span><span>AI-assisted coding</span></div>`;
  }
  if (kind === 'about') {
    return `<h2>About</h2><p>I work across AI, agentic systems, and full-stack software. This portfolio is presented under a creator alias, which is still being chosen.</p>
      <p class="note">The world uses the actual 3D models supplied for this portfolio. Project case studies will be added once they are selected.</p>`;
  }
  return `<h2>Work</h2><p>Project case studies are being selected. These are the areas they will cover; no finished projects are claimed here yet.</p>
    <div class="panel-kicker">AREAS OF WORK</div>
    ${signals.map((signal) => `<section class="work-item"><div class="work-item-top"><h3>${signal.title}</h3><span class="number">${signal.code}</span></div><p>${signal.short}</p>${signal.projects.length ? signal.projects.map(projectMarkup).join('') : '<p class="project-empty">Case studies to be added.</p>'}</section>`).join('')}`;
}

function openPanel(kind) {
  lastFocus = document.activeElement;
  panelLabel.textContent = kind === 'skills' ? 'CAPABILITIES' : kind === 'about' ? 'THE CREATOR' : 'PORTFOLIO INDEX';
  panelContent.innerHTML = panelMarkup(kind);
  panel.classList.add('open');
  panel.inert = false;
  panel.setAttribute('aria-hidden', 'false');
  panelBackdrop.hidden = false;
  document.body.classList.add('panel-open');
  document.documentElement.classList.add('panel-open');
  $('#close-panel').focus();
}

function closePanel() {
  panel.classList.remove('open');
  panel.inert = true;
  panel.setAttribute('aria-hidden', 'true');
  panelBackdrop.hidden = true;
  document.body.classList.remove('panel-open');
  document.documentElement.classList.remove('panel-open');
  lastFocus?.focus?.();
}

function addMesh(parent, geometry, material, position, rotation) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addHorizontalRing(parent, radius, thickness, y, material) {
  if (y * stationScale < 7.3) {
    return addClearRailArcs(parent, radius, thickness, y, material);
  }
  return addMesh(parent, new THREE.TorusGeometry(radius, thickness, 7, 96), material, [0, y, 0], [Math.PI / 2, 0, 0]);
}

function addClearRailArcs(parent, radius, thickness, y, material, start = 0, end = Math.PI * 2) {
  const group = new THREE.Group();
  parent.add(group);
  for (const [a, b] of clearStationArcs(radius * stationScale, start, end)) {
    const curve = new THREE.Curve();
    curve.getPoint = (t, target = new THREE.Vector3()) => {
      const angle = THREE.MathUtils.lerp(a, b, t);
      return target.set(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
    };
    addMesh(group, new THREE.TubeGeometry(curve, Math.max(2, Math.ceil((b - a) * 24)), thickness, 8, false), material, [0, 0, 0]);
    for (const [angle, direction] of [[a, -1], [b, 1]]) {
      const cap = addMesh(group, new THREE.CircleGeometry(thickness, 8), material,
        [Math.sin(angle) * radius, y, Math.cos(angle) * radius]);
      cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(Math.cos(angle) * direction, 0, -Math.sin(angle) * direction));
    }
  }
  return group;
}

function addInnerRail(parent, material) {
  addClearRailArcs(parent, 18.2, .17, 1.9, material, 3.7, Math.PI * 2 + 2.55);
  for(const arc of clearStationArcs(18.2*stationScale,3.7,Math.PI*2+2.55)) for(const angle of arc) {
    const x=Math.sin(angle)*18.2, z=Math.cos(angle)*18.2;
    // Every cut rail ends on a grounded terminal, including the lab corners.
    // The wider base also closes the nearby low ring's exposed termination.
    const post=addMesh(parent,new THREE.BoxGeometry(.4,2.07,.4),material,[x,1.035,z]);
    post.name='Rail terminal post';
    const foot=addMesh(parent,new THREE.BoxGeometry(.82,.12,.82),material,[x,.06,z]);
    foot.name='Rail terminal footing';
  }
}

function sandHeight(x, z) {
  const duneA = .48 * Math.exp(-((x - 5) ** 2 + (z + 5) ** 2) / 62);
  const duneB = .3 * Math.exp(-((x + 8) ** 2 + (z - 4) ** 2) / 42);
  return .16 + duneA + duneB + .055 * Math.sin(x * .46 + z * .22);
}

function floorHeight(x, z) {
  return stationScale * sandHeight(x / stationScale, z / stationScale);
}

function addSandSurface(parent) {
  const segments = 72;
  const rings = 14;
  const positions = [];
  const colors = [];
  const indices = [];
  const base = new THREE.Color(0xd9c491);
  const highlight = new THREE.Color(0xe4d2a6);
  for (let ring = 0; ring <= rings; ring++) {
    const radius = ring / rings * 17.1;
    for (let segment = 0; segment < segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      positions.push(x, sandHeight(x, z), z);
      const color = base.clone().lerp(highlight, .35 + .25 * Math.sin(x * .3 + z * .2));
      colors.push(color.r, color.g, color.b);
      if (ring < rings) {
        const a = ring * segments + segment;
        const b = ring * segments + (segment + 1) % segments;
        const c = (ring + 1) * segments + segment;
        const d = (ring + 1) * segments + (segment + 1) % segments;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  addMesh(parent, geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide }), [0, 0, 0]);
}

function buildStation() {
  const station = new THREE.Group();
  station.scale.setScalar(stationScale);
  scene.add(station);
  const frame = new THREE.MeshStandardMaterial({ color: 0xa3beca, metalness: .25, roughness: .48 });
  const brightFrame = new THREE.MeshStandardMaterial({ color: 0xe0e9e8, metalness: .2, roughness: .46 });
  const darkFrame = new THREE.MeshStandardMaterial({ color: 0x2d5267, metalness: .25, roughness: .58 });
  const deck = new THREE.MeshStandardMaterial({ color: 0x466d83, metalness: .18, roughness: .65, side: THREE.DoubleSide });
  const sand = new THREE.MeshStandardMaterial({ color: 0xd3bd89, roughness: 1, flatShading: true });

  addMesh(station, new THREE.CylinderGeometry(18.1, 18.4, 1.6, 72), darkFrame, [0, -.86, 0]);
  addMesh(station, new THREE.CylinderGeometry(17.4, 17.4, .18, 72), sand, [0, .05, 0]);
  addSandSurface(station);
  addMesh(station, new THREE.RingGeometry(18.1, 23.6, 96), deck, [0, .04, 0], [-Math.PI / 2, 0, 0]);
  addHorizontalRing(station, 18.1, .37, .29, brightFrame);
  addHorizontalRing(station, 23.55, .56, .19, frame);
  addInnerRail(station, brightFrame);
  addHorizontalRing(station, 23.55, .75, 11.7, frame);
  addHorizontalRing(station, 17.5, .33, 11.65, brightFrame);
  addHorizontalRing(station, 23.6, .2, 10.5, darkFrame);

  scene.add(buildHabitatEnclosure(stationScale));
  for (let i = 0; i < 24; i++) {
    const angle = i * Math.PI * 2 / 24;
    const x = Math.sin(angle) * 23.2;
    const z = Math.cos(angle) * 23.2;
    if (insideStationStructure(x * stationScale, z * stationScale)) continue;
    const rib = addMesh(station, new THREE.BoxGeometry(.5, 10.8, .75), frame, [x, 5.8, z], [0, angle, 0]);
    rib.castShadow = false;
  }
  for (let i = 0; i < 48; i++) {
    const angle = i * Math.PI * 2 / 48;
    const x = Math.sin(angle) * 21.2;
    const z = Math.cos(angle) * 21.2;
    addMesh(station, new THREE.BoxGeometry(.54, .4, 6.8), i % 4 === 0 ? brightFrame : frame, [x, 12.65, z], [0, angle, 0]);
    addMesh(station, new THREE.BoxGeometry(.39, .3, 5.3), darkFrame, [x, -1.45, z], [0, angle, 0]);
  }
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI * 2 / 32;
    if (angle > 2.55 && angle < 3.7) continue;
    if (insideStationStructure(Math.sin(angle) * 18.2 * stationScale, Math.cos(angle) * 18.2 * stationScale)) continue;
    addMesh(station, new THREE.BoxGeometry(.18, 1.55, .18), brightFrame, [Math.sin(angle) * 18.2, 1.1, Math.cos(angle) * 18.2]);
  }

}

function fitModel(root, maximumSize) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = maximumSize / (Math.max(size.x, size.y, size.z) || 1);
  root.position.x -= center.x;
  root.position.y -= box.min.y;
  root.position.z -= center.z;
  const group = new THREE.Group();
  group.scale.setScalar(scale);
  group.add(root);
  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return group;
}

function addModel(gltf, size, position, rotation = [0, 0, 0], key) {
  if (!gltf) return null;
  if (key && stagedModels.has(key)) return stagedModels.get(key);
  const object = fitModel(gltf.scene.clone(true), size);
  object.position.set(...position);
  object.rotation.set(...rotation);
  scene.add(object);
  if (key) {
    stagedModels.set(key, object);
    desktopTransforms.set(key, {
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone()
    });
  }
  return object;
}

function buildResearchArea(models) {
  const firstRoomObject = scene.children.length;
  const floor = new THREE.MeshStandardMaterial({ color: 0x6b8996, metalness: .48, roughness: .47 });
  const frame = new THREE.MeshStandardMaterial({ color: 0xb8cbd0, metalness: .38, roughness: .47 });
  const bulkhead = new THREE.MeshStandardMaterial({ color: 0x274658, metalness: .36, roughness: .58 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x76b8d1, transparent: true, opacity: .22, roughness: .16, metalness: .04, depthWrite: false, side: THREE.DoubleSide });
  const ceilingLight = new THREE.MeshBasicMaterial({ color: 0xe6f6f7 });

  // The control and sample equipment share a sealed room behind the desert basin.
  addMesh(scene, new THREE.BoxGeometry(LAB.width, .4, LAB.depth), floor, [LAB.centerX, .4, LAB.centerZ]);
  addMesh(scene, new THREE.BoxGeometry(LAB.width, 6.6, .4), bulkhead, [LAB.centerX, 3.95, LAB.back]);
  for (const x of [LAB.left, LAB.right]) {
    addMesh(scene, new THREE.BoxGeometry(.4, 6.6, LAB.depth), bulkhead, [x, 3.95, LAB.centerZ]);
  }
  // Close the added frontage left of the existing entrance.
  addMesh(scene, new THREE.BoxGeometry(4.3, 6.6, .25), bulkhead, [-11.35, 3.95, LAB.front]);
  for (const x of [-9.2, -4.5]) {
    addMesh(scene, new THREE.BoxGeometry(.6, 6.6, .25), bulkhead, [x, 3.95, -17.5]);
  }
  addMesh(scene, new THREE.BoxGeometry(5.3, 1.6, .25), bulkhead, [-6.85, 6.45, -17.5]);
  addMesh(scene, new THREE.BoxGeometry(19.7, 5.5, .14), glass, [5.65, 4.4, LAB.front]);
  addMesh(scene, new THREE.BoxGeometry(19.7, 1, .4), bulkhead, [5.65, 1.15, LAB.front]);
  addMesh(scene, new THREE.BoxGeometry(LAB.width, .24, LAB.depth), bulkhead, [LAB.centerX, 7.3, LAB.centerZ]);
  for (const x of [-13.4, -9.4, -4.2, 1, 8.2, 15.4]) {
    addMesh(scene, new THREE.BoxGeometry(.22, 6.6, .28), frame, [x, 3.95, -17.36]);
    addMesh(scene, new THREE.BoxGeometry(.22, .3, LAB.depth), frame, [x, 7.3, LAB.centerZ]);
  }
  addMesh(scene, new THREE.BoxGeometry(LAB.width - .2, .24, .3), frame, [LAB.centerX, 7.28, -17.36]);
  const doorGlass = new THREE.MeshPhysicalMaterial({ color: 0x91ccda, transparent: true, opacity: .32, roughness: .09, metalness: .05, depthWrite: false, side: THREE.DoubleSide });
  addMesh(scene, new THREE.BoxGeometry(4.2, .12, .5), frame, [-6.85, .68, -17.12]);
  addMesh(scene, new THREE.BoxGeometry(4.2, .2, .4), frame, [-6.85, 5.55, -17.12]);
  for (const x of [-8.88, -4.82]) {
    addMesh(scene, new THREE.BoxGeometry(.16, 4.8, .4), frame, [x, 3.15, -17.12]);
  }
  for (const side of [-1, 1]) {
    const panel = new THREE.Group();
    panel.position.set(side < 0 ? -8.88 : -4.82, 0, -17.08);
    scene.add(panel);
    const inward = side < 0 ? 1 : -1;
    addMesh(panel, new THREE.BoxGeometry(1.94, 4.65, .09), doorGlass, [inward * 1.01, 3.15, 0]);
    addMesh(panel, new THREE.BoxGeometry(.08, 4.65, .15), frame, [inward * 1.98, 3.15, .02]);
    addMesh(panel, new THREE.BoxGeometry(.06, .68, .12), frame, [inward * 1.78, 2.6, .12]);
    labDoorPanels.push({ panel, direction: inward });
  }
  updateDoorColliders(labDoorPanels, labDoorOpen, labDoorColliders);
  movingColliders.push(...labDoorColliders);

  addModel(models.controlCenter, 4.8, [1, .6, -23.3], [0, 0, 0], 'controlCenter');
  for (const x of [-6, 8]) {
    for (const z of [-21.5, -28]) {
      addMesh(scene, new THREE.BoxGeometry(3.4, .08, .7), ceilingLight, [x, 7.05, z]).name = 'Lab ceiling fixture';
    }
  }

  // The rover approaches this sealed transfer hatch to hand off its samples.
  addMesh(scene, new THREE.BoxGeometry(3.3, 1.6, .2), frame, [6.5, 1.7, -17.14]);
  addMesh(scene, new THREE.BoxGeometry(2.8, 1.1, .22), bulkhead, [6.5, 1.7, -17]);
  addMesh(scene, new THREE.BoxGeometry(.32, .15, .24), ceilingLight, [7.45, 2.35, -16.86]).name = 'Lab transfer indicator';

  // Explicit room ownership keeps global daylight intact outside the lab.
  for (const object of scene.children.slice(firstRoomObject)) object.userData.labPowerSurface = true;

  const controlLight = new THREE.PointLight(0xc5e5f0, 26, 16, 2);
  controlLight.name = 'Lab control light';
  controlLight.position.set(-6, 5.8, LAB.centerZ);
  scene.add(controlLight);
  const labLight = new THREE.PointLight(0xffe6bb, 20, 15, 2);
  labLight.name = 'Lab sample light';
  labLight.position.set(8, 5.8, LAB.centerZ);
  scene.add(labLight);
}

function populateStation(models, buildRoom = true) {
  addModel(models.moon, 14, [-40, 20, -130], [0, 0, 0], 'moon');
  addModel(models.desertCactus, 3, [-13, floorHeight(-13, -10), -10], [0, .25, 0], 'desertCactus');
  addModel(models.pod, 5.3, [-15, floorHeight(-15, -3), -3], [0, .5, 0], 'pod');
  addModel(models.cactus, 3.4, [15, floorHeight(15, 7), 7], [0, -.2, 0], 'cactus');
  const flowers = addModel(models.flowers, .9, [16, floorHeight(16, 8), 8], [0, 0, 0], 'flowers');
  const marigold = addModel(models.marigold, 1.4, [-8, floorHeight(-8, 13), 13], [0, 0, 0], 'marigold');
  for (const [key, plant] of [['flowers', flowers], ['marigold', marigold]]) {
    if (plant && !plantColliders.has(key)) {
      const collision = createRoverCollision(plant);
      plantColliders.set(key, collision);
      movingColliders.push(collision.box);
    }
  }
  addModel(models.rocks, 2.1, [-12, floorHeight(-12, 10), 10], [0, .4, 0], 'rocks');
  addModel(models.rock, 1.8, [15, floorHeight(15, 0), 0], [0, -.35, 0], 'rock');
  const astronaut = addModel(models.astronautPoly, 3.3, [1, .6, -20.35], [0, Math.PI, 0], 'astronautPoly');
  if (astronaut) astronaut.userData.labPowerSurface = true;
  if (astronaut && !astronautCollision) {
    astronautCollision = createRoverCollision(astronaut);
    movingColliders.push(astronautCollision.box);
  }
  tortoise = addModel(models.tortoise, 1.35, [12, floorHeight(12, 8), 8], [0, 0, 0], 'tortoise');
  if (tortoise && !tortoiseCollision) {
    tortoiseCollision = createRoverCollision(tortoise);
    movingColliders.push(tortoiseCollision.box);
  }
  const solarPanel = addModel(models.solarPanel, 4, [2, floorHeight(2, 16), 16], [0, -.55, 0], 'solarPanel');
  if (solarPanel && !solarPanelCollision) {
    // Cover the rotated panel and its supports, including the corners that
    // extended past the old circular obstacle and engulfed the camera.
    solarPanelCollision = createRoverCollision(solarPanel);
    movingColliders.push(solarPanelCollision.box);
  }
  addModel(models.powerCell, 2.8, [15, floorHeight(15, -5), -5], [0, -.65, 0], 'powerCell');
  addModel(models.dish, 4.2, [20.5, 14.9, -20.5], [0, -.7, 0], 'dish');
  addModel(models.commandPod, 4.2, [-14, floorHeight(-14, 4), 4], [0, 1.2, 0], 'commandPod');
  if (buildRoom) buildResearchArea(models);
  rover = addModel(models.rover, 5.6, [2, floorHeight(2, -10), -10], [0, 0, 0], 'rover');
  if (rover && !roverCollision) {
    roverCollision = createRoverCollision(rover);
    movingColliders.push(roverCollision.box);
  }
  moveRover(0);
  moveTortoise(0);
  ship = addModel(models.ship, 18, [0, 27, -50], [0, .2, 0], 'ship');
  if (!gameMode) {
    portraitRover = addModel(models.rover, 5.6, [0, floorHeight(0, -7), -7], [0, 0, 0], 'portraitRover');
    portraitShip = addModel(models.ship, 16, [-3, 21, -38], [0, .2, 0], 'portraitShip');
  }
  applySceneProfile();
  updateCast(currentView);
}

function moveRover(delta) {
  if (!rover) return;
  delta *= roverGameplay?.model.speedMultiplier ?? 1;
  if(delta===0)return;
  const nextTime = roverTime + delta;
  const phase = (nextTime * .024 + .15) % 1;
  const point = roverRoute.getPointAt(phase);
  const direction = roverRoute.getTangentAt(phase);
  point.y = floorHeight(point.x, point.z) + .06;
  if (moveRoverSafely(rover, roverCollision, point, Math.atan2(direction.x, direction.z), player?.position, player?.radius ?? .38)) {
    // Hold route progress while yielding; do not skip ahead through the player.
    roverTime = nextTime;
  }
}

function movePortraitRover(time) {
  if (!portraitRover || sceneProfile === 'desktop') return;
  const survey = THREE.MathUtils.smoothstep(journeyProgress, 5.3, 5.9);
  const x = THREE.MathUtils.lerp(.5, 6, survey) + Math.sin(time * .17) * THREE.MathUtils.lerp(.75, 1.2, survey);
  const z = THREE.MathUtils.lerp(-7, 5, survey) + Math.cos(time * .17) * .35;
  portraitRover.position.set(x, floorHeight(x, z) + .06, z);
  portraitRover.rotation.y = THREE.MathUtils.lerp(.25, -.45, survey) + Math.cos(time * .17) * .1;
}

function moveTortoise(delta) {
  if (!tortoise) return;
  const nextTime = tortoiseTime + delta;
  let remaining = nextTime % tortoiseLoopTime;
  for (let i = 0; i < tortoiseStops.length; i++) {
    const start = tortoiseStops[i];
    const end = tortoiseStops[(i + 1) % tortoiseStops.length];
    const previous = tortoiseStops[(i - 1 + tortoiseStops.length) % tortoiseStops.length];
    const pause = tortoisePauses[i];
    const travel = tortoiseTravel[i];
    const segmentTime = pause + travel;
    if (remaining > segmentTime) {
      remaining -= segmentTime;
      continue;
    }
    const heading = Math.atan2(end.x - start.x, end.z - start.z);
    let x = start.x;
    let z = start.z;
    let walking = false;
    let rotationY;
    if (remaining < pause) {
      const priorHeading = Math.atan2(start.x - previous.x, start.z - previous.z);
      const turn = Math.atan2(Math.sin(heading - priorHeading), Math.cos(heading - priorHeading));
      rotationY = priorHeading + turn * THREE.MathUtils.smoothstep(remaining, 0, pause);
    } else {
      walking = true;
      const rawSteps = Math.min(12, (remaining - pause) / travel * 12);
      const fullSteps = Math.floor(rawSteps);
      const withinStep = rawSteps - fullSteps;
      const advance = (fullSteps + THREE.MathUtils.smoothstep(withinStep, .25, .85)) / 12;
      x = THREE.MathUtils.lerp(start.x, end.x, advance);
      z = THREE.MathUtils.lerp(start.z, end.z, advance);
      rotationY = heading;
    }
    tortoisePosition.set(x, floorHeight(x, z) + (walking ? .012 * Math.sin(nextTime * 3) ** 2 : 0), z);
    if (moveRoverSafely(tortoise, tortoiseCollision, tortoisePosition, rotationY, player?.position, player?.radius ?? .38)) {
      tortoiseTime = nextTime;
      tortoise.rotation.z = walking ? .022 * Math.sin(nextTime * 3) : 0;
    }
    return;
  }
}

function requiredModelKeys(profile) {
  if (gameMode) return new Set(assetFiles.map(([, key]) => key));
  if (profile === 'desktop') return new Set(assetFiles.map(([, key]) => key));
  const keys = new Set(portraitCast[profile].flat());
  if (keys.delete('portraitShip')) keys.add('ship');
  if (keys.delete('portraitRover')) keys.add('rover');
  return keys;
}

async function loadModels(profile = sceneProfile, showProgress = true) {
  const loader = new GLTFLoader();
  const required = requiredModelKeys(profile);
  const files = assetFiles.filter(([, key]) => required.has(key));
  let completed = 0;
  if (showProgress) loadingCount.textContent = `00 / ${String(files.length).padStart(2, '0')}`;
  await Promise.all(files.map(async ([file, key]) => {
    try {
      if (!pendingAssetLoads.has(key)) {
        pendingAssetLoads.set(key, loader.loadAsync(`./assets/${encodeURIComponent(file)}`));
      }
      loadedAssets[key] = await pendingAssetLoads.get(key);
    } catch (error) {
      console.warn(`Could not load ${file}`, error);
      loadedAssets[key] = null;
    } finally {
      completed++;
      if (showProgress) $('#loading-progress').value = completed / files.length;
      if (showProgress) loadingCount.textContent = `${String(completed).padStart(2, '0')} / ${String(files.length).padStart(2, '0')}`;
    }
  }));
  if(files.some(([,key])=>!loadedAssets[key]))throw new Error('Required station models are missing');
  return loadedAssets;
}

async function ensureProfileModels() {
  if (!modelsReady) return;
  await loadModels(sceneProfile, false);
  if ([...requiredModelKeys(sceneProfile)].some((key) => loadedAssets[key] && !stagedModels.has(key))) {
    populateStation(loadedAssets, false);
  }
  applySceneProfile();
  if (player) player.updateCamera();
  menuScene?.resize();
}

function createRenderer() {
  sceneProfile = getSceneProfile();
  quality = getQuality(sceneProfile);
  renderPixelRatio = Math.min(window.devicePixelRatio || 1, quality.ratio);
  // MSAA at a modest pixel ratio reads better than jagged model silhouettes.
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: quality.name === 'low phone' ? 'low-power' : 'default' });
  renderer.setPixelRatio(renderPixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.34;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost',event=>{
    event.preventDefault();player?.clearInput();document.exitPointerLock?.();mainMenu.hide();
    interactions?.setActive(false);powerGameplay?.setActive(false);shiftGameplay?.setActive(false);warningBoard?.setActive(false);
    $('#fallback-message').textContent='The graphics connection was lost. Reload the station; your saved personal best remains in this browser.';
    $('#fallback').hidden=false;
  });
  resize();
}

function resize() {
  if (!camera || !renderer) return;
  const nextProfile = getSceneProfile();
  if (nextProfile !== sceneProfile) {
    sceneProfile = nextProfile;
    quality = getQuality(sceneProfile);
    renderPixelRatio = Math.min(window.devicePixelRatio || 1, quality.ratio);
    applySceneProfile();
    ensureProfileModels().catch((error) => console.warn('Could not stage resized view', error));
    if (sunLight) {
      sunLight.castShadow = quality.shadows;
      sunLight.shadow.mapSize.set(sceneProfile === 'desktop' ? 1024 : 512, sceneProfile === 'desktop' ? 1024 : 512);
      sunLight.shadow.map?.dispose();
      sunLight.shadow.map = null;
    }
  }
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
  adaptiveQuality.reset();
  renderPixelRatio=Math.min(renderPixelRatio,window.devicePixelRatio||1,quality.ratio);
  renderer.setPixelRatio(renderPixelRatio);
  renderer.shadowMap.enabled = quality.shadows;
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  if (player) player.updateCamera();
  menuScene?.resize();
}

function frame(timestamp) {
  requestAnimationFrame(frame);
  if (!renderer) return;
  if (document.hidden) {
    adaptiveQuality.suspend();framePacer.reset();clock.getDelta();refreshInteractions();refreshPowerGameplay();return;
  }
  const paused=gameMode&&!shiftGameplay?.model.terminal&&
    ((!player?.locked&&!repairInput?.active)||photoPaused||!document.hasFocus());
  // Keep active play/cinematics at their configured rate. A static menu needs
  // fewer redraws; photo mode retains responsive mouse look at the play rate.
  const elapsed=framePacer.advance(clock.getDelta(),paused&&!photoPaused?15:quality.frameRate,!paused,timestamp);
  if(elapsed===null)return;
  cameraFeedback?.restore();
  refreshInteractions();
  refreshPowerGameplay();
  let activeElapsed=elapsed;
  if(shiftGameplay?.model.terminal){adaptiveQuality.suspend();equipmentPrompts?.hide();shiftGameplay.updateEnding(elapsed);renderer.render(scene,camera);return;}
  if (arrival?.active) {
    adaptiveQuality.suspend();
    equipmentPrompts?.hide();
    if (player?.locked) arrival.update(elapsed);
    else arrival.pauseAudio();
    renderer.render(scene, camera);
    return;
  }
  if (gameMode && ((!player?.locked&&!repairInput?.active) || photoPaused || !document.hasFocus())) {
    adaptiveQuality.suspend();
    equipmentPrompts?.hide();
    // Drain the real clock but freeze simulation time. Photo pause keeps
    // mouse look available; menu pause also freezes the camera position.
    if (photoPaused) player?.updateCamera();
    training?.render(elapsed);
    renderer.render(scene, camera);
    return;
  }
  if (!reducedMotion || sceneProfile==='desktop') {
    const change=adaptiveQuality.update(activeElapsed,{ratio:renderPixelRatio,minimum:quality.minimum,
      maximum:Math.min(window.devicePixelRatio||1,quality.ratio),frameRate:quality.frameRate,profile:sceneProfile,
      shadows:renderer.shadowMap.enabled,allowShadows:quality.shadows});
    if(change){
      if(change.ratio!==renderPixelRatio){
        renderPixelRatio=change.ratio;
        renderer.setPixelRatio(renderPixelRatio);
        renderer.setSize(host.clientWidth, host.clientHeight, false);
      }
      if(change.shadows!==renderer.shadowMap.enabled){
        renderer.shadowMap.enabled=change.shadows;
        renderer.shadowMap.needsUpdate=true;
        if(sunLight)sunLight.castShadow=change.shadows;
      }
    }
  }
  const integrated=advanceActiveFrame(activeElapsed,step=>{
    if(player){labDoorTarget=player.nearDoor?1:0;player.update(step);}
    const nextDoorOpening=THREE.MathUtils.damp(labDoorOpen,labDoorTarget,8,step);
    labDoorOpen=advanceDoorOpening(labDoorPanels,labDoorColliders,labDoorOpen,nextDoorOpening,player?.position,player?.radius??.38);
    simulationTime+=step;
    if(gameMode||!reducedMotion){moveRover(step);moveTortoise(step);}
    if(training?.active)training.update(step);else shiftGameplay?.update(step);
    return !shiftGameplay?.model.terminal;
  });
  if(integrated.paused){photoPaused=true;hudControls.textContent='PERFORMANCE PAUSE · P RESUME · ESC PAUSE';player?.clearInput();refreshPowerGameplay();refreshInteractions();renderer.render(scene,camera);return;}
  activeElapsed=integrated.advanced;
  if(shiftGameplay?.model.terminal){renderer.render(scene,camera);return;}
  const time = simulationTime;
  if (!reducedMotion) {
    movePortraitRover(time);
    if (ship) {
      ship.position.x = Math.sin(time * .16) * 22;
      ship.position.z = -50 + Math.cos(time * .16) * 4;
      ship.position.y = 27 + Math.sin(time * .32) * 1.2;
      ship.rotation.y = .2 + Math.cos(time * .16) * .16;
    }
    if (portraitShip && sceneProfile !== 'desktop') {
      const centerX = sceneProfile === 'tablet' ? -2 : -3;
      const centerY = sceneProfile === 'tablet' ? 22 : 21;
      portraitShip.position.x = centerX + Math.sin(time * .13) * 1.5;
      portraitShip.position.y = centerY + Math.sin(time * .2) * .4;
      portraitShip.rotation.y = .2 + Math.cos(time * .13) * .12;
    }
  }
  interactions?.observeRun();
  interactions?.update(player.position, activeElapsed, {deferProjection:true});
  powerGameplay?.update(activeElapsed,false);
  oxygenGameplay?.update(activeElapsed);
  coolingGameplay?.update(activeElapsed);
  communicationsGameplay?.update(activeElapsed);
  roverGameplay?.update(activeElapsed);
  emergencyPresentation?.update(activeElapsed);
  warningBoard?.render();
  training?.render(activeElapsed);
  const precision=!player?.inputEnabled||equipmentSystemsForPresentation().some(system=>system?.manager.focus);
  cameraFeedback?.apply(precision);
  try{equipmentPrompts?.update(camera);interactions?.projectDialogue(activeElapsed);renderer.render(scene,camera);}finally{cameraFeedback?.restore();}
}

function equipmentSystemsForPresentation(){return [powerGameplay,oxygenGameplay,coolingGameplay,communicationsGameplay,roverGameplay];}

async function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(SPACE_BACKGROUND);
  camera = new THREE.PerspectiveCamera(61, 1, .1, 260);
  try {
    createRenderer();
  } catch (error) {
    console.error('WebGL could not start', error);
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 450);
    $('#fallback').hidden = false;
    return;
  }
  scene.add(new THREE.HemisphereLight(0xa8e0f2, 0x755e48, 2.0));
  sunLight = new THREE.DirectionalLight(0xffe4bd, 3.0);
  sunLight.position.set(-15, 28, 14);
  sunLight.castShadow = quality.shadows;
  sunLight.shadow.mapSize.set(sceneProfile === 'desktop' ? 1024 : 512, sceneProfile === 'desktop' ? 1024 : 512);
  sunLight.shadow.camera.left = -30;
  sunLight.shadow.camera.right = 30;
  sunLight.shadow.camera.top = 30;
  sunLight.shadow.camera.bottom = -30;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 80;
  sunLight.shadow.bias = -.001;
  scene.add(sunLight);
  const fill = new THREE.DirectionalLight(0x68b4d2, 1.0);
  fill.position.set(13, 9, -12);
  scene.add(fill);
  buildStation();
  scene.add(buildLunarEnvironment());
  try {
    const models = await loadModels();
    populateStation(models);
    modelsReady = true;
    await ensureProfileModels();
  } catch (error) {
    console.error('The station models could not be staged', error);
    loading.hidden=true;mainMenu.hide();$('#fallback-message').textContent='Some station equipment could not load. Check your connection and reload the station.';$('#fallback').hidden=false;
    renderer.render(scene,camera);return;
  }
  player = new FirstPersonController(camera, renderer.domElement, floorHeight, () => labDoorOpen, (locked) => {
    photoPaused = false;
    hudControls.textContent = defaultHudControls;
    if (locked) { menuScene?.hide(); applyComfortSettings(); mainMenu.hide(); }
    else if(repairInput?.active)mainMenu.hide();
    else if(training?.active){mainMenu.hide();training.render();}
    else if(!shiftGameplay?.model.terminal) mainMenu.show({ paused: shiftGameplay?.model.status==='running'||!!arrival?.active, introActive: !!arrival?.active });
    else mainMenu.hide();
    if (locked && arrival && !arrival.started) {
      player.inputEnabled = false;
      player.clearInput();
      arrivalRenderState = { ratio: renderer.getPixelRatio(), shadows: renderer.shadowMap.autoUpdate, exposure: renderer.toneMappingExposure };
      renderer.setPixelRatio(Math.min(arrivalRenderState.ratio, 1.25));
      renderer.shadowMap.autoUpdate = false;
      renderer.toneMappingExposure = 1.12;
      arrival.start(reducedMotion);
    }
    // Exclude the menu-to-arrival gap on first lock and on resume.
    if (locked && arrival?.active) clock.getDelta();
    $('#reticle').hidden = !locked || !!arrival?.active;
    $('#game-hud').hidden = !(locked||repairInput?.active) || !!arrival?.active;
    refreshInteractions();
    refreshPowerGameplay();
  }, () => movingColliders);
  interactions = new StationInteractions({ scene, camera, models: stagedModels, host: $('#app'),reducedMotion,getContext:()=>({shift:presentationShift(),systems:{power:powerGameplay?.model,oxygen:oxygenGameplay?.model,cooling:coolingGameplay?.model,communications:communicationsGameplay?.model,rover:roverGameplay?.model}}) });
  const equipmentSystems=()=>[powerGameplay,oxygenGameplay,coolingGameplay,communicationsGameplay,roverGameplay];
  const canService=owner=>!equipmentSystems().some(system=>system!==owner&&system?.repairOpen);
  const showPausedScreen=()=>{if(shiftGameplay?.model.terminal)return;$('#reticle').hidden=true;$('#game-hud').hidden=true;if(training?.active){mainMenu.hide();training.render();}else mainMenu.show({paused:shiftGameplay?.model.status==='running'||!!arrival?.active,introActive:!!arrival?.active});};
  repairInput=new RepairInput({player,hasOpenRepair:()=>equipmentSystems().some(c=>c?.repairOpen),closeRepairs:()=>{for(const c of equipmentSystems())if(c?.repairOpen)c.closeRepair(true);},canResume:()=>!document.hidden&&document.hasFocus()&&!photoPaused&&(training?.active||shiftGameplay?.model.status==='running'),onPause:showPausedScreen});
  const equipmentInputChanged=()=>{repairInput.changed();refreshInteractions();$('#reticle').hidden=!player.locked||!!arrival?.active||photoPaused||equipmentSystems().some(system=>system?.repairOpen);};
  if (stagedModels.has('powerCell')) powerGameplay = new PowerGameplay({ scene, camera, player,
    isMuted: () => !!arrival?.muted,
    onMuteChange:setAudioMuted,
    canRepair:()=>canService(powerGameplay),
    target: stagedModels.get('powerCell'), host: $('#app'), onInputChange:equipmentInputChanged });
  powerGameplay?.lighting.setReducedMotion(reducedMotion);
  if(powerGameplay&&stagedModels.has('pod'))oxygenGameplay=new OxygenGameplay({scene,camera,player,target:stagedModels.get('pod'),host:$('#app'),power:powerGameplay,canvas:renderer.domElement,
    canRepair:()=>canService(oxygenGameplay),onInputChange:equipmentInputChanged,
  });
  if(powerGameplay&&stagedModels.has('controlCenter'))coolingGameplay=new CoolingGameplay({scene,camera,player,target:stagedModels.get('controlCenter'),host:$('#app'),power:powerGameplay,
    canRepair:()=>canService(coolingGameplay),onInputChange:equipmentInputChanged,
  });
  if(powerGameplay)communicationsGameplay=new CommunicationsGameplay({scene,camera,player,target:stagedModels.get('powerCell'),host:$('#app'),power:powerGameplay,canRepair:()=>canService(communicationsGameplay),onInputChange:equipmentInputChanged});
  if(powerGameplay&&rover)roverGameplay=new RoverGameplay({scene,camera,player,target:rover,host:$('#app'),power:powerGameplay,canRepair:()=>canService(roverGameplay),onInputChange:equipmentInputChanged});
  if(powerGameplay){
    const systems={power:powerGameplay,oxygen:oxygenGameplay,cooling:coolingGameplay,communications:communicationsGameplay,rover:roverGameplay};
    equipmentPrompts=new EquipmentPrompt({host:$('#app'),controllers:systems});
    const audio=new EmergencyAudio();cameraFeedback=new CameraFeedback(camera);
    const indicators=new EquipmentIndicators({scene,sources:interactions.sources});
    const environment=new EnvironmentalFeedback({power:powerGameplay,indicators});
    const screen=new ScreenFeedback({canvas:renderer.domElement,vignette:oxygenGameplay?.root.querySelector('.oxygen-vignette')??{style:{}}});
    emergencyPresentation=new EmergencyPresentation({getContext:()=>({shift:presentationShift(),systems:Object.fromEntries(Object.entries(systems).filter(([,s])=>s).map(([id,s])=>[id,s.model]))}),adapters:[audio,environment,screen,cameraFeedback]});
    emergencyPresentation.audio=audio;emergencyPresentation.attach(systems);
  }
  if(powerGameplay)shiftGameplay=new ShiftGameplay({scene,power:powerGameplay,oxygen:oxygenGameplay,cooling:coolingGameplay,communications:communicationsGameplay,rover:roverGameplay,player,camera,renderer,host:$('#app'),reducedMotion,presentation:emergencyPresentation,
    getSecrets:()=>interactions.secrets.found,
    seed:new URLSearchParams(window.location.search).get('seed'),
    planVersion:[1,2,3,4,5,6,7,8].includes(Number(new URLSearchParams(window.location.search).get('plan')))?Number(new URLSearchParams(window.location.search).get('plan')):8,
    onFinish:()=>{mainMenu.hide();interactions.setActive(false);warningBoard?.setActive(false);$('#reticle').hidden=true;$('#game-hud').hidden=true;},
    onRetry:()=>{player.reset();clock.getDelta();powerGameplay.unlockAudio();player.lock();},
    onTitle:()=>{player.reset();shiftGameplay.reset({preserveSeed:true});mainMenu.show();menuScene.show({returnToTitle:true});$('#reticle').hidden=true;$('#game-hud').hidden=true;refreshPowerGameplay();},
  });
  if(shiftGameplay)warningBoard=new WarningBoard({host:shiftGameplay.root,systems:{power:powerGameplay,oxygen:oxygenGameplay,cooling:coolingGameplay,communications:communicationsGameplay,rover:roverGameplay},getLockdown:()=>shiftGameplay.model.lockdownRemaining,getPresentation:()=>emergencyPresentation?.snapshot});
  training=new TrainingGuide({host:$('#app'),player,controllers:{power:powerGameplay,oxygen:oxygenGameplay,cooling:coolingGameplay,communications:communicationsGameplay,rover:roverGameplay},
    resetSystems:()=>{repairInput.cursor=false;for(const c of equipmentSystems())c?.reset();emergencyPresentation?.reset();interactions.reset();},
    onScenario:index=>{if(index===7)parkTrainingRover();},
    isPaused:()=>(!player.locked&&!repairInput.active)||photoPaused,
    onPause:()=>repairInput.pause(),
    onResume:()=>{photoPaused=false;clock.getDelta();powerGameplay.unlockAudio();player.lock();},
    onExit:()=>{shiftGameplay.reset({preserveSeed:true});leaveTrainingWorld();document.exitPointerLock();mainMenu.show();menuScene.show({returnToTitle:true});$('#game-hud').hidden=true;$('#reticle').hidden=true;refreshPowerGameplay();},
    onRealShift:()=>{shiftGameplay.reset({preserveSeed:true});leaveTrainingWorld();shiftGameplay.start();clock.getDelta();powerGameplay.unlockAudio();player.lock();},
  });
  player.onReset = () => { if(training?.active){training.action('repeat');player.updateCamera();return;}shiftGameplay?.resetEnding();interactions.reset(); powerGameplay?.reset();oxygenGameplay?.reset();coolingGameplay?.reset();communicationsGameplay?.reset();roverGameplay?.reset();shiftGameplay?.reset();player.updateCamera();if(arrival?.started&&!arrival.active)shiftGameplay?.start(); };
  applyComfortSettings();
  applyPresentationSettings();
  arrival = new ArrivalSequence(scene, camera, floorHeight, completeArrival, {
    // The actual glass habitat and lunar terrain establish the destination.
    // Visibility snapshots restore all original state on skip or completion.
    interiorRoots: scene.children.filter(object => !object.isLight),
  });
  arrival.onMuteChange=setAudioMuted;
  arrival.hiddenDetails = ['marigold', 'flowers', 'astronautPoly', 'tortoise', 'rover']
    .map(key => stagedModels.get(key)).filter(Boolean).map(object => [object, object.visible]);
  // Compile the arrival materials behind the loading screen, before the
  // first visible camera movement. Keep shadow maps static during arrival.
  await arrival.prepare(renderer);
  menuScene = new MenuScene(scene, camera, renderer, arrival);
  menuScene.show();
  if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  renderer.render(scene, camera);
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 450);
  mainMenu.show();
  frame();
}

function completeArrival() {
    if (!player || !modelsReady) return;
    if (arrivalRenderState) {
      renderer.setPixelRatio(arrivalRenderState.ratio);
      renderer.shadowMap.autoUpdate = arrivalRenderState.shadows;
      renderer.shadowMap.needsUpdate = true;
      renderer.toneMappingExposure = arrivalRenderState.exposure;
      arrivalRenderState = null;
    }
    player.clearInput();
    player.inputEnabled = true;
    player.position.set(...ARRIVAL_SPAWN);
    player.yaw = 0;
    player.pitch = 0;
    player.eyeY = undefined;
    player.updateCamera();
    applyComfortSettings();
    $('#reticle').hidden = !player.locked;
    $('#game-hud').hidden = !player.locked;
    if(trainingPending){trainingPending=false;beginTraining();}else shiftGameplay?.start();
    refreshInteractions();
    refreshPowerGameplay();
}

function applyComfortSettings() {
  const multiplier = Number($('#look-speed').value);
  $('#look-speed-value').value = `${Math.round(multiplier * 100)}%`;
  if (player) player.lookSensitivity = 0.0014 * multiplier;
  if (camera && !menuScene?.active) {
    camera.fov = Number($('#view-fov').value);
    camera.updateProjectionMatrix();
  }
}

function setAudioMuted(muted){
  $('#audio-muted').checked=!!muted;
  if(arrival&&arrival.muted!==!!muted)arrival.toggleMute();
  if(powerGameplay){powerGameplay.muted=!!muted;powerGameplay.stopAlarm();powerGameplay.renderWarning();}
  emergencyPresentation?.audio.setMuted(muted);
  if(muted)shiftGameplay?.stopOutcome();
}

function applyEffectSettings(){
  reducedMotion=$('#motion-mode').value==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;
  interactions?.setReducedMotion(reducedMotion);
  if(!emergencyPresentation)powerGameplay?.lighting.setReducedMotion(reducedMotion);
  $('#app').setAttribute('data-reduced-motion',String(reducedMotion));
  emergencyPresentation?.configure({reducedMotion,cameraMode:$('#camera-effects').value,screenMode:$('#screen-effects').value});
  emergencyPresentation?.audio.setVolumes(Number($('#master-volume').value)/100,Number($('#alert-volume').value)/100);
  if(shiftGameplay){shiftGameplay.reducedMotion=reducedMotion;shiftGameplay.failureSequence.reducedMotion=reducedMotion;}
}

function applyPresentationSettings(){
  applyEffectSettings();
  quality=getQuality(sceneProfile);
  renderPixelRatio=Math.min(window.devicePixelRatio||1,quality.ratio);resize();
}

mainMenu = new MainMenu($('#start-screen'), {
  onStart: () => {
    if(arrival?.started&&!arrival.active)shiftGameplay?.start();
    if (arrival && !arrival.started) arrival.unlockAudio();
    powerGameplay?.unlockAudio();
    player?.lock();
  },
  onReset: () => player?.reset(),
  onTraining:()=>{if(!player||arrival?.active)return;trainingPending=true;shiftGameplay?.reset({preserveSeed:true});if(arrival?.started&&!arrival.active){trainingPending=false;beginTraining();}else arrival?.unlockAudio();powerGameplay?.unlockAudio();clock.getDelta();player.lock();},
});
$('#look-speed').addEventListener('input', applyComfortSettings);
$('#view-fov').addEventListener('change', applyComfortSettings);
$('#audio-muted').addEventListener('change',event=>setAudioMuted(event.target.checked));
$('#render-quality').addEventListener('change',applyPresentationSettings);
$('#motion-mode').addEventListener('change',applyPresentationSettings);
for(const id of ['camera-effects','screen-effects','master-volume','alert-volume'])$(`#${id}`).addEventListener('input',applyEffectSettings);
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',applyPresentationSettings);
window.addEventListener('pagehide',event=>{equipmentPrompts?.hide();emergencyPresentation?.setActive(false);shiftGameplay?.stopOutcome();if(!event.persisted){equipmentPrompts?.dispose();training?.dispose();interactions?.setActive(false,{reason:'terminal'});interactions?.highlight.clear();interactions?.presentation.dispose();shiftGameplay?.failureSequence.dispose();emergencyPresentation?.dispose();renderer?.dispose();}});
$('#reload-game').addEventListener('click',()=>window.location.reload());
document.addEventListener('keydown', (event) => {
  if(event.code==='Escape'&&(player?.locked||repairInput?.active)&&!shiftGameplay?.model?.terminal){if(repairInput)repairInput.pause();else{player.clearInput();document.exitPointerLock();}return;}
  if(training?.handleKey(event))return;
  if(shiftGameplay?.handleEndingKey(event))return;
  if (arrival?.active) {
    if (event.code === 'KeyM' && !event.repeat) arrival.toggleMute();
    if (event.code === 'Space' && player?.locked && !event.repeat) {
      event.preventDefault();
      arrival.skip();
    }
    return;
  }
  if (event.code === 'KeyE') {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    refreshInteractions();
    refreshPowerGameplay();
    // Watt hosts two services. Its faulty power circuit takes E precedence;
    // an already-open service always retains its own confirmation controls.
    if(!equipmentSystemsForPresentation().some(c=>c?.repairOpen)&&powerGameplay?.model.needsRepair&&powerGameplay.handleKey(event))return;
    if(roverGameplay?.handleKey(event))return;
    if(communicationsGameplay?.handleKey(event))return;
    if(coolingGameplay?.handleKey(event))return;
    if(oxygenGameplay?.handleKey(event))return;
    if (powerGameplay?.handleKey(event)) return;
    if (interactions?.active) { event.preventDefault(); interactions.interact(); }
    return;
  }
  if(roverGameplay?.handleKey(event))return;
  if(communicationsGameplay?.handleKey(event))return;
  if(coolingGameplay?.handleKey(event))return;
  if(oxygenGameplay?.handleKey(event))return;
  if (powerGameplay?.handleKey(event)) return;
  if (interactions?.handleKey(event)) return;
  if (event.code !== 'KeyP' || event.repeat || event.ctrlKey || event.altKey || event.metaKey || !player?.locked) return;
  event.preventDefault();
  photoPaused = !photoPaused;
  refreshPowerGameplay();
  refreshInteractions();
  player.clearInput();
  $('#reticle').hidden = photoPaused;
  hudControls.textContent = photoPaused
    ? 'PHOTO PAUSED · MOUSE LOOK · P RESUME · ESC MENU'
    : defaultHudControls;
});
document.addEventListener('keyup',event=>{if(['KeyE','Space'].includes(event.code))oxygenGameplay?.release();});
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  adaptiveQuality.suspend();
  framePacer.reset();
  clock.getDelta();
  if (document.hidden) arrival?.pauseAudio();
  if(document.hidden&&repairInput?.active)repairInput.pause();
  refreshInteractions();
  refreshPowerGameplay();
});
window.addEventListener('blur', () => { if(repairInput?.active)repairInput.pause();refreshPowerGameplay(); refreshInteractions(); });
window.addEventListener('focus', () => { refreshPowerGameplay(); refreshInteractions(); });
window.addEventListener('pagehide', () => arrival?.pauseAudio());
init();
