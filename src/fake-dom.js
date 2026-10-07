// Just enough DOM to run site/app.js in Node, so the repo stays dependency-free.
// Covers only the calls app.js makes. The tests use it to check the page, and
// scripts/prerender.js uses it to write the drawn report into index.html.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Node {
  parent = null;
  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  after(node) {
    node.remove();
    const siblings = this.parent.children;
    siblings.splice(siblings.indexOf(this) + 1, 0, node);
    node.parent = this.parent;
  }
}

const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;');

class Text extends Node {
  constructor(text) { super(); this.text = text; }
  get textContent() { return this.text; }
  get outerHTML() { return escapeText(this.text); }
}

class Element extends Node {
  children = [];
  attributes = {};
  listeners = {};
  style = {};
  dataset = {};
  hidden = false;
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); }
  get className() { return this.attributes.class ?? ''; }
  set className(v) { this.attributes.class = v; }
  get id() { return this.attributes.id; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({ target: this }); }
  focus() {}
  scrollIntoView() {}
  append(...nodes) {
    for (const n of nodes) {
      const node = n instanceof Node ? n : new Text(String(n));
      node.remove();
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const c of [...this.children]) c.remove();
    this.append(...nodes);
  }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(String(v)); }
  /**
   * Static HTML for this element. Inline styles are left out: the site's CSP
   * blocks style attributes, so bar widths only appear once app.js runs.
   */
  get outerHTML() {
    const tag = this.tagName.toLowerCase();
    const attrs = Object.entries(this.attributes).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
    return `<${tag}${attrs}${this.hidden ? ' hidden' : ''}>${this.innerHTML}</${tag}>`;
  }
  get innerHTML() { return this.children.map((c) => c.outerHTML).join(''); }
  /** Every descendant element, depth first. */
  *walk() {
    for (const c of this.children) if (c instanceof Element) { yield c; yield* c.walk(); }
  }
  /** Descendants matching a tag and, optionally, a class. */
  all(tag, cls) {
    return [...this.walk()].filter((e) => e.tagName === tag.toUpperCase() && (!cls || e.className.split(' ').includes(cls)));
  }
  byId(id) { return [...this.walk()].find((e) => e.id === id) ?? null; }
}

/**
 * Run site/app.js against the given data and resolve once the report is drawn.
 * `metrics` or `brief` set to null makes that file fail to load.
 */
export async function renderSite({ metrics, brief }) {
  const body = new Element('body');
  for (const [tag, id] of [['button', 'theme-btn'], ['a', 'repo-link'], ['main', 'report'], ['footer', 'colophon']]) {
    const e = new Element(tag);
    e.setAttribute('id', id);
    body.append(e);
  }
  const main = body.byId('report');
  main.append(Object.assign(new Element('p'), { className: 'loading' }));

  const files = { 'data/metrics.json': metrics, 'data/brief.json': brief };
  const document = {
    documentElement: new Element('html'),
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => new Text(text),
    getElementById: (id) => body.byId(id),
  };
  const context = vm.createContext({
    document,
    Node,
    console,
    location: { hash: '' },
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async (path) => {
      const data = files[path];
      return data == null
        ? { ok: false, status: 404, json: async () => { throw new Error('not found'); } }
        : { ok: true, status: 200, json: async () => structuredClone(data) };
    },
  });
  vm.runInContext(readFileSync('site/app.js', 'utf8'), context, { filename: 'site/app.js' });

  for (let i = 0; i < 100 && main.all('p', 'loading').length > 0; i++) await new Promise((r) => setImmediate(r));
  return { body, main, colophon: body.byId('colophon') };
}
