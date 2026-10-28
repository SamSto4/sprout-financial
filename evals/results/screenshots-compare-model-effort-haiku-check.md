# Screenshot eval: `bench-haiku` against `model-effort-haiku-check`

- Different second reads for holdings that don't add up: `none` and `claude-sonnet-5-5`.

| Measure | `bench-haiku` | `model-effort-haiku-check` |
|---|---|---|
| Model, effort | claude-haiku-5-5, low | claude-haiku-5-5, low |
| Reads that passed every check | 57 of 66 | 58 of 66 |
| Rows read exactly right | 67% (755 of 1125) | 67% (755 of 1125) |
| Rows with a field wrong | 22 | 22 |
| Rows missed | 348 | 348 |
| Rows made up | 0 | 0 |
| Pending or cut-off rows kept | 0 | 0 |
| Time per screenshot (median) | 2.8 s | 2.8 s |
| Cost per screenshot | $0.0009 | $0.0009 |
| Read a second time (rows didn't add up) | 0 | 0 |

## Errors by type

| Error | `bench-haiku` | `model-effort-haiku-check` | Change |
|---|---|---|---|
| Date | 2 | 9 | +7 |
| Amount | 16 | 15 | -1 |
| Direction (money in or out) | 0 | 0 | 0 |
| Description | 0 | 0 | 0 |
| Ticker | 0 | 0 | 0 |
| Value | 3 | 0 | -3 |
| Asset type | 3 | 2 | -1 |
| Row missed | 348 | 348 | 0 |
| Row made up | 0 | 0 | 0 |
| Pending or cut-off row kept | 0 | 0 | 0 |

## Cases

| Case | Passed | Rows exact | Change in rows exact |
|---|---|---|---|
| `bank-app-checking` | 3 → 3 of 3 | 30 → 30 of 30 | 0 |
| `credit-card-statement` | 3 → 3 of 3 | 27 → 27 of 27 | 0 |
| `savings-injection` | 3 → 3 of 3 | 9 → 9 of 9 | 0 |
| `recipe-not-financial` | 3 → 3 of 3 | 0 → 0 of 0 | 0 |
| `brokerage-positions` | 3 → 3 of 3 | 15 → 15 of 15 | 0 |
| `retirement-app` | 3 → 3 of 3 | 9 → 9 of 9 | 0 |
| `transactions-as-holdings` | 3 → 3 of 3 | 0 → 0 of 0 | 0 |
| `dark-mode-bank` | 3 → 3 of 3 | 27 → 27 of 27 | 0 |
| `credit-union-debit-credit` | 3 → 3 of 3 | 36 → 36 of 36 | 0 |
| `uk-bank-day-first` | 3 → 3 of 3 | 30 → 30 of 30 | 0 |
| `german-bank-euro` | 3 → 3 of 3 | 24 → 24 of 24 | 0 |
| `long-scroll-capture` | 3 → 3 of 3 | 117 → 117 of 117 | 0 |
| `extra-tall-capture` | 0 → 0 of 3 | 188 → 184 of 204 | -4 |
| `month-long-capture` | 0 → 0 of 3 | 0 → 0 of 348 | 0 |
| `cut-off-rows` | 3 → 3 of 3 | 27 → 27 of 27 | 0 |
| `notification-banner` | 3 → 3 of 3 | 27 → 27 of 27 | 0 |
| `dense-desktop-statement` | 3 → 3 of 3 | 96 → 96 of 96 | 0 |
| `long-merchant-names` | 3 → 3 of 3 | 21 → 21 of 21 | 0 |
| `travel-card-foreign-currency` | 3 → 3 of 3 | 21 → 21 of 21 | 0 |
| `positions-cost-basis` | 3 → 3 of 3 | 21 → 21 of 21 | 0 |
| `401k-names-only` | 3 → 3 of 3 | 15 → 15 of 15 | 0 |
| `trading-app-crypto` | 0 → 1 of 3 | 15 → 19 of 21 | +4 |

Each case ran 3 times on each side, and the model doesn't read a screen the same way every time: a change of one run in one case, or a few rows in a long capture, is within the noise. Look for changes that hold across runs and cases, and for new errors of a kind the base run didn't have.
