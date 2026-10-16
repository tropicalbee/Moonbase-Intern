import {repairDiagnostic} from '../dialogue/FaultDialogue.js';
/** Life-support deadlines lead; optional equipment and recovery notices follow. */
const instrumentLabels = {
  power: ['ENERGY / 01', 'WATT · POWER CELL'],
  oxygen: ['LIFE SUPPORT / 02', 'CAPSULE · CIRCULATION'],
  cooling: ['THERMAL / 03', 'PATCH · COOLANT LOOP'],
  communications: ['TELEMETRY / 04', 'RELAY · UPLINK AT WATT'],
  rover: ['MOBILITY / 05', 'SCOUT · SURVEY DRIVE'],
};
const setText = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
export function instrumentTime(incident, snapshot) {
  if(snapshot?.training)return '—';
  const seconds=incident.system==='power'&&incident.status!=='blackout'?incident.phaseSeconds:incident.lethal?incident.deadline:snapshot.remaining;
  if(!Number.isFinite(seconds))return '--:--';
  const value=Math.ceil(Math.max(0,seconds));return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
}

export function warningPriority(id,model,lockdownRemaining=null){
  if(!model?.needsRepair)return 10000;
  if(['power','oxygen','cooling'].includes(id)){
    const remaining=id==='power'?(model.status==='blackout'?lockdownRemaining:model.outageSeconds):model.secondsRemaining;
    return Number.isFinite(remaining)?Math.max(0,remaining):1000;
  }
  return 2000+(Number.isFinite(model.secondsRemaining)?Math.max(0,model.secondsRemaining):1000);
}

export function incidentCopy(incident,model,snapshot){
  const time=value=>Number.isFinite(value)?`${Math.ceil(value)}s`:'--';
  const critical=incident.severity==='critical';
  const diagnostic=repairDiagnostic(model);
  const title=diagnostic?.variant&&diagnostic.label&&!critical&&!['blackout','lost','stalled'].includes(model.status)?diagnostic.label.toUpperCase():{power:model.status==='blackout'?'LAB BLACKOUT':critical?'LAB POWER CRITICAL':'LAB POWER FAULT',oxygen:critical?'ATMOSPHERE CRITICAL':'CIRCULATION FAULT',cooling:critical?'CONTAINMENT LIMIT':'THERMAL FAULT',communications:model.status==='lost'?'UPLINK OFFLINE':'CARRIER UNSTABLE',rover:model.status==='stalled'?'DRIVE STOPPED':critical?'DRIVE SHUTDOWN IMMINENT':'DRIVE OVERLOAD'}[incident.system];
  const deadline=incident.system==='power'?model.status==='blackout'?`Lockdown ${time(incident.deadline)}`:`Supply loss ${time(incident.phaseSeconds)} · lockdown ${time(incident.deadline)}`
    :incident.system==='oxygen'?`Reserve ${time(incident.deadline)}`:incident.system==='cooling'?`${Math.floor(model.temperature)}° · containment ${time(incident.deadline)}`
    :`Handover ${time(snapshot.remaining)}${['lost','stalled'].includes(model.status)?'':` · ${incident.system==='rover'?'stop':'link loss'} ${time(incident.phaseSeconds)}`}`;
  const action=diagnostic?.variant&&!incident.blockedBy?`${diagnostic.label}. ${diagnostic.instruction}`:incident.system==='power'?'Restore Watt’s circuit. Emergency guidance remains powered.'
    :incident.system==='oxygen'?model.holding?'Priming Capsule; keep E held.':'Balance both flows at Capsule, then hold E to prime.'
    :incident.system==='cooling'?incident.blockedBy?'Restore Watt first; the backup pump has no power.':model.vented?snapshot.training?'Loop vented; synchronize the pump. Practice temperature protected.':'Loop vented; synchronize the pump. Heat still rises.':'Vent the highest-pressure loop at Patch; synchronize the pump.'
    :incident.system==='communications'?incident.blockedBy?'Restore Watt before confirming the handshake.':'Tune Relay at Watt; verify the handshake before handover.'
    :'Isolate Scout’s 12 A wheel; hold E to verify. Life support first.';
  return {title,deadline:snapshot.training?'PRACTICE · NO FAILURE DEADLINE':deadline,action};
}

