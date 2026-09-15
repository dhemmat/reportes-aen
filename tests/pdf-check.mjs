// End-to-end check of the PDF output, driven through real headless Chrome.
//
//   node tests/pdf-check.mjs [--keep]
//
// The stubbed DOM in harness.mjs cannot express table cloning or canvas sizing, and
// print layout only exists in a real engine — every bug this feature had (blank
// charts, unchunked tables, blank pages) was invisible to the unit tests and obvious
// here. Skips cleanly when Chrome or the sample exports are missing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find(p => fs.existsSync(p));

// Every export generation we have samples for — QBO changes the format, and the PDF
// has to survive both.
const GENERATIONS = [
  { name: 'Apr 2026', tx: 'Transacciones.xlsx',         bal: 'Balance.xlsx' },
  { name: 'Sep 2026', tx: 'Transacciones-2026-09.xlsx', bal: 'Balance-2026-09.xlsx' },
].map(g => ({
  ...g,
  files: [g.tx, g.bal].map(f => path.join(ROOT, 'docs/samples', f)),
})).filter(g => g.files.every(f => fs.existsSync(f)));

function skip(why) { console.log(`SKIP  pdf-check — ${why}`); process.exit(0); }

if (!CHROME)          skip('no Chrome/Chromium found');
if (!GENERATIONS.length) skip('no sample exports in docs/samples/');

let failures = 0;
let prefix = '';
function check(label, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${prefix}${label}${ok || !detail ? '' : `  → ${detail}`}`);
  if (!ok) failures++;
}

const kept = [];
for (const gen of GENERATIONS) {
  prefix = `[${gen.name}] `;
  // ── Build a page that loads the samples the way the user would ──
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aen-pdf-'));
  const b64 = f => fs.readFileSync(f).toString('base64');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  fs.mkdirSync(path.join(work, 'vendor'));
  for (const f of ['xlsx.full.min.js', 'chart.umd.min.js']) {
    fs.copyFileSync(path.join(ROOT, 'vendor', f), path.join(work, 'vendor', f));
  }

  const boot = `<script>(function(){
    const d=s=>{const b=atob(s),u=new Uint8Array(b.length);
      for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;};
    _txData=d("${b64(gen.files[0])}"); _balRawData=d("${b64(gen.files[1])}");
    loadFiles();
    prepararImpresion();          // what the browser does on beforeprint
    const probe={
      gasCanvas:_gasChart?_gasChart.canvas.width+'x'+_gasChart.canvas.height:'none',
      ingCanvas:_ingChart?_ingChart.canvas.width+'x'+_ingChart.canvas.height:'none',
      chunks:document.querySelectorAll('.print-chunk').length,
      balRows:document.querySelectorAll('#bal-pivot tbody tr').length,
      huquq:/huqu/i.test(document.body.innerText||''),
      meta:document.getElementById('printMeta').textContent.slice(0,60),
    };
    document.title='PROBE'+JSON.stringify(probe);
  })();</script></body>`;
  fs.writeFileSync(path.join(work, 'preview.html'), html.replace('</body>', boot, 1));

  const url = 'file://' + path.join(work, 'preview.html');
  const run = args => execFileSync(CHROME, args, { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });

  // ── 1. State after print preparation ──
  const dom = run(['--headless','--disable-gpu','--virtual-time-budget=10000','--dump-dom', url]);
  const probe = JSON.parse((dom.match(/<title>PROBE(.*?)<\/title>/s) || [,'{}'])[1]
    .replace(/&quot;/g,'"').replace(/&amp;/g,'&'));

  check('Ingresos chart has a real canvas', /^[1-9]\d*x[1-9]\d*$/.test(probe.ingCanvas), probe.ingCanvas);
  check('Gastos chart has a real canvas (hidden tab)', /^[1-9]\d*x[1-9]\d*$/.test(probe.gasCanvas), probe.gasCanvas);
  check('wide tables are split into column blocks', probe.chunks > 0, `chunks=${probe.chunks}`);
  check('balance table has rows', probe.balRows > 20, `rows=${probe.balRows}`);
  check('no custodial account anywhere in the document', probe.huquq === false);
  check('period header is populated', /Per/.test(probe.meta || ''), probe.meta);

  // ── 2. The PDF itself ──
  const pdf = path.join(work, 'out.pdf');
  run(['--headless','--disable-gpu','--no-pdf-header-footer',
       '--virtual-time-budget=10000',`--print-to-pdf=${pdf}`, url]);
  check('a PDF was produced', fs.existsSync(pdf) && fs.statSync(pdf).size > 20000);

  if (fs.existsSync(pdf)) {
    try {
      const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
      const pages = +(info.match(/Pages:\s+(\d+)/) || [,0])[1];
      check('landscape A4', /Page size:\s+841/.test(info), info.match(/Page size:.*/)?.[0]);
      // Three sections over the full 25-month range; far more means blank pages crept back.
      check('page count is sane', pages >= 3 && pages <= 12, `pages=${pages}`);
    } catch { console.log('note  pdfinfo unavailable, skipped PDF metadata checks'); }
  }


  if (process.argv.includes('--keep')) kept.push(work);
  else fs.rmSync(work, { recursive: true, force: true });
}

if (kept.length) console.log(`\nkept: ${kept.join(', ')}`);

console.log(failures ? `\n${failures} check(s) failed` : '\nall PDF checks passed');
process.exit(failures ? 1 : 0);
