const EPSILON=1e-9;

/** Ordered active-time events, delivered once. System dispatch belongs to the run. */
export class EventScheduler {
  constructor(events,duration) {
    if(!Array.isArray(events)||events.some((event,index)=>!event||typeof event.id!=='string'||
      !Number.isFinite(event.at)||event.at<0||event.at>=duration||
      (index>0&&event.at<=events[index-1].at))||new Set(events.map(event=>event.id)).size!==events.length)throw new Error('Invalid event schedule');
    this.events=Object.freeze(events.map(event=>Object.freeze({...event})));this.reset();
  }
  reset(){this.cursor=0;}
  get nextTime(){return this.events[this.cursor]?.at??Infinity;}
  takeDue(elapsed){
    if(!Number.isFinite(elapsed)||elapsed<0)return [];
    const due=[];
    while(this.cursor<this.events.length&&this.nextTime<=elapsed+EPSILON)due.push(this.events[this.cursor++]);
    return due;
  }
}
