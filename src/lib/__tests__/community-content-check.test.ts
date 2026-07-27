import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkContent, checkAnswerQuality } from '@/lib/abuse-prevention';

/**
 * 커뮤니티 글 안전 검사를 **이 커뮤니티가 실제로 받을 글**로 친다.
 *
 * 여기는 전기 표준 Q&A 다. `checkAnswerQuality` 가 "근거 조항을 명시해
 * 주세요" 라고 권하는데, 그 조항 이름은 전부 대문자 약어다 —
 * KEC · IEC · IEEE · NEC · ANSI · MOF · ACB · VCB. `checkContent` 의
 * 대문자 비율 검사는 한글 본문에서 라틴 문자만 뽑아 비율을 재므로,
 * **표준을 인용할수록 비율이 1.0 에 가까워진다.**
 *
 * 두 함수가 서로 반대를 요구하면 성실한 답변자가 막힌다. 여기서 잡는다.
 */
describe('커뮤니티 글 안전 검사', () => {
  const 정상글 = [
    ['표준 3개 인용',
      '접지 저항 기준은 KEC 142.2 를 보시고, 계통 접지 방식은 IEC 60364-4-41 을 참조하세요. 보호 협조는 IEEE 242 가 정본입니다.'],
    ['표준 5개 인용',
      '허용전류는 KEC 표를 따르되 NEC 310.16 과 IEC 60364-5-52 를 비교해 보세요. 아크플래시는 IEEE 1584, 차단기 정격은 ANSI C37 계열입니다.'],
    ['기기 약어 나열',
      '수전 전압 22.9kV, MOF 이후 ACB 로 받고 있습니다. VCB 는 GIS 반에 들어가 있고 LA 는 인입주에 있습니다. 이 구성이 KEC 에 맞나요?'],
    ['정렬된 표 붙여넣기',
      ['회로      전선        차단기', 'R1        16sq        50AT',
        'R2        25sq        75AT', 'R3        35sq       100AT'].join('\n')],
    ['평범한 한글 답변',
      '수전 설비 용량 산정은 부하율과 수용률을 함께 봐야 합니다. 단순 합산은 과대 설계가 됩니다.'],
    // 실측 차단 사례. 라틴 58 자·대문자 비율 0.98 — 낱자 비율로 재던 시절
    // "Excessive use of capital letters" 로 막혔다. 짧은 예문은 20 자 문턱에
    // 못 미쳐 통과해서 이 결함이 가려져 있었다.
    ['긴 실무 답변(약어 다수)',
      '22.9kV 수전반 구성은 LBS - PF - MOF - VCB - TR 순서입니다. LA 는 LBS 전단, ZCT 와 GPT 는 TR 2차에 답니다. 보호는 OCR OCGR 조합이고 KEC IEC IEEE ANSI NEC 를 모두 확인하세요. GIS 반이면 GCB 로 갑니다.'],
  ] as const;

  it.each(정상글)('%s 은 통과한다', (_이름, text) => {
    expect(checkContent(text)).toEqual({ safe: true });
  });

  /**
   * 위 규칙이 실제로 작동한다는 반증 — 막아야 할 것은 막혀야 한다.
   * 이게 없으면 "safe: true 만 반환하도록 고쳤다" 로도 위 테스트가 통과한다.
   */
  it.each([
    ['빈 글', ''],
    ['너무 짧음', '감사합니다'],
    ['반복 문자', 'ㅋ'.repeat(30)],
    // 공백을 빼고 세므로 띄어서 도배해도 걸린다(수리 전에는 빠져나갔다).
    ['띄어쓴 반복 문자', 'ㅋ '.repeat(30)],
    ['스팸 문구 반복', '무료 상담 무료 상담 무료 상담 지금 연락주세요 무료 상담'],
    ['링크 도배', Array.from({ length: 6 }, (_, i) => `https://x${i}.example.com/a`).join(' ') + ' 확인'],
    ['영문 전체 대문자', 'BUY THIS PRODUCT RIGHT NOW AND GET FREE SHIPPING TODAY ONLY'],
    // 수리 중 내가 낸 회귀. 대문자 규칙을 낱자→5자 이상 단어로 바꿨더니
    // 짧은 대문자만 쓰는 고함이 통째로 빠져나갔다(구판은 막던 것). 라틴
    // 비중으로 기준을 다시 잡아 되막았다 — 이 케이스가 그 잠금이다.
    ['짧은 대문자만 쓰는 고함', 'BUY NOW FREE CASH DM ME NOW BUY NOW FREE CASH DM ME NOW'],
  ])('%s 은 막힌다', (_이름, text) => {
    expect(checkContent(text).safe).toBe(false);
  });

  /**
   * 약어를 극단으로 몰아넣은 정상 글. 라틴 비중 0.81 로 스팸(1.00)과
   * 가장 가까운 지점이다 — 여기가 통과해야 기준이 안전 여유를 갖는다.
   */
  it('약어만 잔뜩 나열한 정상 글은 통과한다 — 기준 여유 확인', () => {
    expect(checkContent('MOF ACB VCB GCB OCB LBS ASS COS ZCT GPT PT CT LA SA 전부 확인했습니다.'))
      .toEqual({ safe: true });
  });

  /**
   * 링크 상한이 메시지와 실제가 어긋나면 사용자는 왜 막혔는지 모른다.
   * "최대 3개" 라고 말했으면 3개는 통과해야 한다.
   */
  it('링크 상한 메시지가 실제 동작과 같다 — 3개 통과·4개 차단', () => {
    const link = (n: number) => Array.from({ length: n }, (_, i) => `https://x${i}.example.com/a`).join(' ');
    expect(checkContent(`자료 올립니다 ${link(3)} 확인해 보세요`)).toEqual({ safe: true });
    const over = checkContent(`자료 올립니다 ${link(4)} 확인해 보세요`);
    expect(over.safe).toBe(false);
    expect(over.reason).toContain('3');
  });

  /**
   * PART 2 와 PART 5 의 요구가 충돌하지 않는지 직접 본다.
   * 품질 검사가 "조항을 쓰라" 하고 안전 검사가 그 글을 막으면 모순이다.
   */
  it('품질 검사가 권하는 인용을 안전 검사가 막지 않는다', () => {
    const 인용답변 = 'KEC 232.3.1 과 IEC 60364-5-52 에 따라 간선 굵기를 정하시면 됩니다. IEEE 242 보호 협조도 함께 보세요.';
    expect(checkAnswerQuality(인용답변).hasStandardRef).toBe(true);
    expect(checkContent(인용답변)).toEqual({ safe: true });
  });

  /**
   * 라우트가 "제목 최소 5 자" 라고 검증해 통과시킨 글을 안전 검사가 "최소
   * 10 자" 로 되막으면, 사용자는 한 요청에서 서로 다른 숫자 두 개를 듣는다.
   * 실제로 이 게시판의 자연스러운 제목은 대개 그 사이에 있다.
   */
  it.each(['MOF 용량 산정', '접지 저항 기준', 'ACB 트립 원인'])(
    '제목 "%s" 은 5 자 기준으로 통과한다', (title) => {
      expect(checkContent(title, { minLength: 5 })).toEqual({ safe: true });
      // 기본값(본문 기준 10 자)으로는 막힌다 — 그래서 라우트가 넘겨야 한다.
      expect(checkContent(title).safe).toBe(false);
    },
  );

  it('제목 검사가 라우트의 선언과 같은 숫자를 쓴다', () => {
    const route = readFileSync(
      join(__dirname, '..', '..', 'app', 'api', 'community', 'route.ts'), 'utf8');
    const 선언 = /title\.trim\(\)\.length < (\d+)/.exec(route)?.[1];
    const 전달 = /checkContent\(body\.title,\s*\{\s*minLength:\s*(\d+)/.exec(route)?.[1];
    expect(선언).toBeTruthy();
    expect(전달).toBe(선언);
  });

  it('조항 없는 답변에는 경고가 붙되 막지는 않는다 — soft enforcement', () => {
    const 무인용 = '그건 그냥 굵은 걸로 쓰시면 됩니다. 경험상 문제 없었어요.';
    expect(checkAnswerQuality(무인용).hasStandardRef).toBe(false);
    expect(checkAnswerQuality(무인용).warning).toBeTruthy();
    expect(checkContent(무인용).safe).toBe(true);
  });
});
