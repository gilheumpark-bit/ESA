from pathlib import Path
import subprocess
BASE='dd4be8d5b39030390e23131adf3c442cd225da1c'
p=Path('src/app/(with-nav)/tools/ocr/page.tsx');assert p.read_bytes()==subprocess.check_output(['git','show',f'{BASE}:{p}'])
s=p.read_text()
def rep(a,b,n=1):
 global s
 assert s.count(a)==n,(s.count(a),a[:90]);s=s.replace(a,b)
rep("import { calculatorHref }", "import { decodeNameplateResponse, nameplateInputIssue, nameplateCalculatorInputs, type NameplateReviewData, type NameplateField } from '@/lib/nameplate-review';\nimport { calculatorHref }")
a=s.index('interface NameplateResult {');b=s.index('const CALC_LABELS:',a)
s=s[:a]+'type NameplateResult = NameplateReviewData;\n\n'+s[b:]
rep('          value={editValue}', '          maxLength={1000}\n          value={editValue}')
rep('        {value}\n      </span>', "        {value || '미기재/미판독'}\n      </span>")
rep('  onParamEdit,\n}: {', '  onParamEdit, original, editedFields,\n}: {')
rep('  onParamEdit: (key: string, value: string) => void;', '  onParamEdit: (key: string, value: string) => void;\n  original: NameplateResult; editedFields: string[];')
rep('''              <ParameterRow
                key={key}
                label={label}
                value={value}
                onEdit={newVal => onParamEdit(key, newVal)}
              />''','''              <div key={key} className="rounded-lg border border-[var(--border-default)] p-3">
                <ParameterRow label={label} value={value} onEdit={newVal => onParamEdit(key, newVal)} />
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{editedFields.includes(key) ? `사람 수정 · 최초 판독: ${original[key as NameplateField] ?? '미판독'}` : 'AI 추출 후보 · 원본 확인 필요'}</p>
                {nameplateInputIssue(key as NameplateField, value) && <p className="mt-1 text-xs text-[var(--text-secondary)]">{nameplateInputIssue(key as NameplateField, value)}</p>}
              </div>''')
rep('      {/* Raw text */}', '''      <details className="rounded-xl border border-[var(--border-default)] p-4">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">미기재·미판독 항목 보완</summary>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">값이 없는 항목은 0이 아닙니다. 원본에서 확인한 경우에만 입력하세요.</p>
        <div className="space-y-3">{Object.entries(PARAM_LABELS).filter(([key]) => !result[key as NameplateField]).map(([key, label]) =>
          <ParameterRow key={key} label={label} value="" onEdit={(value) => onParamEdit(key, value)} />)}</div>
      </details>
      <button type="button" className="min-h-11 rounded-lg border px-4 text-sm" onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1, source: 'nameplate-review', original,
          reviewed: result, editedFields, scope: 'This image only; not model training or a verified golden label.' }, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'esa-nameplate-review.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>원본·수정값 JSON 내보내기</button>
      {/* Raw text */}''')
rep('            이 데이터로 계산하기', '            확인 가능한 값으로 계산기 열기')
rep('          <div className="flex flex-wrap gap-2">\n            {suggestedCalcs.map', '''          <p className="mb-3 text-xs text-[var(--text-secondary)]">복수 전압·범위·kA·kVA 등 의미가 다른 값은 자동 입력에서 제외합니다. 계산기에서 원본·단위·필수 입력을 확인하세요.</p>
          <div className="flex flex-wrap gap-2">
            {suggestedCalcs.map''')
a=s.index('function buildCalcParams(');b=s.index('// ═══',a)
s=s[:a]+'''function buildCalcParams(result: NameplateResult, calcId: string): Record<string, unknown> {
  return nameplateCalculatorInputs(result, calcId);
}

'''+s[b:]
rep('  const [result, setResult] = useState<NameplateResult | null>(null);', '  const [result, setResult] = useState<NameplateResult | null>(null);\n  const [originalResult, setOriginalResult] = useState<NameplateResult | null>(null);\n  const [editedFields, setEditedFields] = useState<string[]>([]);')
rep('    setResult(null);', '    setResult(null); setOriginalResult(null); setEditedFields([]);',2)
rep('      const data: OCRResponse | null = await res.json().catch(() => null);', '      const payload: unknown = await res.json().catch(() => null);')
rep("      if (!res.ok || !data?.success || !data.data) throw new Error(readApiErrorMessage(data, 'OCR 처리에 실패했습니다'));", "      if (!res.ok) throw new Error(readApiErrorMessage(payload, 'OCR 처리에 실패했습니다'));\n      const data = decodeNameplateResponse(payload);")
rep('      setResult(data.data);','      setResult(data.data); setOriginalResult(data.data); setEditedFields([]);')
rep('    setResult(prev => (prev ? { ...prev, [key]: value } : null));', '''    if (!Object.hasOwn(PARAM_LABELS, key)) return;
    const normalized = value.trim().slice(0, 1000);
    setResult(prev => (prev ? { ...prev, [key]: normalized || undefined } : null));
    setEditedFields((previous) => [...new Set([...previous, key])]);''')
rep('            result={result}', '            result={result}\n            original={originalResult ?? result}\n            editedFields={editedFields}')
s=s.replace('className="rounded p-1 ', 'className="min-h-11 min-w-11 rounded p-1 ').replace('className="flex-1 text-sm font-medium','className="min-w-0 flex-1 break-words text-sm font-medium')
p.write_text(s)
with open('/tmp/nonbilling-edited-paths.txt','a') as f:f.write(str(p)+'\n')
print('OCR_REVIEW_PROVENANCE_AND_MISSING_FIELDS_CONNECTED')
