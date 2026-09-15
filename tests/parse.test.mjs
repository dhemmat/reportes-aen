// Run with:  node --test tests/
// Needs the sample exports in docs/samples/ (gitignored). Tests that require them
// skip cleanly when they are absent, so a fresh clone still passes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, readSample } from './harness.mjs';

const app = loadApp();
const balBytes = readSample('Balance.xlsx');
const txBytes  = readSample('Transacciones.xlsx');
const need = (b) => b ? false : { skip: 'docs/samples/ not present' };

describe('pure helpers', () => {
  test('parseAmt strips currency formatting', () => {
    assert.equal(app.parseAmt(1234.5), 1234.5);
    assert.equal(app.parseAmt('RD$1,234.50'), 1234.5);
    assert.equal(app.parseAmt('-1,234.50'), -1234.5);
    assert.ok(Number.isNaN(app.parseAmt('')));
  });

  test('parseFecha reads QBO dd/mm/yyyy, not mm/dd', () => {
    const d = app.parseFecha('07/04/2026');           // 7 April, not 4 July
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 3);
    assert.equal(d.getDate(), 7);
  });

  test('parseBalMonth accepts full names and abbreviations', () => {
    assert.deepEqual(app.parseBalMonth('abr. 2024'), { yr:2024, mo:3 });
    assert.deepEqual(app.parseBalMonth('abril 2024'), { yr:2024, mo:3 });
    assert.deepEqual(app.parseBalMonth('sept. 2025'), { yr:2025, mo:8 });
    assert.equal(app.parseBalMonth('no es un mes'), null);
  });

  test('limpiarGasto strips the GL number but keeps sub-account paths', () => {
    assert.equal(app.limpiarGasto('6100019 Reuniones AEN'), 'Reuniones AEN');
    assert.equal(app.limpiarGasto('Fondos Marcados:EBID'), 'Fondos Marcados:EBID');
  });

  test('groupKey is string-sortable across a year boundary', () => {
    const k = (y,m) => app.groupKey(new Date(y,m,15), 'month');
    assert.ok(k(2025,11) < k(2026,0));
  });
});

describe('balance parser', () => {
  test('recovers every account row, none unclassified', { ...need(balBytes) }, () => {
    app.parseBalance(balBytes);
    const { sections, months, unknown } = app.balData;

    assert.equal(months.length, 25, 'expected 25 monthly columns');
    assert.equal(unknown.length, 0, `unclassified rows: ${unknown.join(', ')}`);
    assert.equal(sections.length, 49, 'expected 49 account rows (51 less 2 custodial)');
    assert.ok(sections.every(s => s.values.length === months.length));
  });

  test('no subtotal or header row leaks in as an account', { ...need(balBytes) }, () => {
    app.parseBalance(balBytes);
    for (const s of app.balData.sections) {
      const low = s.name.toLowerCase();
      assert.ok(!low.startsWith('total para'), `subtotal leaked: ${s.name}`);
      assert.ok(!low.startsWith('accrual'),    `footer leaked: ${s.name}`);
    }
  });

  // The seven rows the previous prefix-matching parser silently discarded.
  const recovered = [
    ['Fondos propios del saldo inicial',  'fondos_propios'],
    ['Anticipos',                         'otros_pasivos'],
    ['Cuentas por cobrar',                'cxcobrar'],
    ['Cuentas por cobrar - USD',          'cxcobrar'],
    ['Cuentas por Cobrar EBID',           'cxcobrar'],
    ['Anticipos EBID',                    'cxcobrar'],
  ];
  for (const [name, section] of recovered) {
    test(`recovers "${name}" into ${section}`, { ...need(balBytes) }, () => {
      app.parseBalance(balBytes);
      const row = app.balData.sections.find(s => s.name === name);
      assert.ok(row, `"${name}" is missing from the parsed balance`);
      assert.equal(row.section, section);
      assert.ok(row.values.some(v => v !== null), `"${name}" parsed with no figures`);
    });
  }

  test('accounts land in every expected section', { ...need(balBytes) }, () => {
    app.parseBalance(balBytes);
    const counts = {};
    for (const s of app.balData.sections) counts[s.section] = (counts[s.section]||0) + 1;
    // activos 11→10 and otros_pasivos 2→1: the Huquq bank account and the Huquq
    // fund liability are both custodial and excluded.
    assert.deepEqual(counts, {
      cxcobrar: 4, activos: 10, cxpagar: 1, otros_pasivos: 1,
      fondos_rd: 14, fondos_usd: 15, fondos_propios: 4,
    });
  });

  test('rejects a sheet with no month columns', () => {
    assert.throws(() => app.parseBalance(new Uint8Array([1,2,3])));
  });
});

