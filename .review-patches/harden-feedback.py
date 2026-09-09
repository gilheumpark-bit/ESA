from pathlib import Path

def replace(name, old, new):
    p = Path(name)
    s = p.read_text()
    assert s.count(old) == 1, (name, s.count(old), old[:90])
    p.write_text(s.replace(old, new))

p = 'src/lib/reviewed-symbol-feedback.ts'
replace(p, "  const withdrawn = new Set(catalog.examples.filter((item) => item.status !== 'approved').map((item) => item.id));\n  const entries = [...(base?.entries ?? []).filter((entry) => !entry.feedbackId || !withdrawn.has(entry.feedbackId)),", """  // A previously exported compiled library cannot retain or import approval
  // authority when its local source example is absent, pending, or withdrawn.
  const activeIds = new Set(approved.map((item) => item.id));
  const entries = [...(base?.entries ?? []).filter((entry) => !entry.feedbackId || activeIds.has(entry.feedbackId)),""")
p = 'src/agent/drawing/rated-quantities.ts'
replace(p, "export function parseRatedQuantities(raw: string): RatedQuantity[] {", """const CANONICAL_UNITS: Record<string, string> = {
  mvar: 'MVAR', kvar: 'kVAR', kva: 'kVA', mva: 'MVA', kvl: 'kVL', kv: 'kV', ka: 'kA',
  kw: 'kW', mw: 'MW', 'mm²': 'mm²', mm2: 'mm2', a: 'A', v: 'V',
};
export function parseRatedQuantities(raw: string): RatedQuantity[] {""")
replace(p, "unit: match[2], offset: match.index", "unit: CANONICAL_UNITS[match[2].toLowerCase()] ?? match[2], offset: match.index")
p = 'src/app/(with-nav)/tools/sld/page.tsx'
replace(p, "import { emptySymbolFeedback, readSymbolFeedback", "import { FEEDBACK_STORAGE_KEY, emptySymbolFeedback, readSymbolFeedback")
replace(p, "  }, [registeredSymbolLibrary, feedbackCatalog.revision]);", """  }, [registeredSymbolLibrary, feedbackCatalog.revision]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== FEEDBACK_STORAGE_KEY && event.key !== null) return;
      try { setFeedbackCatalog(readSymbolFeedback(window.localStorage)); setFeedbackNotice(null); }
      catch {
        setFeedbackCatalog(emptySymbolFeedback());
        setFeedbackNotice('다른 화면의 피드백 변경을 검증하지 못해 이 화면의 자동 적용을 중지했습니다.');
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);""")
p = 'src/lib/__tests__/reviewed-symbol-feedback.test.ts'
replace(p, "  it('a newer source correction withdraws old reuse while retaining correction records', () => {", """  it('an exported compiled library cannot import approval without a locally approved example', () => {
    const catalog = approved();
    const published = feedbackSymbolLibrary(null, catalog)!;
    expect(feedbackSymbolLibrary(published, emptySymbolFeedback())).toBeNull();
    const imported = importSymbolFeedback(JSON.stringify(catalog), emptySymbolFeedback());
    expect(feedbackSymbolLibrary(published, imported)).toBeNull();
  });
  it('a newer source correction withdraws old reuse while retaining correction records', () => {""")
p = 'src/agent/drawing/__tests__/rating-assignment-regression.test.ts'
replace(p, "  it('normalizes voltage units without converting power capacity to voltage', () => {", """  it('normalizes unit case before assigning the quantity field', () => {
    const values = extractRatedValues([ratingText('t', '10ka / 100a / 2KVA')], [ratingSymbol('s')]);
    expect(values.map((item) => [item.field, item.normalized?.unit])).toEqual([
      ['breakingCapacity', 'kA'], ['current', 'A'], ['capacity', 'kVA'],
    ]);
  });
  it('normalizes voltage units without converting power capacity to voltage', () => {""")
print('Known stale approvals and unit-case ambiguity are covered; source identity and review scope remain unchanged.')
