import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyHoldingsImport, detectHoldingsColumns, importHoldingsFromCsv, parseNumber, type ImportedHolding } from "./csv-import.ts"
import { MAX_HOLDINGS, type Holding } from "./holdings.ts"

// Layouts follow each brokerage's positions export; the holdings and numbers are made up.
const FIDELITY = `Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today's Gain/Loss Dollar,Today's Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type
Z12345678,Individual,SPAXX**,HELD IN MONEY MARKET,,,,$1520.40,,,,,12.10%,,,Cash
Z12345678,Individual,FXAIX,FIDELITY 500 INDEX FUND,25.512,$212.40,+$1.02,"$5,418.75",+$26.02,+0.48%,+$918.75,+20.42%,43.20%,"$4,500.00",$176.39,Cash
Z12345678,Individual,AAPL,APPLE INC,10,$231.10,-$0.80,"$2,311.00",-$8.00,-0.35%,+$511.00,+28.39%,18.40%,"$1,800.00",$180.00,Margin
Z12345678,Individual, -AAPL261218C250,AAPL DEC 18 2026 $250 CALL,1,$4.10,,$410.00,,,,,,,,Margin
Z12345678,Individual,Pending Activity,,,,,$-25.00,,,,,,,,
X98765432,ROTH IRA,FXAIX,FIDELITY 500 INDEX FUND,10,$212.40,+$1.02,"$2,124.00",,,,,,,,Cash

"The data and information in this spreadsheet is provided to you solely for your use and is not for distribution."
"Date downloaded 10/26/2026 10:59 AM ET"`

const SCHWAB = `"Positions for account Individual ...123 as of 10:58 AM ET, 2026/10/26"

"Symbol","Description","Qty (Quantity)","Price","Price Chng % (Price Change %)","Price Chng $ (Price Change $)","Mkt Val (Market Value)","Day Chng % (Day Change %)","Cost Basis","Gain $ (Gain/Loss $)","Gain % (Gain/Loss %)","Security Type"
"SCHB","SCHWAB US BROAD MARKET ETF","120","$24.10","0.5%","$0.12","$2,892.00","0.5%","$2,400.00","$492.00","20.5%","ETFs & Closed End Funds"
"MSFT","MICROSOFT CORP","5","$430.25","-0.2%","-$0.86","$2,151.25","-0.2%","$1,900.00","$251.25","13.22%","Equity"
"SWVXX","SCHWAB VALUE ADVANTAGE MONEY INV","300","$1.00","0%","$0.00","$300.00","0%","--","--","--","Cash and Money Market"
"Cash & Cash Investments","--","--","--","--","--","$415.60","0%","--","--","--","Cash and Money Market"
"Account Total","--","--","--","--","--","$5,758.85","0.3%","$4,300.00","$743.25","17.28%","--"`

const VANGUARD = `Account Number,Investment Name,Symbol,Shares,Share Price,Total Value,
12345678,Vanguard Federal Money Market Fund,VMFXX,640.12,1,640.12,
12345678,Total Stock Mkt Idx Adm,VTSAX,30.5,140.2,4276.1,
12345678,Vanguard Total Bond Market ETF,BND,15,72.4,1086,



Account Number,Trade Date,Settlement Date,Transaction Type,Transaction Description,Investment Name,Symbol,Shares,Share Price,Principal Amount,Commissions and Fees,Net Amount,Accrued Interest,Account Type,
12345678,2026-10-01,2026-10-02,Buy,Buy,Total Stock Mkt Idx Adm,VTSAX,1,139,-139,0,-139,0,CASH,`

const ETRADE = `Account Summary
Account,Net Account Value,Total Gain $,Total Gain %
Brokerage -1234,"$3,210.00",$210.00,7.00%

View Summary - All Positions
Symbol,Last Price $,Change $,Change %,Qty #,Price Paid $,Day's Gain $,Total Gain $,Total Gain %,Value $
VOO,520.00,1.10,0.21,5,480.00,5.50,200.00,8.33,2600.00
NVDA,140.00,-2.00,-1.41,4,150.00,-8.00,-40.00,-6.67,560.00
CASH,,,,,,,,,50.00
TOTAL,,,,,,,,,3210.00`

