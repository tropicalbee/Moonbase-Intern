// Development-only entry, selected by Vite's dev-loading-cover plugin.
// Production keeps its original HTML, CSS and game entry.
const styles = document.getElementById('dev-game-styles');
try {
  if (!styles.sheet) await new Promise((resolve, reject) => {
    styles.addEventListener('load', resolve, { once: true });
    styles.addEventListener('error', () => reject(new Error('Station stylesheet could not load')), { once: true });
  });
  styles.media = 'all';
  // Two animation frames let the browser paint the cover before scene setup.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await import('./main.js');
} catch (error) {
  console.error('The station could not start', error);
  document.getElementById('loading').hidden = true;
  document.getElementById('fallback-message').textContent = 'The station could not start. Reload to try again.';
  document.getElementById('fallback').hidden = false;
  document.getElementById('reload-game').addEventListener('click', () => location.reload());
}
