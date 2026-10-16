import {criticalContext} from '../dialogue/StationPersonality.js';

/** Run-local input; accepting a code and displaying its discovery are separate. */
export class ConsoleArchive {
  constructor({secrets,reveal,waitingForMessage=()=>false,urgentMessage=()=>false}){
    Object.assign(this,{secrets,reveal,waitingForMessage,urgentMessage});this.reset();
  }
  reset(){this.digits='';this.remaining=0;this.notice='';this.noticeRemaining=0;}
  showNotice(text){this.reset();this.notice=text;this.noticeRemaining=3;}
  available(eligible,context){return eligible&&context?.shift?.status==='running'&&!this.secrets.has('archive-4173');}
  safetyBlocked(context){return criticalContext(context)||this.urgentMessage();}
  tryReveal(eligible,context){
    if(!this.available(eligible,context)||this.digits!=='4173'||!this.secrets.canReveal(context)||this.safetyBlocked(context)||!this.reveal())return false;
    this.secrets.recordConsole(context);this.reset();return true;
  }
  update(delta,eligible,context){
    if(!Number.isFinite(delta)||delta<0)return;
    if(context?.shift?.status!=='running'||this.secrets.has('archive-4173')){this.reset();return;}
    this.noticeRemaining=Math.max(0,this.noticeRemaining-delta);
    if(this.noticeRemaining===0)this.notice='';
    if(!this.digits)return;
    // Fault resolution and protected messages are not part of the input deadline.
    // Lost aim still ages ordinary entries; it never grants a remote discovery.
    const waiting=this.digits==='4173';
    if(this.safetyBlocked(context)||(waiting&&(!this.secrets.canReveal(context)||this.waitingForMessage())))return;
    this.remaining=Math.max(0,this.remaining-delta);
    if(this.remaining===0){this.showNotice(this.digits.length===4?'Archive request timed out / enter the code again':'Entry timed out / try again');return;}
    this.tryReveal(eligible,context);
  }
  handleKey(event,eligible,context){
    if(context?.shift?.status!=='running'||this.secrets.has('archive-4173')){this.reset();return false;}
    if(!this.available(eligible,context)||this.safetyBlocked(context))return false;
    if(event.ctrlKey||event.altKey||event.metaKey||event.shiftKey||event.isComposing)return false;
    const digit=/^(?:Digit|Numpad)([0-9])$/.exec(event.code)?.[1];
    if(digit===undefined&&event.code!=='Backspace')return false;
    event.preventDefault();
    if(event.repeat)return true;
    this.notice='';this.noticeRemaining=0;
    if(event.code==='Backspace')this.digits=this.digits.slice(0,-1);
    else {
      if(this.digits.length===4)this.reset();
      this.digits+=digit;
    }
    this.remaining=this.digits?5:0;
    if(this.digits.length===4&&this.digits!=='4173')this.showNotice('Code not recognized / try again');
    if(this.digits==='4173')this.remaining=8;
    this.tryReveal(eligible,context);return true;
  }
}
