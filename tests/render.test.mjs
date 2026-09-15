// Exercises the render path with a stubbed DOM. Catches crashes and checks that the
// account rows recovered by the parser actually reach the KPIs and the table.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, readSample } from './harness.mjs';

const balBytes = readSample('Balance.xlsx');
const txBytes  = readSample('Transacciones.xlsx');
const need = (b) => b ? false : { skip: 'docs/samples/ not present' };

// Walk a stubbed node tree collecting text, so we can assert on rendered output.
function textOf(node, out = []) {
  if (!node) return out;
  if (node.textContent) out.push(node.textContent);
  for (const c of node.children || []) textOf(c, out);
  return out;
}
const money = (s) => Number(String(s).replace(/[^0-9.]/g, '')) || 0;

describe('balance rendering', () => {
  test('renders without throwing, at every grouping', { ...need(balBytes) }, () => {
    const app = loadApp();
    app.parseBalance(balBytes);
    for (const g of ['month', 'quarter', 'year']) {
      app.setGrouping(g);
      assert.doesNotThrow(() => app.renderBalance(), `grouping "${g}" threw`);
    }
  });

  test('every parsed section reaches the table', { ...need(balBytes) }, () => {
    const app = loadApp();
    app.parseBalance(balBytes);
    app.setGrouping('month');
    app.renderBalance();

    const rendered = textOf(app.el('bal-pivot')).join('\n');
    // Section header bands
    for (const label of ['Cuentas por Cobrar', 'Fondos Marcados (RD$)',
                         'Otros Pasivos Corrientes', 'Fondos Propios']) {
      assert.ok(rendered.includes(label), `section band missing: ${label}`);
    }
    // Rows the old parser dropped by accident. Note fondos_propios accounts are
    // deliberately collapsed into a single "Fondos Propios" line, so they are checked
    // through the KPI below rather than by name here.
    for (const name of ['Cuentas por cobrar - USD', 'Anticipos']) {
      assert.ok(rendered.includes(name), `recovered row not rendered: ${name}`);
    }
    assert.ok(rendered.includes('Fondos Propios'), 'Fondos Propios line missing');
  });

  test('custodial funds appear nowhere in the balance tab', { ...need(balBytes) }, () => {
    const app = loadApp();
    app.parseBalance(balBytes);
    app.setGrouping('month');
    app.renderBalance();

    const rendered = textOf(app.el('bal-pivot')).join('\n');
    assert.ok(!/huqu/i.test(rendered), 'a custodial account was rendered');
    assert.ok(app.el('bal-pasivos').textContent !== '—', 'Total Pasivos did not render');
  });

  test('excluding the custodial liability also excludes its bank account',
    { ...need(balBytes) }, () => {
    // These two mirror each other in the export. Dropping only one of them would
    // overstate the Assembly's net position by the whole custodial balance.
    const app = loadApp();
    app.parseBalance(balBytes);
    const names = app.balData.sections.map(s => s.name);
    assert.ok(!names.includes('Otras Fondos, Huquq'));
    assert.ok(!names.includes('Banco SB Huquh - Ahorro - 0953'));
  });

  test('receivables are counted in Total Activos', { ...need(balBytes) }, () => {
    const app = loadApp();
    app.parseBalance(balBytes);
    app.setGrouping('month');
    app.renderBalance();

    const activos = money(app.el('bal-activos').textContent);
    const last = app.balData.months.length - 1;
    const banks = app.balData.sections
      .filter(s => s.section === 'activos')
      .reduce((t, s) => t + (s.values[last] || 0), 0);
    const cxc = app.balData.sections
      .filter(s => s.section === 'cxcobrar')
      .reduce((t, s) => t + (s.values[last] || 0), 0);

    assert.ok(cxc !== 0, 'no receivables parsed, so this test proves nothing');
    assert.ok(Math.abs(activos - (banks + cxc)) < 1,
      `Total Activos ${activos} should equal banks ${banks} + receivables ${cxc}`);
  });
});

describe('income and expense rendering', () => {
  test('renders without throwing, at every grouping', { ...need(txBytes) }, () => {
    const app = loadApp();
    app.parseTx(txBytes);
    for (const g of ['month', 'quarter', 'year']) {
      app.setGrouping(g);
      assert.doesNotThrow(() => app.renderIngresos(app.txRows), `ingresos "${g}" threw`);
      assert.doesNotThrow(() => app.renderGastos(app.gasRows),  `gastos "${g}" threw`);
    }
  });

  test('handles an empty period without throwing', { ...need(txBytes) }, () => {
    const app = loadApp();
    app.parseTx(txBytes);
    assert.doesNotThrow(() => app.renderIngresos([]));
    assert.doesNotThrow(() => app.renderGastos([]));
  });
});

