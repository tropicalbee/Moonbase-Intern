/** Limit rendered frames while preserving all elapsed simulation time. */
export class FramePacer {
  constructor(){this.reset();}

  reset(){this.phase=0;this.pending=0;this.rate=null;this.active=null;this.timestamp=null;}

  advance(elapsed,rate=60,active=true,timestamp){
    if(!Number.isFinite(elapsed)||elapsed<0||!Number.isFinite(rate)||rate<=0){this.reset();return null;}
    // rAF timestamps follow display ticks; Clock measures callback execution
    // time, whose small jitter must not decide which frames get displayed.
    const tick=Number.isFinite(timestamp)&&this.timestamp!==null?Math.max(0,(timestamp-this.timestamp)/1000):elapsed;
    this.timestamp=Number.isFinite(timestamp)?timestamp:null;
    // Paused time must never become gameplay catch-up on resume. A rate
    // change within gameplay, however, must retain unprocessed active time.
    if(this.active!==active){this.phase=0;this.pending=0;this.active=active;}
    if(this.rate!==rate){this.phase=0;this.rate=rate;}
    this.phase+=tick;this.pending+=elapsed;
    const interval=1/rate,epsilon=.001;
    if(this.phase+epsilon<interval)return null;
    const delta=this.pending;
    this.pending=0;
    // Retain scheduling remainder instead of restarting the frame deadline.
    // Long stalls produce one update, never a burst of redundant renders.
    this.phase-=Math.floor((this.phase+epsilon)/interval)*interval;
    return delta;
  }
}
