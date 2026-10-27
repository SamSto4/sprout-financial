# Screenshot eval: `bench-haiku-r5` against `prompt-schema-haiku-r5`

| Measure | `bench-haiku-r5` | `prompt-schema-haiku-r5` |
|---|---|---|
| Model, effort | claude-haiku-5-5, low | claude-haiku-5-5, low |
| Reads that passed every check | 98 of 110 | 100 of 110 |
| Rows read exactly right | 67% (1264 of 1875) | 67% (1263 of 1875) |
| Rows with a field wrong | 31 | 32 |
| Rows missed | 580 | 580 |
| Rows made up | 0 | 0 |
| Pending or cut-off rows kept | 0 | 0 |
| Time per screenshot (median) | 2.9 s | 2.7 s |
| Cost per screenshot | $0.0009 | $0.0009 |

## Errors by type

| Error | `bench-haiku-r5` | `prompt-schema-haiku-r5` | Change |
|---|---|---|---|
| Date | 5 | 6 | +1 |
| Amount | 25 | 23 | -2 |
| Direction (money in or out) | 0 | 0 | 0 |
| Description | 0 | 6 | +6 |
| Ticker | 0 | 0 | 0 |
| Value | 0 | 0 | 0 |
| Asset type | 2 | 0 | -2 |
| Row missed | 580 | 580 | 0 |
| Row made up | 0 | 0 | 0 |
| Pending or cut-off row kept | 0 | 0 | 0 |

## Cases

| Case | Passed | Rows exact | Change in rows exact |
|---|---|---|---|
| `bank-app-checking` | 5 → 5 of 5 | 50 → 50 of 50 | 0 |
| `credit-card-statement` | 5 → 5 of 5 | 45 → 45 of 45 | 0 |
| `savings-injection` | 5 → 5 of 5 | 15 → 15 of 15 | 0 |
| `recipe-not-financial` | 5 → 5 of 5 | 0 → 0 of 0 | 0 |
| `brokerage-positions` | 5 → 5 of 5 | 25 → 25 of 25 | 0 |
| `retirement-app` | 5 → 5 of 5 | 15 → 15 of 15 | 0 |
| `transactions-as-holdings` | 5 → 5 of 5 | 0 → 0 of 0 | 0 |
| `dark-mode-bank` | 5 → 5 of 5 | 45 → 45 of 45 | 0 |
| `credit-union-debit-credit` | 5 → 5 of 5 | 60 → 60 of 60 | 0 |
| `uk-bank-day-first` | 5 → 5 of 5 | 50 → 50 of 50 | 0 |
| `german-bank-euro` | 5 → 5 of 5 | 40 → 40 of 40 | 0 |
| `long-scroll-capture` | 5 → 5 of 5 | 195 → 195 of 195 | 0 |
| `extra-tall-capture` | 0 → 0 of 5 | 311 → 308 of 340 | -3 |
| `month-long-capture` | 0 → 0 of 5 | 0 → 0 of 580 | 0 |
| `cut-off-rows` | 5 → 5 of 5 | 45 → 45 of 45 | 0 |
| `notification-banner` | 5 → 5 of 5 | 45 → 45 of 45 | 0 |
| `dense-desktop-statement` | 5 → 5 of 5 | 160 → 160 of 160 | 0 |
| `long-merchant-names` | 5 → 5 of 5 | 35 → 35 of 35 | 0 |
| `travel-card-foreign-currency` | 5 → 5 of 5 | 35 → 35 of 35 | 0 |
| `positions-cost-basis` | 5 → 5 of 5 | 35 → 35 of 35 | 0 |
| `401k-names-only` | 5 → 5 of 5 | 25 → 25 of 25 | 0 |
| `trading-app-crypto` | 3 → 5 of 5 | 33 → 35 of 35 | +2 |

Each case ran 5 times on each side, and the model doesn't read a screen the same way every time: a change of one run in one case, or a few rows in a long capture, is within the noise. Look for changes that hold across runs and cases, and for new errors of a kind the base run didn't have.
