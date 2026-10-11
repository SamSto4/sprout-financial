import type { Module } from "../course.ts"

export const beforeYouInvest: Module = {
  id: "before-you-invest",
  title: "Before you invest",
  description: "Why investing matters, what to sort out first, and why starting young is such an advantage.",
  lessons: [
    {
      slug: "why-invest",
      title: "Why invest at all?",
      minutes: 6,
      summary: "Cash slowly loses buying power to inflation. Investing is how your money can grow faster than prices rise.",
      sections: [
        {
          heading: "Saving and investing are different jobs",
          blocks: [
            {
              type: "p",
              text: "**Saving** means keeping money safe and easy to reach, usually in a bank account. **Investing** means buying things that can grow in value over time, like shares of companies, and accepting that their value will go up and down along the way.",
            },
            {
              type: "p",
              text: "You need both. Savings cover the near future: next month's bills, a surprise repair, a trip you're planning. Investments are for goals that are years away, where there's time to ride out the bumps.",
            },
          ],
        },
        {
          heading: "The quiet problem with cash: inflation",
          blocks: [
            {
              type: "p",
              text: "**Inflation** is the general rise in prices over time. When prices go up, each dollar buys a little less. In the US, inflation has averaged very roughly 2–3% a year over long periods, though some years are much higher.",
            },
            {
              type: "callout",
              tone: "example",
              title: "What $1,000 buys in 20 years",
              text: "If prices rise 3% a year, $1,000 kept as cash for 20 years will buy only what about $554 buys today. The number on the balance hasn't changed, but its buying power has fallen by almost half.",
            },
            {
              type: "p",
              text: "A savings account that pays interest softens this, but after inflation it often only just keeps pace. To actually grow buying power over decades, most people need some of their money invested.",
            },
          ],
        },
        {
          heading: "How investments grow: compounding",
          blocks: [
            {
              type: "p",
              text: "When an investment earns a return, that return can earn its own return the following year. This snowball effect is called **compounding**. It starts slowly and speeds up over time, which is why time matters more than almost anything else.",
            },
            {
              type: "p",
              text: "A handy shortcut is the **Rule of 72**: divide 72 by a yearly return to estimate how many years it takes money to double. At 6% a year, that's about 12 years. Try different rates below.",
            },
            { type: "tool", tool: "doubling" },
            {
              type: "callout",
              tone: "caution",
              title: "Returns are never guaranteed",
              text: "Investments don't grow by a steady percentage each year. Some years are up a lot, some are down a lot. The rates in examples are assumptions to help you think, not promises.",
            },
          ],
        },
      ],
      takeaways: [
        "Savings are for the near future; investments are for goals that are years away.",
        "Inflation slowly shrinks what cash can buy, so money that sits still falls behind.",
        "Compounding means returns earn their own returns, and it needs time to work.",
      ],
      keyTerms: ["Inflation", "Compound interest", "Rule of 72"],
      quiz: [
        {
          question: "What's the main reason to invest money you won't need for many years?",
          options: [
            "To make sure the balance never goes down",
            "To give it a chance to grow faster than prices rise",
            "Because bank accounts are unsafe",
            "To get money back quickly if you need it",
          ],
          answer: 1,
          explanation: "Investing aims to grow buying power over long periods. It doesn't prevent drops, and it isn't the right place for money you need soon.",
        },
        {
          question: "If prices rise and your cash balance stays the same, what happens?",
          options: [
            "Your money buys more",
            "Nothing changes",
            "Your money buys less",
            "The bank adds interest to make up for it",
          ],
          answer: 2,
          explanation: "That's inflation: the number stays the same, but each dollar buys less than it used to.",
        },
        {
          question: "Using the Rule of 72, roughly how long does money take to double at 8% a year?",
          options: ["About 6 years", "About 9 years", "About 14 years", "About 72 years"],
          answer: 1,
          explanation: "72 ÷ 8 = 9, so about 9 years. It's an estimate, and real returns vary year to year.",
        },
      ],
      askPrompt: "Can you explain how inflation and compounding work together over 30 years, with a simple example?",
    },
    {
      slug: "money-foundation",
      title: "Build your foundation first",
      minutes: 7,
      summary: "Before investing, get three things in place: a budget that leaves money over, an emergency fund, and a plan for high-interest debt.",
      sections: [
        {
          heading: "Step 1: Know where your money goes",
          blocks: [
            {
              type: "p",
              text: "You can only invest money that's left over after your needs. A simple **budget** shows how much that is. One popular starting point is the 50/30/20 guideline: about half of take-home pay for needs, 30% for wants, and 20% for saving and investing.",
            },
            {
              type: "p",
              text: "It's a guide, not a rule. If you live at home and have few bills, you might save far more than 20%. If rent is high, you might start smaller. What matters is that the number is above zero and it happens every month.",
            },
            { type: "tool", tool: "budget" },
          ],
        },
        {
          heading: "Step 2: Build an emergency fund",
          blocks: [
            {
              type: "p",
              text: "An **emergency fund** is cash set aside for surprises: a lost job, a car repair, a medical bill. A common target is 3 to 6 months of essential spending, kept in a savings account you can reach quickly.",
            },
            {
              type: "p",
              text: "It protects your investments. Without one, a surprise bill could force you to sell investments at a bad time, or put the cost on a credit card. If 3 months feels far away, start with a first goal of $500 or $1,000.",
            },
          ],
        },
        {
          heading: "Step 3: Deal with expensive debt",
          blocks: [
            {
              type: "p",
              text: "Paying off a credit card that charges 25% interest is like earning a guaranteed 25% return. No investment reliably beats that, so high-interest debt usually comes before investing.",
            },
            {
              type: "p",
              text: "Low-interest debt, like many student loans or a car loan at a low rate, is different. Many people invest while paying those off on schedule, because the expected long-term return on investments can be higher than the interest rate.",
            },
            {
              type: "callout",
              tone: "tip",
              title: "A common order of priorities",
              text: "1) A small starter emergency fund. 2) Any employer retirement match, because it's free money. 3) Pay off high-interest debt. 4) Finish the emergency fund. 5) Invest steadily for long-term goals. Your situation may call for a different order, and that's fine.",
            },
          ],
        },
      ],
      takeaways: [
        "A budget tells you how much you can actually invest each month.",
        "An emergency fund keeps a surprise from forcing you to sell investments at a bad time.",
        "Paying off high-interest debt is a guaranteed return that investing can't match.",
      ],
      keyTerms: ["Budget", "Emergency fund", "APR"],
      quiz: [
        {
          question: "Why should an emergency fund usually come before investing?",
          options: [
            "Because emergency funds earn higher returns",
            "So a surprise cost doesn't force you to sell investments or borrow",
            "Because you can't invest without one",
            "Because banks require it",
          ],
          answer: 1,
          explanation: "The fund is a buffer. It lets your investments stay invested when life throws a surprise.",
        },
        {
          question: "You have a credit card charging 24% APR. What's paying it off most like?",
          options: [
            "A risky investment",
            "A guaranteed 24% return",
            "A savings account",
            "Something with no financial benefit",
          ],
          answer: 1,
          explanation: "Every dollar of that balance you pay off stops costing you 24% a year, with no risk involved.",
        },
        {
          question: "What does the 50/30/20 guideline suggest putting toward savings and investing?",
          options: ["5% of take-home pay", "20% of take-home pay", "30% of take-home pay", "50% of take-home pay"],
          answer: 1,
          explanation: "About 20%, with 50% for needs and 30% for wants. Adjust it to your own life.",
        },
      ],
      askPrompt: "Help me figure out whether I'm ready to start investing. What should I check first?",
    },
    {
      slug: "goals-and-time",
      title: "Goals and time horizons",
      minutes: 5,
      summary: "When you'll need the money decides where it should live. The shorter the time, the less risk makes sense.",
      sections: [
        {
          heading: "Name the goal and the date",
          blocks: [
            {
              type: "p",
              text: "“Invest more” is hard to act on. “Have $5,000 for a car in 3 years” or “Build savings for retirement” tells you how much, and more importantly, **when**. That second part is your **time horizon**.",
            },
            {
              type: "p",
              text: "Stock prices can fall a lot in a single year and take years to recover. If you'll need the money soon, a drop could hit at exactly the wrong moment. With a long horizon, you have time to wait for a recovery.",
            },
          ],
        },
        {
          heading: "Match the money to the timeline",
          blocks: [
            {
              type: "table",
              caption: "A common way to think about where money for different goals might go",
              headers: ["Time until you need it", "Example goals", "Where it often goes"],
              rows: [
                ["Under 3 years", "Emergency fund, trip, laptop, car", "Savings account or other cash"],
                ["3 to 10 years", "Home deposit, grad school", "A mix of cash, bonds and some stocks"],
                ["10+ years", "Retirement, long-term wealth", "Mostly diversified stock funds"],
              ],
            },
            {
              type: "p",
              text: "These are starting points, not rules. Your comfort with ups and downs, called **risk tolerance**, matters too. Someone who would panic and sell during a drop may do better with a slightly calmer mix they can stick with.",
            },
          ],
        },
        {
          heading: "Young investors have a superpower",
          blocks: [
            {
              type: "p",
              text: "At 18 or 25, retirement is 40 years or more away. That long horizon means you can usually afford more ups and downs in exchange for higher expected growth, and you have decades for compounding to work.",
            },
            {
              type: "callout",
              tone: "tip",
              title: "Write it down",
              text: "List two or three goals with an amount and a year for each. You'll use this list later when choosing accounts and building a portfolio.",
            },
          ],
        },
      ],
      takeaways: [
        "Every goal needs an amount and a date.",
        "Money needed within a few years usually shouldn't be in stocks.",
        "A long time horizon is the biggest advantage young investors have.",
      ],
      keyTerms: ["Time horizon", "Risk tolerance"],
      quiz: [
        {
          question: "You need $3,000 for a car in 18 months. Where does that money most sensibly go?",
          options: ["A single hot stock", "A stock index fund", "A savings account", "Cryptocurrency"],
          answer: 2,
          explanation: "With a short horizon, a market drop could leave you short when you need to buy. Cash keeps it available.",
        },
        {
          question: "What is a time horizon?",
          options: [
            "How long a stock market is open each day",
            "How long until you need the money for a goal",
            "How long a fund has existed",
            "How often you check your account",
          ],
          answer: 1,
          explanation: "It's the time between now and when you'll spend the money, and it shapes how much risk makes sense.",
        },
        {
          question: "Why can young investors often take more risk with retirement money?",
          options: [
            "Because stocks are guaranteed to rise over 40 years",
            "Because they have decades to recover from drops",
            "Because young people pay no taxes",
            "Because risk doesn't matter for small amounts",
          ],
          answer: 1,
          explanation: "Time gives room to recover from bad years. It improves the odds but doesn't guarantee an outcome.",
        },
      ],
      askPrompt: "I have a few money goals. Can you help me sort them by time horizon and suggest where each might go?",
    },
    {
      slug: "starting-early",
      title: "The power of starting early",
      minutes: 6,
      summary: "Ten years of head start can matter more than decades of extra contributions. Here's the math.",
      sections: [
        {
          heading: "A tale of two investors",
          blocks: [
            {
              type: "p",
              text: "Alex invests $200 a month from age 18 to 28, then stops completely. Jordan starts at 28 and invests $200 a month all the way to 65. Assume both earn 7% a year, compounded monthly.",
            },
            {
              type: "table",
              caption: "Illustration at an assumed 7% yearly return. Real returns vary.",
              headers: ["", "Years investing", "Total put in", "Value at 65"],
              rows: [
                ["Alex (18–28, then stops)", "10", "$24,000", "About $458,000"],
                ["Jordan (28–65)", "37", "$88,800", "About $419,000"],
                ["Both habits (18–65)", "47", "$112,800", "About $877,000"],
              ],
            },
            {
              type: "p",
              text: "Alex put in less than a third as much money and still ended up with more, because Alex's money had ten extra years to compound. Starting early and never stopping does best of all.",
            },
          ],
        },
        {
          heading: "Try it yourself",
          blocks: [
            {
              type: "p",
              text: "Change the starting amount, the monthly amount, the return and the years. Watch how the growth portion (the part you didn't put in yourself) takes over in later years.",
            },
            { type: "tool", tool: "compound" },
          ],
        },
        {
          heading: "Small and steady beats perfect",
          blocks: [
            {
              type: "p",
              text: "You don't need a lot to start. Many brokerages have no account minimum and let you buy fractions of a share. $25 or $50 a month builds the habit, and you can raise it as your income grows.",
            },
            {
              type: "callout",
              tone: "caution",
              title: "About the 7%",
              text: "US stocks have averaged roughly 10% a year before inflation over long periods, or about 6–7% after inflation, with big swings along the way. Future returns could be higher or lower. Treat any single rate as an assumption.",
            },
          ],
        },
      ],
      takeaways: [
        "Time in the market does much of the work; your contributions do the rest.",
        "Starting with a small amount now can beat starting with a larger amount later.",
        "Any projected return is an assumption, not a promise.",
      ],
      keyTerms: ["Compound interest", "Principal"],
      quiz: [
        {
          question: "In the example, why did Alex end up with more than Jordan despite investing less?",
          options: [
            "Alex picked better stocks",
            "Alex's money had more years to compound",
            "Alex earned a higher return",
            "Jordan paid more in fees",
          ],
          answer: 1,
          explanation: "Both earned the same assumed return. The difference is time: Alex's early dollars grew for decades longer.",
        },
        {
          question: "Which habit tends to produce the most wealth over a lifetime?",
          options: [
            "Waiting until you can invest a large amount",
            "Starting early and investing steadily",
            "Investing only when the market seems cheap",
            "Checking your account every day",
          ],
          answer: 1,
          explanation: "Starting early and staying consistent lets compounding do the most work.",
        },
        {
          question: "What's the right way to think about a 7% yearly return in an example?",
          options: [
            "It's guaranteed for stock funds",
            "It's an assumption; real returns vary a lot year to year",
            "It's the minimum you'll earn",
            "It's what savings accounts pay",
          ],
          answer: 1,
          explanation: "Examples need a number, but markets don't move in straight lines. Real returns will differ.",
        },
      ],
      askPrompt: "If I start investing $100 a month at my age, what could that look like by retirement? Show the assumptions.",
    },
  ],
}
