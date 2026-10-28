"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckIcon, CircleDashedIcon, CircleHelpIcon, MessageSquareTextIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { cn } from "cn"

import { NumberField, Panel, SelectField, TextField } from "@/components/plan/fields"
import { Button, buttonVariants } from "@/components/ui/button"
import { currencySymbol, formatMoney } from "@/lib/format"
import {
  EMPTY_PROFILE,
  EXPERIENCE,
  GOALS,
  HORIZON_LABELS,
  horizonBand,
  profileCurrency,
  MATCH_STATUS,
  MAX_DEBTS,
  RISK_LABELS,
  RISK_QUESTIONS,
  riskLevel,
  targetStockRange,
  YES_NO_UNSURE,
  type Debt,
  type InvestorProfile,
} from "@/lib/plan/profile"
import { buildRoadmap, type RoadmapStep } from "@/lib/plan/roadmap"
import { profileStore, saveProfile, sharePlanStore } from "@/lib/stores"
import { useHydrated, useStoredValue } from "@/lib/use-stored-value"

/**
 * Saves every change straight away; the account sync uploads it shortly after. Filling in a plan
 * is a choice to personalize the assistant, so sharing starts on if this device hadn't chosen
 * (saveProfile in lib/stores.ts); an explicit off stays off.
 */
function save(next: InvestorProfile) {
  saveProfile(next, "plan")
}

export function PlanBuilder() {
  const stored = useStoredValue(profileStore)
  const loaded = useHydrated()
  const profile = stored ?? EMPTY_PROFILE
  const update = (patch: Partial<InvestorProfile>) => save({ ...profile, ...patch })

  if (!loaded) return <div className="mt-10 h-96 animate-pulse rounded-2xl bg-muted" aria-hidden="true" />

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <div className="space-y-6">
        <RoadmapPanel profile={profile} started={Boolean(stored?.updatedAt)} />
        <AboutYou profile={profile} update={update} />
        <RiskQuiz profile={profile} update={update} />
        <YourMoney profile={profile} update={update} />
        <Debts profile={profile} update={update} />
      </div>
      <div className="space-y-6 lg:sticky lg:top-24">
        <TargetMix profile={profile} />
        <PrivacyNote />
      </div>
    </div>
  )
}

const STATUS_ICON = {
  done: CheckIcon,
  current: CircleDashedIcon,
  todo: CircleDashedIcon,
  "needs-info": CircleHelpIcon,
} as const

function RoadmapPanel({ profile, started }: { profile: InvestorProfile; started: boolean }) {
  const roadmap = buildRoadmap(profile)
  const router = useRouter()
  const percent = Math.round((roadmap.done / roadmap.steps.length) * 100)

  return (
    <Panel
      id="roadmap"
      title="Your money roadmap"
      description="The usual order for building a strong financial base before investing more. It updates as you fill in the sections below."
    >
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
        <p className="figures text-sm font-medium whitespace-nowrap">
          {roadmap.done} of {roadmap.steps.length} done
        </p>
      </div>

      <ol className="mt-5 space-y-2">
        {roadmap.steps.map((step, index) => (
          <RoadmapRow key={step.id} step={step} index={index} />
        ))}
      </ol>

      {started && roadmap.current && (
        <div className="mt-5 rounded-xl bg-secondary px-4 py-3.5">
          <p className="eyebrow">Your next step</p>
          <p className="mt-1 text-sm font-medium text-secondary-foreground">{roadmap.nextAction}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => router.push(`/assistant?q=${encodeURIComponent(`Help me with my next step: ${roadmap.current?.title}. What exactly should I do?`)}`)}
            >
              <MessageSquareTextIcon />
              Ask the assistant
            </Button>
            <Link href={roadmap.current.lesson} className={buttonVariants({ size: "sm", variant: "outline" })}>
              Read the lesson
            </Link>
          </div>
        </div>
      )}
    </Panel>
  )
}

