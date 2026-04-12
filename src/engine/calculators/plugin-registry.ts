/**
 * Calculator Plugin Registry
 * ---------------------------
 * switch문 대신 자동 등록 패턴.
 * 새 계산기 추가 시 register()만 호출하면 됨.
 *
 * 사용법:
 *   import { calcRegistry } from '@engine/calculators/plugin-registry';
 *   calcRegistry.register({ id: 'my-calc', ... });
 *   const result = calcRegistry.execute('my-calc', inputs);
 */

import type { CalculatorRegistryEntry, DetailedCalcResult } from './types';

class CalculatorPluginRegistry {
  private readonly entries = new Map<string, CalculatorRegistryEntry>();

  /** 계산기 등록 */
  register(entry: CalculatorRegistryEntry): void {
    if (this.entries.has(entry.id)) {
      console.warn(`[ESVA] Calculator "${entry.id}" already registered — overwriting`);
    }
    this.entries.set(entry.id, entry);
  }

  /** 계산기 일괄 등록 */
  registerAll(entries: CalculatorRegistryEntry[]): void {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  /** 계산기 실행 */
  execute(id: string, inputs: Record<string, unknown>): DetailedCalcResult {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new Error(`ESVA-4005: Unknown calculator: ${id}`);
    }
    return entry.calculator(inputs);
  }

  /** 계산기 조회 */
  get(id: string): CalculatorRegistryEntry | undefined {
    return this.entries.get(id);
  }

  /** 카테고리별 계산기 목록 */
  getByCategory(category: string): CalculatorRegistryEntry[] {
    return [...this.entries.values()].filter(e => e.category === category);
  }

  /** 전체 계산기 ID 목록 */
  getIds(): string[] {
    return [...this.entries.keys()];
  }

  /** 전체 수 */
  get size(): number {
    return this.entries.size;
  }

  /** Map 호환 인터페이스 */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Iterator */
  [Symbol.iterator]() {
    return this.entries.entries();
  }
}

/** 싱글톤 레지스트리 */
export const calcRegistry = new CalculatorPluginRegistry();

export default calcRegistry;
