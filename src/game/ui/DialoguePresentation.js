import { dialogueSafeBounds, placeDialogue, placeDockedDialogue, relativeRectangle } from './DialogueLayout.js';

// Small code-native silhouettes, not portraits or imported assets.
const icons = Object.freeze({
  tortoise: '<path d="M5 13a7 5 0 0 1 14 0v3H5zM7 16v3m10-3v3M3 13H1m18 0h3"/><circle cx="21" cy="11" r="2"/>',
  cactus: '<path d="M12 21V5a2 2 0 0 1 4 0v16M12 13H7a3 3 0 0 1-3-3V6m12 9h3a3 3 0 0 0 3-3V8"/>',
  rover: '<path d="M4 14V8h13l3 6zM7 8V4h6v4M2 14h20"/><circle cx="5" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="19" cy="18" r="2"/>',
  astronaut: '<circle cx="12" cy="7" r="5"/><path d="M5 22v-6a7 7 0 0 1 14 0v6M8 7h8M9 18h6"/>',
  equipment: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h5M8 17h8"/>',
  plant: '<path d="M12 21V10M12 14C4 14 3 8 3 5c6 0 9 3 9 9M12 10c0-5 4-8 9-8 0 6-3 10-9 10"/>',
});
const obstacleSelectors = ['.warning-board','.shift-clock','.shift-banner','.shift-dependencies','.shift-lockdown','.power-fault-announcement','.power-prompt','.oxygen-prompt','.cooling-prompt','.comms-prompt','.rover-prompt','.interaction-prompt','.training-card','.training-heading'];

