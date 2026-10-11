// skillTypes.ts

/** How a question is answered: a normal reply, or the longer deep-research flow. */
export type SkillMode = "standard" | "deep-research";

export type SkillCategory =
  | "memory"
  | "reasoning"
  | "communication"
  | "productivity"
  | "web"
  | "data"
  | "coding"
  | "visualization"
  | "custom";

export type GraphType =
  | "line"
  | "bar"
  | "area"
  | "pie"
  | "scatter"
  | "radar"
  | "composed";

export type GraphInteraction =
  | "hover"
  | "tooltip"
  | "legend"
  | "zoom"
  | "pan"
  | "filter"
  | "toggle-series"
  | "select";

export type GraphConfig = {
  type: GraphType;
  title?: string;
  xAxis?: string;
  yAxis?: string;

  interactions?: GraphInteraction[];

  responsive?: boolean;
  animated?: boolean;

  data?: Record<string, unknown>[];
  series?: {
    key: string;
    label?: string;
  }[];
};

export type SkillInput = {
  type: string;
  description?: string;
  required?: boolean;
};

export type SkillOutput = {
  type: string;
  description?: string;
};

export type Skill = {
  id: string;
  name: string;

  description: string;
  category: SkillCategory;

  instructions: string;

  tools?: string[];

  input?: SkillInput;
  output?: SkillOutput;

  enabled?: boolean;

  version?: string;
  tags?: string[];

  metadata?: Record<string, unknown>;
};