function RoadmapRow({ step, index }: { step: RoadmapStep; index: number }) {
  const Icon = STATUS_ICON[step.status]
  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl border px-3.5 py-3",
        step.status === "current" ? "border-primary/40 bg-secondary/50" : "border-transparent"
      )}
      aria-current={step.status === "current" ? "step" : undefined}
    >
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          step.status === "done" ? "bg-primary text-primary-foreground" : step.status === "current" ? "bg-brand-soft text-primary ring-1 ring-primary/40" : "bg-muted text-muted-foreground"
        )}
      >
        {step.status === "done" ? <Icon className="size-3.5" strokeWidth={3} aria-hidden="true" /> : index + 1}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {step.title}
          <span className="sr-only">
            {" "}
            ({step.status === "needs-info" ? "needs information" : step.status})
          </span>
          {step.status === "needs-info" && (
            <span className="ml-2 inline-block rounded-full bg-muted px-1.5 py-0.5 align-middle text-[11px] font-medium whitespace-nowrap text-muted-foreground">
              Needs info
            </span>
          )}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">{step.detail}</p>
      </div>
    </li>
  )
}

type SectionProps = { profile: InvestorProfile; update: (patch: Partial<InvestorProfile>) => void }

function AboutYou({ profile, update }: SectionProps) {
  return (
    <Panel id="about" title="About you" description="Your goal and timeline set how much ups and downs your investments can take.">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Main goal" value={profile.goal} options={GOALS} onChange={(goal) => update({ goal })} />
        <NumberField
          label="When will you need this money?"
          suffix="years from now"
          max={60}
          value={profile.horizonYears}
          onChange={(horizonYears) => update({ horizonYears: horizonYears === null ? null : Math.round(horizonYears) })}
          hint={profile.horizonYears !== null ? `That's ${HORIZON_LABELS[horizonBand(profile.horizonYears)]}.` : "For retirement, years until you plan to stop working."}
        />
        <TextField
          label="Country"
          value={profile.country}
          placeholder="e.g. United States"
          onChange={(country) => update({ country })}
          hint={
            profileCurrency(profile)
              ? `Account types and taxes differ by country. Amounts on this page are in ${profileCurrency(profile)}.`
              : "Account types and taxes differ by country."
          }
        />
        <NumberField label="Age (optional)" max={110} value={profile.age} onChange={(age) => update({ age: age === null ? null : Math.round(age) })} />
        <SelectField label="Investing experience" value={profile.experience} options={EXPERIENCE} onChange={(experience) => update({ experience })} />
      </div>
    </Panel>
  )
}