describe("importHoldingsFromCsv: brokerage exports", () => {
  it("reads a Fidelity export: core cash, the same fund in two accounts, options and pending skipped", () => {
    const result = importHoldingsFromCsv(FIDELITY)
    assert.ok(result.ok)
    const bySymbol = Object.fromEntries(result.holdings.map((holding) => [holding.symbol, holding]))
    assert.deepEqual(Object.keys(bySymbol).sort(), ["AAPL", "FXAIX", "SPAXX"])
    assert.equal(bySymbol.FXAIX.value, 7542.75) // 5,418.75 + 2,124.00 across two accounts
    assert.equal(bySymbol.FXAIX.shares, 35.512)
    assert.equal(bySymbol.FXAIX.assetClass, "us-stocks")
    assert.equal(bySymbol.SPAXX.assetClass, "cash")
    assert.equal(bySymbol.SPAXX.value, 1520.4)
    assert.equal(bySymbol.SPAXX.name, "Fidelity Government Money Market Fund")
    // Fidelity's "Type" is the account type, so it isn't used; "APPLE INC" reads as a company.
    assert.equal(bySymbol.AAPL.assetClass, "single-stock")
    assert.equal(result.combined, 1)
    assert.equal(result.skipped.noSymbol, 1) // the option
    assert.equal(result.skipped.pending, 1)
    assert.equal(result.columns.value, "Current Value")
  })

  it("reads a Schwab export: title line before the header, quoted values, cash row, account total", () => {
    const result = importHoldingsFromCsv(SCHWAB)
    assert.ok(result.ok)
    const bySymbol = Object.fromEntries(result.holdings.map((holding) => [holding.symbol, holding]))
    assert.deepEqual(Object.keys(bySymbol).sort(), ["CASH", "MSFT", "SCHB", "SWVXX"])
    assert.equal(bySymbol.SCHB.value, 2892)
    assert.equal(bySymbol.SCHB.assetClass, "us-stocks")
    assert.equal(bySymbol.MSFT.assetClass, "single-stock") // from Security Type "Equity"
    assert.equal(bySymbol.SWVXX.assetClass, "cash") // from Security Type
    assert.equal(bySymbol.CASH.value, 415.6)
    assert.equal(bySymbol.CASH.name, "Cash")
    assert.equal(result.skipped.totals, 1)
    assert.equal(result.columns.quantity, "Qty (Quantity)")
  })

  it("reads a Vanguard export, stops at the transactions section, and keeps a fund named 'Total…'", () => {
    const result = importHoldingsFromCsv(VANGUARD)
    assert.ok(result.ok)
    assert.deepEqual(
      result.holdings.map((holding) => [holding.symbol, holding.value]),
      [["VTSAX", 4276.1], ["BND", 1086], ["VMFXX", 640.12]]
    )
    assert.equal(result.holdings.find((holding) => holding.symbol === "VMFXX")?.assetClass, "cash")
  })

  it("reads an E*TRADE export with an account summary first, and skips its TOTAL row", () => {
    const result = importHoldingsFromCsv(ETRADE)
    assert.ok(result.ok)
    assert.deepEqual(result.holdings.map((holding) => holding.symbol).sort(), ["CASH", "NVDA", "VOO"])
    assert.equal(result.holdings.find((holding) => holding.symbol === "VOO")?.shares, 5)
    assert.equal(result.skipped.totals, 1)
    assert.equal(result.columns.price, "Last Price $") // not "Price Paid $"
  })

  it("reads a simple hand-made sheet, and works out value from shares × price", () => {
    const result = importHoldingsFromCsv("Ticker,Shares,Price\nvti,10,300.5\nVXUS,4,65")
    assert.ok(result.ok)
    assert.deepEqual(result.holdings.map((holding) => [holding.symbol, holding.value]), [["VTI", 3005], ["VXUS", 260]])
  })

  it("imports shares with no price at $0, and says they need prices", () => {
    const result = importHoldingsFromCsv("Symbol,Quantity\nVOO,3\nBND,10")
    assert.ok(result.ok)
    assert.equal(result.needPrices, 2)
    assert.ok(result.holdings.every((holding) => holding.value === 0 && holding.shares !== null))
  })

  it("handles semicolon files, a byte-order mark and Windows line endings", () => {
    const result = importHoldingsFromCsv("﻿Symbol;Market Value\r\nVOO;1.234,56\r\nBND;99,5\r\n")
    assert.ok(result.ok)
    assert.deepEqual(result.holdings.map((holding) => holding.value), [1234.56, 99.5])
  })
})

