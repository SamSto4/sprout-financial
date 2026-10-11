import type { Module } from "../course.ts"

export const costsAccountsTaxes: Module = {
  id: "costs-accounts-taxes",
  title: "Costs, accounts and taxes",
  description: "The unglamorous stuff that quietly decides how much you keep: fees, account types and taxes.",
  lessons: [
    {
      slug: "fees",
      title: "Fees add up",
      minutes: 6,
      summary: "A 1% fee sounds tiny, but over decades it can take a large share of your growth. Low costs are one of the few things you control.",
      sections: [
        {
          heading: "The fees to watch",
          blocks: [
            {
              type: "list",
              items: [
                "**Expense ratio:** a fund's yearly fee, as a percentage of what you have invested. Broad index funds often charge under 0.10%; many actively managed funds charge 0.5–1% or more.",
                "**Advisory fees:** some advisers and managed accounts charge around 0.25–1% a year on top of fund fees.",
                "**Trading and account fees:** many large US brokerages now charge $0 to trade stocks and ETFs, but check for account, transfer or inactivity fees.",
              ],
            },
            {
              type: "p",
              text: "Fees are taken out whether your investments go up or down, and they compound against you just like returns compound for you.",
            },
          ],
        },
        {
          heading: "What a fee costs over 30 years",
          blocks: [
            {
              type: "callout",
              tone: "example",
              title: "Same investing, different fees",
              text: "Start with $10,000, add $200 a month for 30 years, and assume a 7% yearly return before fees. With a 0.05% fee you'd end with about $321,600. With a 0.5% fee, about $291,200. With a 1% fee, about $261,100: roughly $60,000 less for the same effort.",
            },
            {
              type: "p",
              text: "Compare two fees yourself. This calculator treats the fee as coming straight off the yearly return, which is a close approximation.",
            },
            { type: "tool", tool: "fees" },
          ],
        },
        {
          heading: "How to find a fund's fees",
          blocks: [
            {
              type: "p",
              text: "Search the fund's ticker on your brokerage or the fund company's website and look for “expense ratio” or “net expense ratio”. It's also listed in the fund's prospectus and fact sheet.",
            },
            {
              type: "callout",
              tone: "tip",
              title: "Cheaper isn't everything, but it's a great start",
              text: "Between two funds that hold roughly the same things, the lower-cost one is usually the better choice. A higher fee has to be justified by something you actually need.",
            },
          ],
        },
      ],
      takeaways: [
        "Fees are charged every year, in good markets and bad.",
        "A difference of under 1% a year can cost tens of thousands over decades.",
        "Check the expense ratio before you buy any fund.",
      ],
      keyTerms: ["Expense ratio", "Index fund"],
      quiz: [
        {
          question: "What is an expense ratio?",
          options: [
            "The tax on selling a fund",
            "A fund's yearly fee as a percentage of your investment",
            "The fund's yearly return",
            "A one-time fee to open an account",
          ],
          answer: 1,
          explanation: "It's charged every year on the money you have in the fund.",
        },
        {
          question: "In the example, roughly how much less did the 1% fee leave you with than the 0.05% fee after 30 years?",
          options: ["About $600", "About $6,000", "About $60,000", "Nothing; fees don't compound"],
          answer: 2,
          explanation: "About $321,600 versus about $261,100. Fees compound over time just like returns.",
        },
        {
          question: "Two funds hold nearly the same investments. One charges 0.04%, the other 0.80%. Which is usually better?",
          options: [
            "The 0.80% fund, because expensive means better",
            "The 0.04% fund, because more of the return stays with you",
            "They're the same",
            "Neither; fees don't matter",
          ],
          answer: 1,
          explanation: "With similar holdings, the lower fee leaves more of the same return in your pocket.",
        },
      ],
      askPrompt: "How do I compare the fees of two funds, and what counts as a low expense ratio?",
    },
    {
      slug: "account-types",
      title: "Choosing the right account",
      minutes: 8,
      summary: "The account you invest in decides how your money is taxed. Tax-advantaged retirement accounts can make a big difference.",
      sections: [
        {
          heading: "Accounts are containers",
          blocks: [
            {
              type: "p",
              text: "An account holds your investments; it isn't an investment itself. You can hold the same index fund in a regular brokerage account or in a retirement account. The difference is the tax rules. The accounts below are US accounts; other countries have their own versions.",
            },
          ],
        },
        {
          heading: "The main options",
          blocks: [
            {
              type: "table",
              caption: "Common US account types. Contribution limits change yearly, so check IRS.gov for current figures.",
              headers: ["Account", "Tax treatment", "Good to know"],
              rows: [
                ["Roth IRA", "Put in after-tax money; qualified withdrawals in retirement are tax-free", "Needs earned income. You can take out your contributions (not earnings) anytime. High earners may be limited."],
                ["Traditional IRA", "Contributions may be tax-deductible; withdrawals are taxed", "Early withdrawals before 59½ usually owe a 10% penalty plus tax, with some exceptions."],
                ["401(k) or 403(b)", "Through an employer; traditional (pre-tax) or Roth versions", "Many employers match part of what you put in. Higher limits than IRAs."],
                ["Custodial account (UTMA/UGMA)", "Taxable; managed by an adult for a minor", "The money legally belongs to the minor and passes to them at 18–21, depending on the state."],
                ["Taxable brokerage account", "No special tax breaks; taxed on dividends and sales", "Flexible: no limits and no withdrawal rules. Good for goals before retirement."],
              ],
            },
          ],
        },
        {
          heading: "Why a Roth IRA suits many young investors",
          blocks: [
            {
              type: "p",
              text: "If you're early in your career, your tax rate is probably lower now than it will be later. A **Roth IRA** lets you pay tax now, at that lower rate, and then never pay tax on decades of growth if you follow the rules. Teens with a job can have a **custodial Roth IRA** opened by a parent, as long as the contributions don't exceed what they earned.",
            },
            {
              type: "callout",
              tone: "tip",
              title: "Never skip a match",
              text: "If your employer matches 401(k) contributions, for example 50 cents per dollar up to 6% of pay, contributing at least enough to get the full match is an instant return that's hard to beat. Check your plan's vesting rules, which may require you to stay a while to keep the match.",
            },
          ],
        },
      ],
      takeaways: [
        "Accounts decide taxes; investments decide growth.",
        "Roth accounts trade tax now for tax-free growth later, which often suits young, lower earners.",
        "Always contribute enough to get any employer match.",
      ],
      keyTerms: ["Roth IRA", "401(k)", "Employer match", "Custodial account", "Brokerage account"],
      quiz: [
        {
          question: "What's the key tax benefit of a Roth IRA?",
          options: [
            "Contributions are tax-deductible now",
            "Qualified withdrawals in retirement are tax-free",
            "There are no rules at all",
            "It pays guaranteed interest",
          ],
          answer: 1,
          explanation: "You contribute after-tax money, and qualified withdrawals, including growth, are tax-free.",
        },
        {
          question: "Your employer matches 401(k) contributions up to 5% of pay. What's usually the smart minimum to contribute?",
          options: ["0%", "Enough to get the full match", "Only after you've paid off every debt", "Exactly 1%"],
          answer: 1,
          explanation: "The match is extra money for you. Missing it is leaving part of your pay on the table.",
        },
        {
          question: "What do you need to contribute to a Roth IRA, including a custodial one?",
          options: ["A college degree", "Earned income, such as wages from a job", "At least $10,000", "A parent's permission for adults"],
          answer: 1,
          explanation: "Contributions can't exceed your earned income for the year, or the annual limit, whichever is lower.",
        },
      ],
      askPrompt: "Should I use a Roth IRA, a 401(k), or a regular brokerage account? Here's my situation.",
    },
    {
      slug: "investment-taxes",
      title: "Taxes on investing",
      minutes: 6,
      summary: "You may owe tax when you sell for a profit or receive dividends. How long you hold makes a big difference.",
      sections: [
        {
          heading: "When you owe tax in a regular account",
          blocks: [
            {
              type: "list",
              items: [
                "**Selling for a profit** creates a realized **capital gain**. If your investment has risen but you haven't sold, there's no tax yet.",
                "**Dividends and interest** are generally taxable in the year you receive them, even if they're automatically reinvested.",
              ],
            },
            {
              type: "p",
              text: "Inside retirement accounts like IRAs and 401(k)s, these day-to-day gains and dividends aren't taxed each year. Taxes (if any) depend on the account's rules when you withdraw.",
            },
          ],
        },
        {
          heading: "Short-term versus long-term gains (US)",
          blocks: [
            {
              type: "table",
              caption: "US federal rules in brief. State taxes may also apply.",
              headers: ["", "Short-term", "Long-term"],
              rows: [
                ["Held for", "One year or less", "More than one year"],
                ["Taxed like", "Regular income, at your normal rate", "Lower special rates: 0%, 15% or 20% depending on income"],
              ],
            },
            {
              type: "p",
              text: "This is one more reason frequent trading tends to cost more: gains are more often taxed at the higher short-term rate. Losses can offset gains, and some leftover losses can reduce other income, within limits.",
            },
          ],
        },
        {
          heading: "Taxes for young investors",
          blocks: [
            {
              type: "p",
              text: "If you're a minor (or a full-time student under 24), investment income above a certain amount can be taxed at your parents' rate, under what's called the “kiddie tax”. Keep it in mind if you have a large custodial account.",
            },
            {
              type: "callout",
              tone: "tip",
              title: "Keep the paperwork",
              text: "Your brokerage sends tax forms (like the 1099) early each year. Keep them, and ask a tax professional if your situation is complicated. Tax rules change, so check current IRS guidance.",
            },
          ],
        },
      ],
      takeaways: [
        "In taxable accounts, you owe tax on dividends and on profits when you sell.",
        "Holding more than a year usually means a lower tax rate on gains.",
        "Retirement accounts shelter growth from yearly taxes.",
      ],
      keyTerms: ["Capital gain", "Dividend", "Roth IRA"],
      quiz: [
        {
          question: "Your fund has risen $500 but you haven't sold. In a taxable account, do you owe capital gains tax on that $500?",
          options: ["Yes, every year", "No, not until you sell", "Only if it's a bond", "Only in a Roth IRA"],
          answer: 1,
          explanation: "Unrealized gains aren't taxed. Tax is due when you sell and realize the gain. Dividends are taxed as received.",
        },
        {
          question: "In the US, how long do you need to hold an investment for a gain to count as long-term?",
          options: ["One week", "More than one year", "Five years", "Until retirement"],
          answer: 1,
          explanation: "More than one year. Long-term gains usually get lower tax rates than short-term ones.",
        },
        {
          question: "Why can frequent trading increase your tax bill?",
          options: [
            "Trading is taxed per click",
            "Short-term gains are taxed at higher regular income rates",
            "Brokerages add a trading tax",
            "It doesn't affect taxes",
          ],
          answer: 1,
          explanation: "Selling within a year means gains are taxed like regular income, often at a higher rate.",
        },
      ],
      askPrompt: "How are dividends and capital gains taxed for someone my age? Keep it simple.",
    },
  ],
}
