'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calculator, Clock, Eye, Lock, Loader2 } from 'lucide-react';

interface SharedCalculation {
  id: string;
  calculatorName: string;
  calculatorId: string;
  createdAt?: string;
  value?: number;
  unit?: string;
}

interface SharedProject {
  id: string;
  name: string;
  description?: string;
  status: string;
  updatedAt: string;
  calculations: SharedCalculation[];
  readOnly: true;
}

export default function SharedProjectPage() {
  const token = String(useParams().token ?? '');
  const [project, setProject] = useState<SharedProject | null>(null);
  const [password, setPassword] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProject = useCallback(async (submittedPassword?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/shared/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submittedPassword ? { password: submittedPassword } : {}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setPasswordRequired(Boolean(body?.passwordRequired));
        throw new Error(body?.error ?? '공유 프로젝트를 열 수 없습니다.');
      }
      setProject(body.data as SharedProject);
      setPasswordRequired(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '공유 프로젝트를 열 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadProject(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProject]);

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    void loadProject(password);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-blue-600" aria-label="공유 프로젝트 불러오는 중" />
      </div>
    );
  }

  if (!project) {
    return (
      <main className="mx-auto max-w-md px-4 py-20">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
          <Lock className="mx-auto h-9 w-9 text-gray-400" />
          <h1 className="mt-3 text-lg font-semibold text-gray-900">
            {passwordRequired ? '비밀번호가 필요한 프로젝트' : '공유 링크를 열 수 없습니다'}
          </h1>
          {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
          {passwordRequired && (
            <form onSubmit={submitPassword} className="mt-5 space-y-3">
              <label htmlFor="share-password" className="sr-only">공유 비밀번호</label>
              <input
                id="share-password"
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="공유 비밀번호"
              />
              <button className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                프로젝트 열기
              </button>
            </form>
          )}
          <Link href="/" className="mt-5 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
            <ArrowLeft className="h-4 w-4" /> 홈으로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Eye className="mr-2 inline h-4 w-4" /> 읽기 전용 공유 보기입니다. 멤버 정보와 원본 입력값은 공개되지 않습니다.
      </div>
      <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
      {project.description && <p className="mt-2 text-gray-600">{project.description}</p>}
      <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
        <Clock className="h-3.5 w-3.5" /> 최종 수정 {new Date(project.updatedAt).toLocaleString('ko-KR')}
      </p>

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
          <Calculator className="h-5 w-5" /> 공유된 계산 결과 ({project.calculations.length})
        </h2>
        {project.calculations.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            공유된 계산 결과가 없습니다.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {project.calculations.map((calculation) => (
              <li key={calculation.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="font-medium text-gray-900">{calculation.calculatorName}</p>
                {calculation.value !== undefined && (
                  <p className="mt-1 text-xl font-semibold text-blue-700">
                    {calculation.value} {calculation.unit}
                  </p>
                )}
                {calculation.createdAt && (
                  <p className="mt-1 text-xs text-gray-500">{new Date(calculation.createdAt).toLocaleString('ko-KR')}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