describe('transaction parser', () => {
  test('splits receipts from expenses', { ...need(txBytes) }, () => {
    app.parseTx(txBytes);
    assert.ok(app.txRows.length > 0);
    assert.ok(app.gasRows.length > 0);
    assert.ok(app.txRows.every(r => r.monto > 0), 'income must be positive');
    assert.ok(app.gasRows.every(r => r.monto > 0), 'expenses stored as absolute');
    assert.ok(app.txRows.every(r => r.fecha instanceof Date && !isNaN(r.fecha)));
  });

  test('the TOTAL footer row is not counted as a transaction', { ...need(txBytes) }, () => {
    app.parseTx(txBytes);
    const all = [...app.txRows, ...app.gasRows];
    assert.ok(all.every(r => r.fecha.getFullYear() >= 2020 && r.fecha.getFullYear() <= 2100));
  });
});

describe('custodial funds (Ḥuqúqu\'lláh) are excluded everywhere', () => {
  // The Assembly holds this money for another institution. Reporting it would both
  // overstate their position and show them funds they have asked not to see.

  test('the fund liability is not in the balance', { ...need(balBytes) }, () => {
    app.parseBalance(balBytes);
    assert.equal(app.balData.sections.find(s => /huqu/i.test(s.name)), undefined);
  });

  test('the custodial bank account is not in the balance either', { ...need(balBytes) }, () => {
    app.parseBalance(balBytes);
    // Asymmetry is the trap: excluding only the liability while keeping the bank
    // account overstates the Assembly's net position by the custodial balance.
    const names = app.balData.sections.map(s => s.name);
    assert.ok(!names.some(n => /huqu/i.test(n)), `custodial account left in: ${names.filter(n=>/huqu/i.test(n))}`);
    assert.ok(names.some(n => /Banco BPD/i.test(n)), 'ordinary bank accounts must survive');
  });

  test('custodial rows are excluded from income and expenses', { ...need(txBytes) }, () => {
    app.parseTx(txBytes);
    assert.ok(!app.txRows.some(r => /huqu/i.test(r.cat)),  'custodial income leaked');
    assert.ok(!app.gasRows.some(r => /huqu/i.test(r.cat)), 'custodial expense leaked');
  });

  test('the exclusion is recorded so the report can disclose it', { ...need(txBytes) }, () => {
    app.parseTx(txBytes);
    assert.ok(app.excluded.rows > 0, 'nothing recorded as excluded');
    assert.ok(app.excluded.monto > 0);
    assert.ok(app.excluded.cuentas.length > 0);
  });

  test('matches both chart-of-accounts spellings, Huquq and Huquh', () => {
    assert.ok(app.esCustodial('Otras Fondos, Huquq'));
    assert.ok(app.esCustodial('Banco SB Huquh - Ahorro - 0953'));
    assert.ok(app.esCustodial(null, 'Otras Fondos, Huquq'), 'must check either column');
    assert.ok(!app.esCustodial('Contribuciones de Creyentes'));
    assert.ok(!app.esCustodial('Banco BPD -RD$ Ahorro - 4029 FN'));
    assert.ok(!app.esCustodial(null, null));
  });

  test('real expenses are untouched by the exclusion', { ...need(txBytes) }, () => {
    app.parseTx(txBytes);
    const total = app.gasRows.reduce((t, r) => t + r.monto, 0);
    // ~24.84M reported before the exclusion, ~4.77M of it custodial.
    assert.ok(total > 19_000_000 && total < 21_000_000,
      `expenses after exclusion looked wrong: ${total}`);
  });
});

describe('number formatting', () => {
  test('negative amounts carry a minus sign, not just red text', () => {
    assert.match(app.fmt(-1234.5), /^-RD\$/);
    assert.equal(app.fmt(1234.5).startsWith('-'), false);
    assert.equal(app.fmt(0).startsWith('-'), false);
  });

  test('missing values render as a dash', () => {
    for (const v of [null, undefined, NaN]) assert.equal(app.fmt(v), '—');
  });

  test('two decimal places either way', () => {
    assert.match(app.fmt(5), /5[.,]00$/);
    assert.match(app.fmt(-5), /^-RD\$5[.,]00$/);
  });
});

