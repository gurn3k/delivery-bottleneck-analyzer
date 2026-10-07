import { renderSite } from './fake-dom.js';

/** Replace the text between <!-- prerender:name --> and <!-- /prerender:name -->. */
function fill(html, name, content) {
  const open = `<!-- prerender:${name} -->`;
  const close = `<!-- /prerender:${name} -->`;
  const start = html.indexOf(open);
  const end = html.indexOf(close);
  if (start < 0 || end < start) throw new Error(`index.html is missing the ${open} … ${close} markers`);
  return html.slice(0, start + open.length) + content + html.slice(end);
}

/** index.html with the report and colophon drawn by app.js from this snapshot. */
export async function prerender(html, { metrics, brief }) {
  const { main, colophon } = await renderSite({ metrics, brief });
  if (main.all('p', 'loading').length || main.all('p', 'load-error').length) throw new Error('app.js did not draw the report');
  return fill(fill(html, 'report', main.innerHTML), 'colophon', colophon.innerHTML);
}
