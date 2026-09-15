// Extracts the <script> block from index.html and evaluates it in Node so the real
// parsers can be exercised against real QBO exports. No build step, no npm install:
// the only dependency is the vendored SheetJS the page itself uses.
//
// Deliberately loads the SAME source the browser loads, so a test can never pass
// against a copy that has drifted from index.html.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadApp() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
  if (!m) throw new Error('could not find the inline <script> block in index.html');

  // Drop the two bootstrap calls that touch the DOM at load time.
  const src = m[1].replace(/^handleDrop\(.*$/gm, '');

  // SheetJS is a UMD bundle, so where it puts itself depends on what it finds in
  // scope: `module.exports`, a `window`-alike, `this`, or the real globalThis.
  // `node -e` leaks a `module` global that a plain evaluation would bind to, so we
  // pass in our own `module`/`exports` and then accept whichever slot got filled.
  // Keeps the harness identical under `node --test`, `node -e` and a REPL.
  const sandbox = {};
  const fakeModule = { exports: {} };
  new Function('window', 'self', 'module', 'exports',
    fs.readFileSync(path.join(ROOT, 'vendor/xlsx.full.min.js'), 'utf8')
  ).call(sandbox, sandbox, sandbox, fakeModule, fakeModule.exports);

  const XLSX = [fakeModule.exports, fakeModule.exports?.XLSX,
                sandbox.XLSX, globalThis.XLSX]
    .find(c => c && typeof c.read === 'function');
  if (!XLSX) {
    throw new Error('vendor/xlsx.full.min.js did not expose a usable XLSX.read');
  }

  // A DOM stub rich enough to run the renderers, so a render-path crash fails a test
  // instead of only showing up in the browser. Nodes remember what was written to
  // them, which lets a test read KPI text and walk the generated tables.
  const nodes = new Map();
  function makeNode(id) {
    const n = {
      id, tagName:'', textContent:'', innerHTML:'', value:'', colSpan:1, className:'',
      style:{ cssText:'' }, children:[],
      classList:{ _s:new Set(), toggle(c,on){ on ? this._s.add(c) : this._s.delete(c); },
                  add(c){ this._s.add(c); }, remove(c){ this._s.delete(c); },
                  contains(c){ return this._s.has(c); } },
      appendChild(c){ this.children.push(c); return c; },
      getContext(){ return {}; },
    };
    return n;
  }
  const body = makeNode('body');
  const doc = {
    body,
    getElementById(id){
      if (!nodes.has(id)) nodes.set(id, makeNode(id));
      return nodes.get(id);
    },
    createElement(tag){ const n = makeNode(null); n.tagName = tag.toUpperCase(); return n; },
    querySelectorAll(){ return []; },
  };
  const ctx = {
    XLSX,
    document: doc,
    window: {
      matchMedia: () => ({ matches:false }),
      // The page registers beforeprint/afterprint at load; capture them so tests can
      // fire the print path without a real browser.
      _listeners: {},
      addEventListener(ev, fn){ (this._listeners[ev] ||= []).push(fn); },
      removeEventListener(){},
      print(){ this.dispatch('beforeprint'); this.dispatch('afterprint'); },
      dispatch(ev){ for (const fn of this._listeners[ev] || []) fn(); },
    },
    Chart: function(){ return { destroy(){} }; },
    console,
  };

  const keys = Object.keys(ctx);
  // Expose everything the script declares by returning it from the function scope.
  const exposed = new Function(...keys, src + `
    return { parseTx, parseBalance, parseAmt, fmt, fmtShort, parseFecha, parseBalMonth,
             categorizarIng, limpiarGasto, groupKey, groupLabel,
             get balData(){ return _balData; },
             get txRows(){ return _txRows; },
             get gasRows(){ return _gasRows; },
             renderBalance, renderIngresos, renderGastos, applyFilters,
             esCustodial, renderExclusionNote, get excluded(){ return _excluded; },
             renderPrintMeta, chunkWideTablesForPrint, restoreChunkedTables, descargarPDF,
             prepararImpresion, restaurarDespuesImpresion, olvidarChunks,
             construirGraficosConTodasLasPestanas,
             setGrouping: (g) => { _grouping = g; },
             el: (id) => document.getElementById(id),
             win: window };
  `)(...keys.map(k => ctx[k]));

  return exposed;
}

export function readSample(name) {
  const p = path.join(ROOT, 'docs/samples', name);
  if (!fs.existsSync(p)) return null;
  return new Uint8Array(fs.readFileSync(p));
}
