'use client';

import { useState } from 'react';
import { Download, Library, Trash2, Upload } from 'lucide-react';

import { SLD_COMPONENT_TYPES, type SLDComponentType } from '@/lib/sld-component-types';
import type { SymbolLibrary } from '@/lib/symbol-library-contract';
import type {
  SymbolLibraryCatalog,
  SymbolMappingInput,
} from '@/lib/symbol-library-store';

const DEVICE_TYPE_LABELS: Record<SLDComponentType, string> = {
  transformer: '변압기 (TR)',
  breaker: '차단기 (VCB/MCCB/ACB)',
  cable: '케이블',
  bus: '모선 (BUS)',
  generator: '발전기 (GEN)',
  motor: '전동기 (MOTOR)',
  capacitor: '콘덴서 (CAP)',
  reactor: '리액터 (REA)',
  load: '부하 (LOAD)',
  switch: '개폐기 (LBS/DS/STS)',
  relay: '보호계전기 (RLY)',
  meter: '계기 (CT/PT/METER)',
  panel: '배전반·분전반 (PANEL)',
  ups: '무정전전원장치 (UPS)',
  mcc: '전동기제어반 (MCC)',
  arrester: '피뢰기·SPD (LA/SA)',
  ground: '접지 (GND)',
  lamp: '표시등 (PL)',
  fuse: '퓨즈 (PF/FUSE)',
  grid_connection: '전력망 연결점',
  source: '수전·인입 전원',
  annotation: '타 도면 참조·주석',
};

interface SymbolLibraryPanelProps {
  catalog: SymbolLibraryCatalog;
  activeLibrary: SymbolLibrary | null;
  status: string | null;
  onImport: (file: File) => Promise<void>;
  onSelect: (organization: string | null) => void;
  onExport: () => void;
  onDelete: () => void;
}

/** 도면 업로드 전에 적용 회사를 고르고, JSON을 반입·반출하는 표면. */
export function SymbolLibraryPanel({
  catalog,
  activeLibrary,
  status,
  onImport,
  onSelect,
  onExport,
  onDelete,
}: SymbolLibraryPanelProps) {
  const [importing, setImporting] = useState(false);

  return (
    <section
      aria-labelledby="symbol-library-heading"
      className="mb-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4"
    >
      <div className="flex items-start gap-3">
        <Library size={18} className="mt-0.5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="symbol-library-heading" className="text-sm font-semibold text-[var(--text-primary)]">
            회사별 심볼 사전
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            회사마다 다른 블록·심볼을 이 브라우저에 저장하고, 선택한 회사의 빠른 분석·전체 판독·정밀 검증에 동일하게 적용합니다.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="text-xs font-medium text-[var(--text-secondary)]">
          분석에 적용할 회사
          <select
            value={activeLibrary?.organization ?? ''}
            onChange={(event) => onSelect(event.target.value || null)}
            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]"
          >
            <option value="">적용 안 함</option>
            {catalog.libraries.map((library) => (
              <option key={library.organization} value={library.organization}>
                {library.organization} · {library.entries.length}종
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 self-end rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--color-primary)]">
          <Upload size={15} aria-hidden="true" />
          {importing ? '가져오는 중…' : 'JSON 가져오기'}
          <input
            type="file"
            accept=".json,application/json"
            disabled={importing}
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              setImporting(true);
              try {
                await onImport(file);
              } finally {
                setImporting(false);
              }
            }}
          />
        </label>
      </div>

      {activeLibrary && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--bg-primary)] px-3 py-2">
          <p className="text-xs text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{activeLibrary.organization}</span>
            {' · '}등록 {activeLibrary.entries.length}종
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onExport}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
            >
              <Download size={14} aria-hidden="true" />
              내보내기
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-[var(--color-error)] hover:bg-[var(--bg-secondary)]"
            >
              <Trash2 size={14} aria-hidden="true" />
              삭제
            </button>
          </div>
        </div>
      )}

      <p className="mt-2 min-h-4 text-xs text-[var(--text-tertiary)]" aria-live="polite">
        {status ?? (catalog.libraries.length > 0
          ? `${catalog.libraries.length}개 회사 사전이 이 브라우저에 저장되어 있습니다.`
          : '미인식 심볼을 분석 결과에서 분류하면 첫 회사 사전이 만들어집니다.')}
      </p>
    </section>
  );
}

