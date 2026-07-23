import { scheduleInitialChatSend } from '@/lib/chat-initial-send';

describe('scheduleInitialChatSend', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('reschedules after the first React Strict Mode effect is cleaned up', () => {
    const sentRef = { current: false };
    const send = jest.fn().mockResolvedValue(undefined);

    const cleanupFirstEffect = scheduleInitialChatSend('VCB', sentRef, send);
    cleanupFirstEffect();
    const cleanupSecondEffect = scheduleInitialChatSend('VCB', sentRef, send);
    jest.runOnlyPendingTimers();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('VCB');
    expect(sentRef.current).toBe(true);
    cleanupSecondEffect();
  });

  test('does not schedule a duplicate after the initial query was sent', () => {
    const sentRef = { current: true };
    const send = jest.fn().mockResolvedValue(undefined);

    scheduleInitialChatSend('VCB', sentRef, send);
    jest.runOnlyPendingTimers();

    expect(send).not.toHaveBeenCalled();
  });
});
