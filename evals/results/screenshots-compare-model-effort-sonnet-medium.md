# Screenshot eval: `bench-sonnet` against `model-effort-sonnet-medium`

- Different effort: `low` and `medium`.

| Measure | `bench-sonnet` | `model-effort-sonnet-medium` |
|---|---|---|
| Model, effort | claude-sonnet-5-5, low | claude-sonnet-5-5, medium |
| Reads that passed every check | 60 of 66 | 60 of 66 |
| Rows read exactly right | 68% (769 of 1125) | 69% (771 of 1125) |
| Rows with a field wrong | 8 | 6 |
| Rows missed | 348 | 348 |
| Rows made up | 0 | 0 |
| Pending or cut-off rows kept | 0 | 0 |
| Time per screenshot (median) | 3.5 s | 3.7 s |
| Cost per screenshot | $0.0167 | $0.0167 |

## Errors by type

| Error | `bench-sonnet` | `model-effort-sonnet-medium` | Change |
|---|---|---|---|
| Date | 0 | 0 | 0 |
| Amount | 8 | 6 | -2 |
| Direction (money in or out) | 0 | 0 | 0 |
| Description | 0 | 0 | 0 |
| Ticker | 0 | 0 | 0 |
| Value | 0 | 0 | 0 |
| Asset type | 0 | 0 | 0 |
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
| `extra-tall-capture` | 0 → 0 of 3 | 196 → 198 of 204 | +2 |
| `month-long-capture` | 0 → 0 of 3 | 0 → 0 of 348 | 0 |
| `cut-off-rows` | 3 → 3 of 3 | 27 → 27 of 27 | 0 |
| `notification-banner` | 3 → 3 of 3 | 27 → 27 of 27 | 0 |
| `dense-desktop-statement` | 3 → 3 of 3 | 96 → 96 of 96 | 0 |
| `long-merchant-names` | 3 → 3 of 3 | 21 → 21 of 21 | 0 |
| `travel-card-foreign-currency` | 3 → 3 of 3 | 21 → 21 of 21 | 0 |
| `positions-cost-basis` | 3 → 3 of 3 | 21 → 21 of 21 | 0 |
| `401k-names-only` | 3 → 3 of 3 | 15 → 15 of 15 | 0 |
| `trading-app-crypto` | 3 → 3 of 3 | 21 → 21 of 21 | 0 |

Each case ran 3 times on each side, and the model doesn't read a screen the same way every time: a change of one run in one case, or a few rows in a long capture, is within the noise. Look for changes that hold across runs and cases, and for new errors of a kind the base run didn't have.
