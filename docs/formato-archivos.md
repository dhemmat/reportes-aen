# Input file formats (QBO exports)

Reference for the two `.xlsx` files the tool consumes. Derived from the April 2026
exports kept in [`samples/`](samples/) (not committed — see [`samples/README.md`](samples/README.md)).

Both files are read with SheetJS using `XLSX.read(data, {type:'array', raw:true})` and
only **the first worksheet** (`wb.SheetNames[0]`, named `Sheet1` in both exports) is used.
`raw:true` matters: it keeps QBO's text dates as strings instead of letting SheetJS coerce
them, which is what `parseFecha()` expects.

---

## 1. "Lista de transacciones por fecha" → `Transacciones.xlsx`

### Layout

Four preamble rows, then a header row, then data, then a total row and a timestamp footer.

| Row | Content |
|-----|---------|
| 0 | `Lista de transacciones por fecha` (report title) |
| 1 | Organization name |
| 2 | Date range (e.g. `All Dates`) |
| 3 | blank |
| 4 | **Header row** — located by scanning column A for the literal `Fecha` |
| 5 … n | Data rows |
| n+1 | `TOTAL` in column A, `#VALUE!` in column I |
| n+2 … | blank rows, then `<space>Tuesday, 14 April 2026 08:32 PM GMT-04:00` |

The header row is found by search, not by a fixed index, so extra preamble rows are tolerated.
Columns, however, are read by **fixed index** — a reordered export breaks the parse silently.

### Columns

| Idx | Letter | QBO header | Used as |
|-----|--------|-----------|---------|
| 0 | A | `Fecha` | `iFecha` — transaction date, string `dd/mm/yyyy` |
| 1 | B | `Tipo de transacción` | `iTipo` — routes the row to income / expense / ignored |
| 2 | C | `Número` | not used |
| 3 | D | `Contabilización (S/N)` | not used |
| 4 | E | `Nombre` | `iNombre` — contributor name, used for the unique-contributor counts |
| 5 | F | `Notas` | not used |
| 6 | G | `Nombre de la cuenta` | `iCuenta` — **fallback** category source when column H is empty |
| 7 | H | `Nombre completo de la cuenta` | `iCC` — primary category source |
| 8 | I | `Importe` | `iImporte` — amount; a `float`, or `None` on journal-entry rows |

### Transaction types present in the sample (2,105 data rows)

| `Tipo de transacción` | Rows | Amount sign | How the tool treats it |
|---|---|---|---|
| `Gasto` | 701 | always negative | **Expense** (`_gasRows`), stored as `Math.abs()` |
| `Depósito` | 671 | always positive | **Ignored entirely** |
| `Recibo de venta` | 586 | positive (1 zero) | **Income** (`_txRows`) |
| `Asiento de diario` | 144 | `Importe` empty | Ignored (dropped by the `isNaN(monto)` guard) |
| `Factura` | 3 | positive | **Ignored entirely** |

Matching is substring and case-insensitive: `tipo.includes('recibo')` and `tipo.includes('gasto')`.
Both guards also require the expected sign, so a credit memo booked as a negative
`Recibo de venta` would be dropped rather than netted.

### Account-name conventions

Column H mixes three shapes, which is why the category cleanup is messy:

1. **Numbered GL accounts** — `6100019 Reuniones AEN`, `4100003 De Asambleas Espirituales Locales`.
   `limpiarGasto()` strips the leading digits with `/^\d+\s+/`.
2. **Unnumbered accounts** — `Cargos Bancarios`, `Mantenimientos`, `Contribuciones de Creyentes`.
3. **Colon-delimited sub-accounts** — `Fondos Marcados:EBID`,
   `Fondos Marcados Internacionales - USD:F. Instituto`. The colon path is **kept verbatim**,
   so these show up as their own expense categories alongside the cleaned ones.

Column H is empty on 64 of the `Recibo de venta` rows and 9 of the `Gasto` rows. The fallback
to column G then picks up whatever account the transaction hit — usually
`Fondos sin depositar` for receipts and a bank account name for expenses.

### Income categorisation

`categorizarIng()` runs case-insensitive substring tests, first match wins:

| Test on the account string | Bucket |
|---|---|
| contains `consejeros` or `continental` | `Cuerpo Continental de Consejeros` |
| contains `asambleas` or `locales` | `De Asambleas Espirituales Locales` |
| contains `creyentes` | `Contribuciones de Creyentes` |
| anything else (incl. empty) | `Otras Contribuciones` |

Sample distribution: 433 Creyentes, 57 Asambleas, 5 Consejeros, 90 Otras. The 90 "Otras"
break down as 64 × `Fondos sin depositar`, 14 × `Anticipos`, 7 × `Otros ingresos varios`,
5 × `Services`.

Note the `continental` test also matches `Fondo Continental`, a marked fund, not a
Counsellors contribution — the order of the tests makes this ambiguity reachable.

### Date parsing

`parseFecha()` matches `^(\d{1,2})\/(\d{1,2})\/(\d{4})$` and reads it as **day/month/year**
(`new Date(+m[3], +m[2]-1, +m[1])`). Anything else falls through to `new Date(s)`, which
applies US month-first rules — so an export in a different locale would silently transpose
days and months for the first twelve days of each month.

---

## 2. "Balance General" → `Balance.xlsx`

Must be run with **"Mostrar columnas por" = Mes**. The tool reads one column per month;
a single-date balance sheet has nothing to read.

### Layout

