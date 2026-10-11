import type { Module } from "../course.ts"

export const firstPortfolio: Module = {
  id: "first-portfolio",
  title: "Building your first portfolio",
  description: "Choose a brokerage, pick a simple mix of funds, and set it up so it runs on autopilot.",
  lessons: [
    {
      slug: "choosing-a-broker",
      title: "Picking a brokerage",
      minutes: 6,
      summary: "What to look for in a brokerage, what protections you have, and the red flags that should send you elsewhere.",
      sections: [
        {
          heading: "What to look for",
          blocks: [
            {
              type: "list",
              items: [
                "**Low costs:** no account fees, $0 trades on stocks and ETFs, and a good range of low-cost index funds.",
                "**The accounts you need:** such as a Roth IRA, a regular brokerage account or a custodial account.",
                "**Beginner-friendly features:** fractional shares, automatic investing and no minimum balance.",
                "**Security:** two-factor authentication and clear customer support.",
              ],
            },
          ],
        },
        {
          heading: "Protections you have",
          blocks: [
            {
              type: "p",
              text: "At a US brokerage that's a member of **SIPC**, your account is protected up to $500,000 (including up to $250,000 in cash) if the brokerage itself fails and your assets are missing. SIPC does **not** protect you from investments losing value.",
            },
            {
              type: "p",
              text: "That's different from FDIC insurance on bank deposits, which covers up to $250,000 per depositor, per bank, per ownership category. Investments are never FDIC-insured, even when you buy them through a bank.",
            },
          ],
        },
        {
          heading: "Red flags",
          blocks: [
            {
              type: "list",
              items: [
                "A firm or person that isn't registered. Check any broker or adviser for free on FINRA BrokerCheck or the SEC's Investor.gov.",
                "Pressure to act fast, or promises of guaranteed or unusually high returns.",
                "An app that gamifies trading with confetti, streaks or push notifications nudging you to trade more.",
                "Being asked to send money by gift card, wire to a person, or crypto to “unlock” your account.",
              ],
            },
          ],
        },
      ],
      takeaways: [
        "Pick a low-cost brokerage that offers the account types and funds you need.",
        "SIPC protects against a brokerage failing, not against market losses.",
        "Verify registration on BrokerCheck or Investor.gov before trusting anyone with money.",
      ],
      keyTerms: ["Brokerage account", "SIPC"],
      quiz: [
        {
          question: "What does SIPC protection cover?",
          options: [
            "Losses when your investments drop in value",
            "Missing assets if a member brokerage fails, up to limits",
            "Bad investment advice",
            "Any money lost to scams",
          ],
          answer: 1,
          explanation: "SIPC helps if the firm fails and your assets are missing. It doesn't cover market losses.",
        },
        {
          question: "Where can you check if a US broker or adviser is registered?",
          options: ["Their social media profile", "FINRA BrokerCheck or Investor.gov", "An online forum", "The company's own ads"],
          answer: 1,
          explanation: "These free official tools show registration and any disciplinary history.",
        },
        {
          question: "Which is a red flag?",
          options: [
            "No account minimum",
            "Two-factor authentication",
            "A promise of guaranteed high returns",
            "Low-cost index funds",
          ],
          answer: 2,
          explanation: "Real investments don't guarantee high returns. That promise is a classic warning sign.",
        },
      ],
      askPrompt: "What questions should I ask when comparing brokerages as a beginner?",
    },
    {
      slug: "starter-portfolio",
      title: "A simple starter portfolio",
      minutes: 8,
      summary: "You don't need 20 funds. One to three well-chosen, low-cost funds can build a diversified portfolio.",
      sections: [
        {
          heading: "Option 1: One fund that does it all",
          blocks: [
            {
              type: "p",
              text: "A **target-date fund** holds a full mix of stock and bond funds and gradually becomes more conservative as its target year approaches. You pick the fund with the year closest to when you expect to retire, and it handles the rest.",
            },
            {
              type: "p",
              text: "A broad “all-in-one” or total world stock fund is another single-fund option for long horizons. Check the expense ratio: index-based versions are often much cheaper than actively managed ones.",
            },
          ],
        },
        {
          heading: "Option 2: The three-fund portfolio",
          blocks: [
            {
              type: "p",
              text: "A popular do-it-yourself approach uses three broad index funds. You choose the split, and it's easy to see exactly what you own.",
            },
            {
              type: "table",
              caption: "One illustrative split for a long horizon, not a recommendation",
              headers: ["Fund", "What it holds", "Example share"],
              rows: [
                ["Total US stock market index", "Thousands of US companies of all sizes", "60%"],
                ["Total international stock index", "Companies in developed and emerging markets outside the US", "30%"],
                ["Total bond market index", "Many government and corporate bonds", "10%"],
              ],
            },
          ],
        },
        {
          heading: "How to check a fund before you buy",
          blocks: [
            {
              type: "list",
              ordered: true,
              items: [
                "**What does it track?** Look for a broad index, not a narrow theme.",
                "**What does it cost?** Compare the expense ratio with similar funds.",
                "**How many holdings?** Hundreds or thousands means built-in diversification.",
                "**Does it overlap?** Two funds holding the same companies add little.",
              ],
            },
            {
              type: "callout",
              tone: "caution",
              title: "Beware of theme and hype funds",
              text: "Funds built around a hot trend can be expensive and concentrated. By the time a theme is popular, a lot of optimism may already be in the price.",
            },
          ],
        },
      ],
      takeaways: [
        "A single target-date fund can be a complete portfolio.",
        "A three-fund portfolio covers US stocks, international stocks and bonds.",
        "Check what a fund tracks, what it costs, and whether it overlaps with what you own.",
      ],
      keyTerms: ["Target-date fund", "Index fund", "Portfolio", "Asset allocation"],
      quiz: [
        {
          question: "What does a target-date fund do automatically?",
          options: [
            "Picks hot stocks each year",
            "Shifts toward a more conservative mix as its target year approaches",
            "Guarantees your money by the target date",
            "Avoids all fees",
          ],
          answer: 1,
          explanation: "It adjusts its mix over time. It doesn't guarantee a result, and fees vary between funds.",
        },
        {
          question: "What does a three-fund portfolio typically include?",
          options: [
            "Three technology stocks",
            "US stocks, international stocks and bonds",
            "Three S&P 500 funds",
            "Cash, gold and crypto",
          ],
          answer: 1,
          explanation: "Three broad index funds covering US stocks, international stocks and bonds.",
        },
        {
          question: "Why doesn't owning two funds that hold the same companies add much?",
          options: [
            "It's not allowed",
            "It doesn't add diversification",
            "It doubles your return",
            "It removes fees",
          ],
          answer: 1,
          explanation: "Overlap means you own the same things twice. You gain complexity, not diversification.",
        },
      ],
      askPrompt: "Can you explain how a target-date fund compares to building a three-fund portfolio myself?",
    },
    {
      slug: "automate-and-rebalance",
      title: "Automate it, then leave it alone",
      minutes: 6,
      summary: "Automatic contributions, reinvested dividends and an occasional rebalance keep your plan running with little effort.",
      sections: [
        {
          heading: "Put it on autopilot",
          blocks: [
            {
              type: "list",
              items: [
                "**Automatic transfers:** send a set amount to your brokerage right after each payday.",
                "**Automatic investing:** have that money buy your chosen funds on a schedule.",
                "**Dividend reinvestment:** let dividends buy more shares instead of sitting as cash.",
              ],
            },
            {
              type: "p",
              text: "Automation removes the monthly decision, and with it the temptation to wait for a “better time”. It's dollar-cost averaging without having to think.",
            },
          ],
        },
        {
          heading: "Rebalancing",
          blocks: [
            {
              type: "p",
              text: "Over time, your mix drifts. If stocks do well, a 90/10 mix might become 95/5, which is riskier than you planned. **Rebalancing** means nudging it back by buying more of what's fallen behind or selling some of what's grown.",
            },
            {
              type: "callout",
              tone: "tip",
              title: "Keep it simple",
              text: "Many people check once a year, or when an investment is more than about 5 percentage points off target. Directing new contributions to the part that's behind can rebalance without selling, which avoids taxes in a regular account.",
            },
          ],
        },
        {
          heading: "Check in, don't hover",
          blocks: [
            {
              type: "p",
              text: "A few times a year is plenty: confirm contributions are running, glance at your mix, and revisit your goals when life changes, such as a new job, a raise or a big purchase coming up.",
            },
            {
              type: "p",
              text: "Raising your contribution each time your pay goes up, even by 1%, is one of the most powerful habits you can build.",
            },
          ],
        },
      ],
      takeaways: [
        "Automate contributions and dividend reinvestment.",
        "Rebalance about once a year or when your mix drifts well off target.",
        "Increase contributions whenever your income rises.",
      ],
      keyTerms: ["Rebalancing", "Dividend", "Dollar-cost averaging"],
      quiz: [
        {
          question: "What is rebalancing?",
          options: [
            "Selling everything when prices fall",
            "Bringing your mix back to your target percentages",
            "Switching brokerages every year",
            "Buying whatever went up most",
          ],
          answer: 1,
          explanation: "It resets your portfolio to the risk level you chose.",
        },
        {
          question: "How can you rebalance without selling in a taxable account?",
          options: [
            "You can't",
            "Direct new contributions to the part that's below target",
            "Withdraw cash",
            "Stop contributing",
          ],
          answer: 1,
          explanation: "New money can fill the gap, avoiding a sale that might trigger capital gains tax.",
        },
        {
          question: "Why is automating contributions helpful?",
          options: [
            "It guarantees higher returns",
            "It removes the monthly decision and the urge to time the market",
            "It avoids all taxes",
            "It lets you skip having an emergency fund",
          ],
          answer: 1,
          explanation: "Consistency beats timing for most people, and automation makes consistency easy.",
        },
      ],
      askPrompt: "Help me set up a simple automatic investing plan based on how much I can put in each month.",
    },
  ],
}
