/** A short integrated triangle points toward the source, never across the HUD. */
export class SpeakerConnector {
  constructor(svg) { this.svg = svg; this.path = svg.querySelector('path'); this.hide(); }
  hide() { this.svg.style.display = 'none'; }
  update(marker, layout) {
    if (!marker.source || marker.element.hidden || !layout?.tail) { this.hide(); return; }
    const { width, height, tail } = layout;
    const horizontal = tail.edge === 'top' || tail.edge === 'bottom';
    const half = 7;
    const x1 = tail.baseX - (horizontal ? half : 0), y1 = tail.baseY - (horizontal ? 0 : half);
    const x2 = tail.baseX + (horizontal ? half : 0), y2 = tail.baseY + (horizontal ? 0 : half);
    this.svg.style.display = '';
    this.svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    this.path.setAttribute('d',`M ${x1} ${y1} L ${tail.tipX} ${tail.tipY} L ${x2} ${y2}`);
  }
}
