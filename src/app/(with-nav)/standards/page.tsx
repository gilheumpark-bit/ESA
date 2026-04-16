'use client';

/**
 * Standards Browser Page — /standards
 *
 * PART 1: Imports & constants
 * PART 2: Detail panel
 * PART 3: Main page component
 */

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Search,
  ExternalLink,
  X,
  ArrowRightLeft,
  Loader2,
} from 'lucide-react';
import { STANDARD_REFS, type StandardRef } from '@/data/standards/standard-refs';
import { KEC_ARTICLES } from '@/engine/standards/kec';
import { NEC_ARTICLES_FULL } from '@/engine/standards/nec/nec-articles';
import { IEC_ARTICLES } from '@/engine/standards/iec/iec-articles';
import { NER_ARTICLES, type NerArticle } from '@/engine/standards/ner/ner-articles';
import { ESA_ARTICLES, type EsaArticle } from '@/engine/standards/esa/esa-articles';
import StandardsTree from '@/components/StandardsTree';
import SplitView from '@/components/SplitView';
import { getExamFrequency } from '@/data/exam-frequency/exam-frequency';
import { getCertsByStandard } from '@/data/certifications/certification-db';
import type { CodeArticle } from '@/engine/standards/kec/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Constants
// ═══════════════════════════════════════════════════════════════════════════════

const COUNTRY_FILTERS = [
  { value: '', label: '전체' },
  { value: 'KR', label: '한국 (KEC·NER·ESA)' },
  { value: 'US', label: '미국 (NEC)' },
  { value: 'JP', label: '일본 (JIS)' },
  { value: 'INT', label: '국제 (IEC/IEEE)' },
];

const LICENSE_FILTERS = [
  { value: '', label: '전체 유형' },
  { value: 'open', label: '공개' },
  { value: 'summary_only', label: '요약만' },
  { value: 'link_only', label: '링크만' },
];

