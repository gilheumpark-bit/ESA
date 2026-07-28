import { getAmpacity as getKecAmpacity, type InstallationMethod as KecMethod } from '@/data/ampacity-tables/kec-ampacity';
import { getIecAmpacity } from '@/data/ampacity-tables/iec-ampacity';
import type { IecAmpacityResult, IecInstallMethod } from '@/data/ampacity-tables/iec-ampacity';
import { getActiveCountry } from '../country-defaults';
import { CalcValidationError } from '../types';

/**
 * 허용전류를 **어느 규정의 표**에서 뽑을지 한 곳에서 정한다.
 *
 * 한국에서 쓰는 제품인데 케이블 사이징이 IEC 표로만 계산하고 있었다
 * (2026-07-28, 사용자 지적). 같은 계산기가 전압강하 한도는 이미 KEC
 * (`kecVoltageDropLimit`)를 쓰고 있었으니 한 계산기 안에서 어긋나 있었고,
 * 도면 검토(`circuit-review`)는 KEC 표를 쓰는데 계산기만 IEC 였다 —
 * 같은 질문에 두 화면이 다른 표로 답하고 있었다.
 *
 * 실측 대조(전 굵기·PVC/XLPE):
 *   KEC conduit      ↔ IEC A1 : **35/35 완전 일치**
 *   KEC tray         ↔ IEC C  : 10/10 다름 — KEC 가 **9~17% 낮다**
 *   KEC directBuried ↔ IEC D  : 10/10 다름 — KEC 가 **5~16% 낮다**
 *
 * 즉 IEC 로 계산하면 KEC 기준보다 **가는 케이블**이 나온다. 한국 현장에서
 * 그건 규정 미달이다. 그래서 기본(KR)은 KEC 로 뽑는다.
 *
 * 화면 선택지(A1·C·D)는 그대로 둔다 — 입력 계약을 깨지 않는다. 대신 각
 * 코드를 **라벨이 뜻하는 KEC 공사방법**으로 옮긴다.
 */

/** 화면 코드 → KEC 공사방법. 라벨의 뜻으로 맞춘다(코드 글자가 아니라). */
const KEC_METHOD_BY_UI: Record<string, KecMethod> = {
  A1: 'conduit',       // "A1 — 단열벽 전선관"  · 실측 35/35 일치
  C: 'tray',           // "C — 벽/트레이 직부"
  D: 'directBuried',   // "D — 지중 매설"
};

export interface AmpacityBasisOptions {
  size: number;
  conductor: 'Cu' | 'Al';
  insulation: 'PVC' | 'XLPE';
  /** 화면이 넘기는 IEC 코드 — 계약 유지를 위해 그대로 받는다. */
  installation: IecInstallMethod;
  ambientTemp?: number;
  groupCount?: number;
}

export interface AmpacityBasisResult extends IecAmpacityResult {
  /** 이 값이 어느 규정 표에서 나왔는지 — 영수증·인용에 쓴다. */
  basis: 'KEC' | 'IEC';
  /** 인용 문자열. 화면과 영수증이 같은 것을 쓰도록 여기서 준다. */
  standardRef: string;
}

/**
 * 활성 국가에 맞는 표에서 허용전류를 뽑는다.
 *
 * KR(기본)이면 KEC, 그 밖에는 IEC. KEC 에 그 조합이 없으면 **IEC 로 조용히
 * 넘어가지 않는다** — 던져서 호출부가 그 사실을 알게 한다(무발명).
 */
export function lookupAmpacityByCountry(opts: AmpacityBasisOptions): AmpacityBasisResult {
  const country = getActiveCountry();
  if (country !== 'KR') {
    const r = getIecAmpacity({ ...opts, method: opts.installation });
    return { ...r, basis: 'IEC', standardRef: `IEC 60364-5-52 (방법 ${opts.installation})` };
  }

  const kecMethod = KEC_METHOD_BY_UI[opts.installation];
  if (!kecMethod) {
    // **IEC 로 조용히 넘어가지 않는다.** 처음엔 그렇게 썼다가 기존 검사가
    // 잡았다 — "정본 표가 없는 A2 는 근사계수로 계산하지 않고 거부한다".
    // 그 검사가 옳다. KEC 대응이 없는 공사방법은 한국 기준으로 답할 수
    // 없으므로 거부하는 것이 정직하다(무발명).
    throw new CalcValidationError(
      'installation',
      `공사방법 ${opts.installation} 은 KEC 대응 표가 없어 지원하지 않습니다.`
      + ' A1(단열벽 전선관)·C(벽/트레이 직부)·D(지중 매설) 중에서 고르십시오.',
    );
  }

  const r = getKecAmpacity({
    size: opts.size,
    conductor: opts.conductor,
    insulation: opts.insulation,
    installation: kecMethod,
    ambientTemp: opts.ambientTemp,
    groupCount: opts.groupCount,
  });

  return {
    ...(r as unknown as IecAmpacityResult),
    basis: 'KEC',
    standardRef: `KEC 232.3 허용전류표 (공사방법 ${kecMethod})`,
  };
}

/** 검사·표시용 — 화면 코드가 어느 KEC 방법으로 가는지. */
export const UI_TO_KEC_METHOD: Readonly<Record<string, KecMethod>> = KEC_METHOD_BY_UI;
