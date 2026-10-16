import * as THREE from 'three';

/** Compose intensity and temperature with the completed Watt surface-lighting adapter. */
export class EnvironmentalFeedback {
  constructor({power,indicators}) {
    this.power=power;this.indicators=indicators;this.hotColor=new THREE.Color(0xb86b67);
    this.lights=power.lighting.lights.map(({object})=>({object,color:object.color.clone()}));
  }
  setActive(active,snapshot){this.indicators?.setActive(active,snapshot);}
  update(snapshot,delta,events,context){
    this.power.lighting.update(context.systems.power,delta);
    const cooling=context.systems.cooling;
    const heat=cooling?.needsRepair?THREE.MathUtils.clamp((cooling.temperature-85)/25,0,1)*.6:0;
    for(const {object,color} of this.lights)object.color.copy(color).lerp(this.hotColor,heat);
    this.indicators?.update(snapshot,delta,events,context);
  }
  configure(settings){this.power.lighting.setReducedMotion(settings.reducedMotion);}
  terminate(){this.indicators?.terminate();}
  reset(){this.power.lighting.reset();for(const {object,color} of this.lights)object.color.copy(color);this.indicators?.reset();}
  dispose(){this.reset();this.indicators?.dispose();this.power.lighting.dispose();}
}
