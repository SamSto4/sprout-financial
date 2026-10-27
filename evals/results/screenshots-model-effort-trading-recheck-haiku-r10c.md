# Screenshot import eval

Run on 2026-10-27 against `claude-haiku-5-5` at effort `low`, holdings that don't add up read again with `claude-haiku-5-5`. 1 screenshots, 10 runs each.

**2 of 10 reads passed every check.**

| Measure | Result |
|---|---|
| Rows read exactly right | 81% (57 of 70) |
| Rows read with a field wrong | 13 |
| Rows missed | 0 |
| Rows made up | 0 |
| Pending or cut-off rows kept | 0 |
| Time per screenshot | 4.1 s median, 8.8 s p95 |
| Cost per screenshot | $0.0011 |
| Read a second time (rows didn't add up) | 1 |

## Errors by type

Totals over every run. A row with two fields wrong counts once for each.

| Error | Count | Where |
|---|---|---|
| Date | 0 | - |
| Amount | 0 | - |
| Direction (money in or out) | 0 | - |
| Description | 0 | - |
| Ticker | 0 | - |
| Value | 3 | `trading-app-crypto` 3 |
| Asset type | 10 | `trading-app-crypto` 10 |
| Row missed | 0 | - |
| Row made up | 0 | - |
| Pending or cut-off row kept | 0 | - |

## Cases

| Case | Passed | Rows exact | Fields wrong | Missed | Made up | Kept | What it checks |
|---|---|---|---|---|---|---|---|
| `trading-app-crypto` | 2 of 10 | 57 of 70 | value 3, type 10 | 0 | 0 | 0 | A trading app with Stocks, ETFs, Crypto and Cash headings: stocks and the ETF show only shares and share price (the value is worked out in code, not by the model), crypto shows its value, and the headings say what each holding is. |

## Failures

### `trading-app-crypto` (run 1)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

### `trading-app-crypto` (run 2)

- **Reads every holding with the right value and type**: NVDA: type wrong (got NVDA 1708.8 other, expected NVDA 1708.8 single-stock); TSLA: type wrong (got TSLA 753.9 other, expected TSLA 753.9 single-stock); SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

### `trading-app-crypto` (run 4)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

### `trading-app-crypto` (run 5)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

### `trading-app-crypto` (run 6)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

### `trading-app-crypto` (run 7)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto); NVDA: value wrong (got NVDA 0 single-stock, expected NVDA 1708.8 single-stock); TSLA: value wrong (got TSLA 0 single-stock, expected TSLA 753.9 single-stock); VOO: value wrong (got VOO 0 us-stocks, expected VOO 2466.54 us-stocks)

### `trading-app-crypto` (run 8)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

### `trading-app-crypto` (run 9)

- **Reads every holding with the right value and type**: SOL: type wrong (got SOL 1104.22 other, expected SOL 1104.22 crypto)

