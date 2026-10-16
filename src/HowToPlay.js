// Only teach controls and objectives available in the current build.
export function createHowToPlay(dialog) {
  dialog.innerHTML = `
    <header class="menu-dialog-header">
      <div><span class="menu-kicker">YOUR FIRST SHIFT</span><h2 id="how-to-play-title">How to play</h2></div>
      <form method="dialog"><button class="menu-close" aria-label="Close How to Play">×</button></form>
    </header>
    <section class="menu-training-entry"><h3>Learn by playing</h3><p>Guided practice in the actual habitat: movement, HUD, all five repairs and choosing priorities. No deaths or score penalties. Your real run seed and personal records stay separate.</p><button type="button" id="start-training">START INTERACTIVE TRAINING</button><small class="training-entry-note"></small></section>
    <div class="menu-guide-body"><section class="menu-guide-section" aria-labelledby="movement-title">
      <h3 id="movement-title">Quick reference · movement</h3>
      <dl class="menu-key-list">
        <div><dt class="movement-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>Move</dd></div>
        <div><dt><kbd>MOUSE</kbd></dt><dd>Look</dd></div>
        <div><dt><kbd>SHIFT</kbd></dt><dd>Sprint</dd></div>
        <div><dt><kbd>ESC</kbd></dt><dd>Pause</dd></div>
        <div><dt><kbd>E</kbd></dt><dd>Repair equipment</dd></div>
        <div><dt><kbd>M</kbd></dt><dd>Mute audio</dd></div>
        <div><dt><kbd>R</kbd></dt><dd>Restart shift</dd></div>
        <div><dt><kbd>P</kbd></dt><dd>Photo pause</dd></div>
      </dl>
    </section>
    <aside class="menu-guide-aside"><section class="menu-guide-section" aria-labelledby="objective-title">
      <h3 id="objective-title">Objective</h3>
      <p>Keep station systems stable for seven minutes. Watt handles power and Relay’s uplink, Capsule handles oxygen, and Patch handles cooling. Service drive faults at the survey rover. Repair urgent faults and verify the orbital link before handover.</p>
    </section><section class="menu-guide-section">
      <h3>Repairs</h3>
      <p>Aim at faulty equipment and press E. Watt uses 1–3 and Enter; Capsule uses A/D and W/S, then hold E for two seconds; Patch uses 1–3, then Space in the marked window; Scout uses 1–6, then hold E for three seconds. Backspace leaves service; incident timers keep running.</p>
      <p>Relay at Watt: match the tallest spectrum bar using A (lower) or D (raise). Then follow the phase hint: S lowers phase, W raises it. Reach 100% signal, press E once, and wait two seconds. You can also click the adjustment buttons.</p>
      <p>Life support comes first. Pausing stops deadlines. Blackout blocks cooling and uplink verification. Nearby characters speak automatically.</p>
      <p>Yellow cards identify faults; red marks critical life support; green confirms recovery. Read the consequence, remaining time and action on the leading card.</p>
      <p>Service panels release the mouse cursor so you can click controls or use their keys. Movement and look stop during service; real shift deadlines keep running. Backspace returns to movement. Escape pauses.</p>
    </section><section class="menu-guide-section">
      <h3>After your shift</h3>
      <p>Compare your score with your local personal best, copy your report, replay the same seed or start a new run. Curious interns can discover three secrets. Personal records stay in this browser.</p>
      <p>Repairs and station integrity improve your score. Link outages and a stalled rover cost points. Training never records a score.</p>
    </section></aside></div>`;
}
