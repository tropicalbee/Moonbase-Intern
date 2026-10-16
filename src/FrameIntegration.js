/** At most 40 collision-sized steps. Long stalls pause instead of stealing rescue time. */
export function advanceActiveFrame(elapsed,step) {
  if(!Number.isFinite(elapsed)||elapsed<0)return {advanced:0,steps:0,paused:false};
  if(elapsed>1)return {advanced:0,steps:0,paused:true};
  if(elapsed===0)return {advanced:0,steps:0,paused:false};
  const count=Math.ceil(elapsed/.025),delta=elapsed/count;
  let advanced=0,steps=0;
  for(let i=0;i<count;i++){const keepGoing=step(delta);advanced+=delta;steps++;if(keepGoing===false)break;}
  return {advanced,steps,paused:false};
}
