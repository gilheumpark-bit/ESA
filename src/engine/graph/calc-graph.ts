/**
 * Calculation Graph Engine
 *
 * Builds a directed acyclic graph (DAG) of CalcNode calculators,
 * topologically sorts them, and executes them in dependency order.
 *
 * Predefined chains for common engineering workflows:
 *   - SUBSTATION_CHAIN: transformer → shortCircuit → breaker → cable → voltageDrop → grounding
 *   - SOLAR_CHAIN: generation → inverter → battery → cable → gridConnect
 *   - MOTOR_CHAIN: capacity → startingCurrent → cable → breaker → powerFactor
 */

import type { CalcNode, CalcGraph, CalcResult, Edge } from '../standards/types';

// =========================================================================
// PART 1 — Graph Building with Topological Sort
// =========================================================================

/**
 * Build a CalcGraph from an array of CalcNode definitions.
 * Performs topological sort (Kahn's algorithm) to determine execution order.
 *
 * Edges are inferred from CalcNode.depends_on declarations: if node B
 * lists node A in its depends_on, an edge A→B is created. The param_map
 * on each edge maps output param names from the upstream node to input
 * param names of the downstream node (matched by name/unit).
 *
 * @throws if a cycle is detected
 */
export function buildGraph(calculators: CalcNode[]): CalcGraph {
  const nodes = new Map<string, CalcNode>();
  for (const calc of calculators) {
    if (nodes.has(calc.id)) {
      throw new Error(`Duplicate CalcNode id: "${calc.id}"`);
    }
    nodes.set(calc.id, calc);
  }

  // Build edges from depends_on declarations
  const edges: Edge[] = [];
  for (const calc of calculators) {
    for (const depId of calc.depends_on) {
      if (!nodes.has(depId)) {
        throw new Error(
          `CalcNode "${calc.id}" depends on "${depId}" which does not exist in the graph`,
        );
      }
      const upstream = nodes.get(depId)!;
      // Auto-map params: match upstream output names to downstream input names
      const paramMap: Record<string, string> = {};
      for (const input of calc.inputs) {
        const matchingOutput = upstream.outputs.find(
          (o) => o.name === input.name || o.name === `${calc.id}_${input.name}`,
        );
        if (matchingOutput) {
          paramMap[matchingOutput.name] = input.name;
        }
      }
      edges.push({ from: depId, to: calc.id, param_map: paramMap });
    }
  }

  // Topological sort — Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const id of nodes.keys()) {
    inDegree.set(id, 0);
  }
  for (const edge of edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const executionOrder: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    executionOrder.push(current);

    for (const edge of edges) {
      if (edge.from === current) {
        const newDegree = (inDegree.get(edge.to) ?? 1) - 1;
        inDegree.set(edge.to, newDegree);
        if (newDegree === 0) {
          queue.push(edge.to);
        }
      }
    }
  }

  if (executionOrder.length !== nodes.size) {
    const missing = [...nodes.keys()].filter((id) => !executionOrder.includes(id));
    throw new Error(
      `Cycle detected in calculation graph. Nodes involved: ${missing.join(', ')}`,
    );
  }

  return { nodes, edges, execution_order: executionOrder };
}

// =========================================================================
// PART 2 — Graph Execution
// =========================================================================

/**
 * Execute a CalcGraph sequentially following the topological order.
 *
 * @param graph    — built graph from buildGraph()
 * @param inputs   — initial input values keyed by `nodeId.paramName`
 * @returns        — Map of nodeId → CalcResult for each node
 */
