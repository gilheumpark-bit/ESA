from pathlib import Path
changed=[]
def replace(name,old,new,n=1):
 p=Path(name);s=p.read_text();assert s.count(old)==n,(name,s.count(old),old[:100]);p.write_text(s.replace(old,new));changed.append(name)
p='src/app/(with-nav)/tools/sld/page.tsx'
replace(p,"import { DrawingReadingSummary } from '@/components/DrawingReadingSummary';", """import { DrawingReadingSummary } from '@/components/DrawingReadingSummary';
import { ReviewedSymbolFeedbackPanel } from '@/components/ReviewedSymbolFeedbackPanel';
import { emptySymbolFeedback, readSymbolFeedback, saveSymbolFeedback, feedbackSymbolLibrary, revokeSupersededFeedback,
  type SymbolFeedbackCatalog } from '@/lib/reviewed-symbol-feedback';""")
replace(p,'  const activeSymbolLibrary = getActiveSymbolLibrary(symbolLibraryCatalog);', '''  const [feedbackCatalog, setFeedbackCatalog] = useState<SymbolFeedbackCatalog>(() => emptySymbolFeedback());
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);
  const registeredSymbolLibrary = getActiveSymbolLibrary(symbolLibraryCatalog);
  const compiledFeedback = useMemo(() => {
    try { return { library: feedbackSymbolLibrary(registeredSymbolLibrary, feedbackCatalog), error: null }; }
    catch (cause) { return { library: registeredSymbolLibrary, error: cause instanceof Error ? cause.message : '승인 사전 적용 실패' }; }
  }, [registeredSymbolLibrary, feedbackCatalog]);
  const activeSymbolLibrary = compiledFeedback.library;
  const commitFeedback = useCallback((next: SymbolFeedbackCatalog) => {
    // Validate compilation BEFORE writing storage. Failure never publishes a partial library.
    feedbackSymbolLibrary(registeredSymbolLibrary, next);
    const stored = saveSymbolFeedback(window.localStorage, next, feedbackCatalog.revision);
    setFeedbackCatalog(stored); setFeedbackNotice(null);
  }, [registeredSymbolLibrary, feedbackCatalog.revision]);''')
replace(p,'      const stored = readSymbolLibraryCatalog();','''      try { setFeedbackCatalog(readSymbolFeedback(window.localStorage)); }
      catch { setFeedbackNotice('저장된 피드백을 읽지 못해 자동 적용하지 않았습니다. 원본을 덮어쓰지 않았습니다.'); }
      const stored = readSymbolLibraryCatalog();''')
replace(p,'    setV3Document(payload.document);','''    setV3Document(payload.document);
    try {
      const next = revokeSupersededFeedback(feedbackCatalog, payload.document, targetDisplayId);
      if (next !== feedbackCatalog) commitFeedback(next);
    } catch {
      // The document correction already succeeded. Do not undo it; stop using old feedback in this session.
      setFeedbackCatalog(emptySymbolFeedback());
      setFeedbackNotice('정정은 반영됐지만 이전 재사용 사례의 철회 저장이 실패해 피드백 자동 적용을 중지했습니다.');
    }''')
replace(p,'  }, [v3Document, v3JobId]);','  }, [v3Document, v3JobId, feedbackCatalog, commitFeedback]);')
replace(p,'const analyzed = await handlePrimaryDocumentUpload(drawingFile, savedLibrary);','const analyzed = await handlePrimaryDocumentUpload(drawingFile, feedbackSymbolLibrary(savedLibrary, feedbackCatalog));')
replace(p,'  }, [drawingFile, handlePrimaryDocumentUpload]);','  }, [drawingFile, handlePrimaryDocumentUpload, feedbackCatalog]);')
replace(p,'            activeLibrary={activeSymbolLibrary}','            activeLibrary={registeredSymbolLibrary}')
replace(p,'      {/* Upload area — 탭별 분기 */}', '''      <ReviewedSymbolFeedbackPanel document={v3Document} catalog={feedbackCatalog}
        baseOrganization={registeredSymbolLibrary?.organization} onCommit={commitFeedback} onSelect={handleV3Select} />
      {(feedbackNotice || compiledFeedback.error) && <p role="alert" aria-label="피드백 적용 안내" className="mb-3 text-xs text-red-700">{feedbackNotice ?? compiledFeedback.error}</p>}

      {/* Upload area — 탭별 분기 */}''')
replace(p,'          <QuickDrawingResultTabs', '''          <p className="text-xs text-[var(--text-secondary)]">승인 정정 사례 적용: {analysis.components.filter((item) => item.appliedFeedbackIds?.length).length}건. 회사 사전 분류이며 독립 AI 정답률이 아닙니다.</p>
          <QuickDrawingResultTabs''')
p='src/components/DrawingDocumentV3Report.tsx'
replace(p,'function RatedValuesPanel({ document, onSelect }: ReportPanelProps) {\n  return (','''function RatedValuesPanel({ document, onSelect }: ReportPanelProps) {
  const labels = { confirmed: '확정', ambiguous: '검토 필요', unread: '미판독' };
  const byId = new Map(document.evidenceGraph.symbols.map((item) => [item.id, item.displayId]));
  return (''')
replace(p,'            <span className="block text-xs text-[var(--text-tertiary)]">{item.field} · {item.certainty}</span>','''            <span className="block text-xs text-[var(--text-tertiary)]">{item.field} · {item.certainty}</span>
            {item.assignment && <span className="block text-xs text-[var(--text-secondary)]">
              값 판독: {labels[item.readingCertainty ?? item.certainty]} · 기기 귀속: {labels[item.assignment.certainty]}
              {' · '}{item.assignment.candidateSymbolIds.map((id) => byId.get(id) ?? id).join(' / ') || '근처 귀속 기기 없음'}
            </span>}''')
# The raw RatedValue export also keeps all new reading/assignment fields; detailed
# UI distinguishes them without falsely declaring a semantic role (primary/secondary).
with open('/tmp/feedback-changed-paths.txt','a') as f:f.write('\n'.join(sorted(set(changed)))+'\n')
print('FEEDBACK_UI_WIRING_READY',len(set(changed)))
