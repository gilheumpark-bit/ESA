from pathlib import Path

def rep(name, old, new, count=1):
 p=Path(name);s=p.read_text();assert s.count(old)==count,(name,s.count(old),old[:100]);p.write_text(s.replace(old,new))

p='e2e/nonbilling-quality.spec.ts'
rep(p,"name: '감사로그', exact: true", "name: '감사 로그', exact: true")
rep(p,"page.getByRole('alert')).toContainText('합성 커뮤니티 장애')", "page.getByRole('main').getByRole('alert')).toContainText('합성 커뮤니티 장애')")
p='e2e/nonbilling-review-forms.spec.ts'
rep(p,"page.getByText(/복수 값·범위·미확정 표기/)).toBeVisible()", "page.getByText(/복수 값·범위·미확정 표기/).first()).toBeVisible()")
rep(p,"page.locator('input[type=\"file\"]').setInputFiles", "page.locator('input[accept=\"image/jpeg,image/png,image/webp\"]').setInputFiles")

p='src/components/Header.tsx'
rep(p,"import ThemeToggle from '@/components/ThemeToggle';", "import ThemeToggle from '@/components/ThemeToggle';\nimport NotificationBell from '@/components/NotificationBell';")
rep(p,'<ThemeToggle />','<NotificationBell />\n          <ThemeToggle />')
rep(p,'mx-auto flex h-14 max-w-7xl items-center gap-3 px-4','mx-auto flex h-14 min-w-0 max-w-7xl items-center gap-1 px-3 sm:gap-3 sm:px-4')

# Distinguish a service-unavailable status from a malformed/unknown response.
# Both retain contextual guidance and never select another provider silently.
for name in ['src/lib/electrical-chat-client.ts','src/lib/vision-byok.ts']:
 p=Path(name);s=p.read_text();a=s.index("const status = await requestFeatureJson('/api/settings/chatgpt-local'")
 b=s.index('if (!status.available)',a)
 block=s[a:b];i=block.rfind('});')
 assert i>=0 and not block[i+3:].strip(),name
 block=block[:i]+"}).catch((error: unknown) => {\n      signal?.throwIfAborted();\n      const unavailable = error instanceof Error && 'status' in error && error.status === 503;\n      throw new Error(`계정 상태 확인 실패: ${unavailable ? '로컬 Codex를 사용할 수 없습니다. ' : ''}${error instanceof Error ? error.message : '로컬 연결을 확인해 주세요.'}`);\n    });"+block[i+3:]
 p.write_text(s[:a]+block+s[b:])

# Do not unmount audit controls while searching, or fall back to stale rows.
p='src/app/(with-nav)/admin/page.tsx'
rep(p,'  entries: initialEntries,','  entries: _initialEntries,')
rep(p,'  const entries = resource.data?.entries ?? initialEntries;','  const entries = resource.data?.entries ?? [];')
rep(p,'  const handleExportCSV = useCallback(async () => {\n    setExporting(true);', '  const handleExportCSV = useCallback(async () => {\n    if (resource.loading || resource.error || !resource.data) return;\n    setExporting(true);')
rep(p,'  }, [filtered]);','  }, [filtered, resource.loading, resource.error, resource.data]);')
rep(p,'  if (resource.loading) return <p role="status" className="p-4 text-sm">감사로그를 조회하고 있습니다.</p>;\n  if (resource.error) return <div className="p-4"><p role="alert">{resource.error}</p><button type="button" onClick={resource.reload} className="mt-3 min-h-11 rounded-lg border px-3">다시 시도</button></div>;\n','')
rep(p,'      {/* Table */}', '''      {resource.loading && <p role="status" className="p-3 text-sm">감사로그를 조회하고 있습니다.</p>}
      {resource.error && <div className="p-3"><p role="alert" className="text-sm text-[var(--drawing-error-text)]">{resource.error}</p><button type="button" onClick={resource.reload} className="mt-2 min-h-11 rounded-lg border px-3">다시 시도</button></div>}
      {/* Table */}''')