interface UnknownSymbol {
  blockName: string;
  fingerprint: string | null;
  count: number;
  samplePosition: { x: number; y: number };
}

interface UnknownSymbolRegistrarProps {
  symbols: UnknownSymbol[];
  activeOrganization: string | null;
  onSaveAndAnalyze: (organization: string, mappings: SymbolMappingInput[]) => Promise<boolean>;
}

/** 미인식 결과를 JSON 수작업 없이 회사 사전에 확정하는 표면. */
export function UnknownSymbolRegistrar({
  symbols,
  activeOrganization,
  onSaveAndAnalyze,
}: UnknownSymbolRegistrarProps) {
  const [organization, setOrganization] = useState(activeOrganization ?? '');
  const [selections, setSelections] = useState<Record<string, SLDComponentType | ''>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedMappings = symbols.flatMap((symbol) => {
    const deviceType = selections[symbol.blockName];
    return deviceType
      ? [{
          blockName: symbol.blockName,
          fingerprint: symbol.fingerprint,
          deviceType,
        } satisfies SymbolMappingInput]
      : [];
  });

  return (
    <section
      aria-labelledby="unknown-symbol-heading"
      className="rounded-xl border border-[var(--color-warning)] bg-[var(--bg-secondary)] p-4"
    >
      <h3 id="unknown-symbol-heading" className="text-sm font-semibold text-[var(--color-warning)]">
        미인식 심볼 {symbols.length}종
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
        현재 결과에서는 임시 부하로 표시되지만 확정 판정이 아닙니다. 실제 종류를 아는 항목만 선택하세요. 선택하지 않은 항목은 저장하지 않습니다.
      </p>

      <label className="mt-3 block text-xs font-medium text-[var(--text-secondary)]">
        이 심볼을 사용하는 회사명
        <input
          value={organization}
          maxLength={120}
          onChange={(event) => setOrganization(event.target.value)}
          placeholder="예: A전기"
          className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
        />
      </label>

      <div className="mt-3 space-y-2">
        {symbols.map((symbol) => (
          <div key={`${symbol.blockName}:${symbol.fingerprint ?? ''}`} className="grid gap-2 rounded-lg bg-[var(--bg-primary)] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(190px,0.8fr)] sm:items-center">
            <div className="min-w-0">
              <p className="truncate font-mono text-xs font-semibold text-[var(--text-primary)]">
                {symbol.blockName} <span className="font-sans font-normal text-[var(--text-secondary)]">× {symbol.count}</span>
              </p>
              {symbol.fingerprint && (
                <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-tertiary)]">{symbol.fingerprint}</p>
              )}
            </div>
            <label className="text-xs text-[var(--text-secondary)]">
              기기 종류
              <select
                aria-label={`${symbol.blockName} 기기 종류`}
                value={selections[symbol.blockName] ?? ''}
                onChange={(event) => setSelections((current) => ({
                  ...current,
                  [symbol.blockName]: event.target.value as SLDComponentType | '',
                }))}
                className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-secondary)] px-3 text-sm text-[var(--text-primary)]"
              >
                <option value="">모름 · 저장 안 함</option>
                {SLD_COMPONENT_TYPES.map((type) => (
                  <option key={type} value={type}>{DEVICE_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={saving || selectedMappings.length === 0 || organization.trim().length === 0}
        onClick={async () => {
          setSaving(true);
          setMessage(null);
          try {
            const analyzed = await onSaveAndAnalyze(organization, selectedMappings);
            setMessage(analyzed
              ? `${selectedMappings.length}종을 저장하고 현재 도면에 다시 적용했습니다.`
              : `${selectedMappings.length}종은 저장했지만 현재 도면 재분석에 실패했습니다. 파일을 다시 올리면 자동 적용됩니다.`);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : '회사 심볼 저장에 실패했습니다.');
          } finally {
            setSaving(false);
          }
        }}
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--color-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? '저장·재분석 중…' : `선택한 ${selectedMappings.length}종 저장 후 다시 분석`}
      </button>
      <p className="mt-2 min-h-4 text-xs text-[var(--text-secondary)]" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
