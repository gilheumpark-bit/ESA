export interface HoldExplanation {
  title: string;
  detail: string;
}

const HOLD_EXPLANATIONS: Record<string, HoldExplanation> = {
  HOLD_DRAWING_HASH_MISMATCH: {
    title: '원본 도면 불일치',
    detail: '분석 근거와 현재 보고서의 도면 해시가 다릅니다. 같은 원본으로 다시 분석해야 합니다.',
  },
  HOLD_AMBIGUOUS_PROVENANCE: {
    title: '근거 식별 충돌',
    detail: '같은 근거 번호가 여러 도면 요소를 가리킵니다. 해당 구획을 다시 판독해야 합니다.',
  },
  HOLD_UNRESOLVED_CALCULATION: {
    title: '계산 근거 미해소',
    detail: '계산 입력을 현재 도면의 표기와 유일하게 연결하지 못해 계산 결과를 채택하지 않았습니다.',
  },
  HOLD_UNRESOLVED_ISSUE: {
    title: '문제 근거 미해소',
    detail: '검출 문제를 현재 도면의 위치와 유일하게 연결하지 못했습니다.',
  },
  HOLD_UNRESOLVED_CONFLICT: {
    title: '심사 이견 근거 미해소',
    detail: '독립 심사 이견의 도면·논리 근거를 모두 확인할 수 없습니다.',
  },
  HOLD_UNRESOLVED_RECOMMENDATION: {
    title: '제안 근거 미해소',
    detail: '개선 제안을 뒷받침하는 현재 도면 근거가 부족해 제안을 확정하지 않았습니다.',
  },
  HOLD_UNRESOLVED_CLAIM: {
    title: '종합 판단 근거 미해소',
    detail: '종합 판단 문장을 현재 도면의 기기·선로·표기와 유일하게 연결하지 못했습니다.',
  },
  HOLD_UNRESOLVED_TRACEABILITY: {
    title: '근거 연결률 미달',
    detail: '보고서의 판단·문제·계산·제안 중 일부가 현재 도면 근거에 끝까지 연결되지 않았습니다.',
  },
  HOLD_UNRESOLVED_RELATION: {
    title: '연결관계 미확인',
    detail: '기기와 선로의 시작·종료 지점을 하나의 관계로 확정하지 못했습니다.',
  },
  HOLD_INVARIANT: {
    title: '전기 조건 재확인',
    detail: '정격·전압·보호 조건 중 확정할 수 없는 항목이 있습니다.',
  },
  HOLD_LOGIC: {
    title: '전기적 논리 재확인',
    detail: '보호 순서·전원 방향·전압 구간 중 심사 이견이 남아 있습니다.',
  },
  HOLD_HUMAN_REVIEW: {
    title: '현직자 최종 확인 필요',
    detail: 'AI 심사만으로 확정할 수 없는 항목이 있어 담당 기술자의 확인이 필요합니다.',
  },
};

export function explainDrawingHold(code: string): HoldExplanation {
  if (code.startsWith('HOLD_GRAPH_CONFLICT:')) {
    return {
      title: '공간 그래프 충돌',
      detail: `도면 기호·선 교차 해석 충돌: ${code.slice('HOLD_GRAPH_CONFLICT:'.length)}`,
    };
  }
  if (code.startsWith('HOLD_STAGE_')) {
    return {
      title: '분석 단계 미완료',
      detail: `완료되지 않은 분석 단계: ${code.slice('HOLD_STAGE_'.length)}`,
    };
  }
  if (code.startsWith('HOLD_ROLE_')) {
    return {
      title: '독립 심사 역할 미완료',
      detail: `완료되지 않은 심사 역할: ${code.slice('HOLD_ROLE_'.length)}`,
    };
  }
  return HOLD_EXPLANATIONS[code] ?? {
    title: '추가 확인 필요',
    detail: `검증 보류 코드: ${code}`,
  };
}