function RiskQuiz({ profile, update }: SectionProps) {
  const complete = profile.riskAnswers.length === RISK_QUESTIONS.length
  // Answers so far. Only a complete set is saved, so the stored plan never holds half a quiz.
  const [draft, setDraft] = useState<number[]>(() => (complete ? profile.riskAnswers : RISK_QUESTIONS.map(() => -1)))
  // When the saved answers change from outside the quiz (the plan was cleared, or sync brought in
  // another device's answers), start the draft again from them, so old picks don't show as chosen.
  // Adjusting state during render (rather than remounting with a key) keeps keyboard focus.
  const savedKey = profile.riskAnswers.join(",")
  const [seenKey, setSeenKey] = useState(savedKey)
  if (seenKey !== savedKey) {
    setSeenKey(savedKey)
    setDraft(complete ? profile.riskAnswers : RISK_QUESTIONS.map(() => -1))
  }
  const answers = complete ? profile.riskAnswers : draft
  const level = riskLevel(profile.riskAnswers)
  const answered = answers.filter((answer) => answer >= 0).length

  function choose(question: number, answer: number) {
    const next = answers.map((value, index) => (index === question ? answer : value))
    setDraft(next)
    if (next.every((value) => value >= 0)) update({ riskAnswers: next })
  }

  return (
    <Panel
      id="risk"
      title="Risk quiz"
      description="Five quick questions about how you'd handle ups and downs. There are no wrong answers."
      action={
        level ? (
          <span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium text-primary">{RISK_LABELS[level]}</span>
        ) : (
          <span className="text-sm text-muted-foreground">{answered} of 5</span>
        )
      }
    >
      <ol className="space-y-5">
        {RISK_QUESTIONS.map((question, questionIndex) => (
          <li key={question.id}>
            <fieldset>
              <legend className="text-sm font-medium">
                {questionIndex + 1}. {question.question}
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {question.answers.map((answer, answerIndex) => {
                  const checked = answers[questionIndex] === answerIndex
                  return (
                    <label
                      key={answer}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/60",
                        checked && "border-primary/50 bg-secondary/60"
                      )}
                    >
                      <input
                        type="radio"
                        name={`risk-${question.id}`}
                        checked={checked}
                        onChange={() => choose(questionIndex, answerIndex)}
                        className="mt-0.5 accent-primary"
                      />
                      {answer}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

/** The currency this plan's amounts are in, as the roadmap writes them: US dollars until a country is known. */
function planCurrency(profile: InvestorProfile) {
  return profileCurrency(profile) ?? "USD"
}

function YourMoney({ profile, update }: SectionProps) {
  const sign = currencySymbol(planCurrency(profile))
  const months =
    profile.emergencySavings !== null && profile.monthlyEssentials && profile.monthlyEssentials > 0
      ? profile.emergencySavings / profile.monthlyEssentials
      : null
  return (
    <Panel id="money" title="Your money" description="Rough numbers are fine. Leave anything blank you'd rather not share.">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField label="Monthly take-home pay" prefix={sign} step={50} value={profile.monthlyIncome} onChange={(monthlyIncome) => update({ monthlyIncome })} />
        <NumberField
          label="Monthly essential spending"
          prefix={sign}
          step={50}
          value={profile.monthlyEssentials}
          onChange={(monthlyEssentials) => update({ monthlyEssentials })}
          hint="Rent, food, bills, transport, minimum debt payments."
        />
        <NumberField
          label="Emergency savings"
          prefix={sign}
          step={100}
          value={profile.emergencySavings}
          onChange={(emergencySavings) => update({ emergencySavings })}
          hint={months !== null ? `About ${months.toFixed(1)} months of essentials.` : "Cash you could reach this week, not investments."}
        />
        <SelectField
          label="Does your employer match retirement contributions?"
          value={profile.employerMatch}
          options={MATCH_STATUS}
          onChange={(employerMatch) => update({ employerMatch })}
        />
        <SelectField
          label="Do you have a tax-advantaged investment account?"
          value={profile.hasTaxAdvantagedAccount}
          options={YES_NO_UNSURE}
          onChange={(hasTaxAdvantagedAccount) => update({ hasTaxAdvantagedAccount })}
          hint="For example a Roth IRA or 401(k) in the US."
        />
      </div>
    </Panel>
  )
}

function newDebtId() {
  return `debt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function Debts({ profile, update }: SectionProps) {
  const setDebt = (id: string, patch: Partial<Debt>) =>
    update({ debts: profile.debts.map((debt) => (debt.id === id ? { ...debt, ...patch } : debt)) })
  const total = profile.debts.reduce((sum, debt) => sum + debt.balance, 0)
  const currency = planCurrency(profile)
  const sign = currencySymbol(currency)

  return (
    <Panel
      id="debts"
      title="Debts"
      description="Credit cards, student loans, car loans, buy-now-pay-later. Interest rates decide which to tackle first."
      action={profile.debts.length > 0 ? <span className="figures text-sm text-muted-foreground">{formatMoney(total, currency)} total</span> : undefined}
    >
      {profile.debts.length === 0 && <p className="text-sm text-muted-foreground">No debts listed.</p>}
      <ul className="space-y-3">
        {profile.debts.map((debt) => (
          <li key={debt.id} className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[1.4fr_1fr_0.8fr_1fr_auto] sm:items-end">
            <TextField label="Name" value={debt.name} placeholder="e.g. Visa" onChange={(name) => setDebt(debt.id, { name })} maxLength={40} />
            <NumberField label="Balance" prefix={sign} step={50} value={debt.balance} onChange={(balance) => setDebt(debt.id, { balance: balance ?? 0 })} />
            <NumberField label="Interest" suffix="% APR" max={100} step={0.1} value={debt.aprPercent} onChange={(aprPercent) => setDebt(debt.id, { aprPercent: aprPercent ?? 0 })} />
            <NumberField label="Min. payment" prefix={sign} step={5} value={debt.minPayment} onChange={(minPayment) => setDebt(debt.id, { minPayment: minPayment ?? 0 })} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${debt.name || "this debt"}`}
              onClick={() => update({ debts: profile.debts.filter((other) => other.id !== debt.id) })}
            >
              <Trash2Icon />
            </Button>
          </li>
        ))}
      </ul>
      {profile.debts.length < MAX_DEBTS && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => update({ debts: [...profile.debts, { id: newDebtId(), name: "", balance: 0, aprPercent: 0, minPayment: 0 }] })}
        >
          <PlusIcon />
          Add a debt
        </Button>
      )}
    </Panel>
  )
}

