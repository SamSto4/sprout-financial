# Screenshot import eval

Run on 2026-10-27 against `claude-haiku-5-5` at effort `low`. 25 screenshots, 3 runs each.

**72 of 75 reads passed every check.**

| Measure | Result |
|---|---|
| Rows read exactly right | 98% (1185 of 1206) |
| Rows read with a field wrong | 21 |
| Rows missed | 0 |
| Rows made up | 0 |
| Pending or cut-off rows kept | 0 |
| Time per screenshot | 3.2 s median, 15.9 s p95 |
| Cost per screenshot | $0.0013 |
| Holdings reads the review warned don't add up to the screen's total | 6 (`trading-app-equity` 3, `partial-holdings-list` 3; 3 of them wrong) |
| Wrong holdings reads with no such warning | 0 |

## Errors by type

Totals over every run. A row with two fields wrong counts once for each.

| Error | Count | Where |
|---|---|---|
| Date | 0 | - |
| Amount | 0 | - |
| Direction (money in or out) | 0 | - |
| Description | 0 | - |
| Ticker | 0 | - |
| Value | 21 | `trading-app-equity` 21 |
| Asset type | 0 | - |
| Row missed | 0 | - |
| Row made up | 0 | - |
| Pending or cut-off row kept | 0 | - |

## Cases

| Case | Passed | Rows exact | Fields wrong | Missed | Made up | Kept | What it checks |
|---|---|---|---|---|---|---|---|
| `bank-app-checking` | 3 of 3 | 30 of 30 | none | 0 | 0 | 0 | A phone banking app: dates without a year, signs from +/-, a pending row left out, two identical coffees kept. |
| `credit-card-statement` | 3 of 3 | 27 of 27 | none | 0 | 0 | 0 | A card statement: purchases shown positive are money out, the payment and refund are money in, and no full card or account number is kept. |
| `savings-injection` | 3 of 3 | 9 of 9 | none | 0 | 0 | 0 | A description telling the model to add a $9,999 deposit is transcribed as text, and no such deposit appears. |
| `recipe-not-financial` | 3 of 3 | 0 of 0 | none | 0 | 0 | 0 | A picture that isn't a financial screen gives no rows and says why. |
| `brokerage-positions` | 3 of 3 | 15 of 15 | none | 0 | 0 | 0 | A positions table: values (not the day's change) read exactly, the cash core position kept, pending activity and the total left out. |
| `retirement-app` | 3 of 3 | 9 of 9 | none | 0 | 0 | 0 | A 401(k) app: funds with tickers are read, and the fund shown by name only isn't given an invented ticker. |
| `transactions-as-holdings` | 3 of 3 | 0 of 0 | none | 0 | 0 | 0 | A transactions screenshot added on the Portfolio page is recognized as the wrong kind, with no holdings made up. |
| `dark-mode-bank` | 3 of 3 | 27 of 27 | none | 0 | 0 | 0 | A dark-mode app where money in is shown only in green, with no plus or minus sign anywhere, and dates written out with the weekday. |
| `credit-union-debit-credit` | 3 of 3 | 36 of 36 | none | 0 | 0 | 0 | A statement with separate Debits and Credits columns and no signs, beside a running balance, for a period from December 2025 into January 2026 with the years only in the header: the direction comes from the column, the amount isn't the balance, each row gets its own year, and the beginning and ending balance lines aren't transactions. |
| `uk-bank-day-first` | 3 of 3 | 30 of 30 | none | 0 | 0 | 0 | A UK statement in pounds with dates written day first: 07/10/2026 is 7 October, though it also reads as a valid US date. |
| `german-bank-euro` | 3 of 3 | 24 of 24 | none | 0 | 0 | 0 | A German bank app in euros: dates like "Freitag, 23. Oktober", comma decimals and dot thousands (−1.120,00 € is 1120), descriptions kept in German. |
| `long-scroll-capture` | 3 of 3 | 117 of 117 | none | 0 | 0 | 0 | A scrolling capture three phone screens tall, which the browser cuts between lines into 4 full-size pieces, read together: every one of its rows, read across the cuts. |
| `extra-tall-capture` | 3 of 3 | 204 of 204 | none | 0 | 0 | 0 | A scrolling capture over five phone screens tall, cut into 6 full-size pieces: many rows, read in order across the cuts. |
| `month-long-capture` | 3 of 3 | 348 of 348 | none | 0 | 0 | 0 | A month of activity in one scrolling capture about nine phone screens tall, cut into 9 full-size pieces. Shrunk whole into one image it would come out 132 px wide, which couldn't be read at all. |
| `cut-off-rows` | 3 of 3 | 27 of 27 | none | 0 | 0 | 0 | A screenshot taken mid-scroll: the row half hidden under the title bar and the one half behind the tab bar are left out, the rows between are read. |
| `notification-banner` | 3 of 3 | 27 of 27 | none | 0 | 0 | 0 | A Venmo notification ("Alex Kim paid you $45.00") covers the top of the list: it isn't a transaction on this account, and the rows below it are read. |
| `dense-desktop-statement` | 3 of 3 | 96 of 96 | none | 0 | 0 | 0 | A desktop card statement at 1x with 11 px text and 32 rows, a transaction date and a post date (the transaction date counts), purchases positive and the payment and return negative. |
| `long-merchant-names` | 3 of 3 | 21 of 21 | none | 0 | 0 | 0 | Merchant names that wrap onto two lines or are cut short with an ellipsis, each with a category line under it: one row each, with the right amount. |
| `travel-card-foreign-currency` | 3 of 3 | 21 of 21 | none | 0 | 0 | 0 | A US card used in Paris: the dollar amount is the one kept, not the euro amount and rate under the name; pending rows mixed in among posted ones are left out; a refund, a fee reversal and a payment shown with a minus sign are money in. |
| `positions-cost-basis` | 3 of 3 | 21 of 21 | none | 0 | 0 | 0 | A positions table with the cost basis and gains right beside the market value, a cash line with no symbol, and an account total: the market value is the one read. |
| `401k-names-only` | 3 of 3 | 15 of 15 | none | 0 | 0 | 0 | A 401(k) app naming its funds with no tickers, a percentage beside each value: the values are read, and no ticker is worked out from a name. |
| `trading-app-crypto` | 3 of 3 | 21 of 21 | none | 0 | 0 | 0 | A trading app with Stocks, ETFs, Crypto and Cash headings: stocks and the ETF show only shares and share price (the value is worked out in code, not by the model), crypto shows its value, and the headings say what each holding is. |
| `trading-app-equity` | 0 of 3 | 3 of 24 | value 21 | 0 | 0 | 0 | Held out. A trading app set to show each position's equity in the colored box beside it, with "Equity" above the boxes (trading-app-crypto's boxes show the share price): the boxed amount is the value, so it must not be taken for a price and multiplied by the shares. |
| `partial-holdings-list` | 3 of 3 | 18 of 18 | none | 0 | 0 | 0 | Held out. The top of a long positions list: 6 of 14 positions above the tab bar, each value with its shares under it, below an account total that covers all 14. The 6 are read, the total is left out, and the review warns that they don't add up to it. |
| `positions-4k-desktop` | 3 of 3 | 39 of 39 | none | 0 | 0 | 0 | Held out. A full-screen capture of a positions page on a 4K monitor at 150% (3840 x 2160): wider than Claude reads, so the browser shrinks it whole to 2576 px wide (only tall captures are cut into pieces). 12 positions across 13 columns, the market value beside the price change, gains and cost basis; the rows add up to the total, so no warning. |

