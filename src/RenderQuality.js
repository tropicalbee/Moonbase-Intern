export function renderQuality(profile,{lowHardware=false,mode='auto'}={}){
  if(mode==='low')return {name:'low',ratio:1,minimum:.75,shadows:false,frameRate:60};
  if(profile==='phone')return lowHardware
    ?{name:'low phone',ratio:1,minimum:.85,shadows:false,frameRate:30}
    :{name:'capable phone',ratio:1.4,minimum:1,shadows:false,frameRate:60};
  if(profile==='tablet')return lowHardware
    ?{name:'low tablet',ratio:1.25,minimum:1,shadows:false,frameRate:30}
    :{name:'capable tablet',ratio:1.55,minimum:1,shadows:true,frameRate:60};
  return lowHardware?{name:'low desktop',ratio:1.2,minimum:.85,shadows:false,frameRate:60}
    :{name:'desktop',ratio:1.7,minimum:1,shadows:true,frameRate:60};
}
