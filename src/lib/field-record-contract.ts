import { requireRecord, unwrapFeatureResponse, FeatureRequestError } from './feature-request';

export function decodeFieldSos(value: unknown): { message: string; eventId: string } {
  const data = requireRecord(unwrapFeatureResponse(value));
  if (data.recorded !== true || typeof data.eventId !== 'string' || !data.eventId) throw new FeatureRequestError('SOS 기록 저장을 확인하지 못했습니다. 비상 연락망으로 직접 연락하세요.');
  const channels = requireRecord(data.channels);
  if (!Number.isSafeInteger(channels.inApp) || Number(channels.inApp) < 0) throw new FeatureRequestError('SOS 알림 전달 상태를 확인하지 못했습니다. 직접 연락하세요.');
  return { eventId: data.eventId, message: `SOS 기록 저장 확인 · 인앱 알림 ${channels.inApp}건. 외부 자동 신고나 구조 요청 완료가 아닙니다. 비상 연락망으로 직접 연락하세요.` };
}
export function decodeFieldCompletion(value: unknown): { hash: string; eventId: string; message: string } {
  const data = requireRecord(unwrapFeatureResponse(value)), receipt = requireRecord(data.receipt);
  if (typeof receipt.hash !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.hash) || typeof receipt.eventId !== 'string' || !receipt.eventId) {
    throw new FeatureRequestError('완료 기록의 저장 영수증을 확인하지 못했습니다. 완료로 표시하지 않았습니다.');
  }
  const notifications = requireRecord(data.notifications);
  if (![notifications.sent, notifications.failed].every((count) => Number.isSafeInteger(count) && Number(count) >= 0)) throw new FeatureRequestError('완료 기록의 알림 상태를 확인하지 못했습니다.');
  return { hash: receipt.hash, eventId: receipt.eventId,
    message: `작업 완료 기록 저장 확인 · 인앱 알림 성공 ${notifications.sent}건 / 실패 ${notifications.failed}건. 실제 현장 종료·관리자 확인은 별도입니다.` };
}