| Row | Content |
|-----|---------|
| 0 | `Balance` |
| 1 | Organization name |
| 2 | `Todas las fechas` |
| 3 | blank |
| 4 | **Header row** — column A empty, columns B onward hold month labels |
| 5 … 76 | Account rows, section headers and `Total para …` rows, interleaved |
| 77 … 79 | blank |
| 80 | `Accrual Basis Tuesday, 14 April 2026 08:33 PM GMT-04:00` |

### Header-row detection

`parseBalance()` accepts two shapes, in this order:

1. **Old format** — column A contains `cuenta de distribu…`.
2. **New format** — column A is empty **and** column B matches
   `/^[a-záéíóúü]+\.?\s+\d{4}$/i`, e.g. `abr. 2024`.

The second branch was added in commit `2240993` ("fix balance parser for new QBO export
format"). The sample file uses it.

### Month columns

25 columns in the sample, `abr. 2024` through `abr. 2026`, one per month, no gaps.
`parseBalMonth()` splits the label on whitespace after stripping periods and looks the
month up in a table that accepts both the full name and the abbreviation
(`enero`/`ene`, `abril`/`abr`, `septiembre`/`sep`/`sept`, …). A label it cannot parse still
becomes a column, but with `yr: null` / `mo: null`, which excludes it from grouping and
date filtering.

### Row classification

Sections are derived from the sheet's **own header labels**, never from row position:

- A row with **no numeric cells** in any month column is a section header. It is pushed onto
  a stack of open sections.
- A row whose label starts with `Total para ` (or `Total for `) closes that section: pop
  until the matching label has been popped, which also closes anything still open inside it.
- Any other row is an account. It belongs to the deepest **recognised** section on the
  stack, per `BAL_HEADER_SECTION` in `index.html`.

Recognised header labels and the sections they open:

| Sheet label (lowercased) | Section |
|---|---|
| `activos`, `activos corrientes` | `activos` |
| `cuentas por cobrar` | `cxcobrar` |
| `cuentas por pagar`, `otras` | `cxpagar` |
| `pasivos corrientes` | `otros_pasivos` |
| `fondos marcados` | `fondos_rd` |
| `fondos marcados internacionales - usd` | `fondos_usd` |
| `fondos propios` | `fondos_propios` |

`pasivos y fondos propios` and `pasivos no corrientes` are containers with no section of
their own; accounts never sit directly under them in this export, and if one did it would
inherit the nearest recognised ancestor.

Against the sample export this recovers **51 account rows in 7 sections** with nothing
unclassified, and the stack empties cleanly at the end of the sheet — which is the check
that proves the push/pop pairs are balanced.

Two properties worth preserving if you touch this:

- **An account may share a name with its section header.** Row 7 is the `Cuentas por cobrar`
  header and row 9 is an account also called `Cuentas por cobrar`; they are distinguished by
  whether the row carries figures, not by name. An earlier prefix-matching version dropped
  the account.
- **Nothing is discarded quietly.** A row that lands under no recognised section is
  collected in `_balData.unknown` for the UI to report, and `parseBalance` throws outright
  if it finds no accounts at all — a loud failure is worth more than a plausible wrong
  number.

### Cell values

Month cells arrive as:

- **`float`** — a normal balance.
- **`None` / empty** — account didn't exist that month → stored as `null`, rendered `—`.
- **`'#VALUE!'`** — QBO subtotal formulas Excel couldn't evaluate. Filtered out by the
  `v.includes('#') || v.includes('VALUE')` test.
- **`datetime`** — subtotal cells Excel mistyped as serial dates (rows 12, 31, 32, 49, 75
  in the sample). These all sit on `Total para …` rows, which are recognised by their label
  before their cells are read. `balRowValues()` also maps any `Date` to `null` as a
  belt-and-braces guard. Note SheetJS with `raw:true` hands these back as raw serial
  *numbers* rather than `Date` objects, so the label check is what actually protects here.

### Custodial accounts

Two accounts in this export hold Ḥuqúqu'lláh, which the Assembly administers but does not
own, and which is excluded from the whole report:

| Sheet label | Role |
|---|---|
| `Otras Fondos, Huquq` | the fund liability |
| `Banco SB Huquh - Ahorro - 0953` | the bank account holding it |

Note the two different spellings — `Huquq` for the fund, `Huquh` for the bank account — which
is why the match is the substring `huqu` rather than either full name.

The two mirror each other month to month, though not exactly: in the sample the liability
runs slightly ahead of the cash, and for one month a large transfer sits in a different bank
account at the month-end boundary. That difference is a discrepancy in the source books, not
a parsing artifact, and it shows up as the residual in the
`Activos − Pasivos = Fondos Propios` check.

In the transactions export, custodial money appears under either account column, since it
sometimes moves through a bank account that is not itself custodial. No transaction in the
sample pairs a custodial account with a legitimate category, so matching on either column
does not risk dropping real activity — worth re-checking if the chart of accounts changes.

### Sign convention

Liability sections (`fondos_rd`, `fondos_usd`, `cxpagar`, `otros_pasivos`) are exported as
**positive** numbers, and negative values inside them mean an overdrawn fund. `fmt()` prints
`Math.abs(n)`, so the minus sign is dropped and the sign is conveyed only by red text.

### Currency

The `Fondos Marcados Internacionales - USD` section is named for USD, but the balance-sheet
values appear to be in the company's home currency. Every figure in the UI is labelled `RD$`
unconditionally. **This has not been confirmed against QBO** — worth verifying with the
treasurer before relying on the Balance tab's USD-fund figures.
