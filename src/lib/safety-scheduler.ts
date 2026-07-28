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
  /**
   * **자정을 넘기면 종료가 시작보다 작다.** 그대로 쓰면 `22:00 → 06:00` 이
   * `1320 → 360` 이 되어 2 시간 주기 루프(`while (t < endMin)`)가 첫 바퀴에
   * 끝나고 **법정 가스 재측정이 통째로 사라진다** — 실행 재현: 야간 1 건 대
   * 주간 5 건(2026-07-28 독립 공격자 좌석). 154kV 수전설비 정전작업은 야간이
   * 표준이다. 중간 점검도 `(endMin - startMin)` 이 음수라 같이 죽는다.
   *
   * 하루를 넘긴 만큼 더한 **절대 분**으로 계산하고, 표시할 때만
   * `minutesToTime` 이 `% 24` 로 되돌린다(이미 그렇게 돼 있다).
   *
   * 시작과 종료가 **같으면** 24 시간으로 읽지 않는다 — `08시~08시` 는 오타일
   * 가능성이 크고, 24 시간으로 늘리면 가스 측정 12 건짜리 일정이 나온다
   * (이 수리를 처음 쓸 때 `<=` 로 두어 실제로 그렇게 됐다). 0 이 안전하다.
   */
  const endMinRaw = timeToMinutes(end);
  const endMin = endMinRaw < startMin ? endMinRaw + 24 * 60 : endMinRaw;

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
      // 적정공기 네 항목을 규정 문면대로. 2026-07-28 정정 — 여기 문구는
      // `engine/safety/confined-space.ts` 와 **같은 수치의 두 번째 사본**이라
      // 그쪽만 고쳤을 때 화면에 옛 값이 남아 있었다(라이브 실측).
      // "이하" 는 규정의 "미만" 보다 느슨해 경계에서 부적합을 적합으로 읽고,
      // 이산화탄소 1.5% 는 아예 빠져 있었다.
      description: '산소 18% 이상 23.5% 미만, 이산화탄소 1.5% 미만,'
        + ' 일산화탄소 30ppm 미만, 황화수소 10ppm 미만 확인.',
      regulation: '산업안전보건기준에 관한 규칙 제618조(적정공기 정의)·제619조',
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
  /**
   * **작업 순서대로** 정렬한다 — 벽시계 순이 아니다.
   *
   * 자정을 넘기면 시각 문자열 순서가 뒤집힌다: `22:00` 시작 항목이
   * `00:00`·`02:00` 보다 뒤로 가서 **종료 확인이 목록 맨 위**에 오고
   * 시작 점검이 맨 아래로 밀린다(2026-07-28 독립 공격자 좌석).
   * 현장에서 위에서부터 읽는 목록이라 순서가 곧 지시다.
   *
   * 시작 시각을 0 으로 두고 경과 분으로 센다.
   */
  const elapsed = (t: string) => (timeToMinutes(t) - startMin + 24 * 60) % (24 * 60);
  checkpoints.sort((a, b) => elapsed(a.time) - elapsed(b.time));

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
      warn1: `소장님, 바쁘고 귀찮더라도 1번은 봐주세요 ㅋㅋ 안 누르면 화면에 응급 경보가 뜹니다.`,
      warn2: `많이 바쁘신가요? 안전을 위해 생존 신고 한 번 눌러주세요! 마지막 기회입니다.`,
      sos: `${intervalMin * 2}분간 응답 없음 — 응급상황으로 판단. 이 화면에 경보를 표시합니다. 외부 신고는 직접 하셔야 합니다.`,
    },
  };
}
