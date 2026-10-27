# Screenshot import eval

Run on 2026-10-27 against `claude-sonnet-5-5` at effort `low`. 3 screenshots, 3 runs each.

**9 of 9 reads passed every check.**

| Measure | Result |
|---|---|
| Rows read exactly right | 100% (669 of 669) |
| Rows read with a field wrong | 0 |
| Rows missed | 0 |
| Rows made up | 0 |
| Pending or cut-off rows kept | 0 |
| Time per screenshot | 17.4 s median, 28.2 s p95 |
| Cost per screenshot | $0.0844 |

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
| `long-scroll-capture` | 3 of 3 | 117 of 117 | none | 0 | 0 | 0 | A scrolling capture three phone screens tall, shrunk by the browser to 358 px wide before upload: every one of its rows, at a third of the usual resolution. |
| `extra-tall-capture` | 3 of 3 | 204 of 204 | none | 0 | 0 | 0 | A scrolling capture over five phone screens tall, shrunk to 218 px wide: tiny text and many rows. |
| `month-long-capture` | 3 of 3 | 348 of 348 | none | 0 | 0 | 0 | A month of activity in one scrolling capture about nine phone screens tall, shrunk to 132 px wide: where shrinking the whole capture into one image stops working. |

## Failures

None.
