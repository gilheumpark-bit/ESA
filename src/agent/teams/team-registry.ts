/**
 * ESVA Team Registry
 * ------------------
 * 3개 전문팀과 별도 합의 단계 등록·라우팅. Orchestrator가 InputClassification 기반으로
 * 적절한 팀에 업무를 배분한다.
 *
 * PART 1: Input classifier
 * PART 2: Team router
 */

import type { TeamId, InputClassification } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Input Classifier
// ═══════════════════════════════════════════════════════════════════════════════

/** 계통도 vs 평면도 패턴 */
const SLD_KEYWORDS = [
  '계통도', 'single line', 'sld', '단선도', '결선도',
  'one-line', '주접속도', 'main diagram', '수전설비',
  '변전소', 'substation', '수배전반', 'switchgear',
];
const LAYOUT_KEYWORDS = [
  '평면도', 'floor plan', 'layout', '배치도', '배선도',
  'wiring plan', '전등', '콘센트', 'lighting', 'receptacle',
  '전선관', 'conduit', '케이블트레이', 'cable tray',
];

/** 파일 + 메타 기반 입력 분류 */
export function classifyInput(
  mimeType?: string,
  fileName?: string,
  query?: string,
): InputClassification {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  const q = (query ?? '').toLowerCase();
  const hasSldIntent = SLD_KEYWORDS.some(k => q.includes(k));
  const hasLayoutIntent = LAYOUT_KEYWORDS.some(k => q.includes(k));

  // 텍스트만 있으면 규정질의
  if (!mimeType && !fileName) return 'text_query';

  // 한 입력이 계통도와 평면도 범위를 명시적으로 함께 요구할 때만 mixed.
  // 이전에는 지원 파일 형식이 모두 앞 분기에서 반환되어 mixed가 사실상
  // 도달 불가능했다.
  if (query && hasSldIntent && hasLayoutIntent) return 'mixed';

  // DXF 파일
  if (ext === 'dxf' || mimeType === 'application/dxf') {
    if (LAYOUT_KEYWORDS.some(k => q.includes(k))) return 'layout_dxf';
    return 'sld_dxf';
  }

  // PDF 파일
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    if (LAYOUT_KEYWORDS.some(k => q.includes(k))) return 'layout_pdf';
    return 'sld_pdf';
  }

  // 이미지 파일
  if (mimeType?.startsWith('image/')) {
    if (LAYOUT_KEYWORDS.some(k => q.includes(k))) return 'layout_image';
    if (SLD_KEYWORDS.some(k => q.includes(k))) return 'sld_image';
    // 키워드 없으면 기본 SLD (계통도가 더 흔함)
    return 'sld_image';
  }

  // 텍스트 + 파일 혼합
  if (query) return 'mixed';

  return 'text_query';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Team Router
// ═══════════════════════════════════════════════════════════════════════════════

export interface TeamRouting {
  primaryTeam: TeamId;
  supportTeams: TeamId[];
  classification: InputClassification;
  requiresConsensus: boolean;
}

/** 입력 분류 기반 팀 라우팅 결정 */
export function routeToTeams(classification: InputClassification): TeamRouting {
  switch (classification) {
    case 'sld_image':
    case 'sld_dxf':
    case 'sld_pdf':
      return {
        primaryTeam: 'TEAM-SLD',
        supportTeams: ['TEAM-STD'],
        classification,
        requiresConsensus: true,
      };

    case 'layout_image':
    case 'layout_dxf':
    case 'layout_pdf':
      return {
        primaryTeam: 'TEAM-LAYOUT',
        supportTeams: ['TEAM-STD'],
        classification,
        requiresConsensus: true,
      };

    case 'text_query':
      return {
        primaryTeam: 'TEAM-STD',
        supportTeams: [],
        classification,
        requiresConsensus: false,
      };

    case 'mixed':
      return {
        primaryTeam: 'TEAM-STD',
        supportTeams: ['TEAM-SLD', 'TEAM-LAYOUT'],
        classification,
        requiresConsensus: true,
      };

    default:
      return {
        primaryTeam: 'TEAM-STD',
        supportTeams: [],
        classification: 'text_query',
        requiresConsensus: false,
      };
  }
}
