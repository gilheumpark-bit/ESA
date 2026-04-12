import { SourceTag, Judgment } from '../sjc/types';

export interface ParamDef {
  name: string;
  type: 'number' | 'string' | 'boolean';
  unit?: string;
  description?: string;
}

export interface CalcNode {
  id: string;
  calculator: (...args: unknown[]) => unknown;
  inputs: ParamDef[];
  outputs: ParamDef[];
  depends_on: string[];
  code_ref: string[];
}

export interface Edge {
  from: string;
  to: string;
  param_map: Record<string, string>;
}

export interface CalcGraph {
  nodes: Map<string, CalcNode>;
  edges: Edge[];
  execution_order: string[];
}

export interface CalcResult {
  value: number | string | null;
  unit: string;
  source: SourceTag[];
  judgment?: Judgment;
  formula?: string;
  [key: string]: any;
}