export class WarningBoard {
  constructor({host,systems,getLockdown=()=>null,getPresentation=()=>null}){
    Object.assign(this,{systems,getLockdown,getPresentation});this.active=false;
    this.root=document.createElement('aside');this.root.className='warning-board';this.root.hidden=true;this.root.setAttribute('aria-label','Station warnings, ordered by urgency');
    this.label=document.createElement('span');this.label.className='warning-board-label';this.root.append(this.label);
    this.announcement=document.createElement('span');this.announcement.className='sr-only';this.announcement.setAttribute('role','status');this.announcement.setAttribute('aria-live','polite');this.root.append(this.announcement);
    this.instruments=new Map();
    for(const [id,system] of Object.entries(systems))if(system){
      system.warning.dataset.system=id;system.warning.setAttribute('aria-live','off');
      const header=document.createElement('div');header.className='warning-instrument-header';
      const channel=document.createElement('span');channel.className='warning-channel';channel.textContent=instrumentLabels[id]?.[0]??id.toUpperCase();
      const severity=document.createElement('span');severity.className='warning-severity';header.append(channel,severity);
      const destination=document.createElement('span');destination.className='warning-destination';destination.textContent=instrumentLabels[id]?.[1]??id.toUpperCase();
      const time=document.createElement('span');time.className='warning-time';time.setAttribute('aria-hidden','true');
      system.warning.append(header,time,destination);this.instruments.set(id,{severity,destination,time});this.root.append(system.warning);
    }
    this.alarm=document.createElement('button');this.alarm.className='warning-board-alarm';this.alarm.type='button';
    this.alarm.addEventListener('click',()=>{systems.power?.toggleAlarm();this.render();});this.root.append(this.alarm);
    host.append(this.root);
  }
  setActive(active){if(this.active===!!active)return;this.active=!!active;this.render();}
  render(){
    if(!this.active){this.root.hidden=true;return;}
    const snapshot=this.getPresentation();
    const rank=id=>{const incident=snapshot?.incidents.find(i=>i.system===id);return !incident?10000:id===snapshot.action?-1:incident.lethal?incident.deadline:2000+snapshot.remaining;};
    const entries=Object.entries(this.systems).filter(([,system])=>system&&!system.warning.hidden)
      .sort(([a,x],[b,y])=>snapshot?rank(a)-rank(b):warningPriority(a,x.model,this.getLockdown())-warningPriority(b,y.model,this.getLockdown()));
    this.root.hidden=!this.active||!entries.length;
    const faults=entries.filter(([,system])=>system.model.needsRepair).length;
    setText(this.label,faults?`STATION TELEMETRY / ${String(faults).padStart(2,'0')} ACTIVE`:'STATION TELEMETRY / RECOVERY');
    const muted=!!this.systems.power?.alarmMuted;
    setText(this.alarm,muted?'[M] ALARM MUTED · ENABLE':'[M] ALARM ON · MUTE');
    this.alarm.setAttribute('aria-pressed',String(muted));this.alarm.hidden=!faults;
    for(const [index,[id,system]] of entries.entries()){
      system.warning.style.order=String(index+1);system.warning.dataset.priority=String(index===0);
      const incident=snapshot?.incidents.find(i=>i.system===id);
      system.warning.dataset.emergencySeverity=incident?.severity??'recovered';
      system.warning.dataset.blocked=String(!!incident?.blockedBy);
      const instrument=this.instruments.get(id);
      setText(instrument.severity,incident?incident.severity==='critical'?'! CRITICAL':'△ WARNING':'✓ RECOVERED');
      setText(instrument.time,incident?instrumentTime(incident,snapshot):'');
      setText(instrument.destination,incident?.blockedBy?`WATT → ${instrumentLabels[id]?.[1]??id.toUpperCase()}`:instrumentLabels[id]?.[1]??id.toUpperCase());
      if(incident){
        const copy=incidentCopy(incident,system.model,snapshot),deadline=system.warning.querySelector('strong');
        const title=copy.title[0]+copy.title.slice(1).toLowerCase();
        for(const [node,value] of [[system.warning.querySelector('b'),title],[deadline,copy.deadline],[system.warning.querySelector('p'),copy.action]])if(node&&node.textContent!==value)node.textContent=value;
      }else{
        setText(system.warning.querySelector('b'),{power:'Power restored',oxygen:'Circulation stable',cooling:'Cooling stabilized',communications:'Uplink verified',rover:'Drive verified'}[id]??'System restored');
        setText(system.warning.querySelector('strong'),'Normal operation');
        setText(system.warning.querySelector('p'),'');
      }
    }
    const key=snapshot?[...snapshot.incidents].sort((a,b)=>a.system.localeCompare(b.system)).map(i=>`${i.system}/${i.status}/${i.blockedBy??''}/${repairDiagnostic(this.systems[i.system]?.model)?.variant??''}`).join('|'):'';
    if(key!==this.announced){this.announced=key;const dominant=snapshot?.dominant,model=this.systems[dominant?.system]?.model;const message=dominant?`${incidentCopy(dominant,model,snapshot).title}: ${dominant.severity}. ${snapshot.action!==dominant.system?'Restore Watt first.':''}`:'Station systems stable.';if(this.announcement.textContent!==message)this.announcement.textContent=message;}
  }
}
