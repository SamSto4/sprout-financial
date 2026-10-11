import type { Module } from "../course.ts"

export const riskAndReturn: Module = {
  id: "risk-and-return",
  title: "Risk and return",
  description: "Why higher returns come with bigger swings, and the tools investors use to manage risk.",
  lessons: [
    {
      slug: "risk-and-return",
      title: "The risk–return tradeoff",
      minutes: 6,
      summary: "Investments that can grow more also tend to swing more. Understanding that tradeoff is the heart of investing.",
      sections: [
        {
          heading: "No free lunch",
          blocks: [
            {
              type: "p",
              text: "Investors expect to be paid for taking risk. Cash is steady but grows slowly. Bonds wobble a bit more and have earned more. Stocks swing the most and have earned the most over long periods.",
            },
            {
              type: "table",
              caption: "General patterns over long periods, not predictions",
              headers: ["Asset", "Typical ups and downs", "Long-run growth potential"],
              rows: [
                ["Cash / savings", "Very small", "Low; may only keep up with inflation"],
                ["Bonds", "Moderate", "Moderate"],
                ["Diversified stocks", "Large; drops of 30–50% have happened", "Highest of the three historically"],
                ["Single stocks, crypto", "Very large; can go to zero", "Wide range, including total loss"],
              ],
            },
          ],
        },
        {
          heading: "What risk actually feels like",
          blocks: [
            {
              type: "p",
              text: "**Volatility** is how much prices bounce around. In a typical year, a stock index might move 15–20% either way from its average. In rare years, much more: US stocks fell by roughly half during the 2008 financial crisis, and by about a third in a few weeks in early 2020.",
            },
            {
              type: "p",
              text: "The bigger risk for most people isn't a drop itself. It's selling in a panic during the drop and missing the recovery, which turns a temporary fall into a permanent loss.",
            },
          ],
        },
        {
          heading: "Risk you can take versus risk you should take",
          blocks: [
            {
              type: "p",
              text: "Your **risk capacity** depends on your situation: how long until you need the money and whether you have an emergency fund. Your **risk tolerance** is how you'll actually feel and act when your balance drops.",
            },
            {
              type: "callout",
              tone: "tip",
              title: "A gut check",
              text: "Imagine your $1,000 investment falls to $650 in a few months. Would you hold, buy more, or sell? Your honest answer is useful information when choosing an investment mix.",
            },
          ],
        },
      ],
      takeaways: [
        "Higher expected returns come with bigger swings.",
        "Selling during a drop can turn a temporary loss into a permanent one.",
        "Choose a level of risk your timeline and your nerves can both handle.",
      ],
      keyTerms: ["Volatility", "Risk tolerance"],
      quiz: [
        {
          question: "Which has historically had both the biggest swings and the highest long-run growth?",
          options: ["Cash", "Bonds", "Diversified stocks", "A savings account"],
          answer: 2,
          explanation: "Diversified stocks have grown the most over long periods, with larger drops along the way.",
        },
        {
          question: "What often turns a market drop into a permanent loss for investors?",
          options: [
            "Holding a diversified fund",
            "Selling in a panic before prices recover",
            "Reinvesting dividends",
            "Investing automatically",
          ],
          answer: 1,
          explanation: "A drop is a paper loss until you sell. Selling locks it in and can mean missing the rebound.",
        },
        {
          question: "What does volatility describe?",
          options: [
            "How much an investment's price moves up and down",
            "How much a fund charges",
            "How many shares you own",
            "How long you've been investing",
          ],
          answer: 0,
          explanation: "Volatility is the size and speed of price swings.",
        },
      ],
      askPrompt: "How do I figure out my own risk tolerance? Ask me a few questions.",
    },
    {
      slug: "diversification",
      title: "Diversification: don't bet on one thing",
      minutes: 6,
      summary: "Spreading money across many companies, industries and countries lowers the damage any one of them can do.",
      sections: [
        {
          heading: "Why spreading out works",
          blocks: [
            {
              type: "p",
              text: "**Diversification** means owning many investments that don't all move together. When one falls, others may hold steady or rise. You give up the chance of one lucky pick making you rich, and in exchange you avoid one bad pick ruining you.",
            },
            {
              type: "callout",
              tone: "example",
              title: "One stock versus 500",
              text: "Put $1,000 in one company and it goes bankrupt: you lose $1,000. Put $1,000 in a fund holding 500 companies, equally weighted, and one of them goes bankrupt: you lose about $2.",
            },
          ],
        },
        {
          heading: "Layers of diversification",
          blocks: [
            {
              type: "list",
              items: [
                "**Across companies:** hundreds or thousands instead of a handful.",
                "**Across industries:** tech, healthcare, energy, banks, consumer goods and more.",
                "**Across countries:** US and international markets take turns leading.",
                "**Across asset types:** stocks for growth, bonds and cash for stability.",
              ],
            },
          ],
        },
        {
          heading: "Diversification has limits",
          blocks: [
            {
              type: "p",
              text: "It reduces the risk of any single investment failing, but it can't remove market-wide risk. In a broad crash, most stocks fall together. That's why time horizon and asset mix still matter.",
            },
            {
              type: "callout",
              tone: "caution",
              title: "Owning five tech stocks isn't diversified",
              text: "Several companies in the same industry tend to rise and fall together. Owning many funds that hold the same big companies isn't much more diversified than owning one.",
            },
          ],
        },
      ],
      takeaways: [
        "Diversification limits how much any single investment can hurt you.",
        "Spread across companies, industries, countries and asset types.",
        "It doesn't prevent market-wide drops.",
      ],
      keyTerms: ["Diversification", "Portfolio"],
      quiz: [
        {
          question: "What does diversification protect you from most?",
          options: [
            "Any market-wide crash",
            "One company or industry doing badly",
            "Inflation",
            "All fees",
          ],
          answer: 1,
          explanation: "It limits damage from individual failures. Market-wide drops still affect a diversified portfolio.",
        },
        {
          question: "Which is the most diversified?",
          options: [
            "Five technology stocks",
            "One popular company",
            "A total world stock index fund",
            "Three funds that all track the S&P 500",
          ],
          answer: 2,
          explanation: "A total world fund spreads across thousands of companies in many industries and countries.",
        },
        {
          question: "What's the tradeoff of being diversified?",
          options: [
            "You give up the chance of one pick making you rich, but avoid one pick ruining you",
            "You pay much higher taxes",
            "You can't sell your investments",
            "There's no tradeoff at all",
          ],
          answer: 0,
          explanation: "You won't match the single best stock, and you won't suffer from the single worst.",
        },
      ],
      askPrompt: "How diversified is a single S&P 500 fund? What would I add to diversify further?",
    },
    {
      slug: "asset-allocation",
      title: "Asset allocation: your mix",
      minutes: 7,
      summary: "How you split money between stocks, bonds and cash drives most of your risk and return.",
      sections: [
        {
          heading: "Your most important decision",
          blocks: [
            {
              type: "p",
              text: "**Asset allocation** is the percentage of your money in each type of investment, such as 90% stocks and 10% bonds. That mix shapes your ups and downs far more than which exact fund you choose.",
            },
          ],
        },
        {
          heading: "Common mixes and how they behave",
          blocks: [
            {
              type: "table",
              caption: "Illustrative mixes. Actual results depend on markets and timing.",
              headers: ["Mix (stocks / bonds)", "Ride", "Often used for"],
              rows: [
                ["100 / 0", "Biggest swings, highest growth potential", "Very long horizons and high risk tolerance"],
                ["80–90 / 10–20", "Large swings, slightly softened", "Many young investors saving for retirement"],
                ["60 / 40", "Moderate swings", "Medium horizons or lower risk tolerance"],
                ["30 / 70 or less", "Smaller swings, lower growth", "Goals only a few years away"],
              ],
            },
            {
              type: "p",
              text: "A common pattern is to hold more stocks while a goal is far away and gradually shift toward bonds and cash as it gets closer. **Target-date funds**, covered in module 5, do this automatically.",
            },
          ],
        },
        {
          heading: "Pick a mix you'll stick with",
          blocks: [
            {
              type: "p",
              text: "The best allocation on paper is useless if you abandon it in a downturn. A slightly calmer mix you hold through thick and thin can beat an aggressive one you panic out of.",
            },
            {
              type: "callout",
              tone: "tip",
              title: "Different goals, different mixes",
              text: "You can hold an aggressive mix for retirement and cash for a car you're buying next year. Allocation is set per goal, not once for your whole life.",
            },
          ],
        },
      ],
      takeaways: [
        "Asset allocation is your split between stocks, bonds and cash.",
        "Longer horizons usually allow more stocks; closer goals call for more stability.",
        "The right mix is one you'll stick with in a downturn.",
      ],
      keyTerms: ["Asset allocation", "Target-date fund", "Time horizon"],
      quiz: [
        {
          question: "What is asset allocation?",
          options: [
            "Picking the single best stock",
            "How you split money between stocks, bonds and cash",
            "The fee a fund charges",
            "How often you trade",
          ],
          answer: 1,
          explanation: "It's the mix of asset types, and it drives most of a portfolio's risk and return.",
        },
        {
          question: "As a goal gets closer, what do many investors do with that goal's money?",
          options: [
            "Move more into stocks",
            "Shift gradually toward bonds and cash",
            "Move it all into one stock",
            "Stop tracking it",
          ],
          answer: 1,
          explanation: "Reducing risk as the date nears means a late drop does less damage.",
        },
        {
          question: "Why might a calmer mix beat a more aggressive one in real life?",
          options: [
            "Calmer mixes always earn more",
            "Because you're more likely to stick with it during a downturn",
            "Because bonds never lose value",
            "It can't",
          ],
          answer: 1,
          explanation: "Behavior matters. Selling during a crash can do more harm than a slightly lower expected return.",
        },
      ],
      askPrompt: "What asset allocation might suit someone my age saving for retirement, and why?",
    },
    {
      slug: "market-drops",
      title: "When markets fall",
      minutes: 7,
      summary: "Drops are normal. A plan for them, like steady investing and staying the course, matters more than predicting them.",
      sections: [
        {
          heading: "Drops are part of the deal",
          blocks: [
            {
              type: "p",
              text: "Declines of 10% or more (called corrections) have happened every year or two on average. Drops of 20% or more (**bear markets**) have come every several years. So far, the US stock market has eventually recovered from every one, though some recoveries took years.",
            },
            {
              type: "p",
              text: "Nobody has reliably predicted these drops or the rebounds. Some of the market's best days have come right after its worst, so investors who sell and wait on the sidelines often miss them.",
            },
          ],
        },
        {
          heading: "Dollar-cost averaging",
          blocks: [
            {
              type: "p",
              text: "**Dollar-cost averaging** means investing a fixed amount on a regular schedule, like $100 every payday, no matter what prices are doing. When prices are low, your $100 buys more shares. When they're high, it buys fewer.",
            },
            {
              type: "callout",
              tone: "example",
              title: "Buying through a dip",
              text: "You invest $100 a month. In month 1 the fund costs $50 (2 shares). In month 2 it drops to $25 (4 shares). In month 3 it's back to $50 (2 shares). You invested $300 for 8 shares, an average of $37.50 each, below the $50 starting price.",
            },
            {
              type: "p",
              text: "If you already have a lump sum, research suggests investing it right away has usually come out ahead, because markets rise more often than they fall. Spreading it out can still be reasonable if it helps you sleep and stick to the plan.",
            },
          ],
        },
        {
          heading: "Your downturn plan",
          blocks: [
            {
              type: "list",
              ordered: true,
              items: [
                "Keep your emergency fund in cash, so you never have to sell investments to cover bills.",
                "Keep automatic investments running.",
                "Check your mix still matches your goals, rather than reacting to headlines.",
                "Look at your account less often. Daily checking makes normal swings feel scarier.",
              ],
            },
          ],
        },
      ],
      takeaways: [
        "Corrections and bear markets are normal and unpredictable.",
        "Dollar-cost averaging buys more shares when prices are low.",
        "A plan made in calm times keeps you from panic-selling in bad ones.",
      ],
      keyTerms: ["Bear market", "Bull market", "Dollar-cost averaging"],
      quiz: [
        {
          question: "What is dollar-cost averaging?",
          options: [
            "Investing only when prices drop",
            "Investing a fixed amount on a regular schedule",
            "Selling a little each month",
            "Buying the cheapest stocks",
          ],
          answer: 1,
          explanation: "A fixed amount on a schedule means you automatically buy more shares when prices are lower.",
        },
        {
          question: "What's usually the biggest risk during a market drop for a long-term investor?",
          options: [
            "Continuing to invest automatically",
            "Selling in a panic and missing the recovery",
            "Owning index funds",
            "Having an emergency fund",
          ],
          answer: 1,
          explanation: "Recoveries often start suddenly. Being out of the market can mean missing the best days.",
        },
        {
          question: "What is a bear market?",
          options: [
            "A drop of about 20% or more from a recent high",
            "A market that only trades animal-related stocks",
            "A period of rising prices",
            "A day with no trading",
          ],
          answer: 0,
          explanation: "A bear market is a decline of roughly 20% or more. A rising market is called a bull market.",
        },
      ],
      askPrompt: "The market just dropped and I'm nervous. How should I think about it as a long-term investor?",
    },
  ],
}
