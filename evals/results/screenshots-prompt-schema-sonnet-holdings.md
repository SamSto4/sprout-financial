# Screenshot import eval

Run on 2026-10-27 against `claude-sonnet-5-5` at effort `low`. 6 screenshots, 3 runs each.

**18 of 18 reads passed every check.**

| Measure | Result |
|---|---|
| Rows read exactly right | 100% (81 of 81) |
| Rows read with a field wrong | 0 |
| Rows missed | 0 |
| Rows made up | 0 |
| Pending or cut-off rows kept | 0 |
| Time per screenshot | 3.2 s median, 4.3 s p95 |
| Cost per screenshot | $0.0148 |

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
| `brokerage-positions` | 3 of 3 | 15 of 15 | none | 0 | 0 | 0 | A positions table: values (not the day's change) read exactly, the cash core position kept, pending activity and the total left out. |
| `positions-cost-basis` | 3 of 3 | 21 of 21 | none | 0 | 0 | 0 | A positions table with the cost basis and gains right beside the market value, a cash line with no symbol, and an account total: the market value is the one read. |
| `retirement-app` | 3 of 3 | 9 of 9 | none | 0 | 0 | 0 | A 401(k) app: funds with tickers are read, and the fund shown by name only isn't given an invented ticker. |
| `transactions-as-holdings` | 3 of 3 | 0 of 0 | none | 0 | 0 | 0 | A transactions screenshot added on the Portfolio page is recognized as the wrong kind, with no holdings made up. |
| `401k-names-only` | 3 of 3 | 15 of 15 | none | 0 | 0 | 0 | A 401(k) app naming its funds with no tickers, a percentage beside each value: the values are read, and no ticker is worked out from a name. |
| `trading-app-crypto` | 3 of 3 | 21 of 21 | none | 0 | 0 | 0 | A trading app with Stocks, ETFs, Crypto and Cash headings: stocks and the ETF show only shares and share price (the value is worked out in code, not by the model), crypto shows its value, and the headings say what each holding is. |

## Failures

None.
