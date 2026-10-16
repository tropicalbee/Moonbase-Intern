/** User-supplied recordings. Literal URLs let Vite package them for offline releases. */
export const alarmSamples = Object.freeze({
  power: { url: new URL('../../../assets/alexis_gaming_cam-alarme-342932.mp3', import.meta.url).href, seconds: 2.4, peak: .18 },
  emergency: { url: new URL('../../../assets/freesound_community-emergency-alarm-with-reverb-29431.mp3', import.meta.url).href, seconds: 3.2, peak: .2 },
  equipment: { url: new URL('../../../assets/freesound_community-beepbeepbeep-53921.mp3', import.meta.url).href, seconds: .85, peak: .12 },
  explosion: { url: new URL('../../../assets/soundreality-explosion-fx-343683.mp3', import.meta.url).href, seconds: 4.1, peak: .24 },
  oxygenLoss: { url: new URL('../../../assets/freesound_community-air-hiss-102406.mp3', import.meta.url).href, seconds: 2.1, peak: .1 },
  powerFailure: { url: new URL('../../../assets/freesound_community-electric-sparks-6130.mp3', import.meta.url).href, seconds: 1.25, peak: .12 },
  uplinkFailure: { url: new URL('../../../assets/freesound_community-transmission-error-loop-23152.mp3', import.meta.url).href, seconds: 1.6, peak: .1 },
  roverFailure: { url: new URL('../../../assets/freesound_community-car-breaks-down-87833.mp3', import.meta.url).href, seconds: 2.1, peak: .12 },
  shiftComplete: { url: new URL('../../../assets/soundshelfstudio-mission-complete-chime-534595.mp3', import.meta.url).href, seconds: 3.5, peak: .12 },
});
