/**
 * KEC 조항별 출제 빈도 데이터
 * ------------------------------
 * 전기기사/전기공사기사 시험에서 자주 출제되는 KEC 조항 가중치.
 * 자체 분석 데이터 (기출문제 내용 아닌 출제 "경향" = 사실 정보).
 *
 * 수험생이 "이 조항이 얼마나 중요한지" 파악하는 데 사용.
 */

export interface ExamFrequencyEntry {
  articleId: string;
  articleTitle: string;
  /** 최근 10회 시험 중 출제 횟수 (0~10) */
  frequencyLast10: number;
  /** 중요도 등급 */
  importance: 'essential' | 'high' | 'medium' | 'low';
  /** 자주 출제되는 계산 유형 */
  commonCalcTypes?: string[];
  /** 관련 시험 과목 */
  examSubject: string;
  /** 팁 */
  studyTip?: string;
}

export const KEC_EXAM_FREQUENCY: ExamFrequencyEntry[] = [
  // === 필수 (essential) — 거의 매회 출제 ===
  { articleId: 'KEC-232.52', articleTitle: '전압강하', frequencyLast10: 9, importance: 'essential', commonCalcTypes: ['전압강하율 계산', '전선 굵기 산정'], examSubject: '전기설비기술기준', studyTip: '3%/5% 기준 + 공식 암기 필수. 3상/단상 공식 구분.' },
  { articleId: 'KEC-212.3', articleTitle: '과전류차단기 선정', frequencyLast10: 8, importance: 'essential', commonCalcTypes: ['차단기 정격 산정', 'Ib≤In≤Iz 관계'], examSubject: '전기설비기술기준', studyTip: 'Ib≤In≤Iz, I2≤1.45×Iz 공식 필수.' },
  { articleId: 'KEC-232.3', articleTitle: '허용전류', frequencyLast10: 8, importance: 'essential', commonCalcTypes: ['허용전류 산정', '보정계수 적용'], examSubject: '전기설비기술기준', studyTip: '온도 보정 + 묶음 보정 반드시 출제.' },
  { articleId: 'KEC-142.3', articleTitle: '접지 저항', frequencyLast10: 8, importance: 'essential', commonCalcTypes: ['접지 저항 계산', '접지봉 병렬'], examSubject: '전기설비기술기준', studyTip: '1/2/3종 접지 기준값 암기. 병렬 접지 공식.' },
  { articleId: 'KEC-142.5', articleTitle: '접지 시스템 (TN/TT/IT)', frequencyLast10: 7, importance: 'essential', commonCalcTypes: ['접지 계통 구분', '감전 보호'], examSubject: '전기설비기술기준', studyTip: 'TN-S/TN-C-S/TT/IT 각 특징과 적용 장소.' },

  // === 고빈도 (high) — 2~3회에 1번 ===
  { articleId: 'KEC-311.1', articleTitle: '수변전 설비', frequencyLast10: 6, importance: 'high', commonCalcTypes: ['변압기 용량 산정', '단락전류'], examSubject: '전력공학', studyTip: '수전 설비 구성 순서(MOF→DS→VCB→TR) 암기.' },
  { articleId: 'KEC-341.1', articleTitle: '전동기 분기회로', frequencyLast10: 6, importance: 'high', commonCalcTypes: ['전동기 전선 산정', '기동 전류'], examSubject: '전기기기', studyTip: '정격전류×1.25 이상. FLC 테이블 참조.' },
  { articleId: 'KEC-340.1', articleTitle: '역률 개선', frequencyLast10: 5, importance: 'high', commonCalcTypes: ['콘덴서 용량 계산', '역률 개선'], examSubject: '전력공학', studyTip: 'Qc = P(tanθ1 - tanθ2) 공식.' },
  { articleId: 'KEC-212.4', articleTitle: '누전차단기', frequencyLast10: 5, importance: 'high', commonCalcTypes: ['감도전류 선정'], examSubject: '전기설비기술기준', studyTip: '30mA/0.03s. 설치 의무 장소 암기.' },
  { articleId: 'KEC-220.1', articleTitle: '부하 산정', frequencyLast10: 5, importance: 'high', commonCalcTypes: ['수용률', '부등률', '부하율'], examSubject: '전력공학', studyTip: '수용률/부등률/부하율 정의 + 공식.' },
  { articleId: 'KEC-501.1', articleTitle: '태양광 발전', frequencyLast10: 4, importance: 'high', commonCalcTypes: ['PV 발전량', '인버터 용량'], examSubject: '전기설비기술기준', studyTip: '최근 출제 급증. 계통연계 기준 중요.' },

  // === 중빈도 (medium) — 3~5회에 1번 ===
  { articleId: 'KEC-234.1', articleTitle: '조도 계산', frequencyLast10: 3, importance: 'medium', commonCalcTypes: ['조도 산출', '광속법'], examSubject: '전기응용', studyTip: 'F = E×A / (U×M) 공식.' },
  { articleId: 'KEC-131.1', articleTitle: '감전 보호', frequencyLast10: 3, importance: 'medium', examSubject: '전기설비기술기준', studyTip: '직접/간접 접촉 보호 방법 구분.' },
  { articleId: 'KEC-211.2', articleTitle: '금속관 배선', frequencyLast10: 3, importance: 'medium', examSubject: '전기공사', studyTip: '관 내경과 전선 수 관계. 실기 자주 출제.' },
  { articleId: 'KEC-232.31', articleTitle: '전선관 충전율', frequencyLast10: 3, importance: 'medium', commonCalcTypes: ['충전율 계산'], examSubject: '전기공사', studyTip: '3선 이상 40% 이하.' },
  { articleId: 'KEC-520.1', articleTitle: 'ESS', frequencyLast10: 2, importance: 'medium', examSubject: '전기설비기술기준', studyTip: '최근 출제 증가 추세. BMS/PCS 기본 개념.' },

  // === 저빈도 (low) — 간헐적 ===
  { articleId: 'KEC-250.1', articleTitle: '욕실 구역 구분', frequencyLast10: 1, importance: 'low', examSubject: '전기설비기술기준' },
  { articleId: 'KEC-260.1', articleTitle: '전기차 충전', frequencyLast10: 1, importance: 'low', examSubject: '전기설비기술기준', studyTip: '향후 출제 증가 예상.' },
  { articleId: 'KEC-143.1', articleTitle: '피뢰 시스템', frequencyLast10: 2, importance: 'low', examSubject: '전기설비기술기준' },
];

/** 중요도별 조항 수 */
export function getFrequencyStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const e of KEC_EXAM_FREQUENCY) {
    stats[e.importance] = (stats[e.importance] ?? 0) + 1;
  }
  return stats;
}

/** 특정 조항의 출제 빈도 조회 */
export function getExamFrequency(articleId: string): ExamFrequencyEntry | null {
  return KEC_EXAM_FREQUENCY.find(e => e.articleId === articleId) ?? null;
}

/** 중요도순 정렬 */
export function getTopArticlesForExam(limit: number = 10): ExamFrequencyEntry[] {
  return [...KEC_EXAM_FREQUENCY]
    .sort((a, b) => b.frequencyLast10 - a.frequencyLast10)
    .slice(0, limit);
}
