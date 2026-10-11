import type { ReactNode } from "react"
import { CalculatorIcon, LightbulbIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "cn"

import { BudgetPlanner } from "@/components/budget-planner"
import { CompoundCalculator } from "@/components/compound-calculator"
import { DoublingCard } from "@/components/doubling-card"
import { FeeCalculator } from "@/components/fee-calculator"
import type { Block, Section, ToolId } from "@/lib/learn/course"

/** Renders lesson text, turning **bold** into <strong>. Nothing else is interpreted. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        )
      )}
    </>
  )
}

const TOOLS: Record<ToolId, ReactNode> = {
  compound: <CompoundCalculator />,
  doubling: <DoublingCard />,
  fees: <FeeCalculator />,
  budget: (
    <div className="rounded-2xl border bg-card p-5 shadow-[0_1px_2px_rgb(24_53_42/0.04)] sm:p-6">
      <p className="eyebrow mb-4">Try it: budget planner</p>
      <BudgetPlanner />
    </div>
  ),
}

const CALLOUTS = {
  example: { icon: CalculatorIcon, className: "border-brand bg-surface", titleClass: "text-primary" },
  tip: { icon: LightbulbIcon, className: "border-primary/40 bg-secondary", titleClass: "text-primary" },
  caution: { icon: TriangleAlertIcon, className: "border-warning bg-warning/8", titleClass: "text-[#7a5516]" },
} as const

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      return (
        <p className="leading-relaxed text-foreground/90">
          <RichText text={block.text} />
        </p>
      )
    case "list": {
      const List = block.ordered ? "ol" : "ul"
      return (
        <List
          className={cn(
            "space-y-2 pl-5 leading-relaxed text-foreground/90",
            block.ordered ? "list-decimal marker:font-semibold marker:text-primary" : "list-disc marker:text-brand"
          )}
        >
          {block.items.map((item, index) => (
            <li key={index} className="pl-1">
              <RichText text={item} />
            </li>
          ))}
        </List>
      )
    }
    case "callout": {
      const style = CALLOUTS[block.tone]
      const Icon = style.icon
      return (
        <aside className={cn("rounded-r-xl border-l-[3px] px-4 py-3.5", style.className)}>
          <p className={cn("flex items-center gap-2 text-sm font-semibold", style.titleClass)}>
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {block.title}
          </p>
          <p className="figures mt-1.5 text-[15px] leading-relaxed text-foreground/90">
            <RichText text={block.text} />
          </p>
        </aside>
      )
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="figures w-full min-w-[32rem] border-collapse text-left text-sm">
            <caption className="caption-bottom border-t px-3 py-2 text-left text-xs text-muted-foreground">
              {block.caption}
            </caption>
            <thead className="bg-surface">
              <tr>
                {block.headers.map((header, index) => (
                  <th key={index} scope="col" className="border-b px-3 py-2.5 text-xs font-semibold text-muted-foreground">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b last:border-0">
                  {row.map((cell, cellIndex) =>
                    cellIndex === 0 ? (
                      <th key={cellIndex} scope="row" className="px-3 py-2.5 align-top font-medium">
                        {cell}
                      </th>
                    ) : (
                      <td key={cellIndex} className="px-3 py-2.5 align-top text-foreground/90">
                        {cell}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case "tool":
      return <div className="py-2">{TOOLS[block.tool]}</div>
  }
}

export function LessonBody({ sections }: { sections: Section[] }) {
  return (
    <div className="space-y-12">
      {sections.map((section, index) => (
        <section key={index} aria-labelledby={`section-${index}`} className="space-y-5">
          <h2 id={`section-${index}`} className="text-2xl font-semibold sm:text-[1.7rem]">
            {section.heading}
          </h2>
          {section.blocks.map((block, blockIndex) => (
            <BlockView key={blockIndex} block={block} />
          ))}
        </section>
      ))}
    </div>
  )
}
