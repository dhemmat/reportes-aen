# Reporte Financiero AEN

A single-page, zero-backend financial report for the **Asamblea Nacional Espiritual de los
Bahá'ís de la República Dominicana**. The treasurer exports two standard reports from
QuickBooks Online, drops them onto the page, and gets the monthly / quarterly / annual
breakdown the Assembly's members actually need — income by contribution category, expenses
by category, and account balances by fund.

**Live:** https://dhemmat.github.io/reportes-aen/
**Demo video:** https://www.loom.com/share/995a2d4834d04fea9cee680f49120d5f

Everything runs in the browser. No server, no upload, no persistence — which is the point:
the Assembly's financial data never leaves the treasurer's machine.

> **Status:** MVP, in production use. Built to solve an immediate reporting gap, and it
> carries the shortcuts that implies. The [Known limitations](#known-limitations) section is
> the honest inventory — read it before extending anything.

---

## Contents

- [Running it](#running-it)
- [Architecture](#architecture)
- [Data flow](#data-flow)
- [Code walkthrough](#code-walkthrough)
- [The three tabs](#the-three-tabs)
- [Filters and grouping](#filters-and-grouping)
- [Known limitations](#known-limitations)
- [Where to change things](#where-to-change-things)
- [Docs in this repo](#docs-in-this-repo)

---

## Running it

There is no build step and no dependency install.

```sh
# any static server works; open the printed URL
python3 -m http.server 8000
```

Then open `http://localhost:8000` and upload the two `.xlsx` files. Opening `index.html`
directly via `file://` also works — the two CDN scripts load fine over `file://`, and
`FileReader` needs no origin.

Deployment is GitHub Pages serving `main` at the repo root. Pushing to `main` publishes.

Tests need nothing installed either — Node's built-in runner, against the vendored SheetJS:

```sh
node --test tests/*.test.mjs      # parsers and render paths
node tests/pdf-check.mjs         # drives headless Chrome, checks the real PDF
```

They evaluate the real `<script>` block out of `index.html`, so a test can never pass
against a copy that has drifted from what the browser loads. Tests that need the sample
exports skip cleanly when `docs/samples/` is absent.

To get input files, follow [`docs/instrucciones-usuario.md`](docs/instrucciones-usuario.md).
Sample exports live in [`docs/samples/`](docs/samples/README.md) and are intentionally
**not committed** — this repo is public.

---

## Architecture

One file: [`index.html`](index.html), ~1380 lines, three sections.

| Lines | Section |
|---|---|
| [11–220](index.html#L11-L220) | `<style>` — all CSS, no framework |
| [224–366](index.html#L224-L366) | Markup — upload screen + report screen, both always present in the DOM |
| [368–1378](index.html#L368-L1378) | `<script>` — parsing, state, rendering |

Two dependencies, both **vendored** into [`vendor/`](vendor/README.md) rather than loaded
from a CDN, so the tool has no runtime network dependency and cannot break because a third
party changed something:

- **SheetJS** `0.18.5` — `.xlsx` parsing
- **Chart.js** `4.4.0` — the two bar charts

Screen switching is a `display` toggle on `#uploadScreen` / `#reportScreen`
([1048–1049](index.html#L1048-L1049)); there is no router. Handlers are inline `onclick`
attributes, so every function they call has to stay a global.

### Global state

All module state is file-scoped `let` bindings ([277–280](index.html#L277-L280),
[1008](index.html#L1008)):

| Variable | Holds |
|---|---|
| `_txRows` | Parsed income rows: `{fecha, monto, nombre, cat}` |
| `_gasRows` | Parsed expense rows: `{fecha, monto, cat}` (`monto` positive) |
| `_balData` | `{months, sections}` from the balance sheet |
| `_grouping` | `'month'` \| `'quarter'` \| `'year'` |
| `_minDate` / `_maxDate` | Date span of the transactions file, used to seed the filters |
| `_ingChart` / `_gasChart` | Chart.js instances, destroyed before each re-render |
| `_txData` / `_balRawData` | Raw `Uint8Array` file bytes, held until "Generar reporte" |

`_txFile` and `_balFile` ([407](index.html#L407)) are declared and never used.

---

## Data flow

```
   ┌─────────────────────┐         ┌─────────────────────┐
   │ Transacciones.xlsx  │         │    Balance.xlsx     │
   │ (Lista de transac-  │         │ (Balance General,   │
   │  ciones por fecha)  │         │  columnas por mes)  │
   └──────────┬──────────┘         └──────────┬──────────┘
              │ FileReader → Uint8Array       │
              ▼                               ▼
         _txData                         _balRawData
              │                               │
              │   ── click "Generar reporte" ──
              ▼                               ▼
        parseTx()                       parseBalance()
              │                               │
     ┌────────┴────────┐                      │
     ▼                 ▼                      ▼
  _txRows          _gasRows                _balData
 (Recibo de       (Gasto,                {months[],
  venta, >0)       <0, abs)               sections[]}
     │                 │                      │
     └────────┬────────┴──────────────────────┘
              ▼
        applyFilters()  ← date range + _grouping
              │
     ┌────────┼────────────────┐
     ▼        ▼                ▼
renderIngresos renderGastos renderBalance
     │        │                │
     ▼        ▼                ▼
  KPIs +   KPIs +          KPIs +
  chart +  chart +         sectioned
  2 pivots 1 pivot         pivot
```

The two files are parsed independently and never reconciled against each other. Nothing
checks that a transaction total agrees with a balance movement.

---

## Code walkthrough

### Helpers ([282–328](index.html#L282-L328))

| Function | Behaviour |
|---|---|
| `fmt(n)` | `RD$1,234.56`, locale `es-DO`, 2 decimals. **Prints `Math.abs(n)`** — the minus sign is discarded. |
| `fmtShort(n)` | `RD$1.2M` / `RD$1.2K` for axis ticks and average KPIs. |
| `toISO(d)` | `YYYY-MM-DD` for `<input type="date">`, built from local-time getters (no UTC drift). |
| `parseAmt(v)` | Passes numbers through; strips `RD$`, spaces and commas from strings. |
| `parseFecha(v)` | `dd/mm/yyyy` → `Date`; otherwise falls back to `new Date(s)`. |
| `categorizarIng(c)` | Account string → one of the four income buckets. See [format spec](docs/formato-archivos.md#income-categorisation). |
| `limpiarGasto(c)` | Strips a leading GL number (`/^\d+\s+/`) off an expense account name. |
| `groupKey(fecha, g)` | `'2025'` \| `'2025-Q2'` \| `'2025-04'` — string-sortable, which is how period ordering works. |
| `groupLabel(k, g)` | Key → Spanish display label. |

### Parsing

**`parseTx(data)`** ([826–860](index.html#L826-L860)) finds the header row by scanning
column A for `Fecha`, then reads by fixed column index. Each row is routed by
`Tipo de transacción`:

- `includes('recibo')` **and** `monto > 0` → `_txRows`, category from `categorizarIng()`
- `includes('gasto')` **and** `monto < 0` → `_gasRows`, category from `limpiarGasto()`
- everything else, including all `Depósito` and `Factura` rows → dropped

The category source is column H (`Nombre completo de la cuenta`), falling back to column G
(`Nombre de la cuenta`) when H is empty ([847](index.html#L847)). Finally it sets
`_minDate` / `_maxDate` from the union of both row sets.

**`parseBalance(data)`** ([926–1005](index.html#L926-L1005)) finds the header row by either
the old marker (`cuenta de distribu…` in column A) or the new one (column A empty, column B
matching a month label). It builds a `months[]` array of `{label, yr, mo, colIdx}`, then
walks the rows deriving section membership **from the sheet's own labels**:

- A row with **no numeric cells** in any month column is a section header — push it onto a stack.
- A row starting with `Total para ` / `Total for ` closes that section — pop back to it,
  and pop anything still open inside it.
- Any other row is an account, belonging to the deepest recognised section on the stack
  (`BAL_HEADER_SECTION`, [870](index.html#L870)).

Nothing depends on row position, so accounts added or removed in QBO are absorbed without
mis-filing. Rows that end up under no recognised section are collected in
`_balData.unknown` instead of being silently dropped, and `parseBalance` throws if it finds
no accounts at all.

Both parsers `throw` on a missing header row; `loadFiles()` catches and shows the message.

### Rendering

**`buildPivot()`** ([372–427](index.html#L372-L427)) — the shared amounts table. Rows are
categories, columns are periods, plus a row-total column and a column-total footer. Empty
cells render `—` rather than `RD$0.00`. Sticky first column and sticky header/footer come
from CSS ([82–126](index.html#L82-L126)).

**`buildContribPivot()`** ([430–490](index.html#L430-L490)) — counts *distinct contributor
names* per category per period using `Set`s, so the "Únicos totales" column is a true
distinct count across the whole range, not a sum of the monthly counts.

**`renderIngresos()`** ([493–591](index.html#L493-L591)) groups rows by `groupKey`,
accumulating both an amount and a `Set` of names per category. Produces three KPIs, a
stacked bar chart (one dataset per `ING_CATS` entry, with unique-contributor count in the
tooltip's `afterBody`), the amounts pivot, and the contributor-count pivot.

**`renderGastos()`** ([594–664](index.html#L594-L664)) same grouping, but categories are
discovered from the data and sorted by descending total. The chart is a single-series total
per period — deliberately not stacked, since the sample has ~50 expense categories.

**`renderBalance()`** ([674–823](index.html#L674-L823)) is the most involved. Balances are
point-in-time, so grouping **picks the last month in each group** rather than summing
([679–686](index.html#L679-L686)) — `groupColIdx[k]` is overwritten as it iterates, so the
final write wins. It then filters columns to the date range at year/month precision, computes
three KPIs from the last visible column, and emits one table with a coloured header row per
section. `fondos_propios` is special-cased: its individual rows are summed into a single
`Fondos Propios` line ([750–793](index.html#L750-L793)).

### File loading ([1010–1059](index.html#L1010-L1059))

`handleDrop()` wires each drop zone for both click-to-browse and drag-and-drop, reading the
file to a `Uint8Array` and enabling the button once **both** files are present. Drag-and-drop
routes through a synthetic `DataTransfer` so both paths hit the same `change` handler.
`loadFiles()` parses, seeds the date filters from `_minDate`/`_maxDate`, swaps screens and
renders.

---

## Custodial funds are excluded

Ḥuqúqu'lláh is held by the Assembly on behalf of another institution. It is not the
Assembly's money and they have asked not to see it, so it is excluded from **every** figure
in this report.

The rule lives in one place — `CUSTODIAL_RE` / `esCustodial()` ([395](index.html#L395)) —
and is applied in both parsers. It matches the account name case-insensitively and covers
both spellings in the chart of accounts: `Huquq` (the fund liability) and `Huquh` (the bank
account holding it). Transactions are tested on **both** account columns, because custodial
money sometimes passes through a bank account that is not itself custodial.

Three things about this are worth understanding before changing it:

**It has to be symmetric.** The fund liability and the bank account that holds it mirror
each other. Dropping only the liability — which is what the old `BAL_SKIP` prefix list did
by accident — leaves the custodial cash sitting in Total Activos with no matching obligation,
overstating the Assembly's net position by the whole custodial balance. Both sides go, or
neither does.

**It is not only a balance-sheet concern.** Custodial movements also flowed through the
Gastos tab, where they were a large share of reported expenses and concentrated in a couple
of months, making those months look wildly overspent. Income is unaffected today only
because every custodial receipt happens to be a `Depósito`, which the tool ignores — so
whoever fixes [deposits](#2-depósito-rows-are-dropped-entirely--671-of-2105-in-the-sample)
must apply the exclusion there too, or custodial money walks straight into Ingresos.

**It is disclosed, deliberately.** `renderExclusionNote()` ([1215](index.html#L1215)) prints
a line under the report title naming the exclusion and the amount held out. The treasurer
reconciles this report against QBO by hand, so a total that is intentionally lower than
QBO's has to say so — otherwise it reads as exactly the kind of unexplained discrepancy that
prompted this work. Don't silence it without replacing it with something better.

### Verifying a balance parse

`Activos − Pasivos = Fondos Propios` is the check worth running after touching
`parseBalance()`. Against the sample export it holds to the cent for the months where the
Assembly's own Huquq liability equals its Huquq cash. Where it doesn't, the residual equals
that difference exactly — i.e. it is a discrepancy in the source books, not a parsing error.
A residual that *doesn't* match that difference means the parser is wrong.

## The three tabs

### 📥 Ingresos

KPIs: total, per-period average, distinct contributors. Stacked bar chart plus two pivots
(amounts, contributor counts). Categories are fixed in `ING_CATS`
([373](index.html#L373)):

| Key | Label | Colour |
|---|---|---|
| `Contribuciones de Creyentes` | Creyentes | `#3a82c4` |
| `De Asambleas Espirituales Locales` | Asambleas | `#27ae60` |
| `Cuerpo Continental de Consejeros` | Consejeros | `#8e44ad` |
| `Otras Contribuciones` | Otros | `#95a5a6` |

### 📤 Gastos

KPIs: total, per-period average, active category count. Total-per-period bar chart and one
pivot, categories ordered by total descending.

### 🏦 Balance

KPIs: total assets, total liabilities, own funds — all as of the **last visible column**.
One table, sections in `SECTION_ORDER` ([887](index.html#L887)), each with a coloured header
band from `BAL_SECTION_META` ([1040](index.html#L1040)).

KPI aggregation ([713–715](index.html#L713-L715)):

- **Activos** = `activos` + `cxcobrar`
- **Pasivos** = `cxpagar` + `otros_pasivos` + `fondos_rd` + `fondos_usd`
- **Fondos Propios** = `fondos_propios`

Custodial accounts are already gone by this point — they never enter `_balData.sections`.

---

## Filters and grouping

The filter bar ([170–203](index.html#L170-L203)) has a from/to date pair, a quick-period
dropdown, and a monthly/quarterly/annual segmented control. Any change calls
`applyFilters()` ([490](index.html#L490)), which re-filters and re-renders all
three tabs — cheap enough at this data volume that nothing is memoised.

Transactions filter on the exact `Date`; the balance filters on year/month only
([689–699](index.html#L689-L699)), since its columns are whole months.

Quick periods ([341–357](index.html#L341-L357)): `all` uses the file's own span, everything
else is computed from **`new Date()` — today's real date**, not the data's range. See the
first entry under [Known limitations](#known-limitations).

---

## Known limitations

Ordered roughly by how likely they are to produce a wrong number in front of the Assembly.

### 1. Quick periods are computed from today, not from the data

`applyQuickPeriod()` ([472](index.html#L472)) builds every relative range from
`new Date()`. If the export ends before today — the normal case, since QBO data lags — then
"Últimos 3 meses" and friends select a window with no data in it, and the tabs render
"Sin datos". With the April 2026 sample opened in September 2026, every relative shortcut
except "Todo el archivo" comes up empty. Fix: anchor them to `_maxDate`.

### 2. `Depósito` rows are dropped entirely — 671 of 2,105 in the sample

`parseTx()` only recognises `Recibo de venta` and `Gasto`. Deposits are ignored, and in the
sample they include 22 rows posted to `Contribuciones de Creyentes` and 9 to
`De Asambleas Espirituales Locales` — real contributions missing from the Ingresos tab. The
other 398 hit `Fondos sin depositar`, which is the offset side of receipts already counted,
so this cannot be fixed by simply including all deposits. Needs a decision with the
treasurer on which types represent contribution income. `Factura` (3 rows) is dropped too.

### 3. ~~The balance parser is keyed to hardcoded row indices~~ — FIXED

Sections were mapped from hardcoded sheet row numbers, so adding or deleting one account in
QBO pushed every row below it into the wrong section, silently. Replaced with the
label-and-stack scheme described under [Rendering](#rendering); `BAL_HEADER_SECTION`
([1023](index.html#L1023)) is now the only place section membership is defined. Covered by
`tests/parse.test.mjs`.

### 4. ~~`BAL_SKIP` prefix-matching drops seven real account rows~~ — FIXED

`balIsSkip()` tested `startsWith`, so entries meant to catch section headers also swallowed
accounts whose names began the same way. Seven rows carrying real figures were discarded:
`Anticipos EBID`, `Cuentas por cobrar`, `Cuentas por Cobrar EBID`, `Cuentas por cobrar - USD`,
`Anticipos`, `Otras Fondos, Huquq` and `Fondos propios del saldo inicial`.

The effect on the KPIs was large: **Fondos Propios was showing roughly half its true value**
and receivables never appeared under Activos at all.

One of the seven, `Otras Fondos, Huquq`, turned out to be one the Assembly genuinely wants
excluded — but excluding it by name prefix, while keeping the bank account that holds it,
was the wrong way to get there. It is now excluded explicitly and symmetrically; see
[Custodial funds are excluded](#custodial-funds-are-excluded).

The prefix list is gone — a header is now identified by having no figures in it, not by how
its name starts, so an account may share a name with its section header. Each recovered row
has a named regression test, and `tests/render.test.mjs` asserts that Total Activos equals
banks plus receivables, and that Huquq lands in a section the Pasivos KPI sums.

### 5. ~~Negative amounts print without a minus sign~~ — FIXED

`fmt()` returned `Math.abs(n)`, leaving red text as the only indication that a figure was
negative — lost for a reader with a red-green colour deficiency, and lost again the moment
the new PDF is printed in greyscale. It now emits the sign. Colour is still there, as
reinforcement rather than as the sole carrier of meaning.

### 6. Expense categories mix operating expenses with fund transfers and non-expenses

`limpiarGasto()` cleans GL numbers but keeps colon paths verbatim, so the category list mixes
real cost lines (`Sueldos`, `Google Suite`) with disbursements from marked funds
(`Fondos Marcados:EBID`), balance-sheet accounts (`Cuentas por cobrar`, 61 rows;
`Cuenta Transitoria`), and — where column H is empty and the fallback picks up column G —
bank account names such as `Banco BPD -RD$ Ahorro - 4029 FN`. **Total Gastos** is therefore
not the Assembly's operating expenditure. Needs a classification agreed with the treasurer.

### 7. Contributor counts are exact-string distinct

`Set` membership on the raw `Nombre` field, so any spelling or accent variation
(`Fátima Baez` vs `Fátima Báez`) counts as two contributors. Both variants exist in the
sample. Needs at minimum accent-and-case normalisation.

### 8. Uploading the two files in the wrong boxes fails obscurely

Nothing checks which report is which — hence the plea in the user instructions. Swapping them
produces "No se encontró encabezado…" if you're lucky, or a nonsense report if you aren't.
Both files carry their report name in row 0 (`Lista de transacciones por fecha`, `Balance`),
so this is easy to validate.

### 9. Currency is assumed to be DOP throughout

Everything is labelled `RD$`, including the `Fondos Marcados Internacionales - USD` section.
Whether QBO exports those columns in DOP or USD has not been verified — see the
[format spec](docs/formato-archivos.md#currency).

### 10. Smaller items

- ~~**No export.**~~ There is a PDF download; see [Downloading a PDF](#downloading-a-pdf).
  There is still no Excel export, which is the better format if the Assembly wants to
  re-pivot the figures rather than read them.
- **Errors don't clear.** `showError()` ([1370](index.html#L1370)) reveals the message and
  nothing hides it again — a fixed retry leaves the stale error visible.
- **Half-implemented dark mode.** The charts read `prefers-color-scheme`
  ([535](index.html#L535), [643](index.html#L643)) but the page is hardcoded light, so dark-mode
  users get light-grey chart text on white.
- **Dead code.** `_txFile` / `_balFile` ([407](index.html#L407)) are unused, as is
  `buildPivot`'s `catKey` parameter ([503](index.html#L503)) and `renderBalance`'s
  `groupLabels` ([823](index.html#L823)). `BAL_SECTION_MAP` is gone, and `cxcobrar` — which
  it declared but never reached — is now a real section.
- ~~**No tests.**~~ `tests/` now covers the parsers and the render path — 24 assertions.
  Coverage is thin on the filter and grouping logic.
- **Assembly name is hardcoded** in two places ([135](index.html#L135),
  [161](index.html#L161)), so re-pointing the tool at another Assembly means editing markup.

---

## Downloading a PDF

The **⬇ Descargar PDF** button calls `window.print()`. The browser's own print-to-PDF keeps
the text as selectable vectors, adds no dependency, and has nothing in it to rot — where
`jsPDF` + `html2canvas` would have added ~1MB of vendored code to produce a rasterised
screenshot of the page.

`prepararImpresion()` reshapes the app into a document on `beforeprint`, and
`restaurarDespuesImpresion()` puts it back. Four things about this are not obvious, and
each of them was a bug first:

**Charts must be built while their tab is laid out.** Chart.js will not size a chart that
was constructed inside a `display:none` subtree — the canvas stays 0×0 and prints as an
empty box, and neither `resize()` nor `resize(w, h)` recovers it. Rebuilding at print time
fails differently: a chart created inside `beforeprint` has not painted when the page is
captured, so it prints blank anyway. Both charts are therefore constructed once at load
with `body.show-all-tabs` applied, which lays out all three tabs. A canvas keeps its
dimensions once its tab is hidden again, so printing then works from any tab, by button or
by Ctrl-P.

**Wide tables are split, not scaled.** Twenty-five monthly columns do not fit on landscape
A4. Scaling to fit seemed obvious and was wrong twice over: `beforeprint` runs while the
page is still laid out for the screen, so anything measured there describes the wrong
geometry, and the result was a table too small to read. `chunkWideTablesForPrint()` instead
emits successive blocks of `MAX_PRINT_COLS` periods, each repeating the account column and
the Total. No measurement, no scaling, type at full size.

**`break-inside: avoid` costs blank pages.** A card or column block taller than a sheet
turns that rule into an instruction the browser cannot honour, and Chrome answers with
empty pages — it was emitting several. Only `tr` and `.kpi` are kept whole now; the
repeated `<thead>` is what keeps a table readable when it does break.

**`beforeprint` fires after the button has already prepared.** Preparation therefore has to
be idempotent. It clears the previous run's chunk bookkeeping (`olvidarChunks()`) rather
than seeing a stale "already done" flag and skipping — which silently printed the
full-width table.

The page also prints what the filter bar would otherwise have told the reader:
`renderPrintMeta()` writes the period, the grouping and the generation date into the
document, since the filter bar itself does not print.

## Where to change things

| To change… | Go to |
|---|---|
| Income categories or their colours | `ING_CATS` ([373](index.html#L373)) + `categorizarIng()` ([437](index.html#L437)) |
| Which transaction types count | `parseTx()` ([970](index.html#L970)) |
| Expense category naming | `limpiarGasto()` ([445](index.html#L445)) |
| Balance sections / order / colours | `BAL_HEADER_SECTION` ([1023](index.html#L1023)), `BAL_SECTION_META` ([1040](index.html#L1040)), `SECTION_ORDER` ([887](index.html#L887)) |
| How subtotal / footer rows are recognised | `BAL_TOTAL_PREFIXES`, `BAL_FOOTER_PREFIXES` ([1038](index.html#L1038)) |
| Balance KPI composition | `ACTIVO_SECS` / `PASIVO_SECS` / `FONDOS_SECS` ([713–715](index.html#L713-L715)) |
| Quick-period definitions | `applyQuickPeriod()` ([472](index.html#L472)) |
| Currency or number formatting | `fmt()` / `fmtShort()` ([418](index.html#L418)) |
| Columns per block in the printed tables | `MAX_PRINT_COLS` |
| Anything about the PDF layout | the `@media print` block, and `prepararImpresion()` |
| Adding a tab | markup ([206–209](index.html#L206-L209)), `showTab()` ([462](index.html#L462)) — note it maps tabs to content by **array index**, so a new tab must be added to that array too |

Two conventions worth preserving: inline `onclick` handlers mean every referenced function
must stay global, and Chart.js instances must be `destroy()`ed before re-creation
([556](index.html#L556), [647](index.html#L647)) or the canvases leak.

---

## Docs in this repo

| Path | Contents |
|---|---|
| [`docs/instrucciones-usuario.md`](docs/instrucciones-usuario.md) | The Spanish instructions sent to the treasurer, verbatim, plus notes on which steps the parser depends on |
| [`docs/formato-archivos.md`](docs/formato-archivos.md) | Full spec of both QBO export formats: layout, columns, transaction types, account naming, row-index map, cell-value edge cases |
| [`docs/samples/README.md`](docs/samples/README.md) | What the sample exports are and why they aren't committed |
| `docs/samples/*.xlsx` | Real April 2026 exports — **local only**, gitignored |
| [`vendor/README.md`](vendor/README.md) | The two vendored libraries and why they aren't on a CDN |
| `tests/` | `harness.mjs` evaluates `index.html`'s script in Node; `parse.test.mjs` and `render.test.mjs` are the suites; `pdf-check.mjs` drives headless Chrome against the real PDF |

### A note on this repository being public

GitHub Pages serves the tool from this repo, so everything committed here is world-readable.
The sample exports are gitignored and must stay that way; `docs/formato-archivos.md`
deliberately documents structure and account naming only, with no contributor names and no
figures. Keep that line when adding documentation.
