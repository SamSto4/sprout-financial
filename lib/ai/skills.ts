// skills.ts

import type { Skill } from "./skilltypes";

export const skills: Skill[] = [
  {
    id: "remember-context",
    name: "Remember Context",
    description:
      "Stores and recalls useful information from previous interactions.",
    category: "memory",

    instructions: `
      Remember useful information from the conversation that can
      improve future responses.

      Prioritize:
      - User preferences
      - Important project information
      - Long-term goals
      - Repeated instructions
      - Important decisions
    `,

    enabled: true,
    version: "1.0.0",
    tags: ["memory", "context", "personalization"],
  },

  {
    id: "learn-preferences",
    name: "Learn Preferences",
    description:
      "Learns recurring user preferences and adapts the agent accordingly.",
    category: "memory",

    instructions: `
      Identify recurring preferences in the user's behavior
      and adapt future responses when appropriate.

      Examples:
      - Writing style
      - Response length
      - Design preferences
      - Workflow preferences
      - Frequently used tools
    `,

    enabled: true,
    version: "1.0.0",
    tags: ["preferences", "memory", "personalization"],
  },

  {
    id: "web-research",
    name: "Web Research",
    description:
      "Researches external information and summarizes relevant findings.",
    category: "web",

    instructions: `
      Research external information when current or specialized
      knowledge is required.

      Prefer reliable sources and distinguish factual information
      from opinions or speculation.
    `,

    tools: ["web-search"],

    enabled: true,
    version: "1.0.0",
    tags: ["web", "research", "information"],
  },

  // ============================================================
  // INTERACTIVE GRAPH SKILL
  // ============================================================

  {
    id: "create-interactive-graphs",

    name: "Create Interactive Graphs",

    description:
      "Creates responsive, interactive data visualizations from structured or unstructured data.",

    category: "visualization",

    instructions: `
      You can create interactive graphs and data visualizations
      when the user provides numerical, categorical, temporal, or
      comparative data.

      Your responsibilities:

      1. Understand the data
         - Identify the independent and dependent variables.
         - Determine whether the data is numerical, categorical,
           chronological, or comparative.
         - Detect missing, invalid, or inconsistent values.
         - Never invent data to complete a graph.

      2. Select an appropriate graph
         - Use a line chart for trends over time.
         - Use a bar chart for category comparisons.
         - Use an area chart for cumulative or continuous trends.
         - Use a scatter plot for relationships between variables.
         - Use a pie chart only when showing a small number of
           meaningful parts of a whole.
         - Use a radar chart when comparing multiple dimensions
           across a small number of entities.
         - Use a composed chart when multiple related series
           require different visual encodings.

      3. Make the visualization interactive
         Include appropriate interactions such as:
         - Hover tooltips
         - Legends
         - Series toggles
         - Filtering
         - Zooming
         - Panning
         - Data-point selection

      4. Make the graph responsive
         The graph should adapt to the available container width
         and remain usable on desktop and mobile screens.

      5. Make the graph readable
         - Use clear labels.
         - Include meaningful axis titles when appropriate.
         - Use an informative graph title when appropriate.
         - Avoid unnecessary visual decoration.
         - Avoid misleading axis ranges.
         - Preserve the meaning of the underlying data.

      6. Explain the visualization
         When useful, briefly describe:
         - What the graph shows.
         - Why the selected graph type was appropriate.
         - Any important trends or observations.

      7. Code generation
         When the application supports a charting library, generate
         the graph using the application's supported visualization
         components rather than inventing a custom charting system.

      8. Data integrity
         Never alter, fabricate, or silently remove meaningful data.
         If the data cannot support a reliable visualization, explain
         what is missing and produce the safest useful representation.

      Default behavior:
      - Prefer simple visualizations over unnecessarily complex ones.
      - Prefer interactive behavior when it improves understanding.
      - Keep charts visually consistent with the application.
      - Reuse existing chart components and design tokens when available.
    `,

    tools: [
      "chart-renderer",
      "data-parser",
    ],

    input: {
      type: "graph-data",
      description:
        "Structured data, tabular data, JSON, or natural-language data that can be transformed into a visualization.",
      required: true,
    },

    output: {
      type: "interactive-graph",
      description:
        "A responsive interactive graph configuration and renderable visualization.",
    },

    enabled: true,

    version: "1.0.0",

    tags: [
      "graphs",
      "charts",
      "visualization",
      "data",
      "interactive",
      "analytics",
    ],

    metadata: {
      supportedGraphTypes: [
        "line",
        "bar",
        "area",
        "pie",
        "scatter",
        "radar",
        "composed",
      ],

      supportedInteractions: [
        "hover",
        "tooltip",
        "legend",
        "zoom",
        "pan",
        "filter",
        "toggle-series",
        "select",
      ],
    },
  },
];