// 계산기 관련 맵핑 (standardRef id → calc id)
const STANDARD_CALC_MAP: Record<string, { calcId: string; category: string; label: string }[]> = {
  // KEC
  'kec-130': [{ calcId: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'kec-212': [{ calcId: 'breaker-sizing', category: 'protection', label: '차단기 선정' }],
  'kec-232': [{ calcId: 'voltage-drop', category: 'voltage-drop', label: '전압 강하' }, { calcId: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'kec-241': [{ calcId: 'breaker-sizing', category: 'protection', label: '차단기 선정' }],
  'kec-140': [{ calcId: 'ground-resistance', category: 'grounding', label: '접지 저항' }, { calcId: 'ground-conductor', category: 'grounding', label: '접지 도체' }],
  'kec-502': [{ calcId: 'solar-generation', category: 'renewable', label: '태양광 발전량' }, { calcId: 'solar-cable', category: 'renewable', label: '태양광 DC 케이블' }],
  'kec-510': [{ calcId: 'battery-capacity', category: 'renewable', label: '배터리 용량' }],
  // NEC
  'nec-210': [{ calcId: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'nec-240': [{ calcId: 'breaker-sizing', category: 'protection', label: '차단기 선정' }],
  'nec-250': [{ calcId: 'ground-resistance', category: 'grounding', label: '접지 저항' }],
  'nec-310': [{ calcId: 'ampacity-compare', category: 'cable', label: '허용전류 비교' }, { calcId: 'cable-sizing', category: 'cable', label: '케이블 사이징' }],
  'nec-430': [{ calcId: 'motor-capacity', category: 'motor', label: '전동기 용량' }, { calcId: 'starting-current', category: 'motor', label: '기동전류' }],
  'nec-690': [{ calcId: 'solar-generation', category: 'renewable', label: '태양광 발전량' }, { calcId: 'solar-cable', category: 'renewable', label: '태양광 DC 케이블' }],
  // IEC
  'iec-60364': [{ calcId: 'cable-sizing', category: 'cable', label: '케이블 사이징' }, { calcId: 'voltage-drop', category: 'voltage-drop', label: '전압 강하' }],
  'iec-60909': [{ calcId: 'short-circuit', category: 'protection', label: '단락전류 계산' }],
  'iec-61936': [{ calcId: 'substation-capacity', category: 'substation', label: '수변전 용량' }],
  // JIS
  'jis-c0364': [{ calcId: 'ground-resistance', category: 'grounding', label: '접지 저항' }, { calcId: 'voltage-drop', category: 'voltage-drop', label: '전압 강하' }],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Detail Panel
// ═══════════════════════════════════════════════════════════════════════════════

function DetailPanel({
  ref_,
  onClose,
}: {
  ref_: StandardRef;
  onClose: () => void;
}) {
  // Find matching articles across KEC + NEC + IEC
  const kecArticles: CodeArticle[] = useMemo(() => {
    const articles: CodeArticle[] = [];
    const clause = ref_.clause;
    if (!clause) return articles;

    if (ref_.standard.startsWith('KEC')) {
      KEC_ARTICLES.forEach((article) => {
        if (article.article.startsWith(clause)) articles.push(article);
      });
    }
    if (ref_.standard.startsWith('NEC')) {
      NEC_ARTICLES_FULL.forEach((article) => {
        if (article.article.startsWith(clause)) articles.push(article);
      });
    }
    if (ref_.standard.startsWith('IEC')) {
      IEC_ARTICLES.forEach((article) => {
        if (article.article.startsWith(clause)) articles.push(article);
      });
    }
    return articles;
  }, [ref_]);

  // NER 조문 조회 (한국전기내선규정)
  const nerArticles: NerArticle[] = useMemo(() => {
    if (ref_.standard !== 'NER' || !ref_.clause) return [];
    const prefix = `NER-${ref_.clause}`;
    const result: NerArticle[] = [];
    NER_ARTICLES.forEach((art) => {
      if (art.id.startsWith(prefix)) result.push(art);
    });
    return result;
  }, [ref_]);

  // ESA 조문 조회 (전기사업법)
  const esaArticles: EsaArticle[] = useMemo(() => {
    if (ref_.standard !== 'ESA' || !ref_.clause) return [];
    const prefix = `ESA-${ref_.clause}`;
    const result: EsaArticle[] = [];
    ESA_ARTICLES.forEach((art) => {
      if (art.id.startsWith(prefix)) result.push(art);
    });
    return result;
  }, [ref_]);

  const relatedCalcs = STANDARD_CALC_MAP[ref_.id] ?? [];

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      {/* Close button */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <span className="text-xs font-medium text-[var(--text-tertiary)]">
            {ref_.standard} {ref_.clause ?? ''}
          </span>
          <h2 className="mt-1 text-lg font-bold text-[var(--text-primary)]">
            {ref_.title_ko}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">{ref_.title_en}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-tertiary)]"
        >
          <X size={18} />
        </button>
      </div>

      {/* Meta info */}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[var(--text-tertiary)]">
          {ref_.body}
        </span>
        <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[var(--text-tertiary)]">
          {ref_.country}
        </span>
        {ref_.edition && (
          <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[var(--text-tertiary)]">
            {ref_.edition}
          </span>
        )}
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            ref_.licenseType === 'open'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : ref_.licenseType === 'summary_only'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}
        >
          {ref_.licenseType === 'open' ? '공개' : ref_.licenseType === 'summary_only' ? '요약' : '링크'}
        </span>
      </div>

      {/* KEC articles (conditions tree) */}
      {kecArticles.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
            조항 ({kecArticles.length}개)
          </h3>
          <div className="space-y-2">
            {kecArticles.map((art) => (
              <div
                key={art.id}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] p-3"
              >
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {art.article} — {art.title}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  {art.standard} {art.version} | {art.effectiveDate}
                </p>
                {art.conditions.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {art.conditions.map((cond, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-xs text-[var(--text-secondary)]"
                      >
                        <span className="shrink-0 font-mono text-[var(--text-tertiary)]">
                          {cond.param} {cond.operator} {cond.value}{cond.unit}
                        </span>
                        <span className="text-[var(--text-tertiary)]">&rarr;</span>
                        <span className={cond.result === 'PASS' ? 'text-green-600' : 'text-red-600'}>
                          {cond.result}
                        </span>
                        <span className="text-[var(--text-tertiary)]">({cond.note})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NER 조문 내용 (한국전기내선규정) */}
      {nerArticles.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
            조문 내용 ({nerArticles.length}개)
          </h3>
          <div className="space-y-3">
            {nerArticles.map((art) => (
              <div
                key={art.id}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] p-3"
              >
                {/* 조문 번호 + 제목 */}
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {art.article} — {art.title}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  내선규정 {art.edition}
                </p>
                {/* 핵심 요약 */}
                <p className="mt-2 rounded bg-[var(--color-primary)]/8 px-2.5 py-1.5 text-xs font-medium text-[var(--color-primary)]">
                  💡 {art.summary}
                </p>
                {/* 조문 본문 */}
                <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-secondary)] font-sans">
                  {art.content}
                </pre>
                {/* 규정 표 */}
                {art.table && art.table.length > 0 && (
                  <table className="mt-2 w-full text-xs border-collapse">
                    <tbody>
                      {art.table.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-[var(--bg-secondary)]' : ''}>
                          <td className="border border-[var(--border-default)] px-2 py-1 font-medium text-[var(--text-secondary)]">{row.label}</td>
                          <td className="border border-[var(--border-default)] px-2 py-1 text-[var(--text-primary)]">{row.value}</td>
                          {row.note && <td className="border border-[var(--border-default)] px-2 py-1 text-[var(--text-tertiary)]">{row.note}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {/* 교차 참조 */}
                {art.crossRef && art.crossRef.length > 0 && (
                  <p className="mt-1.5 text-[10px] text-[var(--text-tertiary)]">
                    참조: {art.crossRef.join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ESA 조문 내용 (전기사업법) */}
      {esaArticles.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
            조문 내용 ({esaArticles.length}개)
          </h3>
          <div className="space-y-3">
            {esaArticles.map((art) => (
              <div
                key={art.id}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-tertiary)] p-3"
              >
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {art.article} — {art.title}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  전기사업법 {art.edition}
                </p>
                {/* 핵심 요약 */}
                <p className="mt-2 rounded bg-[var(--color-primary)]/8 px-2.5 py-1.5 text-xs font-medium text-[var(--color-primary)]">
                  💡 {art.summary}
                </p>
                {/* 조문 본문 */}
                <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-secondary)] font-sans">
                  {art.content}
                </pre>
                {/* 위반 제재 */}
                {art.penalty && (
                  <div className="mt-2 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    ⚠️ {art.penalty}
                  </div>
                )}
                {/* 교차 참조 */}
                {art.crossRef && art.crossRef.length > 0 && (
                  <p className="mt-1.5 text-[10px] text-[var(--text-tertiary)]">
                    참조: {art.crossRef.join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 교차참조 조항 */}
      {kecArticles.some(a => a.relatedClauses && a.relatedClauses.length > 0) && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
            교차참조 조항
          </h3>
          <div className="space-y-1">
            {kecArticles.flatMap(a => a.relatedClauses ?? []).map((rel, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-medium ${
                  rel.relation === 'equivalent' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : rel.relation === 'exception' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  {rel.relation === 'equivalent' ? '등가' : rel.relation === 'exception' ? '예외' : rel.relation === 'implements' ? '구현' : '참조'}
                </span>
                <span className="font-mono text-[var(--color-primary)]">{rel.articleId}</span>
                <span className="text-[var(--text-tertiary)]">{rel.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 허용전류표 퀵 조회 (KEC 232 계열) */}
      {ref_.clause?.startsWith('232') && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <h3 className="mb-1 text-sm font-semibold text-blue-700 dark:text-blue-300">
            허용전류표 퀵 조회
          </h3>
          <p className="text-xs text-blue-600 dark:text-blue-400">
            Cu/XLPE/conduit 기준 주요 규격:
            4sq→36A, 6sq→46A, 10sq→63A, 16sq→85A, 25sq→112A, 35sq→138A, 50sq→168A, 95sq→258A
          </p>
          <Link href="/calc?q=허용전류" className="mt-2 inline-flex text-xs font-medium text-blue-700 hover:underline dark:text-blue-300">
            허용전류 계산기로 이동 →
          </Link>
        </div>
      )}

      {/* External link */}
      {ref_.licenseType === 'link_only' && (
        <div className="mb-4">
          <p className="text-xs text-[var(--text-tertiary)]">
            이 표준은 유료이므로 외부 링크만 제공됩니다.
          </p>
          {ref_.url && (
            <a
              href={ref_.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 text-sm text-[var(--color-primary)] hover:underline"
            >
              <ExternalLink size={14} />
              표준 원문 보기
            </a>
          )}
        </div>
      )}

      {/* Related calculators */}
      {relatedCalcs.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
            관련 계산기
          </h3>
          <div className="flex flex-wrap gap-2">
            {relatedCalcs.map((calc) => (
              <Link
                key={calc.calcId}
                href={`/calc/${calc.category}/${calc.calcId}`}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
              >
                {calc.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2.5 — Standard Convert Widget (calls /api/standard-convert)
// ═══════════════════════════════════════════════════════════════════════════════

const CONVERT_STANDARDS = ['KEC', 'NEC', 'IEC', 'JIS'] as const;

interface ConversionResult {
  toStandard: string;
  toClause: string;
  confidence: number;
  title?: string;
  notes?: string;
}

function StandardConvertWidget() {
  const [fromStandard, setFromStandard] = useState('KEC');
  const [fromClause, setFromClause] = useState('');
  const [toStandard, setToStandard] = useState('NEC');
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConvert = useCallback(async () => {
    if (!fromClause.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/standard-convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromStandard,
          fromClause: fromClause.trim(),
          toStandard,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
      } else {
        setError(json.error?.message ?? '변환 실패');
      }
    } catch {
      setError('네트워크 오류');
    } finally {
      setLoading(false);
    }
  }, [fromStandard, fromClause, toStandard]);

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <ArrowRightLeft size={16} className="text-[var(--color-primary)]" />
        기준 변환
      </h3>
      <p className="mb-4 text-xs text-[var(--text-tertiary)]">
        KEC / NEC / IEC / JIS 조항 번호를 상호 변환합니다
      </p>

      <div className="space-y-3">
        {/* From */}
        <div className="flex gap-2">
          <select
            value={fromStandard}
            onChange={(e) => setFromStandard(e.target.value)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 text-sm"
          >
            {CONVERT_STANDARDS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            type="text"
            value={fromClause}
            onChange={(e) => setFromClause(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConvert(); }}
            placeholder="조항 번호 (예: 232.1)"
            className="h-9 flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm outline-none focus:border-[var(--color-primary)]"
          />
        </div>

        {/* To */}
        <div className="flex items-center gap-2">
          <ArrowRightLeft size={14} className="shrink-0 text-[var(--text-tertiary)]" />
          <select
            value={toStandard}
            onChange={(e) => setToStandard(e.target.value)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 text-sm"
          >
            {CONVERT_STANDARDS.filter((s) => s !== fromStandard).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={handleConvert}
            disabled={loading || !fromClause.trim()}
            className="h-9 rounded-lg bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : '변환'}
          </button>
        </div>

        {/* Result */}
        {error && (
          <p className="text-xs text-[var(--color-error)]">{error}</p>
        )}
        {result && (
          <div className="rounded-lg bg-[var(--bg-secondary)] p-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-[var(--text-tertiary)]">{result.toStandard}</span>
              <span className="text-base font-bold text-[var(--text-primary)]">{result.toClause}</span>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${
                result.confidence >= 0.8
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : result.confidence >= 0.5
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {Math.round(result.confidence * 100)}% 일치
              </span>
            </div>
            {result.title && (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{result.title}</p>
            )}
            {result.notes && (
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">{result.notes}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — Main Page
// ═══════════════════════════════════════════════════════════════════════════════

export default function StandardsPage() {
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [licenseFilter, setLicenseFilter] = useState('');
  const [selectedRef, setSelectedRef] = useState<StandardRef | null>(null);

  const filteredRefs = useMemo(() => {
    let refs = STANDARD_REFS;

    if (countryFilter) {
      refs = refs.filter((r) =>
        countryFilter === 'INT'
          ? r.country === 'INT' || r.body === 'IEEE'
          : r.country === countryFilter,
      );
    }

    if (licenseFilter) {
      refs = refs.filter((r) => r.licenseType === licenseFilter);
    }

    return refs;
  }, [countryFilter, licenseFilter]);

  return (
    <div className="min-h-screen bg-[var(--bg-secondary)]">
      {/* Header */}
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <h1 className="flex items-center gap-3 text-2xl font-bold text-[var(--text-primary)]">
            <BookOpen size={28} className="text-[var(--color-primary)]" />
            전기 기준/규격 브라우저
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            KEC / NEC / IEC / IEEE Standards Browser
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="조항 검색 (예: 전압강하, breaker, 232)"
              className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--color-primary)]"
            />
          </div>

          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="h-10 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]"
          >
            {COUNTRY_FILTERS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <select
            value={licenseFilter}
            onChange={(e) => setLicenseFilter(e.target.value)}
            className="h-10 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]"
          >
            {LICENSE_FILTERS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>

          <span className="text-xs text-[var(--text-tertiary)]">
            {filteredRefs.length}개 표준
          </span>
        </div>

        {/* Standard Convert Widget */}
        <div className="mb-6">
          <StandardConvertWidget />
        </div>

        {/* Content: tree + detail */}
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <StandardsTree
            refs={filteredRefs}
            searchQuery={search}
            onSelectRef={(ref) => setSelectedRef(ref)}
          />

          {selectedRef ? (
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
              <DetailPanel ref_={selectedRef} onClose={() => setSelectedRef(null)} />
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--bg-primary)] p-12 text-center">
              <div>
                <BookOpen size={48} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
                <p className="text-sm text-[var(--text-tertiary)]">
                  좌측에서 표준을 선택하면 상세 정보가 표시됩니다
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