// ── Both QBO export generations ────────────────────────────────────────────
// QBO changed its export between these two. The differences that mattered:
//   * report title and organisation name swapped rows
//   * "Nombre completo de la cuenta" renamed to "División" (same content)
//   * GL numbers dropped from account names
//   * "Contabilización (S/N)" → "(Y/N)", "Notas" → "Nota"
//   * "Fondos propios" → "Fondos propios de los accionistas"  ← broke the parser
//   * new transaction types (Pago, Transferencia) and many new accounts
// Only the last one actually broke anything, and only because header labels were
// matched exactly. Both files are kept so a future export cannot quietly regress
// either generation.
const GENERATIONS = [
  { name: 'Apr 2026', tx: 'Transacciones.xlsx',         bal: 'Balance.xlsx',         months: 25 },
  { name: 'Sep 2026', tx: 'Transacciones-2026-09.xlsx', bal: 'Balance-2026-09.xlsx', months: 29 },
];

for (const gen of GENERATIONS) {
  const tx  = readSample(gen.tx);
  const bal = readSample(gen.bal);
  const has = (b) => b ? false : { skip: `docs/samples/${gen.tx} not present` };

  describe(`export generation: ${gen.name}`, () => {
    test('balance parses with nothing unclassified', { ...has(bal) }, () => {
      const app = loadApp();
      app.parseBalance(bal);
      const d = app.balData;
      assert.equal(d.months.length, gen.months);
      assert.deepEqual(d.unknown, [], `unclassified: ${d.unknown.join(', ')}`);
      assert.ok(d.sections.length > 40);
    });

    test('every section is populated, including fondos propios',
      { ...has(bal) }, () => {
      // Fondos Propios was the one that broke: its header gained a suffix, and an
      // exact-match lookup orphaned all four accounts under it, zeroing the KPI.
      const app = loadApp();
      app.parseBalance(bal);
      const counts = {};
      for (const s of app.balData.sections) counts[s.section] = (counts[s.section] || 0) + 1;
      for (const sec of ['activos','cxcobrar','cxpagar','otros_pasivos',
                         'fondos_rd','fondos_usd','fondos_propios']) {
        assert.ok(counts[sec] > 0, `section "${sec}" has no accounts — got ${JSON.stringify(counts)}`);
      }
    });

    test('custodial funds are excluded on both sides', { ...has(bal) }, () => {
      const app = loadApp();
      app.parseBalance(bal);
      app.parseTx(tx);
      assert.deepEqual(app.balData.sections.filter(s => /huqu/i.test(s.name)), []);
      assert.deepEqual([...app.txRows, ...app.gasRows].filter(r => /huqu/i.test(r.cat)), []);
      assert.ok(app.excluded.rows > 0, 'custodial movements should have been recorded');
    });

    test('transactions parse into both buckets with sane dates', { ...has(tx) }, () => {
      const app = loadApp();
      app.parseTx(tx);
      assert.ok(app.txRows.length  > 100, `income rows: ${app.txRows.length}`);
      assert.ok(app.gasRows.length > 100, `expense rows: ${app.gasRows.length}`);
      assert.ok(app.txRows.every(r => r.monto > 0));
      assert.ok(app.gasRows.every(r => r.monto > 0));
      for (const r of [...app.txRows, ...app.gasRows]) {
        const y = r.fecha.getFullYear();
        assert.ok(y >= 2020 && y <= 2100, `implausible date ${r.fecha} on ${r.cat}`);
      }
    });

    test('income lands in the four known categories only', { ...has(tx) }, () => {
      const app = loadApp();
      app.parseTx(tx);
      const known = new Set(['Contribuciones de Creyentes','De Asambleas Espirituales Locales',
                             'Cuerpo Continental de Consejeros','Otras Contribuciones']);
      for (const r of app.txRows) assert.ok(known.has(r.cat), `unexpected bucket: ${r.cat}`);
    });

    test('the books balance where the custodial pair agrees', { ...has(bal) }, () => {
      // Activos - Pasivos = Fondos Propios. Any residual should be the Assembly's own
      // custodial liability/cash difference, not a parsing error — so it must be small
      // relative to the balance sheet, not arbitrary.
      const app = loadApp();
      app.parseBalance(bal);
      const d = app.balData;
      const at = (secs, i) => d.sections.filter(s => secs.includes(s.section))
                               .reduce((t, s) => t + (s.values[i] || 0), 0);
      let exact = 0;
      d.months.forEach((m, i) => {
        const gap = at(['activos','cxcobrar'], i)
                  - at(['cxpagar','otros_pasivos','fondos_rd','fondos_usd'], i)
                  - at(['fondos_propios'], i);
        if (Math.abs(gap) < 0.01) exact++;
      });
      assert.ok(exact > 0, 'the identity never held exactly in any month — parser is wrong');
    });
  });
}
