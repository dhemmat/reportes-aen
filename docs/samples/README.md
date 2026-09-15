# Sample QBO exports

Real exports from QuickBooks Online, used to develop and test the parsers. **Two
generations**, because QBO changed the format between them and both must keep working —
the tests run against both, and `tests/pdf-check.mjs` renders a PDF from each.

| File | QBO report | Contents |
|---|---|---|
| `Transacciones.xlsx` | Lista de transacciones por fecha | 14 Apr 2026 export · Apr 2024 – Apr 2026 |
| `Balance.xlsx` | Balance General, columnas por mes | 14 Apr 2026 export · 25 monthly columns |
| `Transacciones-2026-09.xlsx` | Lista de transacciones por fecha | 14 Sep 2026 export · Apr 2024 – Aug 2026 |
| `Balance-2026-09.xlsx` | Balance General, columnas por mes | 14 Sep 2026 export · 29 monthly columns |

What changed between the two is catalogued in
[`../formato-archivos.md`](../formato-archivos.md#differences-between-export-generations).
If you add a third generation, name it by its export date and add it to `GENERATIONS` in
`tests/parse.test.mjs` and `tests/pdf-check.mjs` — that is all the wiring there is.

## These files are not committed

They contain contributor names and the Assembly's account balances, and this repository is
public (it serves the tool via GitHub Pages at `dhemmat.github.io/reportes-aen`). They are
excluded by the `*.xlsx` rule in [`.gitignore`](../../.gitignore) and must stay that way.

Anyone picking the project up needs to obtain fresh exports from the treasurer following
[`../instrucciones-usuario.md`](../instrucciones-usuario.md). The structure they need to
match is documented in [`../formato-archivos.md`](../formato-archivos.md), which deliberately
records layout and account naming only — no names and no figures.

## Regenerating them

Follow steps 1 and 2 of [`../instrucciones-usuario.md`](../instrucciones-usuario.md). For the
Balance General, "Mostrar columnas por" **must** be set to `Mes`. Use the widest date range
available so the samples exercise the multi-year grouping paths.
