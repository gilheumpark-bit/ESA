/**
 * ESVA Receipt UI Adapter — GET /api/receipt/[id]
 * Loads the same receipt store as /api/calculate/[id] and normalizes the
 * response shape consumed by ReceiptCard.
 */

import { NextRequest, NextResponse } from 'next/server';

import { extractVerifiedUserId } from '@/lib/auth-helpers';
import { applyRateLimit } from '@/lib/rate-limit';
import { computeReceiptIntegrity } from '@/lib/receipt-integrity';
import { loadCalculation } from '@/lib/supabase';
import type { Receipt, UnitSystem } from '@/engine/receipt/types';
import type { DifficultyLevel } from '@/engine/calculators/types';

const DIFFICULTIES = new Set<DifficultyLevel>(['basic', 'intermediate', 'advanced']);

function asUnitSystem(value: unknown): UnitSystem {
  return value === 'Imperial' ? 'Imperial' : 'SI';
}

function asDifficulty(value: unknown): DifficultyLevel {
  return typeof value === 'string' && DIFFICULTIES.has(value as DifficultyLevel)
    ? value as DifficultyLevel
    : 'basic';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const blocked = applyRateLimit(request, 'default');
    if (blocked) return blocked;

    const { id } = await params;
    if (!id || typeof id !== 'string' || id.length < 8) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4020', message: 'Invalid receipt ID' } },
        { status: 400 },
      );
    }

    const row = await loadCalculation(id);
    if (!row) {
      return NextResponse.json(
        { success: false, error: { code: 'ESVA-4021', message: 'Receipt not found' } },
        { status: 404 },
      );
    }

    if (!row.is_public) {
      const requesterId = await extractVerifiedUserId(request);
      if (!requesterId) {
        return NextResponse.json(
          { success: false, error: { code: 'ESVA-1001', message: 'Authentication required' } },
          { status: 401 },
        );
      }
      if (!row.user_id || requesterId !== row.user_id) {
        return NextResponse.json(
          { success: false, error: { code: 'ESVA-1002', message: 'Access denied' } },
          { status: 403 },
        );
      }
    }

    const integrity = await computeReceiptIntegrity(row);
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const rowId = row.id ?? id;
    const storedHash = row.receipt_hash ?? (typeof meta.receiptHash === 'string' ? meta.receiptHash : '');
    const receipt: Receipt & {
      integrity: Awaited<ReturnType<typeof computeReceiptIntegrity>>;
      hash: string;
      calculatorId: string;
      calculatorName: string;
      outputs: Record<string, unknown>;
    } = {
      id: rowId,
      calcId: typeof meta.calcId === 'string' ? meta.calcId : row.calculator_id,
      userId: row.user_id || undefined,
      projectId: typeof meta.projectId === 'string' ? meta.projectId : undefined,
      countryCode: row.country_code ?? 'KR',
      appliedStandard: row.applied_standard ?? (typeof meta.appliedStandard === 'string' ? meta.appliedStandard : ''),
      unitSystem: asUnitSystem(row.unit_system ?? meta.unitSystem),
      difficultyLevel: asDifficulty(row.difficulty_level),
      inputs: row.inputs,
      result: row.outputs as unknown as Receipt['result'],
      steps: Array.isArray(row.steps) ? row.steps as Receipt['steps'] : [],
      formulaUsed: row.formula_used ?? '',
      standardsUsed: asStringArray(row.standards_used),
      warnings: asStringArray(row.warnings),
      recommendations: asStringArray(row.recommendations),
      disclaimerText: row.disclaimer_text ?? '',
      disclaimerVersion: row.disclaimer_version ?? '',
      calculatedAt: row.calculated_at ?? row.created_at ?? '',
      standardVersion: row.standard_version ?? row.standard_ref ?? '',
      standardVerifiedAt: row.standard_verified_at,
      engineVersion: row.engine_version ?? (typeof meta.engineVersion === 'string' ? meta.engineVersion : ''),
      // Legacy true values without evidence are not promoted to verified current.
      isStandardCurrent: row.is_standard_current === true && Boolean(row.standard_verified_at),
      receiptHash: storedHash,
      isPublic: row.is_public === true,
      integrity,
      hash: storedHash,
      // Compatibility aliases for older API consumers.
      calculatorId: row.calculator_id,
      calculatorName: row.calculator_name,
      outputs: row.outputs,
    };

    return NextResponse.json(receipt, {
      status: 200,
      headers: {
        'Cache-Control': row.is_public
          ? 'public, max-age=3600, s-maxage=86400'
          : 'private, max-age=300',
      },
    });
  } catch (error) {
    console.error('[ESVA /api/receipt/[id]] Error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'ESVA-4999', message: 'Failed to load receipt' } },
      { status: 500 },
    );
  }
}