export async function executeGraph(
  graph: CalcGraph,
  inputs: Map<string, any>,
): Promise<Map<string, CalcResult>> {
  const results = new Map<string, CalcResult>();
  // Accumulated outputs: `nodeId.paramName` → value
  const outputs = new Map<string, any>(inputs);

  for (const nodeId of graph.execution_order) {
    const node = graph.nodes.get(nodeId)!;

    // Gather inputs for this node
    const nodeInputs: Record<string, any> = {};

    // First, collect from direct inputs map (`nodeId.paramName`)
    for (const param of node.inputs) {
      const directKey = `${nodeId}.${param.name}`;
      if (outputs.has(directKey)) {
        nodeInputs[param.name] = outputs.get(directKey);
      }
    }

    // Then, wire upstream outputs via edges
    const incomingEdges = graph.edges.filter((e) => e.to === nodeId);
    for (const edge of incomingEdges) {
      for (const [fromParam, toParam] of Object.entries(edge.param_map)) {
        const upstreamKey = `${edge.from}.${fromParam}`;
        if (outputs.has(upstreamKey) && !(toParam in nodeInputs)) {
          nodeInputs[toParam] = outputs.get(upstreamKey);
        }
      }
    }

    // Validate required inputs
    for (const param of node.inputs) {
      if (!(param.name in nodeInputs)) {
        // Try bare name from global inputs
        if (inputs.has(param.name)) {
          nodeInputs[param.name] = inputs.get(param.name);
        }
      }
    }

    // Execute the calculator
    let result: CalcResult;
    try {
      result = await Promise.resolve(node.calculator(nodeInputs)) as CalcResult;
    } catch (err) {
      result = {
        value: null,
        unit: '',
        source: [],
        judgment: {
          pass: false,
          message: `Calculation failed: ${err instanceof Error ? err.message : String(err)}`,
          severity: 'error',
        },
      };
    }

    results.set(nodeId, result);

    // Store outputs for downstream nodes
    if (result.value !== null) {
      for (const outParam of node.outputs) {
        const key = `${nodeId}.${outParam.name}`;
        // If result has the param as a direct property, use it;
        // otherwise use result.value for single-output nodes
        const val = (result as any)[outParam.name] ?? result.value;
        outputs.set(key, val);
      }
    }
  }

  return results;
}

/**
 * Synchronous version for graphs with no async calculators.
 */
export function executeGraphSync(
  graph: CalcGraph,
  inputs: Map<string, any>,
): Map<string, CalcResult> {
  const results = new Map<string, CalcResult>();
  const outputs = new Map<string, any>(inputs);

  for (const nodeId of graph.execution_order) {
    const node = graph.nodes.get(nodeId)!;
    const nodeInputs: Record<string, any> = {};

    for (const param of node.inputs) {
      const directKey = `${nodeId}.${param.name}`;
      if (outputs.has(directKey)) {
        nodeInputs[param.name] = outputs.get(directKey);
      }
    }

    const incomingEdges = graph.edges.filter((e) => e.to === nodeId);
    for (const edge of incomingEdges) {
      for (const [fromParam, toParam] of Object.entries(edge.param_map)) {
        const upstreamKey = `${edge.from}.${fromParam}`;
        if (outputs.has(upstreamKey) && !(toParam in nodeInputs)) {
          nodeInputs[toParam] = outputs.get(upstreamKey);
        }
      }
    }

    for (const param of node.inputs) {
      if (!(param.name in nodeInputs) && inputs.has(param.name)) {
        nodeInputs[param.name] = inputs.get(param.name);
      }
    }

    let result: CalcResult;
    try {
      result = node.calculator(nodeInputs) as CalcResult;
    } catch (err) {
      result = {
        value: null,
        unit: '',
        source: [],
        judgment: {
          pass: false,
          message: `Calculation failed: ${err instanceof Error ? err.message : String(err)}`,
          severity: 'error',
        },
      };
    }

    results.set(nodeId, result);

    if (result.value !== null) {
      for (const outParam of node.outputs) {
        const key = `${nodeId}.${outParam.name}`;
        const val = (result as any)[outParam.name] ?? result.value;
        outputs.set(key, val);
      }
    }
  }

  return results;
}

// =========================================================================
// PART 3 — Predefined Calculation Chains
// =========================================================================

/**
 * Chain definitions: arrays of { id, depends_on } that define the
 * execution order for common engineering workflows.
 *
 * These are templates — actual CalcNode instances with calculators
 * must be provided when building the graph. These definitions serve
 * as the canonical dependency declarations.
 */

export interface ChainNodeDef {
  id: string;
  depends_on: string[];
  description: string;
}

/**
 * Substation design chain:
 *   transformer → shortCircuit → breaker → cable → voltageDrop → grounding
 */
export const SUBSTATION_CHAIN: ChainNodeDef[] = [
  {
    id: 'transformer',
    depends_on: [],
    description: 'Transformer sizing — determine kVA, impedance, tap settings',
  },
  {
    id: 'shortCircuit',
    depends_on: ['transformer'],
    description: 'Short-circuit current calculation (symmetrical & asymmetrical)',
  },
  {
    id: 'breaker',
    depends_on: ['shortCircuit'],
    description: 'Circuit breaker selection — breaking capacity, trip settings',
  },
  {
    id: 'cable',
    depends_on: ['breaker'],
    description: 'Cable sizing — ampacity, short-circuit withstand, derating',
  },
  {
    id: 'voltageDrop',
    depends_on: ['cable'],
    description: 'Voltage drop verification — %VD at load point',
  },
  {
    id: 'grounding',
    depends_on: ['transformer', 'shortCircuit'],
    description: 'Grounding system design — grid resistance, step/touch voltage',
  },
];

