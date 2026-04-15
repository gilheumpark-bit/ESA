/**
 * ESVA 현장 안전 스케줄러
 *
 * 작업 시간 + 장소 정보 → 법적 의무 점검 주기 자동 생성
 * 순수 함수 — 부작용 없음
 *
 * PART 1: 체크포인트 규칙 정의
 * PART 2: 스케줄 생성 함수
 * PART 3: 데드맨 스위치 주기 계산
 */

import type { SafetyIntentResult, SafetySchedule, CheckpointItem } from '@/engine/safety/types';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — 체크포인트 규칙 정의
// ═══════════════════════════════════════════════════════════════════════════════

/** 밀폐공간 가스 측정 주기 (분) — 산안법 제619조 기반 */
const GAS_MEASUREMENT_INTERVAL_MIN = 120; // 2시간마다

/** 일반 작업 생존 신고 기본 주기 (분) */
const DEFAULT_CHECKIN_INTERVAL_MIN = 60;

/** 밀폐공간 생존 신고 주기 (분) — 더 짧게 */
const CONFINED_CHECKIN_INTERVAL_MIN = 30;

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — 스케줄 생성 함수
// ═══════════════════════════════════════════════════════════════════════════════

/** HH:MM 문자열을 분 단위로 변환 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 분 → HH:MM 문자열 변환 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 현장 조건 기반 안전 스케줄 생성
 */
export function generateSafetySchedule(intent: SafetyIntentResult): SafetySchedule | null {
  if (!intent.hours) return null;

  const { start, end, durationHours } = intent.hours;
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);

  const checkpoints: CheckpointItem[] = [];

  // ── 1. 작업 시작 직전 체크포인트
  checkpoints.push({
    time: start,
    title: '작업 시작 전 안전 점검',
    description: '보호구 착용 확인, 작업 허가서 서명, 비상연락망 공유.',
    regulation: '산안법 제15조',
    isGasMeasurement: false,
    isMandatory: true,
  });

  // ── 2. 밀폐공간 가스 측정 (2시간 주기)
  if (intent.isConfinedSpace) {
    // 최초 진입 전
    checkpoints.push({
      time: start,
      title: '진입 전 산소/유해가스 측정',
      description: '산소 18%~23.5%, H₂S 10ppm 이하, CO 30ppm 이하 확인.',
      regulation: '산안법 제619조',
      isGasMeasurement: true,
      isMandatory: true,
    });

    // 이후 2시간 간격
    let gasMeasureTime = startMin + GAS_MEASUREMENT_INTERVAL_MIN;
    while (gasMeasureTime < endMin) {
      checkpoints.push({
        time: minutesToTime(gasMeasureTime),
        title: '가스 농도 재측정',
        description: '산소/유해가스 2시간 주기 재측정. 이상 시 즉시 대피.',
        regulation: '산안법 제619조',
        isGasMeasurement: true,
        isMandatory: true,
      });
      gasMeasureTime += GAS_MEASUREMENT_INTERVAL_MIN;
    }
  }

  // ── 3. 중간 안전 점검 (우천, 장시간 작업)
  const hasRain = intent.weather.some(w => w.condition === 'rain');
  if (hasRain || durationHours >= 4) {
    const midPoint = startMin + Math.floor((endMin - startMin) / 2);
    const midPointRounded = Math.floor(midPoint / 30) * 30;

    // 가스 측정 체크포인트와 중복 방지
    const existingTimes = checkpoints.map(c => c.time);
    const midTime = minutesToTime(midPointRounded);

    if (!existingTimes.includes(midTime)) {
      checkpoints.push({
        time: midTime,
        title: hasRain ? '우천 임시 배선 절연 중간 점검' : '작업 중간 안전 점검',
        description: hasRain
          ? '빗물 침투 여부, 절연 상태, 누전차단기 작동 확인.'
          : '작업자 건강 상태, 환경 변화, 장비 이상 여부 점검.',
        regulation: hasRain ? 'KEC 232조' : '산안법 제15조',
        isGasMeasurement: false,
        isMandatory: hasRain,
      });
    }
  }

  // ── 4. 작업 종료 체크포인트
  checkpoints.push({
    time: end,
    title: '작업 종료 안전 확인',
    description: '전원 차단 확인, 임시 배선 철거, 장비 점검, 작업자 전원 퇴거 확인.',
    regulation: '산안법 제15조',
    isGasMeasurement: false,
    isMandatory: true,
  });

  // 시간 순 정렬
  checkpoints.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));

  const deadManInterval = intent.isConfinedSpace
    ? CONFINED_CHECKIN_INTERVAL_MIN
    : DEFAULT_CHECKIN_INTERVAL_MIN;

  return {
    workStart: start,
    workEnd: end,
    checkpoints,
    deadManIntervalMinutes: deadManInterval,
    totalCheckpoints: checkpoints.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3 — 데드맨 스위치 주기 계산
// ═══════════════════════════════════════════════════════════════════════════════

export interface DeadManConfig {
  /** 체크인 주기 (밀리초) */
  intervalMs: number;
  /** 1차 경고 지연 (체크인 주기 × 배수) */
  warn1Multiplier: number;
  /** 2차 경고 지연 (체크인 주기 × 배수) */
  warn2Multiplier: number;
  /** SOS 발동 지연 (체크인 주기 × 배수) */
  sosMultiplier: number;
  /** ESA 메시지 */
  messages: {
    remind: string;
    warn1: string;
    warn2: string;
    sos: string;
  };
}

/**
 * 현장 조건 기반 데드맨 스위치 설정 계산
 */
export function calcDeadManConfig(intent: SafetyIntentResult): DeadManConfig {
  const intervalMin = intent.isConfinedSpace
    ? CONFINED_CHECKIN_INTERVAL_MIN
    : DEFAULT_CHECKIN_INTERVAL_MIN;

  const intervalMs = intervalMin * 60 * 1000;

  return {
    intervalMs,
    warn1Multiplier: 1,   // 1주기 = 경고 1
    warn2Multiplier: 1.5, // 1.5주기 = 경고 2
    sosMultiplier: 2,     // 2주기 = SOS
    messages: {
      remind: `⚡ ${intervalMin}분 경과. 생존 신고 한 번 눌러주세요!`,
      warn1: `소장님, 바쁘고 귀찮더라도 1번은 봐주세요 ㅋㅋ 안 누르면 관리자한테 연락 갑니다.`,
      warn2: `많이 바쁘신가요? 안전을 위해 생존 신고 한 번 눌러주세요! 마지막 기회입니다.`,
      sos: `${intervalMin * 2}분간 응답 없음 — 응급상황으로 판단, 관리자에게 자동 신고 들어갑니다.`,
    },
  };
}
