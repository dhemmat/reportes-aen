# Sample QBO exports

Two real exports from QuickBooks Online, dated 14 April 2026, used to develop and test
the parsers:

| File | QBO report | Contents |
|---|---|---|
| `Transacciones.xlsx` | Lista de transacciones por fecha | 2,105 data rows, Apr 2024 – Apr 2026 |
| `Balance.xlsx` | Balance General, columnas por mes | 72 account rows × 25 monthly columns, `abr. 2024` – `abr. 2026` |

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
