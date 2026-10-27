// Frequently asked questions: the /faq page, the links at the bottom of the home and About pages,
// and the page's structured data (faqPageJsonLd in lib/seo/json-ld.ts) are all built from faqGroups().
//
// Every answer describes what the code does today, and the comment above each item names the files
// that back it. When you change one of those behaviours, update the answer in the same change.
// Answers that depend on how this server is set up take SiteFeatures, so the page never describes
// something that's switched off here. Figures come from the code's constants, never typed by hand.
// Kept free of framework imports so it can be unit-tested with `node --test`.

import { MAX_SESSION_AGE_MS } from "./auth/session-version.ts"
import { MAX_CONTEXT_CHATS } from "./chat/history.ts"
import { LESSONS } from "./learn/course.ts"
import { MAX_SCREENSHOTS } from "./screenshots/image.ts"
import type { SiteFeatures } from "./site.ts"

/** A run of answer text: plain, or a link to a page on this site ("/path") or to another answer ("#id"). */
export type FaqText = string | { text: string; href: string }
export type FaqBlock = { type: "p"; text: FaqText[] } | { type: "list"; items: FaqText[][] }
export type FaqItem = { id: string; question: string; answer: FaqBlock[] }
export type FaqGroup = { id: string; title: string; items: FaqItem[] }

const DAY_MS = 24 * 60 * 60 * 1000

const p = (...text: FaqText[]): FaqBlock => ({ type: "p", text })
const list = (...items: FaqText[][]): FaqBlock => ({ type: "list", items })
const link = (text: string, href: string): FaqText => ({ text, href })
/** The values when `on`, otherwise nothing: for answers and items that depend on SiteFeatures. */
function when<T>(on: boolean, ...values: T[]): T[] {
  return on ? values : []
}

