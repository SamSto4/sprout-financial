# Screenshot import eval

Run on 2026-10-27 against `claude-haiku-5-5` at effort `low`, holdings that don't add up read again with `off`. 1 screenshots, 10 runs each.

**3 of 10 reads passed every check.**

| Measure | Result |
|---|---|
| Rows read exactly right | 90% (63 of 70) |
| Rows read with a field wrong | 7 |
| Rows missed | 0 |
| Rows made up | 0 |
| Pending or cut-off rows kept | 0 |
| Time per screenshot | 4.1 s median, 5.2 s p95 |
| Cost per screenshot | $0.0010 |
| Read a second time (rows didn't add up) | 0 |

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
| Asset type | 7 | `trading-app-crypto` 7 |
| Row missed | 0 | - |
| Row made up | 0 | - |
| Pending or cut-off row kept | 0 | - |

## Cases

| Case | Passed | Rows exact | Fields wrong | Missed | Made up | Kept | What it checks |
|---|---|---|---|---|---|---|---|
| `trading-app-crypto` | 3 of 10 | 63 of 70 | type 7 | 0 | 0 | 0 | A trading app with Stocks, ETFs, Crypto and Cash headings: stocks and the ETF show only shares and share price (the value is worked out in code, not by the model), crypto shows its value, and the headings say what each holding is. |

## Failures

### `trading-app-crypto` (run 2)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

### `trading-app-crypto` (run 3)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

### `trading-app-crypto` (run 4)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

### `trading-app-crypto` (run 5)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

### `trading-app-crypto` (run 6)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

### `trading-app-crypto` (run 8)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

### `trading-app-crypto` (run 10)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

