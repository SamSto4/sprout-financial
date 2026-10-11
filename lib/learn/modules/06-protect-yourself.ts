import type { Module } from "../course.ts"

export const protectYourself: Module = {
  id: "protect-yourself",
  title: "Protect yourself",
  description: "Tell investing from gambling, spot scams and hype, and outsmart the habits that trip investors up.",
  lessons: [
    {
      slug: "investing-vs-speculating",
      title: "Investing versus speculating",
      minutes: 7,
      summary: "Single stocks, crypto, options and day trading can feel exciting. Know the risks, and keep any speculation small.",
      sections: [
        {
          heading: "What makes something speculation",
          blocks: [
            {
              type: "p",
              text: "**Investing** is owning productive assets, like businesses, for years and sharing in their growth. **Speculation** is betting on short-term price moves, often in things that are hard to value. Speculation can pay off, but outcomes are much closer to a coin flip, and losses can be total.",
            },
          ],
        },
        {
          heading: "Common high-risk areas",
          blocks: [
            {
              type: "list",
              items: [
                "**Day trading:** buying and selling within days or hours. Studies of day traders have consistently found that most lose money over time.",
                "**Cryptocurrencies:** extremely volatile. Bitcoin has fallen more than 70% from its peak more than once, and many smaller coins have gone to nearly zero. Scams and exchange failures are common.",
                "**Options and leverage:** these can magnify gains and losses. Options can expire worthless, and borrowing to invest (margin) can lose more than you put in.",
                "**Meme stocks and hot tips:** prices driven by social media hype can collapse as fast as they rise.",
              ],
            },
          ],
        },
        {
          heading: "If you want to speculate, fence it off",
          blocks: [
            {
              type: "p",
              text: "Some people set aside a small “fun money” amount, often suggested as no more than about 5% of their investments, for picks and experiments, and keep the rest in a diversified plan. Only use money you could lose entirely without it affecting your goals.",
            },
            {
              type: "callout",
              tone: "caution",
              title: "Never speculate with",
              text: "Your emergency fund, money you'll need within a few years, or borrowed money, including credit cards.",
            },
          ],
        },
      ],
      takeaways: [
        "Investing is long-term ownership; speculation is betting on short-term moves.",
        "Day trading, crypto, options and leverage can all lead to large or total losses.",
        "If you speculate, cap it at a small amount you can afford to lose.",
      ],
      keyTerms: ["Speculation", "Volatility", "Diversification"],
      quiz: [
        {
          question: "What have studies generally found about day traders?",
          options: [
            "Most earn steady profits",
            "Most lose money over time",
            "They beat index funds on average",
            "They never pay taxes",
          ],
          answer: 1,
          explanation: "Research across several countries has found that the large majority of day traders lose money.",
        },
        {
          question: "What's a sensible way to handle the urge to speculate?",
          options: [
            "Use your emergency fund",
            "Borrow on a credit card",
            "Limit it to a small amount you can afford to lose entirely",
            "Put all your savings into one hot tip",
          ],
          answer: 2,
          explanation: "A small, capped amount keeps speculation from threatening your real goals.",
        },
        {
          question: "What can happen when you invest with borrowed money (margin)?",
          options: [
            "You can't lose money",
            "You can lose more than you put in",
            "Your returns are guaranteed",
            "Nothing different from normal investing",
          ],
          answer: 1,
          explanation: "Leverage magnifies losses as well as gains, and you still owe the loan.",
        },
      ],
      askPrompt: "I'm curious about crypto and individual stocks. How can I explore them without putting my goals at risk?",
    },
    {
      slug: "scams-and-biases",
      title: "Scams, hype and your own brain",
      minutes: 7,
      summary: "Learn the warning signs of investment scams, how to read financial content online, and the mental traps that cost investors money.",
      sections: [
        {
          heading: "Scam warning signs",
          blocks: [
            {
              type: "list",
              items: [
                "**Guaranteed high returns** or “no risk”. Real investments always carry risk.",
                "**Urgency and secrecy:** “act now”, “limited spots”, “don't tell anyone”.",
                "**Unusual payment:** gift cards, wiring money to a person, or sending crypto.",
                "**Can't withdraw** unless you first pay a “tax” or “fee”.",
                "**Contact out of the blue**, especially through social media, messaging apps or dating apps.",
              ],
            },
            {
              type: "p",
              text: "If something feels off, stop and check. Verify people and firms on FINRA BrokerCheck or Investor.gov, and report fraud to the SEC or at ReportFraud.ftc.gov.",
            },
          ],
        },
        {
          heading: "Reading money content online",
          blocks: [
            {
              type: "p",
              text: "Plenty of creators share useful information, but some are paid to promote products, or profit when you buy what they already own. Ask: How does this person make money? Are they showing their losses too? Is there a clear disclosure of sponsorships?",
            },
            {
              type: "callout",
              tone: "caution",
              title: "Pump and dump",
              text: "A classic scheme: promoters hype a small, thinly traded stock or coin, the price jumps as people pile in, and the promoters sell at the top, leaving everyone else with the crash.",
            },
          ],
        },
        {
          heading: "Mental traps",
          blocks: [
            {
              type: "table",
              caption: "Common biases and a counter-move for each",
              headers: ["Trap", "What it looks like", "Counter-move"],
              rows: [
                ["FOMO / herd behavior", "Buying because everyone else is", "Stick to your written plan"],
                ["Loss aversion", "Selling in a panic, or holding losers to avoid admitting a mistake", "Decide rules in advance, like rebalancing once a year"],
                ["Overconfidence", "Believing you can reliably pick winners or time the market", "Keep most money in diversified index funds"],
                ["Recency bias", "Assuming recent trends will continue forever", "Look at long-term history, including bad decades"],
              ],
            },
          ],
        },
      ],
      takeaways: [
        "Guaranteed returns, pressure and unusual payment requests are classic scam signs.",
        "Ask how a financial creator makes money before trusting their tips.",
        "A written plan is the best defense against your own biases.",
      ],
      keyTerms: ["Speculation", "Diversification"],
      quiz: [
        {
          question: "Someone on a messaging app promises 30% monthly returns with no risk. What is this most likely to be?",
          options: ["A great opportunity", "A scam", "A normal index fund", "A savings account"],
          answer: 1,
          explanation: "Guaranteed high returns and unsolicited contact are two of the clearest scam warning signs.",
        },
        {
          question: "What happens in a pump and dump?",
          options: [
            "A fund rebalances automatically",
            "Promoters hype an asset, then sell at the top as others buy",
            "A company pays a special dividend",
            "A bond reaches maturity",
          ],
          answer: 1,
          explanation: "The promoters profit from the price spike their hype created, and later buyers are left with losses.",
        },
        {
          question: "What's a good defense against FOMO?",
          options: [
            "Checking social media more often",
            "Following a written investing plan",
            "Buying whatever is trending",
            "Trading more frequently",
          ],
          answer: 1,
          explanation: "A plan made in calm times helps you ignore hype and stick to your goals.",
        },
      ],
      askPrompt: "Someone offered me an investment opportunity online. What questions should I ask to check if it's legitimate?",
    },
  ],
}