export function faqGroups(features: SiteFeatures): FaqGroup[] {
  // Email confirmation, two-step verification, Google sign-in and login limits only exist alongside accounts.
  const accounts = features.accounts
  const emailConfirmation = accounts && features.emailConfirmation
  const twoFactor = accounts && features.twoFactor
  const google = accounts && features.googleSignIn
  const loginLimits = accounts && features.loginLimits
  const passwordReset = accounts && features.passwordReset
  const marketData = features.marketData
  const sessionDays = Math.round(MAX_SESSION_AGE_MS / DAY_MS)

  const groups: FaqGroup[] = [
    {
      id: "about-sprout",
      title: "About Sprout",
      items: [
        {
          // lib/site.ts (SITE_TAGLINE), lib/learn/course.ts (LESSONS), AGENTS.md section 1
          id: "what-is-sprout",
          question: "What is Sprout?",
          answer: [
            p(
              `Sprout is a website for learning how money works, in plain English. It has a ${LESSONS.length}-lesson course, a step-by-step money plan, a check-up for your investments, a spending dashboard, calculators, and an AI coach that answers your questions and shows its working.`
            ),
            p("It's built to help you understand your options and make your own decisions, not to make them for you."),
          ],
        },
        {
          // lib/learn/course.ts (COURSE_TAGLINE), lib/ai/system-prompt.ts (SYSTEM_PROMPT, first paragraph), lib/learn/glossary.ts
          id: "who-is-sprout-for",
          question: "Who is Sprout for?",
          answer: [
            p(
              "Anyone starting out with money, especially teens and twenty-somethings making their first decisions about saving, debt and investing."
            ),
            p(
              "You don't need any background. The ",
              link("course", "/learn"),
              " starts from the basics, and its glossary explains the jargon in plain English."
            ),
          ],
        },
        {
          // app/(pages)/about/page.tsx (the earlier FAQ's wording, kept by the product owner), README.md ("a free public demo").
          // There is no payment code in app/, components/ or lib/.
          id: "does-sprout-cost-anything",
          question: "Does Sprout cost anything?",
          answer: [
            p(
              "Sprout is free to use while it's in development, and there's nothing to buy inside it. Pricing may change once it launches fully."
            ),
          ],
        },
        {
          // lib/ai/system-prompt.ts (Boundaries: "educational AI tool, not a licensed financial advisor"), components/site-footer.tsx
          id: "is-sprout-financial-advice",
          question: "Is Sprout financial advice?",
          answer: [
            p(
              "No. Sprout is an educational tool, not a licensed financial advisor, and nothing it shows or says is personal financial advice. It explains options, trade-offs and risks so you can decide for yourself."
            ),
            p(
              "For big or complicated situations, such as large sums, taxes, an inheritance or a divorce, it suggests talking to a qualified professional, like a fee-only fiduciary advisor or a tax professional."
            ),
          ],
        },
        {
          // lib/format.ts (USD), lib/learn/modules/04-costs-accounts-taxes.ts ("The accounts below are US accounts"),
          // lib/ai/system-prompt.ts (asks for country, "don't assume US accounts"), lib/plan/roadmap.ts (tax-advantaged step outside the US)
          id: "can-i-use-sprout-outside-the-us",
          question: "Can I use Sprout outside the US?",
          answer: [
            p(
              "Yes, though some parts are written for the US. Amounts are shown in US dollars, and the lesson on ",
              link("choosing an account", "/learn/account-types"),
              " uses US accounts such as the Roth IRA and 401(k) as examples."
            ),
            p(
              "The assistant asks which country you're in before giving strategy advice, because account types and tax rules differ. If your plan says you live somewhere else, its roadmap points you to your own country's tax-advantaged accounts instead of US ones."
            ),
          ],
        },
      ],
    },
    {
      id: "your-data",
      title: "Your data and your account",
      items: [
        {
          // lib/stores.ts (localStorage), lib/sync/account-sync.ts (merge on sign-in, then upload changes),
          // app/api/account/data/[key]/route.ts (PARSERS: finances, progress, profile, portfolio, budget), app/api/account/chats
          id: "do-i-need-an-account",
          question: "Do I need an account?",
          answer: [
            p(
              "No. Every lesson, tool and calculator works without one, and so does the assistant. What you enter is saved in the browser you're using."
            ),
            ...when(
              accounts,
              p(
                "An account saves your chats, course progress and quiz scores, plan, portfolio, monthly budgets and imported transactions, and keeps them in step on every device you log in on. Without one, clearing your browser or switching devices means starting again."
              ),
              p(
                "You can ",
                link("create an account", "/login?mode=signup"),
                " whenever you like. What's already saved in your browser is merged into it when you log in."
              )
            ),
          ],
        },
        {
          // lib/stores.ts, lib/sync/account-sync.ts, components/account-menu.tsx ("Signing out removes your data from this device"),
          // lib/db/account-data.ts, AGENTS.md section 8 ("Not synced: the AI review ..., the memory and share switches")
          id: "where-is-my-data-stored",
          question: "Where is my data stored?",
          answer: [
            p(
              "In your browser first. Your plan, portfolio, budgets, imported transactions, chats and course progress are saved in this browser's storage, on your device."
            ),
            ...when(
              accounts,
              p(
                "When you're logged in, they're also saved to your Sprout account so they sync across your devices. Signing out removes them from the device you're using; they stay in your account. Two things stay on each device and aren't synced: the switches that control what the assistant can see, and the dashboard's AI spending review."
              )
            ),
            p(
              "Nothing is sent to the AI until you use one of its features, such as asking the assistant a question or importing a screenshot. ",
              link("What the assistant sees", "#what-does-the-ai-see"),
              " has the details."
            ),
          ],
        },
        {
          // components/assistant.tsx (the context sent with each question; sidebar switches), components/plan/plan-sidebar-panel.tsx,
          // components/plan/plan-builder.tsx (sharing starts on with the first save), components/portfolio/portfolio-builder.tsx,
          // components/finance-import.tsx ("Get investing tips"), components/finances/ai-insights.tsx, components/finances/finance-overview.tsx,
          // lib/stores.ts (memoryStore on by default, sharePlanStore, shareFinancesStore off by default),
          // lib/chat/history.ts (MAX_CONTEXT_CHATS), lib/ai/client.ts (Anthropic SDK), lib/ai/request-log.ts ("never what was said")
          id: "what-does-the-ai-see",
          question: "What does the AI assistant see?",
          answer: [
            p("Your questions and the conversation so far, plus what these switches allow:"),
            list(
              [
                `Your past chats saved in this browser (up to the ${MAX_CONTEXT_CHATS} most recent), so it remembers your goals. This is on unless you turn off “Let the assistant use past chats” in the assistant's side panel.`,
              ],
              [
                "Your plan and portfolio, while “Let the assistant see my plan and portfolio” is on. It turns on when you first save a plan or ask the assistant about your portfolio, and you can switch it off at any time.",
              ],
              [
                "Your imported transactions, only once you choose to share them: by switching on “Let the assistant see my transactions”, importing them next to the chat, or clicking “Get investing tips”. The Dashboard's “Review my spending” and “Ask about your spending” send them when you use them.",
              ]
            ),
            p(
              "Replies are written by Claude, an AI model made by Anthropic, so what the assistant sees is sent to Anthropic to write each answer. For each question, Sprout's server writes one log line about how the request went, such as timings and token counts, without your messages."
            ),
          ],
        },
        {
          // AGENTS.md section 5.4 (tools are read-only or calculations), app/(pages)/portfolio/page.tsx ("Nothing here buys or sells anything"),
          // components/finance-import.tsx and components/portfolio/holdings-import.tsx (file.text(): read in the browser),
          // lib/screenshots/image.ts (MAX_SCREENSHOTS), app/api/import/screenshot/route.ts (the image lives only for the request),
          // lib/screenshots/transaction-rows.ts and holding-rows.ts (maskAccountNumbers), lib/ai/system-prompt.ts (never ask for account numbers)
          id: "do-i-have-to-connect-my-bank",
          question: "Do I have to connect my bank?",
          answer: [
            p(
              "No, and you can't: Sprout never asks for bank logins, can't move money and can't place trades. Its tools only look things up and do calculations."
            ),
            p(
              `To see your spending or holdings, upload a CSV file exported from your bank or brokerage, which is read in your browser rather than uploaded, or add up to ${MAX_SCREENSHOTS} screenshots from your banking or investing app. Each screenshot is sent to the AI to read the rows and isn't stored by Sprout, and long account or card numbers are cut to their last four digits. Nothing from a screenshot is saved until you check the rows and confirm.`
            ),
            p(
              "Never share account numbers, passwords or ID numbers with Sprout, or with anyone online. The assistant is instructed never to ask for them."
            ),
          ],
        },
        ...when<FaqItem>(accounts, {
          // lib/auth/users.ts (bcrypt), lib/auth/auth.ts (login limits per visitor and per account; Google), lib/rate-limit/server.ts
          // (rateLimitsEnabled), lib/auth/verify.ts, lib/auth/two-factor-server.ts, components/two-factor-card.tsx,
          // lib/auth/session-version.ts (MAX_SESSION_AGE_MS, isSessionStale), components/sign-out-everywhere.tsx,
          // lib/auth/reset-server.ts (passwordResetAvailable: reset needs email in production)
          id: "how-is-my-account-protected",
          question: "How is my account kept secure?",
          answer: [
            list(
              [
                loginLimits
                  ? "Your password is stored only in a scrambled, one-way form (a bcrypt hash), never as the password itself, and repeated wrong guesses are blocked for a while."
                  : "Your password is stored only in a scrambled, one-way form (a bcrypt hash), never as the password itself.",
              ],
              ...when(emailConfirmation, [
                "New accounts are confirmed by email. The account is only created once you open the link and enter the password you chose.",
              ]),
              ...when(twoFactor, [
                "You can turn on two-step verification on your ",
                link("Account page", "/account"),
                ": a code from an authenticator app on top of your password, with one-time recovery codes in case you lose your phone.",
              ]),
              [
                "Sign out everywhere, on your ",
                link("Account page", "/account"),
                passwordReset
                  ? ", signs you out on every device, and so does resetting your password. "
                  : ", signs you out on every device. ",
                `Sessions also end on their own after ${sessionDays} days at most.`,
              ],
              ...when(google, ["If you log in with Google, your Google account's own security settings protect that login."])
            ),
          ],
        }),
        {
          // app/(pages)/account/page.tsx, components/delete-account-form.tsx, app/api/account/route.ts (DELETE), lib/auth/account-deletion.ts,
          // lib/sync/account-sync.ts (deleteAccount clears this browser; endSessionLocally, run from components/providers.tsx,
          // clears another browser's copy once it finds the session has ended), components/plan/plan-builder.tsx
          // ("Clear my plan"), components/portfolio/portfolio-builder.tsx ("Clear all"), components/assistant.tsx (delete a chat)
          id: "how-do-i-delete-my-data",
          question: "How do I delete my data?",
          answer: [
            ...when(
              accounts,
              p(
                "If you have an account, go to your ",
                link("Account page", "/account"),
                twoFactor
                  ? ", type your email to confirm (and a code from your authenticator app, if two-step verification is on), and Sprout permanently deletes your account and everything synced to it, and clears it from that browser."
                  : ", type your email to confirm, and Sprout permanently deletes your account and everything synced to it, and clears it from that browser.",
                " Your other devices are signed out, and Sprout removes its copy from each of those browsers the next time it's opened there."
              )
            ),
            p(
              accounts ? "Without an account, your data is only in your browser. " : "Your data is only in your browser. ",
              "You can clear things one at a time on their own pages, or clear this site's data in your browser's settings to remove everything."
            ),
          ],
        },
      ],
    },
    {
      id: "assistant-and-numbers",
      title: "The assistant and the numbers",
      items: [
        {
          // lib/ai/system-prompt.ts (Boundaries; Special situations: scams), AGENTS.md section 8b (the before-you-buy check never gives a verdict),
          // components/portfolio/portfolio-builder.tsx (id="before-you-buy"), evals/cases.ts (safety and protection cases)
          id: "will-sprout-tell-me-what-to-buy",
          question: "Will Sprout tell me what to buy?",
          answer: [
            p(
              "No. It won't tell you to buy or sell a specific stock, crypto coin or other single investment, or when to do it, and it never promises returns. It teaches strategy instead: a safety net first, paying off expensive debt, spreading your money across many investments, keeping fees low and choosing a mix that fits your timeline."
            ),
            p(
              "If you saw a tip online, the ",
              link("before-you-buy check", "/portfolio#before-you-buy"),
              " walks you through the questions that matter without giving a yes or no. If something sounds like a scam, such as a promise to double your money, the assistant is set up to say so and point you to the lesson on ",
              link("spotting scams", "/learn/scams-and-biases"),
              "."
            ),
          ],
        },
        {
          // lib/finance/*.ts and their tests, lib/ai/calculators.ts, lib/ai/tools.ts, lib/ai/system-prompt.ts (Numbers),
          // lib/ai/grounding.ts (prices to the cent checked against market data)
          id: "where-do-the-numbers-come-from",
          question: "Where do the numbers come from?",
          answer: [
            p(
              "From calculators written in code and checked by automated tests, not from the AI doing maths in its head. Projections, fee comparisons, doubling times and budget checks come from the same functions as the calculators on this site, and they state their assumptions, like a 7% average yearly return, which isn't guaranteed."
            ),
            ...when(
              marketData,
              p(
                "When the assistant quotes a price to the cent after looking up market data, Sprout checks it against the data it received and adds a note under the reply if it can't find a match."
              )
            ),
            p("The AI can still misread a question or get something wrong, so double-check anything important before you act on it."),
          ],
        },
        ...when<FaqItem>(marketData, {
          // lib/market/fmp.ts, lib/ai/system-prompt.ts (MARKET_DATA_PROMPT), AGENTS.md section 5.4 (timestamps; "unavailable", never invented)
          id: "where-does-market-data-come-from",
          question: "Where does market data come from?",
          answer: [
            p(
              "Prices, company facts and market history come from Financial Modeling Prep. Quotes can be delayed, so the assistant says when a figure is from. If the data can't be loaded, it says so instead of guessing a number."
            ),
          ],
        }),
      ],
    },
  ]
  return groups.filter((group) => group.items.length > 0)
}

export function faqItems(features: SiteFeatures): FaqItem[] {
  return faqGroups(features).flatMap((group) => group.items)
}

const plain = (runs: FaqText[]) => runs.map((run) => (typeof run === "string" ? run : run.text)).join("")

/** An answer as plain text, links reduced to their words: for structured data and tests. */
export function faqAnswerText(item: FaqItem): string {
  return item.answer
    .map((block) => (block.type === "p" ? plain(block.text) : block.items.map((runs) => `- ${plain(runs)}`).join("\n")))
    .join("\n\n")
}

/** The questions linked from the bottom of the home and About pages, in this order. */
export const HOME_FAQ_IDS = [
  "do-i-need-an-account",
  "what-does-the-ai-see",
  "is-sprout-financial-advice",
  "does-sprout-cost-anything",
] as const

export function homeFaqLinks(features: SiteFeatures): { id: string; question: string; href: string }[] {
  const items = faqItems(features)
  return HOME_FAQ_IDS.flatMap((id) => {
    const item = items.find((candidate) => candidate.id === id)
    return item ? [{ id, question: item.question, href: `/faq#${id}` }] : []
  })
}
