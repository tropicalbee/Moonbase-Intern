/** Hand-written fault reactions. Selection is cosmetic and never consumes simulation RNG. */
const lines = {
  'feed-trip': [
    'Watt reports a tripped primary feed. Find the open fuse; enthusiasm is not a substitute for isolation.',
    'The primary feed has disconnected itself. Visit Watt and reconnect your career prospects.'
  ],
  'bank-short': [
    'Watt reports a shorted backup bank. Check the leakage readings before trusting the word backup.',
    'A backup bank is leaking current. Watt needs isolation, not another motivational speech.'
  ],
  'bus-isolation': [
    'Two feeds are back-feeding the lab bus. Watt needs both isolated, highest leakage first.',
    'The lab bus has acquired two unwanted inputs. Isolate the leaking feeds at Watt before restoring power.'
  ],
  'flow-balance': [
    'Capsule reports mismatched circulation flows. Balance both regulators; breathing remains mandatory.',
    'The atmosphere is taking an inefficient route. Match both flow targets at Capsule, then prime.'
  ],
  'filter-bypass': [
    'Capsule has a blocked filter. Find the high-pressure filter before adjusting the airflow.',
    'A filter is collecting everything except compliments. Bypass the blockage at Capsule, then balance and prime.'
  ],
  'valve-purge': [
    'Capsule has two trapped-pressure valves. Purge the highest reading first, then balance the flows.',
    'Pressure is trapped in two valves. Capsule needs a controlled purge, not a dramatic entrance.'
  ],
  'pressure-lock': [
    'Patch reports a pressure lock. Vent the hottest loop, then tap Space inside the pump window.',
    'Coolant pressure is rising at Patch. Vent the highest reading before attempting pump synchronization.'
  ],
  'return-blockage': [
    'Patch has a blocked coolant return. Find the low-flow loop, then synchronize the pump.',
    'Coolant is arriving without leaving. Open the blocked return at Patch; this is not a storage experiment.'
  ],
  'sensor-drift': [
    'Patch has a drifting temperature probe. Calibrate against the reference before venting the hot loop.',
    'One probe at Patch is exaggerating. Correct its reading, vent the hot loop, then synchronize the pump.'
  ],
  'carrier-drift': [
    'Relay reports carrier drift. Match the spectrum peak and tune phase at Watt before verifying.',
    'Our uplink has wandered off frequency. Tune Relay at Watt; management is still expecting paperwork.'
  ],
  'relay-mismatch': [
    'Relay is using the wrong route. Select the strongest relay at Watt before tuning the carrier.',
    'The uplink took a poor connection. Route through the high-quality relay, then tune and verify.'
  ],
  'phase-inversion': [
    'Relay reports inverted signal polarity. Match the reference at Watt before tuning the uplink.',
    'The uplink is transmitting with reversed polarity. Correct the sign, then tune; shouting will not help.'
  ],
  'motor-overload': [
    'Scout has motor overcurrent. Find the twelve-amp wheel before it becomes a permanent parking brake.',
    'One of Scout’s motors is drawing twelve amps. Isolate that wheel and hold E to verify the repair.'
  ],
  'brake-lock': [
    'Scout has a locked brake. Select the high-drag wheel, tap Space to release it, then verify.',
    'Scout’s brake refuses to clock out. Find the wheel above twenty newtons of drag and release it.'
  ],
  'encoder-drift': [
    'Scout has encoder drift. Select the wheel with an error and apply the opposite trim.',
    'Scout’s wheel encoder disagrees with reality. Correct the trim before holding E to verify.'
  ]
};

const characterLines = {
  'feed-trip': ['My primary feed tripped. Please isolate the open fuse before connecting a matching backup.', 'I have reserves, not infinite patience. Check the tripped feed first.'],
  'bank-short': ['My backup bank is leaking current. Isolate the high-leakage bank, then match a live feed.', 'Backup is a job description, not proof of reliability. Read the leakage values.'],
  'bus-isolation': ['Two feeds are leaking into my bus. Highest leakage first, then the other faulty feed.', 'Please isolate both back-feeds. One repair step is not a complete personality.'],
  'flow-balance': ['My intake and return need balancing. Match both targets before holding E to prime.', 'Two flow controls, two targets. Please give both your attention.'],
  'filter-bypass': ['One filter has too much pressure across it. Bypass it before balancing my flows.', 'The filter above ten kilopascals is blocked. I would appreciate a bypass.'],
  'valve-purge': ['Two valves have trapped pressure. Purge the highest reading first, then the other.', 'Please purge both high-pressure valves. My flow controls can wait until that is done.'],
  'pressure-lock': ['My hottest loop needs venting. Then tap Space when the pump needle enters the window.', 'Pressure first, pump second. The stable window is a target, not a decoration.'],
  'return-blockage': ['My return loop is blocked. Find the low-flow reading before synchronizing the pump.', 'Coolant should circulate, not settle down here. Open the return below four litres per second.'],
  'sensor-drift': ['One of my probes disagrees with the reference. Calibrate it before venting the hot loop.', 'Please fix the drifting probe first. I would prefer accurate readings to confident guesses.'],
  'carrier-drift': ['Match my spectrum peak, tune phase, then verify. I cannot transmit on good intentions.', 'My carrier has drifted. Watt has the tuning controls; space has no customer support.'],
  'relay-mismatch': ['Choose the relay above eighty percent quality before tuning my signal.', 'My current route is unreliable. Give me a stronger relay, then check frequency and phase.'],
  'phase-inversion': ['My polarity is reversed. Match the reference sign before tuning and verification.', 'Please correct my polarity. I am trying to communicate, not contradict the waveform.'],
  'motor-overload': ['One motor is drawing twelve amps. That is a complaint, not enthusiasm.', 'Find my twelve-amp wheel and verify it. I would like to remain a rover rather than furniture.'],
  'brake-lock': ['My brake is stuck. Select the wheel with high drag and tap Space; then hold E to verify.', 'I am not refusing to work. My locked brake needs releasing, which is an important distinction.'],
  'encoder-drift': ['My encoder thinks a wheel is somewhere else. Apply the opposite trim before verifying.', 'Find the nonzero encoder error. A little opposite trim should restore my sense of direction.']
};

export function repairDiagnostic(model) { return model?.circuit ?? model?.setting ?? model?.drive ?? null; }

export function authoredChoice(options, seed, key, ordinal = 0) {
  let hash = 2166136261;
  for (const char of `${seed ?? ''}/${key}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return options[(hash % options.length + ordinal) % options.length];
}

export function faultReaction(model, seed, ordinal = 0, character = false) {
  const variant = repairDiagnostic(model)?.variant, options = (character ? characterLines : lines)[variant];
  return options ? authoredChoice(options, seed, variant, ordinal) : null;
}
