/** Native cursor for service panels, while the existing simulation keeps running. */
export class RepairInput {
  constructor({player,hasOpenRepair,closeRepairs,canResume,onPause,exitPointerLock=()=>document.exitPointerLock()}){Object.assign(this,{player,hasOpenRepair,closeRepairs,canResume,onPause,exitPointerLock});this.cursor=false;}
  get active(){return this.cursor&&this.hasOpenRepair();}
  changed(){
    if(this.hasOpenRepair()&&this.player.locked){this.cursor=true;this.exitPointerLock();}
    else if(this.cursor&&!this.hasOpenRepair()){
      this.cursor=false;
      if(this.canResume())this.player.lock();else this.onPause();
    }
  }
  pause(){this.cursor=false;this.player.clearInput();this.closeRepairs();if(this.player.locked)this.exitPointerLock();this.onPause();}
}
