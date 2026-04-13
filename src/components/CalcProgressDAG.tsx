'use client';

/**
 * CalcProgressDAG — 5-stage 계산 파이프라인 진행 표시
 *
 * EXTRACT → LOOKUP → CALCULATE → VERIFY → REPORT
 * 현재 단계 하이라이트 + 완료 체크 + 경과 시간
 */

import { CheckCircle, Circle, Loader2 } from 'lucide-react';

export type PipelineStage = 'extract' | 'lookup' | 'calculate' | 'verify' | 'report';

interface CalcProgressDAGProps {
  /** 현재 활성 단계 */
  currentStage: PipelineStage | 'idle' | 'done';
  /** 각 단계 경과 시간 (ms) */
  stageTimes?: Partial<Record<PipelineStage, number>>;
}

const STAGES: { id: PipelineStage; label: string; labelEn: string }[] = [
  { id: 'extract', label: '입력 추출', labelEn: 'EXTRACT' },
  { id: 'lookup', label: '기준서 조회', labelEn: 'LOOKUP' },
  { id: 'calculate', label: '계산 실행', labelEn: 'CALCULATE' },
  { id: 'verify', label: '검증', labelEn: 'VERIFY' },
  { id: 'report', label: '리포트', labelEn: 'REPORT' },
];

function getStageStatus(
  stageId: PipelineStage,
  currentStage: CalcProgressDAGProps['currentStage']
): 'done' | 'active' | 'pending' {
  if (currentStage === 'done') return 'done';
  if (currentStage === 'idle') return 'pending';
  const currentIdx = STAGES.findIndex((s) => s.id === currentStage);
  const stageIdx = STAGES.findIndex((s) => s.id === stageId);
  if (stageIdx < currentIdx) return 'done';
  if (stageIdx === currentIdx) return 'active';
  return 'pending';
}

export default function CalcProgressDAG({ currentStage, stageTimes }: CalcProgressDAGProps) {
  if (currentStage === 'idle') return null;

  return (
    <div className="flex items-center gap-1 py-3 px-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
      {STAGES.map((stage, i) => {
        const status = getStageStatus(stage.id, currentStage);
        const time = stageTimes?.[stage.id];

        return (
          <div key={stage.id} className="flex items-center">
            {/* 단계 노드 */}
            <div className="flex flex-col items-center min-w-[72px]">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                ${status === 'done' ? 'bg-green-500 text-white' : ''}
                ${status === 'active' ? 'bg-blue-600 text-white ring-2 ring-blue-300 ring-offset-1' : ''}
                ${status === 'pending' ? 'bg-gray-200 dark:bg-gray-700 text-gray-400' : ''}
              `}>
                {status === 'done' && <CheckCircle className="w-5 h-5" />}
                {status === 'active' && <Loader2 className="w-5 h-5 animate-spin" />}
                {status === 'pending' && <Circle className="w-4 h-4" />}
              </div>
              <span className={`text-[10px] mt-1 font-mono tracking-tight
                ${status === 'active' ? 'text-blue-600 dark:text-blue-400 font-bold' : ''}
                ${status === 'done' ? 'text-green-600 dark:text-green-400' : ''}
                ${status === 'pending' ? 'text-gray-400' : ''}
              `}>
                {stage.labelEn}
              </span>
              {time !== undefined && (
                <span className="text-[9px] text-gray-400">{(time / 1000).toFixed(1)}s</span>
              )}
            </div>

            {/* 연결선 */}
            {i < STAGES.length - 1 && (
              <div className={`w-6 h-[2px] mx-0.5 transition-colors duration-300
                ${status === 'done' ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'}
              `} />
            )}
          </div>
        );
      })}
    </div>
  );
}