describe("importHoldingsFromCsv: rows it leaves out", () => {
  it("skips short positions and closed ($0) positions", () => {
    const result = importHoldingsFromCsv("Symbol,Quantity,Market Value\nVOO,2,1000\nGME,-5,-120\nOLD,0,$0.00")
    assert.ok(result.ok)
    assert.deepEqual(result.holdings.map((holding) => holding.symbol), ["VOO"])
    assert.equal(result.skipped.negative, 1)
    assert.equal(result.skipped.noValue, 1)
  })

  it(`keeps the ${MAX_HOLDINGS} largest holdings when a file has more`, () => {
    const rows = Array.from({ length: MAX_HOLDINGS + 5 }, (_, i) => `T${i},${(i + 1) * 10}`)
    const result = importHoldingsFromCsv(`Symbol,Value\n${rows.join("\n")}`)
    assert.ok(result.ok)
    assert.equal(result.holdings.length, MAX_HOLDINGS)
    assert.equal(result.dropped, 5)
    assert.equal(result.holdings.at(-1)?.value, 60) // the 5 smallest (10–50) were left out
  })
})

describe("importHoldingsFromCsv: files it can't use", () => {
  it("explains a transaction history instead of positions", () => {
    const result = importHoldingsFromCsv("Run Date,Action,Amount\n10/01/2026,YOU BOUGHT,-100")
    assert.ok(!result.ok)
    assert.match(result.error, /transaction history/)
  })

  it("explains a file with no symbol column", () => {
    const result = importHoldingsFromCsv("Name,Notes\nFoo,bar")
    assert.ok(!result.ok)
    assert.match(result.error, /Symbol column/)
  })

  it("refuses empty and oversized files, and files with no investments", () => {
    assert.equal(importHoldingsFromCsv("").ok, false)
    assert.equal(importHoldingsFromCsv("x".repeat(3 * 1024 * 1024)).ok, false)
    const none = importHoldingsFromCsv("Symbol,Value\nAccount Total,$100")
    assert.ok(!none.ok)
    assert.match(none.error, /No holdings/)
  })

  it("never puts markup or formulas from the file anywhere but plain text fields", () => {
    const result = importHoldingsFromCsv('Symbol,Description,Value\nVOO,"<img src=x onerror=alert(1)>",100\n"=HYPERLINK(1)",x,5')
    assert.ok(result.ok)
    assert.deepEqual(result.holdings.map((holding) => holding.symbol), ["VOO"]) // "=HYPERLINK(1)" isn't a symbol
    assert.equal(typeof result.holdings[0].name, "string") // React renders it as text
  })
})

