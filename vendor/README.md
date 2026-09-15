# Vendored dependencies

Committed on purpose. The tool has to keep working untouched for years, so it must not
depend on a CDN being up, unchanged, and serving the same bytes at runtime.

| File | Library | Version | Source |
|---|---|---|---|
| `xlsx.full.min.js` | SheetJS | 0.18.5 | `https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js` |
| `chart.umd.min.js` | Chart.js | 4.4.0 | `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js` |

Don't upgrade these without a reason. Nothing about the tool improves with a newer
SheetJS, and an upgrade is the most likely way to break parsing that currently works.
If you do upgrade, run `node --test tests/*.test.mjs` against real exports first.

`tests/harness.mjs` loads `xlsx.full.min.js` from here too, so the tests exercise the
exact bytes the browser does.
