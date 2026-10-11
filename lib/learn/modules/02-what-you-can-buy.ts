import type { Module } from "../course.ts"

export const whatYouCanBuy: Module = {
  id: "what-you-can-buy",
  title: "What you can invest in",
  description: "Stocks, bonds and funds in plain English, and what actually happens when you click “buy”.",
  lessons: [
    {
      slug: "stocks",
      title: "Stocks: owning part of a company",
      minutes: 7,
      summary: "A share of stock is a small slice of ownership in a company. You can profit if the company grows, and lose if it struggles.",
      sections: [
        {
          heading: "What a share really is",
          blocks: [
            {
              type: "p",
              text: "A **stock** (also called a share or equity) is a small piece of ownership in a company. If a company is split into 1 billion shares and you own 10, you own a tiny fraction of everything it has and earns.",
            },
            {
              type: "p",
              text: "Companies sell shares to raise money to grow. After that, shares are bought and sold between investors on a stock exchange, and the price moves with supply and demand.",
            },
          ],
        },
        {
          heading: "How stock investors make money",
          blocks: [
            {
              type: "list",
              items: [
                "**Price growth.** If the company becomes more valuable, its share price tends to rise. If you sell for more than you paid, the profit is a **capital gain**.",
                "**Dividends.** Some companies pay part of their profits to shareholders, often every quarter. Many growing companies pay none and reinvest instead.",
              ],
            },
            {
              type: "p",
              text: "In the short run, prices react to news, interest rates and investor mood, so they can swing a lot. Over long periods, prices have tended to follow company earnings.",
            },
          ],
        },
        {
          heading: "The risk of owning just one",
          blocks: [
            {
              type: "p",
              text: "Any single company can stumble. Products flop, competitors win, and some companies go bankrupt, making their shares worth nothing. Famous names aren't immune.",
            },
            {
              type: "callout",
              tone: "caution",
              title: "Knowing a brand isn't research",
              text: "Loving a company's products doesn't mean its stock is a good buy. The price already reflects what millions of investors expect. That's one reason most beginners do better owning many companies through a fund, which you'll meet in lesson 7.",
            },
          ],
        },
      ],
      takeaways: [
        "A share is part-ownership of a real business.",
        "Stock returns come from price growth and, sometimes, dividends.",
        "Any single company can fail, so owning just one is risky.",
      ],
      keyTerms: ["Stock", "Dividend", "Capital gain"],
      quiz: [
        {
          question: "What do you own when you buy a share of stock?",
          options: [
            "A loan to the company",
            "A small piece of ownership in the company",
            "A guarantee of future profits",
            "A product the company makes",
          ],
          answer: 1,
          explanation: "A share is part-ownership. Lending to a company is a bond, which is the next lesson.",
        },
        {
          question: "What is a dividend?",
          options: [
            "A fee your broker charges",
            "A share of company profits paid to shareholders",
            "The price you pay for a share",
            "A tax on stock sales",
          ],
          answer: 1,
          explanation: "Some companies pay dividends from profits. Not all do, and they can be cut.",
        },
        {
          question: "Why is putting all your money in one company's stock risky?",
          options: [
            "Because individual stocks can't pay dividends",
            "Because one company's problems could wipe out a big part of your money",
            "Because you're not allowed to sell it",
            "It isn't risky if it's a famous company",
          ],
          answer: 1,
          explanation: "Even large, well-known companies can decline or fail. Spreading money out limits the damage.",
        },
      ],
      askPrompt: "Explain what drives a company's stock price up or down, using a simple example.",
    },
    {
      slug: "bonds",
      title: "Bonds: lending your money",
      minutes: 6,
      summary: "A bond is a loan to a government or company that pays interest. Bonds usually move less than stocks and earn less over time.",
      sections: [
        {
          heading: "How a bond works",
          blocks: [
            {
              type: "p",
              text: "When you buy a **bond**, you're lending money. The borrower, a government or a company, promises to pay interest on a schedule and repay the full amount on a set date, called maturity.",
            },
            {
              type: "callout",
              tone: "example",
              title: "A simple bond",
              text: "You buy a $1,000 bond that pays 4% a year for 5 years. You'd receive $40 a year in interest, and your $1,000 back at the end, as long as the borrower doesn't default.",
            },
          ],
        },
        {
          heading: "Not all bonds are equally safe",
          blocks: [
            {
              type: "list",
              items: [
                "**US Treasury bonds** are backed by the US government and considered among the safest.",
                "**Corporate bonds** usually pay more, because companies are more likely than the government to miss payments.",
                "**High-yield (junk) bonds** pay the most because the borrowers are the riskiest.",
              ],
            },
            {
              type: "p",
              text: "Higher interest is compensation for more risk. A bond paying far more than others is telling you something.",
            },
          ],
        },
        {
          heading: "Why bond prices move",
          blocks: [
            {
              type: "p",
              text: "Bonds can be sold before maturity, and their prices change. When interest rates rise, older bonds paying lower rates become less attractive, so their prices fall. When rates fall, older bonds become more valuable. Prices and rates move in opposite directions.",
            },
            {
              type: "p",
              text: "Bonds generally swing less than stocks and have earned less over long periods. Many portfolios hold some bonds to soften the ride, especially as a goal gets closer.",
            },
          ],
        },
      ],
      takeaways: [
        "A bond is a loan that pays interest and returns your money at maturity.",
        "Riskier borrowers pay higher interest.",
        "When interest rates rise, existing bond prices fall, and the reverse.",
      ],
      keyTerms: ["Bond", "Yield"],
      quiz: [
        {
          question: "When you buy a bond, what are you doing?",
          options: [
            "Buying ownership in a company",
            "Lending money in exchange for interest",
            "Opening a savings account",
            "Buying a fund of stocks",
          ],
          answer: 1,
          explanation: "A bond is a loan. You get interest and, at maturity, your money back if the borrower pays.",
        },
        {
          question: "Why do corporate bonds usually pay more interest than US Treasury bonds?",
          options: [
            "Companies are more generous",
            "Companies are more likely to miss payments, so investors want extra reward",
            "Treasury bonds are taxed more",
            "They don't; they pay the same",
          ],
          answer: 1,
          explanation: "More risk of default means investors demand more interest to take it on.",
        },
        {
          question: "If interest rates rise, what usually happens to the prices of existing bonds?",
          options: ["They rise", "They fall", "They stay exactly the same", "They double"],
          answer: 1,
          explanation: "New bonds pay more, so older lower-paying bonds are worth less. Prices and rates move in opposite directions.",
        },
      ],
      askPrompt: "Why do bond prices fall when interest rates go up? Walk me through it with numbers.",
    },
    {
      slug: "funds",
      title: "Funds, index funds and ETFs",
      minutes: 8,
      summary: "A fund pools money from many investors to buy many investments at once. Low-cost index funds are the backbone of most beginner portfolios.",
      sections: [
        {
          heading: "Buying a basket instead of one egg",
          blocks: [
            {
              type: "p",
              text: "A **fund** collects money from lots of investors and buys a large collection of stocks, bonds or both. One purchase can give you a slice of hundreds or thousands of companies.",
            },
            {
              type: "p",
              text: "That makes it easy to spread risk. If one company in a 500-company fund collapses, it's a small dent rather than a disaster.",
            },
          ],
        },
        {
          heading: "Active funds versus index funds",
          blocks: [
            {
              type: "list",
              items: [
                "**Actively managed funds** pay professionals to pick investments they hope will beat the market. They typically charge higher fees.",
                "**Index funds** simply hold everything in a market index, such as the S&P 500 (about 500 large US companies) or a total market index (thousands of companies). They aim to match the market, not beat it, and usually charge very low fees.",
              ],
            },
            {
              type: "p",
              text: "Long-running research, including the S&P SPIVA reports, has found that most actively managed funds trail their index over 10 to 15 years, largely because of their higher costs. That's why many experts suggest low-cost index funds for most people.",
            },
          ],
        },
        {
          heading: "ETFs and mutual funds",
          blocks: [
            {
              type: "table",
              caption: "Two common ways funds are packaged",
              headers: ["", "ETF (exchange-traded fund)", "Mutual fund"],
              rows: [
                ["How you buy", "Like a stock, through any brokerage, during market hours", "From the fund company or a brokerage, once a day at the closing price"],
                ["Minimum", "One share, or less with fractional shares", "Sometimes a set minimum, like $1,000"],
                ["Can it be an index fund?", "Yes, most are", "Yes, many are"],
              ],
            },
            {
              type: "p",
              text: "Both can be excellent. What matters most is what the fund holds and what it costs, which you'll learn to check in the fees lesson.",
            },
          ],
        },
      ],
      takeaways: [
        "A fund lets you own many investments with one purchase.",
        "Index funds track a market instead of trying to beat it, usually at very low cost.",
        "ETFs and mutual funds are two wrappers; check what's inside and the fee.",
      ],
      keyTerms: ["Index fund", "ETF", "Mutual fund", "Diversification"],
      quiz: [
        {
          question: "What does an S&P 500 index fund hold?",
          options: [
            "The 500 best-performing stocks of the year",
            "About 500 large US companies in the index",
            "500 different bonds",
            "Whatever the manager thinks will win",
          ],
          answer: 1,
          explanation: "It holds the companies in the index, aiming to match its performance.",
        },
        {
          question: "What's a main reason index funds often beat actively managed funds over long periods?",
          options: [
            "Index funds are guaranteed to rise",
            "Their lower costs leave more of the return for investors",
            "They only buy technology companies",
            "They avoid all market drops",
          ],
          answer: 1,
          explanation: "Fees come out of returns every year, and index funds usually charge far less.",
        },
        {
          question: "What's one practical difference between an ETF and a mutual fund?",
          options: [
            "ETFs trade during the day like a stock; mutual funds trade once a day",
            "Only mutual funds can hold stocks",
            "ETFs can't be index funds",
            "Mutual funds have no fees",
          ],
          answer: 0,
          explanation: "ETFs trade throughout the day on an exchange. Mutual fund orders are filled at the day's closing price.",
        },
      ],
      askPrompt: "What's the difference between an S&P 500 fund and a total stock market fund, and does it matter for a beginner?",
    },
    {
      slug: "how-markets-work",
      title: "How buying and selling works",
      minutes: 6,
      summary: "Brokerages, tickers, market and limit orders, and fractional shares: what really happens when you invest.",
      sections: [
        {
          heading: "Brokerages and exchanges",
          blocks: [
            {
              type: "p",
              text: "You don't buy stocks directly from a company. You open an account with a **brokerage**, a firm licensed to place orders for you on stock exchanges like the NYSE or Nasdaq, where buyers and sellers are matched.",
            },
            {
              type: "p",
              text: "Each investment has a short code called a **ticker**. For example, AAPL is Apple. Funds have tickers too. Always double-check the ticker, since similar-looking codes can be completely different investments.",
            },
          ],
        },
        {
          heading: "Placing an order",
          blocks: [
            {
              type: "list",
              items: [
                "A **market order** buys or sells right away at the best available price. It's simple, but the price can shift a little by the time it fills.",
                "A **limit order** sets the most you'll pay (or the least you'll accept when selling). It only fills at that price or better, so it might not fill at all.",
              ],
            },
            {
              type: "p",
              text: "There's always a small gap between the highest price a buyer offers (the bid) and the lowest price a seller asks (the ask). For large, popular funds this gap is usually tiny.",
            },
          ],
        },
        {
          heading: "Fractional shares and automatic investing",
          blocks: [
            {
              type: "p",
              text: "Many brokerages let you buy **fractional shares**, so $50 can buy part of a share that costs $400. Many also let you set up automatic investments on a schedule, which is one of the easiest ways to build the habit.",
            },
            {
              type: "callout",
              tone: "tip",
              title: "In the US, you usually need to be 18",
              text: "Most brokerages require account holders to be adults. Younger investors can invest through a custodial account that a parent or guardian manages. You'll learn about account types in module 4.",
            },
          ],
        },
      ],
      takeaways: [
        "A brokerage account is how you buy and sell investments.",
        "Market orders fill right away; limit orders control the price but might not fill.",
        "Fractional shares and automatic investing make small amounts easy to invest.",
      ],
      keyTerms: ["Brokerage account", "Market order", "Limit order"],
      quiz: [
        {
          question: "What's the difference between a market order and a limit order?",
          options: [
            "A market order fills at the current price; a limit order only fills at your price or better",
            "A limit order always fills faster",
            "Market orders are only for bonds",
            "There's no difference",
          ],
          answer: 0,
          explanation: "Market orders prioritize speed. Limit orders prioritize price and may not fill.",
        },
        {
          question: "What lets you invest $50 in a fund whose shares cost $400 each?",
          options: ["A limit order", "Fractional shares", "A dividend", "A bond"],
          answer: 1,
          explanation: "Fractional shares let you buy part of a share, where the brokerage offers it.",
        },
        {
          question: "What is a ticker?",
          options: [
            "A fee for each trade",
            "A short code that identifies an investment",
            "The time the market opens",
            "A type of bond",
          ],
          answer: 1,
          explanation: "Tickers like AAPL identify investments. Double-check them before you buy.",
        },
      ],
      askPrompt: "What should I look for when placing my first order in a brokerage app?",
    },
  ],
}
