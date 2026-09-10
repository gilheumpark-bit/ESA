from pathlib import Path
import subprocess
BASE='dd4be8d5b39030390e23131adf3c442cd225da1c'
changed=[]
def edit(name,fn):
 p=Path(name); assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{name}']),name
 p.write_text(fn(p.read_text()));changed.append(name)
def rep(s,a,b,n=1):
 assert s.count(a)==n,(s.count(a),a[:90]);return s.replace(a,b)
def compare(s):
 s=rep(s,"import { readApiErrorMessage } from '@/lib/error-messages';", "import { prepareDrawingCalculationInputs } from '@/lib/drawing-calculation-inputs';\nimport { requestFeatureJson, requireRecord, FeatureRequestError } from '@/lib/feature-request';")
 s=rep(s,"  const [selectedCalc, setSelectedCalc]", "  const [shareWarning, setShareWarning] = useState<string | null>(null);\n  const [selectedCalc, setSelectedCalc]")
 s=rep(s,'          const parsed = JSON.parse(decodeURIComponent(raw));', "          if (raw.length > 16_384) throw new Error('Shared scenario too long');\n          const parsed = JSON.parse(decodeURIComponent(raw));")
 s=rep(s,'            inputs: parsed as Record<string, string>,', '''            inputs: Object.fromEntries(initialOption.params.filter((param) => Object.hasOwn(parsed, param.name))
              .map((param) => {
                const value: unknown = parsed[param.name];
                if ((typeof value !== 'string' && typeof value !== 'number') || String(value).length > 500) throw new Error('Invalid shared input');
                return [param.name, String(value)];
              })),''')
 s=rep(s,'          // Ignore malformed shared scenarios and show safe defaults.', "          setShareWarning('일부 공유 입력의 형식을 확인하지 못했습니다. 기본 입력과 원본을 확인하세요.');")
 a=s.index('      const parsedInputs: Record<string, unknown>');b=s.index('      setScenarios((prev)',a)
 s=s[:a]+'''      const prepared = prepareDrawingCalculationInputs(calcOption.params, scenario.inputs);
      if (!prepared.ready) throw new Error(`입력 확인 필요: ${[...prepared.missing, ...prepared.invalid].join(', ')}`);
      const data = await requestFeatureJson('/api/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calculatorId: selectedCalc, inputs: prepared.input, countryCode: readStoredCountry() }), signal: controller.signal,
      }, (value) => {
        const envelope = requireRecord(value), body = requireRecord(envelope.data ?? envelope);
        if (!body.result || typeof body.result !== 'object') throw new FeatureRequestError('계산 결과 응답이 올바르지 않습니다.');
        return body as unknown as { result: CalcResult; receipt?: Receipt };
      });
      if (!isCurrent()) return;
''' +s[b:]
 s=rep(s,'  }, [scenarios, selectedCalc, cancelScenario]);', '  }, [scenarios, selectedCalc, cancelScenario, calcOption.params]);')
 s=rep(s,'            const n = parseFloat(v);\n            return [k, isNaN(n) ? v : n];', "            const definition = calcOption.params.find((param) => param.name === k);\n            const n = definition?.type === 'number' && v.trim() ? Number(v) : NaN;\n            return [k, Number.isFinite(n) ? n : v];")
 s=rep(s,'    [scenarios],', '    [scenarios, calcOption.params],')
 s=rep(s,'        {/* Calculator selector + actions */}', '''        {shareWarning && <p role="alert" className="mb-4 rounded-lg border p-3 text-sm">{shareWarning}</p>}
        <p className="mb-4 text-xs text-[var(--text-secondary)]">입력값과 적용 국가를 확인한 뒤 계산하세요. 공유 링크에는 입력값만 포함되며 이전 결과의 검증을 승계하지 않습니다.</p>
        {/* Calculator selector + actions */}''')
 s=s.replace('h-9 ', 'min-h-11 ').replace('h-10 ', 'min-h-11 ').replace('text-[var(--color-error)]','text-[var(--drawing-error-text)]')
 return s
edit('src/app/(with-nav)/compare/page.tsx',compare)