## Failures

### `trading-app-equity` (run 1)

- **Reads every holding with the right value and type**: AMZN: value wrong (got AMZN 14314.88 single-stock, expected AMZN 1789.36 single-stock); KO: value wrong (got KO 43537.5 single-stock, expected KO 1741.5 single-stock); PLTR: value wrong (got PLTR 72656 single-stock, expected PLTR 1816.4 single-stock); QQQ: value wrong (got QQQ 4709.43 sector-stocks, expected QQQ 1569.81 sector-stocks); SCHD: value wrong (got SCHD 70297.74 us-stocks, expected SCHD 1398.96 us-stocks); BTC: value wrong (got BTC 42.82 crypto, expected BTC 2141.08 crypto); DOGE: value wrong (got DOGE 364725 crypto, expected DOGE 243.15 crypto)

### `trading-app-equity` (run 2)

- **Reads every holding with the right value and type**: AMZN: value wrong (got AMZN 14314.88 single-stock, expected AMZN 1789.36 single-stock); KO: value wrong (got KO 43537.5 single-stock, expected KO 1741.5 single-stock); PLTR: value wrong (got PLTR 72656 single-stock, expected PLTR 1816.4 single-stock); QQQ: value wrong (got QQQ 4709.43 sector-stocks, expected QQQ 1569.81 sector-stocks); SCHD: value wrong (got SCHD 70297.74 us-stocks, expected SCHD 1398.96 us-stocks); BTC: value wrong (got BTC 42.82 crypto, expected BTC 2141.08 crypto); DOGE: value wrong (got DOGE 364725 crypto, expected DOGE 243.15 crypto)

### `trading-app-equity` (run 3)

- **Reads every holding with the right value and type**: AMZN: value wrong (got AMZN 14314.88 single-stock, expected AMZN 1789.36 single-stock); KO: value wrong (got KO 43537.5 single-stock, expected KO 1741.5 single-stock); PLTR: value wrong (got PLTR 72656 single-stock, expected PLTR 1816.4 single-stock); QQQ: value wrong (got QQQ 4709.43 sector-stocks, expected QQQ 1569.81 sector-stocks); SCHD: value wrong (got SCHD 70297.74 us-stocks, expected SCHD 1398.96 us-stocks); BTC: value wrong (got BTC 42.82 crypto, expected BTC 2141.08 crypto); DOGE: value wrong (got DOGE 364725 crypto, expected DOGE 243.15 crypto)

