/**
 * ESVA Team Registry
 * ------------------
 * 4-Team 등록 및 라우팅. Orchestrator가 InputClassification 기반으로
 * 적절한 팀에 업무를 배분한다.
 *
 * PART 1: Team configurations
 * PART 2: Input classifier
 * PART 3: Team router
 */

import type {
  TeamId,
  TeamConfig,
  TeamCapability,
  InputClassification,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — Team Configurations
// ═══════════════════════════════════════════════════════════════════════════════

const TEAM_CONFIGS: Record<TeamId, TeamConfig> = {
  'TEAM-SLD': {
    id: 'TEAM-SLD',
    name: 'SLD Analysis Team',
    nameKo: '계통도팀',
    description: '계통도(SLD) 분석: 이미지/DXF/PDF → 토폴로지 → 계산 체인',
    acceptedInputs: ['sld_image', 'sld_dxf', 'sld_pdf'],
    requiredForConsensus: true,
    timeoutMs: 30000,
    retryCount: 1,
  },
  'TEAM-LAYOUT': {
    id: 'TEAM-LAYOUT',
    name: 'Floor Plan Team',
    nameKo: '평면도팀',
    description: '평면도 분석: 배선 경로 추출 → 전선관 계산 → 거리 산출',
    acceptedInputs: ['layout_image', 'layout_dxf', 'layout_pdf'],
    requiredForConsensus: true,
    timeoutMs: 30000,
    retryCount: 1,
  },
  'TEAM-STD': {
    id: 'TEAM-STD',
    name: 'Standards & Regulations Team',
    nameKo: '규정질의팀',
    description: 'KEC/NEC/IEC 조문 검색, 대조, 판정, 단가표 대조',
    acceptedInputs: ['text_query', 'mixed'],
    requiredForConsensus: true,
    timeoutMs: 10000,
    retryCount: 2,
  },
  'TEAM-CONSENSUS': {
    id: 'TEAM-CONSENSUS',
    name: 'Consensus & Output Team',
    nameKo: '합의+출력팀',
    description: '다중팀 결과 병합, 토론/재합의, ESVA Verified 보고서 생성',
    acceptedInputs: ['mixed'],
    requiredForConsensus: false,
    timeoutMs: 15000,
    retryCount: 0,
  },
};

const TEAM_CAPABILITIES: Record<TeamId, TeamCapability> = {
  'TEAM-SLD': {
    teamId: 'TEAM-SLD',
    tools: ['VISION_SPLIT', 'DXF_PARSE', 'PDF_PARSE', 'TOPOLOGY_BUILD', 'CALC_CHAIN'],
    dataScope: ['sld', 'topology', 'symbol-db'],
    canDebate: true,
  },
  'TEAM-LAYOUT': {
    teamId: 'TEAM-LAYOUT',
    tools: ['VISION_SPLIT', 'WIRING_ROUTE', 'CONDUIT_CALC', 'DISTANCE_CALC'],
    dataScope: ['layout', 'conduit-tables', 'wiring-methods'],
    canDebate: true,
  },
  'TEAM-STD': {
    teamId: 'TEAM-STD',
    tools: ['KEC_QUERY', 'NEC_QUERY', 'IEC_QUERY', 'UNIT_PRICE', 'STANDARD_COMPARE'],
    dataScope: ['kec', 'nec', 'iec', 'unit-prices', 'standard-drawings'],
    canDebate: true,
  },
  'TEAM-CONSENSUS': {
    teamId: 'TEAM-CONSENSUS',
    tools: ['DEBATE', 'MERGE', 'REPORT_BUILD', 'MARKING', 'VERIFIED_STAMP'],
    dataScope: ['all'],
    canDebate: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — Input Classifier
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

const SLD_DXF_LAYERS = [
  'POWER', 'HV', 'MV', 'LV', 'BUS', 'TRANSFORMER',
  'BREAKER', 'SWITCHGEAR', 'FEEDER', 'GENERATOR',
];
const LAYOUT_DXF_LAYERS = [
  'LIGHTING', 'RECEPTACLE', 'CONDUIT', 'CABLE_TRAY',
  'FIRE_ALARM', 'WALL', 'ROOM', 'FLOOR',
];

/** 파일 + 메타 기반 입력 분류 */
export function classifyInput(
  mimeType?: string,
  fileName?: string,
  query?: string,
  dxfLayers?: string[],
): InputClassification {
  const ext = fileName?.split('.').pop()?.toLowerCase();
  const q = (query ?? '').toLowerCase();

  // 텍스트만 있으면 규정질의
  if (!mimeType && !fileName) return 'text_query';

  // DXF 파일
  if (ext === 'dxf' || mimeType === 'application/dxf') {
    if (dxfLayers) {
      const sldScore = dxfLayers.filter(l =>
        SLD_DXF_LAYERS.some(s => l.toUpperCase().includes(s))
      ).length;
      const layoutScore = dxfLayers.filter(l =>
        LAYOUT_DXF_LAYERS.some(s => l.toUpperCase().includes(s))
      ).length;
      if (layoutScore > sldScore) return 'layout_dxf';
    }
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
// PART 3 — Team Router
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
        supportTeams: ['TEAM-STD', 'TEAM-CONSENSUS'],
        classification,
        requiresConsensus: true,
      };

    case 'layout_image':
    case 'layout_dxf':
    case 'layout_pdf':
      return {
        primaryTeam: 'TEAM-LAYOUT',
        supportTeams: ['TEAM-STD', 'TEAM-CONSENSUS'],
        classification,
        requiresConsensus: true,
      };

    case 'text_query':
      return {
        primaryTeam: 'TEAM-STD',
        supportTeams: ['TEAM-CONSENSUS'],
        classification,
        requiresConsensus: false,
      };

    case 'mixed':
      return {
        primaryTeam: 'TEAM-STD',
        supportTeams: ['TEAM-SLD', 'TEAM-LAYOUT', 'TEAM-CONSENSUS'],
        classification,
        requiresConsensus: true,
      };

    default:
      return {
        primaryTeam: 'TEAM-STD',
        supportTeams: ['TEAM-CONSENSUS'],
        classification: 'text_query',
        requiresConsensus: false,
      };
  }
}

/** 팀 구성 조회 */
export function getTeamConfig(teamId: TeamId): TeamConfig {
  return TEAM_CONFIGS[teamId];
}

/** 팀 역량 조회 */
export function getTeamCapability(teamId: TeamId): TeamCapability {
  return TEAM_CAPABILITIES[teamId];
}

/** 전체 팀 목록 */
export function getAllTeams(): TeamConfig[] {
  return Object.values(TEAM_CONFIGS);
}

/** 합의 필수 팀 목록 */
export function getConsensusRequiredTeams(): TeamId[] {
  return Object.values(TEAM_CONFIGS)
    .filter(t => t.requiredForConsensus)
    .map(t => t.id);
}
