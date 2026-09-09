from pathlib import Path
p=Path('.review-patches/apply-feedback.py');s=p.read_text()
a=s.index("p='src/lib/symbol-library-contract.ts'");b=s.index("p='src/engine/topology/symbol-library.ts'",a)
s=s[:a]+'''p='src/lib/symbol-library-contract.ts'
replace(p,'export interface SymbolLibraryEntry {', "export interface SymbolLibraryEntry {\\n  matchPolicy?: 'fingerprint-and-name';\\n  feedbackId?: string;")
replace(p,'    entries.push({\\n      fingerprint:', """    if (e.matchPolicy !== undefined && e.matchPolicy !== 'fingerprint-and-name') {
      errors.push(`${tag}: matchPolicy 무효`); continue;
    }
    if (e.matchPolicy === 'fingerprint-and-name' && (typeof fingerprint !== 'string'
      || !/^fp2:[a-f0-9]{16}$/.test(fingerprint) || names?.length !== 1)) {
      errors.push(`${tag}: 정정 사례는 현행 지문과 하나의 블록명이 필요합니다`); continue;
    }
    if (e.feedbackId !== undefined && (typeof e.feedbackId !== 'string' || !/^fb-[a-zA-Z0-9-]{1,96}$/.test(e.feedbackId)
      || e.matchPolicy !== 'fingerprint-and-name')) {
      errors.push(`${tag}: feedbackId 무효`); continue;
    }
    entries.push({
      ...(e.matchPolicy === 'fingerprint-and-name' ? { matchPolicy: e.matchPolicy } : {}),
      ...(typeof e.feedbackId === 'string' ? { feedbackId: e.feedbackId } : {}),
      fingerprint:""")
''' + s[b:]
a=s.index("p='src/engine/topology/dxf-parser.ts'");b=s.index("replace('src/agent/teams/types.ts'",a)
s=s[:a]+'''p='src/engine/topology/dxf-parser.ts'
replace(p,'fingerprintBlock, indexSymbolLibrary, matchSymbol,', 'fingerprintBlock, indexSymbolLibrary, matchSymbolEvidence, hasSymbolLibraryConflict,')
replace(p,'const libraryType = libraryIndex ? matchSymbol(libraryIndex, blockName, fingerprint) : null;', 'const libraryMatch = libraryIndex ? matchSymbolEvidence(libraryIndex, blockName, fingerprint) : null;\\n        const libraryType = libraryMatch?.type ?? null;')
replace(p,'const heuristicType = libraryType ? null : resolveBlockTypeOrNull(blockName);', 'const libraryConflict = libraryIndex ? hasSymbolLibraryConflict(libraryIndex, blockName, fingerprint) : false;\\n        const heuristicType = libraryType || libraryConflict ? null : resolveBlockTypeOrNull(blockName);')
replace(p,'            blockName,\\n          },', """            blockName,
            ...(libraryConflict ? { reviewedFeedbackConflict: 'true' } : {}),
          },
          ...(fingerprint?.startsWith('fp2:') ? { sourcePattern: { kind: 'dxf-block-v2' as const, fingerprint, blockName } } : {}),
          ...(libraryMatch?.feedbackIds.length ? { appliedFeedbackIds: libraryMatch.feedbackIds } : {}),""")
''' + s[b:]
a=s.index("transform('src/agent/teams/sld-team.ts'");b=s.index("transform('src/agent/drawing/team-result-adapter.ts'",a)
s=s[:a]+'''replace('src/agent/teams/sld-team.ts','      position: c.position,\\n      confidence: 0.9,','      position: c.position,\\n      sourcePattern: c.sourcePattern,\\n      appliedFeedbackIds: c.appliedFeedbackIds,\\n      confidence: 0.9,')
''' + s[b:]
a=s.index("transform(p,lambda s:s.replace('      dup.evidence.push(...incoming);'");b=s.index("p='src/lib/quick-drawing-readout.ts'",a)
s=s[:a]+'''replace(p,'      existing.typeCandidates = unionCandidates;', """      existing.typeCandidates = unionCandidates;
      if (hit.sourcePatterns?.length) existing.sourcePatterns = [...new Map([...(existing.sourcePatterns ?? []), ...hit.sourcePatterns]
        .map((pattern) => [`${pattern.fingerprint}:${pattern.blockName}`, { ...pattern }])).values()];
      if (hit.appliedFeedbackIds?.length) existing.appliedFeedbackIds = [...new Set([...(existing.appliedFeedbackIds ?? []), ...hit.appliedFeedbackIds])];""")
replace(p,'      typeCandidates: [...hitCandidates],', """      typeCandidates: [...hitCandidates],
      ...(hit.sourcePatterns?.length ? { sourcePatterns: hit.sourcePatterns.map((pattern) => ({ ...pattern })) } : {}),
      ...(hit.appliedFeedbackIds?.length ? { appliedFeedbackIds: [...hit.appliedFeedbackIds] } : {}),""")
''' + s[b:]
a=s.index("p='src/lib/quick-drawing-readout.ts'");b=s.index("Path('/tmp/feedback-changed-paths.txt')",a)
s=s[:a]+'''p='src/lib/quick-drawing-readout.ts'
replace(p,"| 'MULTIPLE_TYPE_CANDIDATES';", "| 'MULTIPLE_TYPE_CANDIDATES' | 'FEEDBACK_CONFLICT';")
replace(p,"  TYPE_UNKNOWN: '현재 근거로 기기 종류를 분류하지 못했습니다',", "  TYPE_UNKNOWN: '현재 근거로 기기 종류를 분류하지 못했습니다',\\n  FEEDBACK_CONFLICT: '회사 사전·승인 정정 사례가 충돌해 자동 분류하지 않았습니다',")
replace(p,'  if (isUnknown(component)) {', "  if (component.properties?.reviewedFeedbackConflict === 'true') return { certainty: 'unread', reason: 'FEEDBACK_CONFLICT' };\\n  if (isUnknown(component)) {")
''' + s[b:]
p.write_text(s)
print('Guarded patch aligned to pinned d73a19b5 interfaces.')
