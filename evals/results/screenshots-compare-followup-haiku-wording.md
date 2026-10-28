# Screenshot eval: `followup-haiku` against `followup-haiku-wording`

| Measure | `followup-haiku` | `followup-haiku-wording` |
|---|---|---|
| Model, effort | claude-haiku-5-5, low | claude-haiku-5-5, low |
| Reads that passed every check | 72 of 75 | 75 of 75 |
| Rows read exactly right | 98% (1185 of 1206) | 100% (1206 of 1206) |
| Rows with a field wrong | 21 | 0 |
| Rows missed | 0 | 0 |
| Rows made up | 0 | 0 |
| Pending or cut-off rows kept | 0 | 0 |
| Time per screenshot (median) | 3.2 s | 3 s |
| Cost per screenshot | $0.0013 | $0.0013 |
| Holdings reads the review warned don't add up | 6 (`trading-app-equity` 3, `partial-holdings-list` 3; 3 of them wrong) | 3 (`partial-holdings-list` 3; 0 of them wrong) |

## Errors by type

| Error | `followup-haiku` | `followup-haiku-wording` | Change |
|---|---|---|---|
| Date | 0 | 0 | 0 |
| Amount | 0 | 0 | 0 |
| Direction (money in or out) | 0 | 0 | 0 |
| Description | 0 | 0 | 0 |
| Ticker | 0 | 0 | 0 |
| Value | 21 | 0 | -21 |
| Asset type | 0 | 0 | 0 |
| Row missed | 0 | 0 | 0 |
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
| `extra-tall-capture` | 3 → 3 of 3 | 204 → 204 of 204 | 0 |
| `month-long-capture` | 3 → 3 of 3 | 348 → 348 of 348 | 0 |
| `cut-off-rows` | 3 → 3 of 3 | 27 → 27 of 27 | 0 |
| `notification-banner` | 3 → 3 of 3 | 27 → 27 of 27 | 0 |
| `dense-desktop-statement` | 3 → 3 of 3 | 96 → 96 of 96 | 0 |
| `long-merchant-names` | 3 → 3 of 3 | 21 → 21 of 21 | 0 |
| `travel-card-foreign-currency` | 3 → 3 of 3 | 21 → 21 of 21 | 0 |
| `positions-cost-basis` | 3 → 3 of 3 | 21 → 21 of 21 | 0 |
| `401k-names-only` | 3 → 3 of 3 | 15 → 15 of 15 | 0 |
| `trading-app-crypto` | 3 → 3 of 3 | 21 → 21 of 21 | 0 |
| `trading-app-equity` | 0 → 3 of 3 | 3 → 24 of 24 | +21 |
| `partial-holdings-list` | 3 → 3 of 3 | 18 → 18 of 18 | 0 |
| `positions-4k-desktop` | 3 → 3 of 3 | 39 → 39 of 39 | 0 |

Each case ran 3 times on each side, and the model doesn't read a screen the same way every time: a change of one run in one case, or a few rows in a long capture, is within the noise. Look for changes that hold across runs and cases, and for new errors of a kind the base run didn't have.
