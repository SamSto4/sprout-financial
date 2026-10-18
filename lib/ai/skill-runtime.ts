import "server-only"

import type Anthropic from "@anthropic-ai/sdk"

import {
  isServerTool,
  isWebSearchEnabled,
  resolveSkillSet,
  runSkillTool,
  skillStatus,
  type SkillId,
  type SkillOutcome,
} from "@/lib/ai/skill-tools"
import { skillRegistry } from "@/lib/ai/skillsregistry"
import type { SkillMode } from "@/lib/ai/skilltypes"
import { CHART_SKILL_PROMPT, DEEP_RESEARCH_PROMPT, TABLE_SKILL_PROMPT, WEB_SEARCH_PROMPT } from "@/lib/ai/system-prompt"

// Each runtime skill is listed in the registry (lib/ai/skills.ts), where setting `enabled: false`
// switches it off. A skill missing from the registry counts as on.
const REGISTRY_IDS: Record<SkillId, string> = {
  charts: "create-interactive-graphs",
  tables: "create-data-tables",
  "web-search": "web-research",
  "deep-research": "deep-research",
}

// The guidance for each skill, kept with the rest of the agent's instructions in system-prompt.ts.
const PROMPTS: Record<SkillId, string> = {
  charts: CHART_SKILL_PROMPT,
  tables: TABLE_SKILL_PROMPT,
  "web-search": WEB_SEARCH_PROMPT,
  "deep-research": DEEP_RESEARCH_PROMPT,
}

/** What the agent loop needs from the active skills for one request. */
export type ResolvedSkills = {
  effort: "low" | "medium" | "high"
  maxToolRounds: number
  tools: Anthropic.Beta.Messages.BetaToolUnion[]
  /** Guidance for the active skills, appended to the system prompt. */
  prompt: string
  /** True when Anthropic-run tools (web search, page reading) are among the tools. */
  usesServerTools: boolean
  /** A short progress note for a tool call, or undefined to show nothing. */
  status: (name: string, input: Record<string, unknown>) => string | undefined
  /** Runs a chart or table tool; undefined means "not a skill tool, try the regular ones". */
  run: (name: string, input: unknown) => SkillOutcome | undefined
}

/**
 * Picks the skills for a request. `webSearch: false` forces search off for this one request,
 * which the agent loop uses to carry on if the API turns the search tools down.
 */
export function resolveSkills(options: { mode: SkillMode; webSearch?: boolean }): ResolvedSkills {
  const set = resolveSkillSet({
    mode: options.mode,
    webSearch: (options.webSearch ?? true) && isWebSearchEnabled(),
    isOn: (skill) => skillRegistry.get(REGISTRY_IDS[skill])?.enabled !== false,
  })

  return {
    effort: set.effort,
    maxToolRounds: set.maxToolRounds,
    tools: set.tools,
    prompt: set.skills.map((skill) => PROMPTS[skill]).join("\n\n"),
    usesServerTools: set.tools.some(isServerTool),
    status: skillStatus,
    run: (name, input) => runSkillTool(name, input),
  }
}