describe("importHoldingsFromCsv: guessing the type from the name", () => {
  it("files companies as individual stocks and leaves unknown funds for the user to pick", () => {
    const result = importHoldingsFromCsv(
      ["Symbol,Description,Value", "AAPL,APPLE INC,1", "BRK.B,BERKSHIRE HATHAWAY INC CL B,1", "TSM,TAIWAN SEMICONDUCTOR MFG SPONSORED ADR,1", "ZZZX,SOME GROWTH FUND,1", "ABCD,ACME INDEX TRUST,1", "QWER,Mystery,1"].join("\n")
    )
    assert.ok(result.ok)
    const classes = Object.fromEntries(result.holdings.map((holding) => [holding.symbol, holding.assetClass]))
    assert.deepEqual(classes, { AAPL: "single-stock", "BRK.B": "single-stock", TSM: "single-stock", ZZZX: "other", ABCD: "other", QWER: "other" })
  })
})

describe("parseNumber", () => {
  it("reads the ways brokerages write numbers", () => {
    const cases: [string, number | null][] = [
      ["$1,234.56", 1234.56],
      ["+$12.34", 12.34],
      ["-$8.00", -8],
      ["$-25.00", -25],
      ["(45.00)", -45],
      ["12.5%", 12.5],
      ["25.512", 25.512],
      ["1.234,56", 1234.56],
      ["99,5", 99.5],
      ["--", null],
      ["n/a", null],
      ["", null],
    ]
    for (const [raw, expected] of cases) assert.equal(parseNumber(raw), expected, raw)
  })
})

describe("detectHoldingsColumns", () => {
  it("needs a symbol and a value or quantity", () => {
    assert.equal(detectHoldingsColumns(["Symbol", "Description"]), null)
    assert.deepEqual(detectHoldingsColumns(["Symbol", "Shares"]), { symbol: 0, quantity: 1 })
  })

  it("doesn't take a change or gain column as the value", () => {
    const columns = detectHoldingsColumns(["Symbol", "Day Change Value", "Total Gain Value", "Market Value"])
    assert.equal(columns?.value, 3)
  })
})

describe("applyHoldingsImport", () => {
  const now = "2026-10-26T09:00:00.000Z"
  let counter = 0
  const newId = () => `h-new${++counter}`
  const saved: Holding[] = [
    { id: "h-voo", symbol: "VOO", name: "Vanguard S&P 500 ETF", assetClass: "us-stocks", value: 1000, shares: 2, expenseRatioPercent: 0.03, valueAsOf: "2026-01-01" },
    { id: "h-house", symbol: "SAVINGS", name: "Emergency fund", assetClass: "cash", value: 5000, shares: null, expenseRatioPercent: null, valueAsOf: "2026-01-01" },
  ]
  const file: ImportedHolding[] = [
    { symbol: "VOO", name: "VANGUARD S&P 500 ETF", assetClass: "us-stocks", value: 2600, shares: 5 },
    { symbol: "NVDA", name: "NVIDIA CORP", assetClass: "single-stock", value: 560, shares: 4 },
  ]

  it("replace: the file becomes the portfolio, keeping the fee typed for a matching symbol", () => {
    const { holdings } = applyHoldingsImport(saved, file, "replace", now, newId)
    assert.deepEqual(holdings.map((holding) => holding.symbol), ["VOO", "NVDA"])
    const voo = holdings[0]
    assert.equal(voo.id, "h-voo")
    assert.equal(voo.value, 2600)
    assert.equal(voo.expenseRatioPercent, 0.03)
    assert.equal(voo.valueAsOf, now)
  })

  it("update: matching symbols are updated, others kept, new ones added", () => {
    const { holdings } = applyHoldingsImport(saved, file, "update", now, newId)
    assert.deepEqual(holdings.map((holding) => [holding.symbol, holding.value]), [["VOO", 2600], ["SAVINGS", 5000], ["NVDA", 560]])
  })

  it(`never saves more than ${MAX_HOLDINGS} holdings`, () => {
    const many: ImportedHolding[] = Array.from({ length: MAX_HOLDINGS }, (_, i) => ({ symbol: `T${i}`, name: "", assetClass: "other", value: 10, shares: null }))
    const { holdings, dropped } = applyHoldingsImport(saved, many, "update", now, newId)
    assert.equal(holdings.length, MAX_HOLDINGS)
    assert.equal(dropped, 2)
  })
})
