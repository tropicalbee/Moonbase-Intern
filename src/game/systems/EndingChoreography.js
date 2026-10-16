const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
export const ENDING_SKIP_DELAY=1.5;
export const ENDING_EXTERIOR_TIME=2.35;
export const THERMAL_IMPACT_TIME=3.2;
export function endingKind(reason){
  return reason==null?'success':reason==='cooling-overheated'?'thermal':reason==='power-lockdown'?'blackout':reason==='oxygen-depleted'?'oxygen':'handover';
}

const shots={
  success:{duration:7.2,radius:[59,77],angle:[.62,1.04],height:[18,30],exposure:1.04,light:1.1,tint:0xffe6bb,
    transmission:'Habitat secure. Thank you, intern.',title:'SHIFT COMPLETE',caption:'Habitat 07 secure. Your watch is over.'},
  blackout:{duration:6.8,radius:[59,75],angle:[.84,.58],height:[16,25],exposure:.56,light:0,tint:0x92b4ce,
    transmission:'Reserve exhausted. Safety isolation engaged.',title:'CONNECTION LOST',caption:'Habitat 07 / safety isolation'},
  oxygen:{duration:7,radius:[61,79],angle:[.68,.94],height:[19,31],exposure:.75,light:.32,tint:0x8ebace,
    transmission:'Atmosphere depleted. Life support offline.',title:'ATMOSPHERE LOST',caption:'Habitat 07 / circulation offline'},
  thermal:{duration:7.6,radius:[83,98],angle:[.72,.94],height:[28,37],exposure:.8,light:.14,tint:0xe88b54,
    transmission:'Containment failing. Habitat integrity lost.',title:'STATION LOST',caption:'Habitat 07 / containment breached'},
  handover:{duration:6.6,radius:[60,75],angle:[.76,.98],height:[18,27],exposure:.82,light:.55,tint:0xa8c5da,
    transmission:'Readiness unresolved. Handover denied.',title:'HANDOVER REJECTED',caption:'Habitat 07 / readiness check failed'}
};

/** Shared with arrival: pure, eased camera sampling in the existing render loop. */
export function sampleEnding(reason,time,{reducedMotion=false}={}){
  const kind=endingKind(reason),shot=shots[kind],duration=shot.duration;
  const t=Number.isFinite(time)?Math.max(0,Math.min(duration,time)):0,cut=ENDING_EXTERIOR_TIME;
  const exterior=reducedMotion||t>=cut,pull=reducedMotion?1:smooth((t-cut)/(duration-cut-.35));
  // A polar track keeps the lens outside the pressure shell throughout the reveal.
  const radius=mix(...shot.radius,pull),angle=mix(...shot.angle,pull);
  const position=[Math.sin(angle)*radius,mix(...shot.height,pull),Math.cos(angle)*radius];
  if(kind==='thermal'&&!reducedMotion&&t>=THERMAL_IMPACT_TIME){const age=t-THERMAL_IMPACT_TIME,kick=.22*Math.exp(-age*3)*Math.sin(age*20);position[0]+=kick;position[1]+=kick*.35;}
  const settle=reducedMotion?1:smooth(t/1.7),heat=kind==='thermal'&&!reducedMotion?(1-smooth((t-cut)/.8)):0;
  const verdictAt=kind==='thermal'?4.05:3.55,transmitting=!reducedMotion&&t>=.25&&t<2.05;
  const verdict=!reducedMotion&&t>=verdictAt&&t<duration;
  const dizzy=kind==='oxygen'&&!reducedMotion&&!exterior?settle:0;
  return Object.freeze({kind,reason,exterior,position,target:[0,kind==='thermal'?mix(7,1.8,pull):mix(5,7,pull),mix(-6,-2,pull)],
    fov:mix(kind==='thermal'?52:57,kind==='success'?48:50,pull),
    interiorPitch:kind==='oxygen'?(dizzy?dizzy*(-.06+.014*Math.sin(t*2.3)):0):reducedMotion?0:kind==='thermal'?.008*Math.sin(t*12)*settle:0,
    interiorYaw:dizzy?dizzy*.018*Math.sin(t*1.8):0,
    interiorRoll:dizzy?dizzy*.032*(.7*Math.sin(t*2.4)+.3*Math.sin(t*1.1)):0,
    interiorFovOffset:dizzy?dizzy*1.8*Math.sin(t*1.7):0,
    fade:reducedMotion?0:t<cut?smooth((t-1.85)/(cut-1.85)):1-smooth((t-cut)/.65),
    exposure:mix(1,shot.exposure,settle),lightOutput:mix(1,shot.light,settle)+heat*.85*settle,
    lightTint:shot.tint,lightTintMix:settle*(kind==='success'?.25:.65),fixtureOutput:kind==='thermal'?mix(1,1.4,heat*settle):mix(1,shot.light,settle),
    effectTime:reducedMotion?0:Math.max(0,t-THERMAL_IMPACT_TIME),
    rupture:kind==='thermal'&&(reducedMotion||t>=THERMAL_IMPACT_TIME),
    destroyed:kind==='thermal'&&(reducedMotion||t>=THERMAL_IMPACT_TIME),
    stage:transmitting?'transmission':exterior?'verdict':'consequence',
    captionVisible:transmitting||verdict,
    captionOpacity:transmitting?smooth((t-.25)/.15)*(1-smooth((t-1.8)/.25)):verdict?smooth((t-verdictAt)/.45)*(1-smooth((t-(duration-.3))/.3)):0,
    title:transmitting?'STATION AI':shot.title,
    caption:transmitting?(reason==='communications-unresolved'?'Uplink lost. Orbital handover denied.':reason==='rover-unresolved'?'Scout stranded. Survey handover denied.':shot.transmission):shot.caption,
    vignette:reducedMotion?0:kind==='oxygen'?.65*settle*(1-.7*smooth((t-cut)/2)):kind==='thermal'?.18*heat*settle:0,
    reportReady:reducedMotion||t>=duration,canSkip:reducedMotion||t>=ENDING_SKIP_DELAY,duration});
}