/** One accessible message node; presentation has no queue or narrative timers. */
export class DialoguePresentation {
  constructor({ container, root, host, marker, connector, reducedMotion = false }) {
    Object.assign(this, { container, root, host, marker, connector });
    this.surface = container.querySelector('.dialogue-surface');
    this.icon = container.querySelector('.dialogue-icon');
    this.obstacles = [];
    this.obstacleNodes = new Map();
    this.bounds = { left: 0, top: 0 };
    this.width = this.height = 0;
    this.size = { width: 300, height: 120 };
    this.layoutElapsed = .15;
    this.line = null;
    this.side = null;
    this.dirty = true;
    this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { this.dirty = true; }) : null;
    this.observer?.observe(container);
    this.observer?.observe(root);
    this.setReducedMotion(reducedMotion);
  }

  setReducedMotion(reducedMotion) {
    this.reducedMotion = !!reducedMotion;
    this.container.setAttribute('data-reduced-motion', String(this.reducedMotion));
  }

  cacheLayout() {
    const rootRect = this.root.getBoundingClientRect();
    this.bounds = { left: rootRect.left, top: rootRect.top };
    this.obstacles = [];
    for (const selector of obstacleSelectors) {
      let node = this.obstacleNodes.get(selector);
      if (!node) { node = this.host.querySelector?.(selector); if (node) { this.obstacleNodes.set(selector, node); this.observer?.observe(node); } }
      if (!node || node.hidden || node.closest?.('[hidden]') || (node.getClientRects && !node.getClientRects().length)) continue;
      const rectangle = relativeRectangle(node.getBoundingClientRect(), this.bounds);
      if (rectangle) this.obstacles.push(rectangle);
    }
    this.obstacleVisibility = this.visibilityKey();
  }

  visibilityKey() { return [...this.obstacleNodes.values()].map(node=>node.hidden || node.closest?.('[hidden]') ? '0' : '1').join(''); }

  setIcon(id) {
    const type = id === 'tortoise' ? 'tortoise' : id === 'cactus' || id === 'desert-cactus' ? 'cactus' : id === 'rover' ? 'rover'
      : id === 'astronaut' ? 'astronaut' : ['flowers','marigold'].includes(id) ? 'plant' : 'equipment';
    const symbol=id?icons[type]:'<path d="M3 12h2l2-5 3 11 3-14 3 13 2-5h3"/>';
    this.icon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${symbol}</svg>`;
  }

  showStable() {
    this.container.hidden = false;
    this.connector.hide(); this.surface.style.opacity = '1'; this.surface.style.animation = '';
    if (this.dirty || this.layoutElapsed >= .15) {
      this.container.style.transform = ''; this.container.style.width = ''; this.container.style.maxHeight = '';
      this.cacheLayout(); this.layoutElapsed = 0;
      const rectangle = relativeRectangle(this.container.getBoundingClientRect(),this.bounds);
      this.stableLayout = rectangle && placeDockedDialogue({ ...rectangle, viewportWidth:this.width, viewportHeight:this.height, obstacles:this.obstacles });
      this.stableTransform = this.stableLayout ? `translate3d(${(this.stableLayout.x-rectangle.x).toFixed(2)}px, ${(this.stableLayout.y-rectangle.y).toFixed(2)}px, 0)` : '';
      this.dirty = false;
    }
    this.container.style.transform = this.stableTransform;
    // Keep protected discoveries available; ordinary broadcasts yield when every safe slot is occupied.
    this.container.style.visibility = this.stableLayout || this.line.kind === 'important' ? '' : 'hidden';
  }

  update(dialogue, delta = 0) {
    const line = dialogue.current;
    if (!dialogue.active || !line) { this.hide(); return; }
    if (line.sourceId && this.marker.element.hidden && line.kind !== 'important') { this.hide(); return; }
    const width = this.root.clientWidth, height = this.root.clientHeight;
    const changed = line !== this.line;
    if (changed) {
      this.line = line; this.side = null; this.dirty = true; this.forcedStable = false;
      this.setIcon(line.sourceId);
      this.surface.style.animation = 'none';
    }
    if (width !== this.width || height !== this.height) { this.width = width; this.height = height; this.dirty = true; }
    if (this.visibilityKey() !== this.obstacleVisibility) this.dirty = true;
    this.layoutElapsed += Number.isFinite(delta) && delta > 0 ? delta : 0;
    const local = !!line.sourceId && line.sourceId!=='dish' && !this.marker.element.hidden && (!this.forcedStable || this.dirty || this.layoutElapsed >= .15);
    const mode = local ? 'local' : 'stable';
    this.container.setAttribute('data-channel',line.sourceId==='dish'?'radio':line.sourceId?'character':'intercom');
    this.container.setAttribute('data-protected',String(line.kind==='important'));
    this.container.setAttribute('data-source-visible',String(local));
    if (mode !== this.mode) { this.mode = mode; this.container.setAttribute('data-presentation', mode); this.dirty = true; }
    this.container.hidden = false;
    this.container.style.visibility = '';
    if (!local) {
      this.showStable();
      return;
    }
    if (this.dirty || this.layoutElapsed >= .15) { this.cacheLayout(); this.layoutElapsed = 0; }
    if (this.dirty) {
      const safe = dialogueSafeBounds(width, height);
      this.container.style.width = `${Math.min(320, safe.width)}px`;
      this.container.style.maxHeight = `${safe.height}px`;
      const rect = this.container.getBoundingClientRect();
      this.size = { width: Math.min(rect.width || this.container.offsetWidth || 300, safe.width),
        height: Math.min(rect.height || this.container.offsetHeight || 120, safe.height) };
      this.dirty = false;
    }
    const layout = placeDialogue({ anchorX: parseFloat(this.marker.element.style.left), anchorY: parseFloat(this.marker.element.style.top),
      ...this.size, viewportWidth: width, viewportHeight: height, obstacles: this.obstacles, previousSide: this.side });
    if (!layout || layout.covered > 0) {
      if (line.kind === 'important') {
        this.forcedStable = true; this.mode = 'stable'; this.container.setAttribute('data-presentation', 'stable');
        this.dirty = true;
        this.showStable();
      } else this.hide();
      return;
    }
    this.forcedStable = false;
    this.side = layout.side;
    this.container.style.transform = `translate3d(${layout.x.toFixed(2)}px, ${layout.y.toFixed(2)}px, 0)`;
    this.connector.update(this.marker, layout);
    this.surface.style.animation = '';
    this.surface.style.opacity = this.reducedMotion || line.kind === 'important' ? '1' : String(Math.min(1, dialogue.remaining / .12));
    this.connector.svg.style.opacity = this.surface.style.opacity;
  }

  hide() { this.container.hidden = true; this.container.style.visibility = ''; this.connector.hide(); this.line = null; this.side = null; }
  reset() { this.hide(); this.dirty = true; this.forcedStable = false; this.layoutElapsed = .15; this.container.style.transform = ''; this.surface.style.animation = ''; this.surface.style.opacity = '1'; }
  dispose() { this.reset(); this.observer?.disconnect(); this.obstacleNodes.clear(); }
}
