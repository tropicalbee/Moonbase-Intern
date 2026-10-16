import { readFile } from 'node:fs/promises';

const stylesUrl = new URL('../src/styles.css', import.meta.url);
const coverUrl = new URL('../assets/arrival-cover.jpg', import.meta.url);
const baseStyles = `:root{color-scheme:dark;font-family:"Segoe UI",Arial,sans-serif}
*{box-sizing:border-box}
html,body{margin:0;width:100%;min-width:320px}
body{background:#020912;color:#f4f5f0}
[hidden]{display:none!important}
#app{position:fixed;inset:0;width:100%;height:100dvh;overflow:hidden}
.fallback{position:absolute;z-index:80;inset:25% 15%;text-align:center}`;

/** Keep the original loading cover visible while cold development CSS loads. */
export function devLoadingCover() {
  return {
    name: 'dev-loading-cover',
    apply: 'serve',
    transformIndexHtml: {
      // Add the critical CSS after Vite's inline-CSS transforms. Otherwise the
      // cover itself has to wait for the same cold processing it should mask.
      order: 'post',
      async handler(html, context) {
        if (!context.server || !html.includes('src="./src/main.js"')) return html;
        const [styles, coverImage] = await Promise.all([readFile(stylesUrl, 'utf8'), readFile(coverUrl)]);
        const start = styles.indexOf('.loading {'), end = styles.indexOf('@keyframes station-drift', start);
        if (start < 0 || end < start) throw new Error('Loading cover styles could not be found');
        // Deliver the original JPEG with the first HTML response. A separate
        // image request exposed a flat background during cold server startup.
        // The scoped selector also keeps later stylesheet updates from swapping
        // this image back to a separately fetched URL.
        const coverStyles = styles.slice(start, end)
          .replaceAll('../assets/', './assets/')
          .replace("url('./assets/arrival-cover.jpg')", `url('data:image/jpeg;base64,${coverImage.toString('base64')}')`)
          .replace('.loading-scenery {', '#loading > .loading-scenery {');
        return html
          .replace('<link rel="stylesheet" href="./src/styles.css" />',
            '<link id="dev-game-styles" rel="stylesheet" href="./src/styles.css" media="print" />')
          .replace('</head>', `<style id="dev-loading-cover">${baseStyles}\n${coverStyles}</style>\n</head>`)
          .replace('src="./src/main.js"', 'src="./src/dev-start.js"');
      },
    },
  };
}
