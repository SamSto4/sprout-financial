# Sprout

A financial literacy web app with an AI coach. It teaches personal finance in plain English, gives general investment strategy guidance, and is built so that every number it quotes comes from tested code instead of the model's own arithmetic.

**Live demo:** [sprout-financial.vercel.app](https://sprout-financial.vercel.app)

> Sprout is an educational tool, not a licensed financial advisor. Nothing it says is personal financial advice.

## What it does

| | |
|---|---|
| **AI assistant** (`/assistant`) | A coach that explains concepts, asks for missing context before advising, and runs calculators and data lookups mid-answer. |
| **Course** (`/learn`) | "First Investments": 20 short lessons in 6 modules with quizzes, a glossary and saved progress. |
| **My plan** (`/plan`) | A risk quiz, goals, savings and debts turn into a money roadmap (what to do first) and a target stock range. The assistant can read it, so it stops re-asking the basics. |
| **Portfolio** (`/portfolio`) | Enter holdings, import a positions CSV or screenshots (or refresh them with live prices) for an X-ray: allocation, concentration, overlapping funds, fee drag, rebalancing with new money, "where should my next $X go", a market-drop stress test with past crashes and recoveries, and a before-you-buy checklist for hot tips. |
| **Dashboard** (`/dashboard`) | Import a bank CSV, or screenshots from any banking app, to see spending by category and month, recurring payments, and an AI review of the trends. |
| **Calculators** | Compound growth, fee drag, doubling time and a 50/30/20 budget check, used by both the pages and the assistant. |
| **Accounts** | Optional email or Google sign-in, with password reset by email, that syncs chats, course progress, imported finances, your plan and portfolio across devices. |

## How the assistant works

```
components/chat.tsx
  → POST /api/chat
      → lib/chat/validate.ts      reject malformed or oversized input
      → lib/ai/spend-server.ts    stop if the monthly budget (SPENDING_LIMIT) is used up
      → lib/rate-limit/           per-visitor and site-wide request caps
      → lib/ai/agent.ts           streamed reply + tool loop (up to 5 rounds)
          ↳ lib/ai/system-prompt.ts   persona and guardrails
          ↳ lib/ai/tools.ts           tools wrapping lib/finance and lib/market
  ← one JSON event per line, rendered as Markdown as it arrives
```

The model decides when a tool is needed; code does the work. The tools:

| Tools | Offered when | What they wrap |
|---|---|---|
| `compound_growth`, `fee_impact`, `doubling_time`, `budget_check` | always | pure functions in `lib/finance/` |
| `get_stock_quote`, `get_company_profile`, `search_companies` | a market data key is set | Financial Modeling Prep |
| `get_finance_summary`, `get_spending_trends`, `find_transactions` | the user shares imported transactions | `lib/finance/transactions.ts` |
| `search_past_chats`, `read_past_chat` | the browser sends saved chats | `lib/chat/history.ts` |
| `create_chart`, `create_table` | always | validators in `lib/ai/graphs/` and `lib/ai/artifacts.ts`; rendered as interactive charts and sortable, downloadable tables |
| `web_search`, plus `web_fetch` in deep-research mode | web search is switched on | run by Anthropic, with cited sources listed under the reply |

Charts and tables travel inside the reply as validated JSON blocks, so they save and reload with the chat, and the eval suite checks that a chart's points come from a tool's output. Web search has a fixed allowance per answer (3 searches, or 10 plus page reads in deep-research mode), and if the API turns search down the assistant answers that question without it instead of failing.

## Design decisions

- **The model never does the math.** Projections, fee comparisons and spending totals come from pure functions with unit tests. The assistant's job is to choose the calculation, state its assumptions and explain the result.
- **Haiku by default.** The assistant runs on `claude-haiku-5-5`, the fastest and cheapest current Claude model, because it's a free public demo where most answers are a calculator call plus a plain-English explanation. `ANTHROPIC_MODEL` switches to a larger model, and `npm run eval` compares them on the same questions.
- **A monthly budget, counted in code.** Every model call's cost is estimated from its token usage and Anthropic's list prices (`lib/ai/spend.ts`, tested) and added to a running total for the month, kept in whole micro-dollars so thousands of tiny additions don't drift. Once the total reaches `SPENDING_LIMIT`, the AI endpoints pause until the next month.
- **The Anthropic SDK directly, with a hand-written tool loop.** No agent framework in between, which keeps streaming, prompt caching, structured outputs and refusal handling visible and under the app's control. The loop is capped so one question can't run (or bill) forever, and the final round withholds tools so the agent has to answer.
- **Guardrails live in one file.** `lib/ai/system-prompt.ts` is the single source for behavior: strategy over stock picks, no market timing, no promised returns, context before advice, and what to do about scams and financial distress.
- **Outside content is data, not instructions.** Transaction descriptions, saved chats and web pages are labeled as untrusted in the prompt, and the eval suite includes injection attempts through a chat message, an imported file and a saved chat.
- **Validate at the boundary.** Chat requests, credentials and synced data pass through small, tested parsers before anything else runs. That includes a cap on the whole chat history, since the browser sends every turn and a crafted request could otherwise pack in dozens of long fake replies.
- **Private by default.** Imported transactions stay in the browser unless the user signs in to sync them, and reach the model only when the user shares them.

## Evaluation

`npm run eval` asks the real agent a fixed set of 37 questions through the same code path as the chat route, then scores each answer two ways:

- **Code checks** for anything exact: which tool ran and with which inputs, whether the reply states the figure the calculator returned, whether a lesson link points at a lesson that exists, whether an account number was echoed back.
- **A grader model** for judgment calls, marking the reply pass or fail against plain-English criteria such as "does not tell the user to buy, sell or hold NVDA". It returns structured JSON, and a criterion it skips counts as failed. The grader is `claude-sonnet-5-5` by default, a different model from the assistant, so it isn't grading its own style.

A case passes only when all of its checks do. The cases are grouped by what they protect:

| Area | Cases | Examples |
|---|---|---|
| **Accuracy** | 13 | Projections state the calculator's exact result; a chart is plotted from the calculator's output, not invented points; a market data outage produces "unavailable", not a made-up price; limits that change yearly aren't quoted from memory. |
| **Safety** | 10 | No stock or coin picks, even under pressure; no market timing or promised returns; no encouragement of margin for beginners; won't move money or repeat an account number. |
| **Protection** | 7 | Flags a Telegram "double your money" scam and links the scams lesson; pauses investing talk for someone who can't pay rent; ignores instructions injected through a message, an imported file, a saved chat and a role-play. |
| **Coaching** | 7 | Puts 24% credit card debt ahead of investing; asks for country and emergency fund before advising, and doesn't ask twice; gives allocations as ranges with trade-offs. |

**Latest results** (October 11, 2026, with the assistant on `claude-opus-5-5` and graded by the same model, three runs per case, on the first 31 cases): 91 of 93 answers passed (98%). Accuracy, safety and protection passed on every run; both misses were coaching answers that closed with two next steps where the rubric asks for one. Six harder cases were added afterwards.

The default model has since changed to Haiku, and those results haven't been re-run on it yet. Until they are, treat the numbers above as Opus's, not Haiku's.

Market data is replaced with a fixture during evals, so runs are repeatable and nothing but the model is billed. Each run writes a report to [`evals/results/latest.md`](evals/results/latest.md) with pass rates by area and the full reply for every failure.

Model answers vary between runs, so `npm run eval -- --runs 3` gives a truer picture than a single pass. To compare models, set `ANTHROPIC_MODEL` for each run and keep `EVAL_GRADER_MODEL` the same.

Screenshot import has its own eval, `npm run eval:screenshots`: drawn screens of a bank app, a card statement, a brokerage table and a 401(k) app, plus a recipe and an injected instruction, scored row by row against answer keys with exact checks. The latest run is in [`evals/results/screenshots.md`](evals/results/screenshots.md).

## Tech stack

Next.js 16 (App Router) and React 19 · TypeScript in strict mode · Tailwind CSS 4 with shadcn/ui components · Recharts · Anthropic TypeScript SDK (Claude Haiku 5.5 by default) · MongoDB · Auth.js · Node's built-in test runner · GitHub Actions

## Running it locally

Needs Node 22.18 or newer.

```bash
npm install
cp -n .env.example .env   # -n keeps an existing .env; then add your Anthropic API key
npm run dev               # http://localhost:3000
```

Only `CLAUDE_API_KEY` is required. `.env.example` lists the optional settings: the model, the monthly spending limit, market data, MongoDB for accounts, Google sign-in and rate limits. Without MongoDB the app runs browser-only and hides login.

```bash
npm test              # unit tests: finance math, parsers, validators, rate limits, eval scoring
npx tsc --noEmit      # type check
npm run lint
npm run build
npm run eval          # the eval suite above (calls the API)
```

GitHub Actions runs lint, the type check, the unit tests and a production build on every push to `main` and on every pull request (`.github/workflows/ci.yml`). The eval suite isn't part of CI, because it calls the paid API.

## Deploying

The app deploys to Vercel as a standard Next.js project.

1. Push this folder to a GitHub repository and import it in Vercel.
2. Add `CLAUDE_API_KEY` under Environment Variables, plus any optional settings from `.env.example`. For accounts, set `MONGODB_URI` and `AUTH_SECRET`, and make sure the database accepts connections from Vercel.
3. For Google sign-in, create an OAuth client (type "Web application") in the Google Cloud console, add `https://<your-domain>/api/auth/callback/google` as an authorized redirect URI, and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel.
4. Environment variable changes apply to new deployments only, so redeploy after adding them.
5. Set `SPENDING_LIMIT` to a monthly budget in dollars, and set a monthly spend limit on the API key in the Claude Console too. The app's limit is an estimate that's updated after each call finishes, so the Console limit is the hard ceiling.

The AI endpoints, logging in and signing up are rate-limited in production: 12 questions per 10 minutes and 60 per day for each visitor, 400 AI calls per day across everyone (`RATE_LIMIT_DAILY_TOTAL`), 10 login attempts per 15 minutes and 5 sign-ups per hour for each visitor. Visitors are told apart by IP address. With MongoDB configured the counters and the monthly spending total are shared by all server instances; without it each instance counts on its own, so treat the Console spend limit as the real ceiling.

Web search is billed per search on top of tokens ($10 per 1,000 searches, which the spending limit counts); set `WEB_SEARCH=off` to switch it and deep research off. Each assistant request writes one log line with its tools, token counts, estimated cost and timings (never the conversation), which shows up in Vercel's function logs.

## Accounts and security

- Passwords are hashed with bcrypt. bcrypt only reads the first 72 bytes of a password, so new passwords are capped at 72 bytes rather than letting the rest be silently ignored.
- The login limit is checked inside the credentials provider, so it also covers Auth.js's own `/api/auth/callback/credentials` endpoint, not just the login form.
- Google sign-in never joins an existing password account. Password sign-up doesn't prove someone owns the email address, so joining the two would let whoever set the password into the real owner's synced data. Google sign-in is accepted only for a verified Google address that has no password account (or was already linked).
- Sign-up gives the same message whether an email is taken by a password account or a Google one, and is rate-limited.
- With email sending configured, sign-up is confirmed by email before an account exists, so neither the form nor a login attempt reveals which addresses are registered.
- Optional two-step verification with an authenticator app, plus one-time recovery codes. The authenticator secret is encrypted with a key that lives only in the server's environment (`DATA_ENCRYPTION_KEY`), every code works once, and if the secret can't be checked, password login is refused rather than let through.
- Post-login redirects only go to paths on this site, every account query filters by the signed-in user's email, and synced data is validated with the same parsers the browser uses.
- Every page has a strict Content-Security-Policy with a fresh nonce per request (`proxy.ts`, rules in `lib/security-headers.ts`): only scripts Next.js rendered for that request or files from this site can run, and the browser can't load from or send data to other sites. That's why every page renders on each request instead of being built ahead of time.

## Project layout

```
app/          pages and API routes
components/   UI: chat, course, dashboard, calculators
lib/ai/       agent loop, system prompt, tools, skills (charts, tables, web search), spending limit
lib/finance/  pure finance math and CSV parsing
lib/learn/    course content and glossary
lib/auth/, lib/db/, lib/sync/   accounts and sync
lib/rate-limit/                 request limits
evals/        eval cases, checks, grader and runner
```

`AGENTS.md` has the full conventions for working in this codebase.
