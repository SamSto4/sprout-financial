"use client"

import { useState } from "react"
import { CheckCircle2Icon, RotateCcwIcon, XCircleIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import type { QuizQuestion } from "@/lib/learn/course"
import { recordQuizScore, setLessonComplete, shuffledOrder } from "@/lib/learn/progress"
import { progressStore } from "@/lib/stores"
import { useStoredValue } from "@/lib/use-stored-value"

// Each question gives feedback as soon as it's answered. Finishing with every answer right
// marks the lesson complete.
export function LessonQuiz({ slug, questions }: { slug: string; questions: QuizQuestion[] }) {
  const progress = useStoredValue(progressStore)
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null))
  const [attempt, setAttempt] = useState(0)

  const answered = picked.filter((choice) => choice !== null).length
  const score = picked.filter((choice, index) => choice === questions[index].answer).length
  const finished = answered === questions.length
  const best = progress.quizScores[slug]

  function choose(questionIndex: number, option: number) {
    if (picked[questionIndex] !== null) return
    const next = picked.map((choice, index) => (index === questionIndex ? option : choice))
    setPicked(next)

    if (next.every((choice) => choice !== null)) {
      const finalScore = next.filter((choice, index) => choice === questions[index].answer).length
      let updated = recordQuizScore(progressStore.get(), slug, finalScore)
      if (finalScore === questions.length) updated = setLessonComplete(updated, slug, true)
      progressStore.set(updated)
    }
  }

  function retake() {
    setPicked(questions.map(() => null))
    setAttempt((current) => current + 1)
  }

  return (
    <section aria-labelledby="quiz-title" className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(24_53_42/0.04)] sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="eyebrow">Check your understanding</p>
          <h2 id="quiz-title" className="mt-1 text-2xl font-semibold">
            Quick quiz
          </h2>
        </div>
        <p className="figures text-sm text-muted-foreground" aria-live="polite">
          {answered} of {questions.length} answered
          {best !== undefined && ` · Best: ${best}/${questions.length}`}
        </p>
      </div>

      <ol className="mt-6 space-y-8">
        {questions.map((question, questionIndex) => {
          const order = shuffledOrder(`${slug}-${questionIndex}`, question.options.length)
          const choice = picked[questionIndex]
          const isAnswered = choice !== null
          const isRight = choice === question.answer
          const name = `${slug}-q${questionIndex}-${attempt}`

          return (
            <li key={`${attempt}-${questionIndex}`}>
              <fieldset>
                <legend className="font-medium">
                  <span className="figures mr-2 text-sm text-muted-foreground">{questionIndex + 1}.</span>
                  {question.question}
                </legend>
                <div className="mt-3 grid gap-2">
                  {order.map((optionIndex) => {
                    const isChoice = choice === optionIndex
                    const isAnswer = optionIndex === question.answer
                    return (
                      <label
                        key={optionIndex}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-[15px] transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40",
                          !isAnswered && "cursor-pointer hover:border-brand/60 hover:bg-surface",
                          isAnswered && isAnswer && "border-brand bg-secondary",
                          isAnswered && isChoice && !isAnswer && "border-destructive/50 bg-destructive/5",
                          isAnswered && !isChoice && !isAnswer && "opacity-60"
                        )}
                      >
                        <input
                          type="radio"
                          name={name}
                          checked={isChoice}
                          disabled={isAnswered}
                          onChange={() => choose(questionIndex, optionIndex)}
                          className="mt-1 size-4 shrink-0 accent-primary"
                        />
                        <span className="flex-1">{question.options[optionIndex]}</span>
                        {isAnswered && isAnswer && (
                          <CheckCircle2Icon className="mt-0.5 size-4.5 shrink-0 text-primary" aria-label="Correct answer" />
                        )}
                        {isAnswered && isChoice && !isAnswer && (
                          <XCircleIcon className="mt-0.5 size-4.5 shrink-0 text-destructive" aria-label="Your answer" />
                        )}
                      </label>
                    )
                  })}
                </div>
                {isAnswered && (
                  <p
                    role="status"
                    className={cn(
                      "animate-rise mt-3 rounded-lg px-3.5 py-2.5 text-sm leading-relaxed",
                      isRight ? "bg-secondary text-foreground" : "bg-warning/10 text-foreground"
                    )}
                  >
                    <strong className={isRight ? "text-primary" : "text-[#7a5516]"}>
                      {isRight ? "Correct. " : "Not quite. "}
                    </strong>
                    {question.explanation}
                  </p>
                )}
              </fieldset>
            </li>
          )
        })}
      </ol>

      {finished && (
        <div className="animate-rise mt-8 flex flex-col gap-3 rounded-xl bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="figures text-sm">
            <span className="font-heading text-2xl font-semibold text-primary">
              {score}/{questions.length}
            </span>{" "}
            {score === questions.length
              ? "All correct. This lesson is marked complete."
              : "Read the explanations above, then try again when you're ready."}
          </p>
          <Button type="button" variant="outline" onClick={retake}>
            <RotateCcwIcon />
            Retake quiz
          </Button>
        </div>
      )}
    </section>
  )
}