function TargetMix({ profile }: { profile: InvestorProfile }) {
  const range = targetStockRange(profile)
  const level = riskLevel(profile.riskAnswers)
  return (
    <Panel title="Your target mix" description="A rule-of-thumb range for how much of your investments to keep in stocks.">
      {range && level && profile.horizonYears !== null ? (
        <>
          <p className="font-heading text-3xl font-semibold">
            {range.min}–{range.max}% <span className="text-lg font-medium text-muted-foreground">stocks</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The rest in bonds and cash. Based on a {RISK_LABELS[level].toLowerCase()} risk level and money needed in{" "}
            {HORIZON_LABELS[horizonBand(profile.horizonYears)]}.
          </p>
          <div className="relative mt-5 h-3 rounded-full bg-muted" role="img" aria-label={`Target range: ${range.min} to ${range.max} percent stocks`}>
            <div
              className="absolute inset-y-0 rounded-full bg-brand"
              style={{ left: `${range.min}%`, width: `${Math.max(2, range.max - range.min)}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
            <span>All bonds & cash</span>
            <span>All stocks</span>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            More stocks has meant more growth over long periods, with bigger drops along the way. Money you&apos;ll need within a
            few years usually stays out of stocks. This is education, not personal advice.
          </p>
          <Link href="/portfolio" className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4" })}>
            Compare with my portfolio
          </Link>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Add when you&apos;ll need the money and finish the risk quiz to see your range.
        </p>
      )}
    </Panel>
  )
}

function PrivacyNote() {
  const share = useStoredValue(sharePlanStore)
  return (
    <div className="space-y-3 rounded-2xl border border-dashed p-5 text-sm">
      <p className="font-medium">Saved as you type</p>
      <p className="text-muted-foreground">
        Your plan is kept in this browser, and in your account when you&apos;re logged in. Never enter account numbers or
        passwords. Sprout doesn&apos;t need them.
      </p>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          role="switch"
          checked={share}
          onChange={(event) => sharePlanStore.set(event.target.checked)}
          className="mt-0.5 size-3.5 accent-primary"
        />
        <span>
          <span className="block font-medium">Use About you in the assistant&apos;s answers</span>
          <span className="text-muted-foreground">
            Your plan, the topics you picked and the lessons you&apos;ve finished, so answers fit your situation without asking
            again. This switch is for this device; exact amounts are looked up only when an answer needs them.
          </span>
        </span>
      </label>
      <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => profileStore.set(null)}>
        Clear my plan
      </Button>
    </div>
  )
}