def standards(s):
 s=rep(s,"import { useState, useMemo, useCallback } from 'react';", "import { useState, useMemo, useCallback, useRef, useEffect } from 'react';\nimport { copyTextWithFallback } from '@/lib/clipboard';\nimport { requestFeatureJson, requireRecord, FeatureRequestError } from '@/lib/feature-request';")
 s=rep(s,'  const relatedCalcs = STANDARD_CALC_MAP[ref_.id] ?? [];', "  const relatedCalcs = STANDARD_CALC_MAP[ref_.id] ?? [];\n  const [copyStatus, setCopyStatus] = useState('');")
 s=rep(s,'      {/* KEC articles (conditions tree) */}', '''      <div className="mb-4 rounded-lg border border-[var(--border-default)] p-3 text-sm">
        <p>이 화면의 참조 판본: {ref_.edition ?? '미기록'} · 최신 개정 여부는 공인 원문 확인이 필요합니다.</p>
        <button type="button" className="mt-2 min-h-11 rounded-lg border px-3" onClick={async () => {
          try {
            const reference = `${ref_.standard} ${ref_.clause ?? ''} | ${ref_.title_ko} | 판본: ${ref_.edition ?? '미기록'} | 출처: ${ref_.url ?? '미기록'}`;
            setCopyStatus(await copyTextWithFallback(reference, '기준 참조:') ? '참조 정보를 복사했습니다.' : '복사를 완료하지 못했습니다. 표시된 판본과 출처를 직접 확인하세요.');
          } catch { setCopyStatus('참조 정보 복사에 실패했습니다.'); }
        }}>판본·출처 복사</button>
        {copyStatus && <p role="status" className="mt-2 text-xs">{copyStatus}</p>}
      </div>
      {/* KEC articles (conditions tree) */}''')
 a=s.index('function StandardConvertWidget()');b=s.index('// ═══',a);block=s[a:b]
 block=rep(block,'  const handleConvert = useCallback(async () => {', '''  const active = useRef<AbortController | null>(null);
  const stop = useCallback(() => { active.current?.abort(); active.current = null; setLoading(false); setResult(null); setError(null); }, []);
  useEffect(() => () => { active.current?.abort(); }, []);
  const handleConvert = useCallback(async () => {''')
 block=rep(block,'    if (!fromClause.trim()) return;', "    if (!fromClause.trim() || active.current) return;\n    const controller = new AbortController(); active.current = controller;")
 a1=block.index('    try {\n      const res =');b1=block.index('\n  return (',a1)
 block=block[:a1]+'''    try {
      const data = await requestFeatureJson('/api/standard-convert', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromStandard, fromClause: fromClause.trim(), toStandard }),
      }, (value) => {
        const row = requireRecord(requireRecord(value).data);
        if (row.toStandard !== toStandard || typeof row.toClause !== 'string' || typeof row.confidence !== 'number'
          || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1) throw new FeatureRequestError('기준 대응 응답을 확인하지 못했습니다.');
        return row as unknown as ConversionResult;
      });
      if (!controller.signal.aborted) setResult(data);
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '기준 변환 실패'); }
    finally { if (active.current === controller) { active.current = null; setLoading(false); } }
  }, [fromStandard, fromClause, toStandard]);
''' +block[b1:]
 block=rep(block,'              const next = e.target.value;', '              stop();\n              const next = e.target.value;')
 block=rep(block,'onChange={(e) => setFromClause(e.target.value)}', 'maxLength={120}\n            onChange={(e) => { stop(); setFromClause(e.target.value); }}')
 block=rep(block,'onChange={(e) => setToStandard(e.target.value)}', 'onChange={(e) => { stop(); setToStandard(e.target.value); }}')
 block=rep(block,'<p className="text-xs text-[var(--color-error)]">{error}</p>', '<p role="alert" className="text-sm text-[var(--drawing-error-text)]">{error}</p>')
 block=rep(block,'{Math.round(result.confidence * 100)}% 일치', '대응 후보 지표 {Math.round(result.confidence * 100)}%')
 block=rep(block,'KEC / NEC / IEC / JIS 조항 번호를 상호 변환합니다', '저장된 대응표에서 조항 후보를 조회합니다. 같은 효력·요구사항 또는 최신 판본의 일치를 보증하지 않습니다.')
 s=s[:a]+block+s[b:]
 s=rep(s,"  const [licenseFilter, setLicenseFilter] = useState('');", "  const [licenseFilter, setLicenseFilter] = useState('');\n  const [editionFilter, setEditionFilter] = useState('');")
 s=rep(s,'    return refs;\n  }, [countryFilter, licenseFilter]);', "    if (editionFilter) refs = refs.filter((ref) => (ref.edition ?? '미기록') === editionFilter);\n    return refs;\n  }, [countryFilter, licenseFilter, editionFilter]);")
 s=rep(s,'        {/* Filters */}', '''        <label className="mb-4 flex flex-wrap items-center gap-2 text-sm">저장된 참조 판본
          <select aria-label="저장된 참조 판본" value={editionFilter} onChange={(event) => setEditionFilter(event.target.value)} className="min-h-11 rounded-lg border border-[var(--border-default)] bg-[var(--bg-primary)] px-3">
            <option value="">모든 판본</option>{[...new Set(STANDARD_REFS.map((ref) => ref.edition ?? '미기록'))].sort().map((edition) => <option key={edition} value={edition}>{edition}</option>)}
          </select>
          <button type="button" className="min-h-11 rounded-lg border px-3" onClick={() => { setSearch(''); setCountryFilter(''); setLicenseFilter(''); setEditionFilter(''); }}>기준 필터 초기화</button>
        </label>
        {/* Filters */}''')
 s=s.replace('min-w-[280px]', 'min-w-0 basis-64').replace('h-9 ', 'min-h-11 ').replace('h-10 ', 'min-h-11 ').replace('text-[10px]','text-xs')
 return s
edit('src/app/(with-nav)/standards/page.tsx',standards)
with open('/tmp/nonbilling-edited-paths.txt','a') as f:f.write('\n'.join(changed)+'\n')
print('COMPARISON_AND_STANDARDS_REVIEW_CONNECTED')