/**
 * Solar PV system chain:
 *   generation → inverter → battery → cable → gridConnect
 */
export const SOLAR_CHAIN: ChainNodeDef[] = [
  {
    id: 'generation',
    depends_on: [],
    description: 'PV array sizing — module count, string configuration, peak power',
  },
  {
    id: 'inverter',
    depends_on: ['generation'],
    description: 'Inverter selection — DC/AC ratio, MPPT range, efficiency',
  },
  {
    id: 'battery',
    depends_on: ['generation', 'inverter'],
    description: 'Battery storage sizing — capacity, charge/discharge rates, DoD',
  },
  {
    id: 'cable',
    depends_on: ['inverter', 'battery'],
    description: 'DC and AC cable sizing — ampacity, voltage drop',
  },
  {
    id: 'gridConnect',
    depends_on: ['cable', 'inverter'],
    description: 'Grid interconnection — protection, metering, anti-islanding',
  },
];

/**
 * Motor circuit chain:
 *   capacity → startingCurrent → cable → breaker → powerFactor
 */
export const MOTOR_CHAIN: ChainNodeDef[] = [
  {
    id: 'capacity',
    depends_on: [],
    description: 'Motor load calculation — shaft power, efficiency, service factor',
  },
  {
    id: 'startingCurrent',
    depends_on: ['capacity'],
    description: 'Starting current analysis — DOL, star-delta, VFD inrush',
  },
  {
    id: 'cable',
    depends_on: ['startingCurrent'],
    description: 'Motor feeder cable sizing — FLA, starting current derating',
  },
  {
    id: 'breaker',
    depends_on: ['startingCurrent', 'cable'],
    description: 'Motor circuit breaker/starter selection — MCCB or contactor+overload',
  },
  {
    id: 'powerFactor',
    depends_on: ['capacity'],
    description: 'Power factor correction — capacitor bank sizing, harmonic check',
  },
];

// =========================================================================
// PART 4 — Utility: Create CalcNodes from Chain + Calculator Map
// =========================================================================

/**
 * Convenience: merge a chain definition with a map of calculator functions
 * to produce CalcNode[] ready for buildGraph().
 */
export function createNodesFromChain(
  chain: ChainNodeDef[],
  calculators: Record<string, {
    calculator: (...args: unknown[]) => unknown;
    inputs: CalcNode['inputs'];
    outputs: CalcNode['outputs'];
    code_ref?: string[];
  }>,
): CalcNode[] {
  return chain.map((def) => {
    const calc = calculators[def.id];
    if (!calc) {
      throw new Error(
        `No calculator provided for chain node "${def.id}". ` +
        `Required nodes: ${chain.map((d) => d.id).join(', ')}`,
      );
    }
    return {
      id: def.id,
      depends_on: def.depends_on,
      calculator: calc.calculator,
      inputs: calc.inputs,
      outputs: calc.outputs,
      code_ref: calc.code_ref ?? [],
    };
  });
}

// =========================================================================
// PART 5 — Graph Inspection Utilities
// =========================================================================

/** Get all nodes that depend on a given node (direct dependents) */
export function getDependents(graph: CalcGraph, nodeId: string): string[] {
  return graph.edges
    .filter((e) => e.from === nodeId)
    .map((e) => e.to);
}

/** Get all nodes that a given node depends on (direct dependencies) */
export function getDependencies(graph: CalcGraph, nodeId: string): string[] {
  return graph.edges
    .filter((e) => e.to === nodeId)
    .map((e) => e.from);
}

/** Get execution order as a readable string for debugging */
export function describeGraph(graph: CalcGraph): string {
  const lines: string[] = ['Calculation Graph:'];
  for (const nodeId of graph.execution_order) {
    const deps = getDependencies(graph, nodeId);
    const depStr = deps.length > 0 ? ` (depends on: ${deps.join(', ')})` : ' (root)';
    lines.push(`  ${graph.execution_order.indexOf(nodeId) + 1}. ${nodeId}${depStr}`);
  }
  return lines.join('\n');
}
