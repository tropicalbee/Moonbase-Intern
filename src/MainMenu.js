import { createHowToPlay } from './HowToPlay.js';

/** Menu-only state; simulation, pointer lock and arrival remain owned by main. */
export class MainMenu {
  constructor(root, { onStart, onReset, onTraining }) {
    this.root = root;
    this.start = root.querySelector('#start-button');
    this.reset = root.querySelector('#reset-button');
    this.subtitle = root.querySelector('.menu-tagline');
    this.dialogs = [...root.querySelectorAll('dialog')];
    createHowToPlay(root.querySelector('#how-to-play'));
    this.training=root.querySelector('#start-training');
    this.training.addEventListener('click',onTraining);
    const speed = root.querySelector('#look-speed');
    const updateTrack = () => speed.style.setProperty('--look-fill', `${(Number(speed.value)-Number(speed.min))/(Number(speed.max)-Number(speed.min))*100}%`);
    speed.addEventListener('input', updateTrack);
    updateTrack();
    this.start.addEventListener('click', onStart);
    this.reset.addEventListener('click', onReset);
    for (const button of root.querySelectorAll('[data-menu-dialog]')) {
      const dialog = root.querySelector(`#${button.dataset.menuDialog}`);
      button.addEventListener('click', () => {
        if (!this.root.hidden && !dialog.open) {
          this.opener = button;
          dialog.showModal();
        }
      });
      dialog.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key !== 'Tab') return;
        const controls = [...dialog.querySelectorAll('button, input, select, a[href], [tabindex="0"]')]
          .filter(control => !control.disabled && control.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      });
      dialog.addEventListener('close', () => {
        if (!this.root.hidden) this.opener?.focus();
      });
    }
  }

  show({ paused = false, introActive = false } = {}) {
    this.root.classList.toggle('is-paused', paused);
    this.start.textContent = paused ? introActive ? 'RESUME ARRIVAL' : 'RESUME SHIFT' : 'START SHIFT';
    this.subtitle.textContent = paused ? introActive ? 'Arrival paused.' : 'Your shift is paused.' : "Please Don't Break Anything";
    this.reset.hidden = !paused || introActive;
    this.training.disabled=introActive;
    this.training.textContent=paused&&!introActive?'END THIS SHIFT & START TRAINING':'START INTERACTIVE TRAINING';
    this.root.querySelector('.training-entry-note').textContent=introActive?'Resume arrival first to start training.':paused?'Starting training ends this in-progress shift. Your saved records and run seed are preserved.':'';
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
    for (const dialog of this.dialogs) if (dialog.open) dialog.close();
  }
}
