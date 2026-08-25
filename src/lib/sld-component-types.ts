/**
 * 도면 판독 전 경로가 공유하는 기기 종류 정본.
 *
 * 이 파일은 브라우저 저장소·서버 파서 양쪽에서 안전하게 가져갈 수 있도록
 * 네트워크 호출이나 Node 전용 의존성을 두지 않는다.
 */
export const SLD_COMPONENT_TYPES = [
  'transformer',
  'breaker',
  'cable',
  'bus',
  'generator',
  'motor',
  'capacitor',
  'reactor',
  'load',
  'switch',
  'relay',
  'meter',
  'panel',
  'ups',
  'mcc',
  'arrester',
  'ground',
  'lamp',
  'fuse',
  'grid_connection',
  'source',
  'annotation',
] as const;

export type SLDComponentType = (typeof SLD_COMPONENT_TYPES)[number];
