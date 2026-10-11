// graphTypes.ts

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

export type GraphSeries = {
  key: string;
  label?: string;
  type?: GraphType;
};

export type GraphConfig = {
  type: GraphType;

  title?: string;
  description?: string;

  xAxis?: {
    key: string;
    label?: string;
  };

  yAxis?: {
    key: string;
    label?: string;
  };

  data: Record<string, unknown>[];

  series: GraphSeries[];

  interactions?: GraphInteraction[];

  responsive?: boolean;
  animated?: boolean;

  metadata?: {
    source?: string;
    generatedBy?: string;
    createdAt?: string;
  };
};
