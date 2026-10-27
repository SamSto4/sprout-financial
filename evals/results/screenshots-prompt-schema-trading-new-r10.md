# Screenshot import eval

Run on 2026-10-27 against `claude-haiku-5-5` at effort `low`. 1 screenshots, 10 runs each.

**10 of 10 reads passed every check.**

| Measure | Result |
|---|---|
| Rows read exactly right | 100% (70 of 70) |
| Rows read with a field wrong | 0 |
| Rows missed | 0 |
| Rows made up | 0 |
| Pending or cut-off rows kept | 0 |
| Time per screenshot | 2.3 s median, 2.3 s p95 |
| Cost per screenshot | $0.0008 |

## Errors by type

Totals over every run. A row with two fields wrong counts once for each.

| Error | Count | Where |
|---|---|---|
| Date | 0 | - |
| Amount | 0 | - |
| Direction (money in or out) | 0 | - |
| Description | 0 | - |
| Ticker | 0 | - |
| Value | 0 | - |
| Asset type | 0 | - |
| Row missed | 0 | - |
| Row made up | 0 | - |
| Pending or cut-off row kept | 0 | - |

## Cases

| Case | Passed | Rows exact | Fields wrong | Missed | Made up | Kept | What it checks |
|---|---|---|---|---|---|---|---|
| `trading-app-crypto` | 10 of 10 | 70 of 70 | none | 0 | 0 | 0 | A trading app with Stocks, ETFs, Crypto and Cash headings: stocks and the ETF show only shares and share price (the value is worked out in code, not by the model), crypto shows its value, and the headings say what each holding is. |

## Failures

None.