describe('unclassified-account warning', () => {
  test('stays hidden when everything is classified', { ...need(balBytes) }, () => {
    const app = loadApp();
    app.parseBalance(balBytes);
    app.setGrouping('month');
    app.renderBalance();
    assert.equal(app.balData.unknown.length, 0);
    assert.equal(app.el('bal-warn').style.display, 'none');
  });

  test('shows and names the accounts when something cannot be filed', { ...need(balBytes) }, () => {
    const app = loadApp();
    app.parseBalance(balBytes);
    // Simulate a QBO export that introduced a section we do not recognise.
    app.balData.unknown.push('Cuenta Nueva Sin Sección');
    app.setGrouping('month');
    app.renderBalance();
    const warn = app.el('bal-warn');
    assert.equal(warn.style.display, 'block');
    assert.match(warn.innerHTML, /Cuenta Nueva Sin Secci/);
    assert.match(warn.innerHTML, /no están incluidas/);
  });
});

describe('fondos propios aggregation', () => {
  test('the collapsed line includes the recovered opening-balance row',
    { ...need(balBytes) }, () => {
    const app = loadApp();
    app.parseBalance(balBytes);
    app.setGrouping('month');
    app.renderBalance();

    const last = app.balData.months.length - 1;
    const rows = app.balData.sections.filter(s => s.section === 'fondos_propios');
    const opening = rows.find(s => s.name === 'Fondos propios del saldo inicial');
    assert.ok(opening, 'opening-balance row missing from the parse');

    const expected = rows.reduce((t, s) => t + (s.values[last] || 0), 0);
    const shown = money(app.el('bal-fondos').textContent);
    assert.ok(Math.abs(shown - expected) < 1,
      `Fondos Propios KPI ${shown} should equal ${expected}`);
    assert.ok(Math.abs(opening.values[last]) > 0,
      'the recovered row contributes nothing, so this proves nothing');
  });
});

describe('custodial exclusion is disclosed to the reader', () => {
  test('the note states the amount kept out of the report', { ...need(txBytes) }, () => {
    const app = loadApp();
    app.parseTx(txBytes);
    app.renderExclusionNote();
    const note = app.el('exclNote');
    assert.equal(note.style.display, 'block');
    assert.match(note.textContent, /Ḥuqúqu'lláh/);
    assert.match(note.textContent, /movimientos/);
    assert.match(note.textContent, /RD\$/);
  });

  test('the note stays hidden when nothing was excluded', () => {
    const app = loadApp();
    app.renderExclusionNote();
    assert.equal(app.el('exclNote').style.display, 'none');
  });
});

describe('PDF / print preparation', () => {
  function loaded() {
    const app = loadApp();
    app.parseTx(txBytes);
    app.parseBalance(balBytes);
    app.setGrouping('month');
    app.applyFilters();
    return app;
  }

  test('the period header states the scope the filter bar would have shown',
    { ...need(txBytes) }, () => {
    const app = loaded();
    app.el('filterFrom').value = '2025-01-01';
    app.el('filterTo').value = '2025-12-31';
    app.renderPrintMeta();
    const t = app.el('printMeta').innerHTML;
    assert.match(t, /Período/);
    assert.match(t, /enero/);
    assert.match(t, /diciembre/);
    assert.match(t, /Agrupación/);
    assert.match(t, /Mensual/);
    assert.match(t, /Generado/);
  });

  // Table chunking needs real cloneNode/remove semantics, which the stubbed DOM here
  // does not provide. It is covered end-to-end by tests/pdf-check.mjs instead, which
  // drives headless Chrome against the actual printed output.

  test('a narrow period is left as a single table', { ...need(balBytes) }, () => {
    const app = loaded();
    app.el('filterFrom').value = '2026-01-01';
    app.el('filterTo').value = '2026-04-30';
    app.applyFilters();
    app.prepararImpresion();
    const wrap = app.el('bal-pivot');
    assert.equal(wrap.dataset?.chunked, undefined, 'four months should not be split');
  });

  test('printing leaves the page as it found it', { ...need(balBytes) }, () => {
    const app = loaded();
    app.prepararImpresion();
    assert.ok(app.win._listeners, 'print listeners registered');
    app.restaurarDespuesImpresion();
    const wrap = app.el('bal-pivot');
    assert.equal(wrap.dataset?.chunked, undefined, 'chunk bookkeeping not cleared');
  });
});