rep(p,'{!entries.length && <tr>', '{!resource.loading && !resource.error && !entries.length && <tr>')
rep(p,'disabled={exporting}','disabled={exporting || resource.loading || Boolean(resource.error) || !entries.length}')
rep(p,'disabled={page <= 1}','disabled={page <= 1 || resource.loading || Boolean(resource.error)}')
rep(p,'disabled={page >= totalPages}','disabled={page >= totalPages || resource.loading || Boolean(resource.error)}')
rep(p,'현재 {filtered.length}건 / 전체 {resource.data?.totalCount ?? 0}건','{resource.data ? `현재 ${filtered.length}건 / 전체 ${resource.data.totalCount}건` : \'조회 결과 미확인\'}')
p=Path(p);s=p.read_text()
s=s.replace('className="mx-auto max-w-5xl px-4 py-8"','className="mx-auto w-full min-w-0 max-w-5xl px-4 py-8"')
s=s.replace('className="space-y-4"','className="min-w-0 space-y-4"')
s=s.replace('className="mb-6 flex gap-1 overflow-x-auto','className="mb-6 flex min-w-0 max-w-full gap-1 overflow-x-auto')
s=s.replace('className="overflow-x-auto rounded-xl','className="w-full min-w-0 max-w-full overflow-x-auto rounded-xl')
s=s.replace('className="relative flex-1"','className="relative min-w-0 flex-1 basis-48"')
s=s.replace('className="flex items-center justify-between"','className="flex flex-wrap items-center justify-between gap-3"')
s=s.replace('className="flex items-center gap-1"','className="flex flex-wrap items-center gap-1"')
p.write_text(s)

p='e2e/nonbilling-quality.spec.ts'
rep(p,"    const requested: string[] = [];", "    const requested: string[] = [];\n    const searched: string[] = [];")
rep(p,"      const p = new URL(route.request().url()).searchParams.get('page') ?? '1'; requested.push(p);", "      const params = new URL(route.request().url()).searchParams;\n      const p = params.get('page') ?? '1'; requested.push(p); searched.push(params.get('search') ?? '');")
rep(p,"    await capture(page, `audit-${width}`);", """    const search = page.getByRole('textbox', { name: '감사로그 리소스 검색', exact: true });
    await search.focus(); await search.pressSequentially('abc', { delay: 40 });
    await expect(search).toHaveValue('abc'); await expect(search).toBeFocused();
    await expect.poll(() => searched.includes('abc')).toBe(true);
    await expect(page.getByRole('button', { name: /현재 페이지 CSV 내보내기/ })).toBeEnabled();
    await capture(page, `audit-${width}`);""")

p=Path('docs/project/handoffs/2026-09-10-nonbilling-feature-quality.md')
p.write_text(p.read_text()+'''
## 브라우저 통합에서 확인한 후속 수리

준비 실행 34492070759는 단위 4,632건과 스크립트164/PDF17을 통과한 뒤 브라우저에서 실패했다. 로컬 계정 상태 오류의 문맥 안내가 사라진 경로, 알림 컴포넌트가 실제 헤더에 연결되지 않은 경로, 모바일 관리자 표/필터 넘침을 수리했다. 오류는 계정 상태 확인 실패로 명시하되 다른 공급자로 자동 전환하지 않는다. 알림의 데이터는 기존 인증된 사용자 범위이며 결제 역할·요금제·가격은 변경하지 않았다.

후속 실행 34495428044는 브라우저130통과/3실패였다. 503 로컬 서비스 사용 불가 안내를 단순 응답 형식 실패와 구분했고, 카메라·파일 업로드가 함께 있는 OCR 시험의 선택자를 실제 파일 선택 입력으로 한정했다. 반복 안내 선택자도 첫 실제 안내로 한정하되 원본/수정값·미판독 보완·반출 단언은 유지했다. 실패한 실행을 최종 성공으로 소급하지 않는다.

감사로그 필터는 조회 중에도 유지해 한 글자를 입력한 뒤 초점이 사라지는 문제를 막고, 미완료/실패 조회를 0건으로 표시하거나 CSV로 반출하지 않는다. 브라우저에서 연속 키 입력과 초점 유지를 검사한다. 모바일 표는 내부 스크롤을 사용하고 문서 바깥 넘침을 숨겨 통과시키지 않는다.
''')
print('Local service status, actual OCR picker, stable admin search and all existing negative-path assertions preserved.')
