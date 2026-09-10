from pathlib import Path

def rep(name, old, new, count=1):
 p=Path(name);s=p.read_text();assert s.count(old)==count,(name,s.count(old),old[:100]);p.write_text(s.replace(old,new))

p='e2e/nonbilling-quality.spec.ts'
rep(p,"name: '감사로그', exact: true", "name: '감사 로그', exact: true")
rep(p,"page.getByRole('alert')).toContainText('합성 커뮤니티 장애')", "page.getByRole('main').getByRole('alert')).toContainText('합성 커뮤니티 장애')")
p='e2e/nonbilling-review-forms.spec.ts'
rep(p,"page.getByText(/복수 값·범위·미확정 표기/)).toBeVisible()", "page.getByText(/복수 값·범위·미확정 표기/).first()).toBeVisible()")

# The existing notification component was not reachable from the app header.
# Display it beside the existing controls; no payment logic or role policy is changed.
p='src/components/Header.tsx'
rep(p,"import ThemeToggle from '@/components/ThemeToggle';", "import ThemeToggle from '@/components/ThemeToggle';\nimport NotificationBell from '@/components/NotificationBell';")
rep(p,'            <ThemeToggle />','            <NotificationBell />\n            <ThemeToggle />')

# Preserve contextual status errors expected by every explicit local-AI entrypoint.
# Do not turn an outage into a fallback to another provider or hide cancellation.
for name in ['src/lib/electrical-chat-client.ts','src/lib/vision-byok.ts']:
 p=Path(name);s=p.read_text();a=s.index("const status = await requestFeatureJson('/api/settings/chatgpt-local'")
 b=s.index('if (!status.available)',a)
 block=s[a:b];i=block.rfind('});')
 assert i>=0 and not block[i+3:].strip(),name
 block=block[:i]+"}).catch((error: unknown) => {\n      signal?.throwIfAborted();\n      throw new Error(`계정 상태 확인 실패: ${error instanceof Error ? error.message : '로컬 연결을 확인해 주세요.'}`);\n    });"+block[i+3:]
 p.write_text(s[:a]+block+s[b:])

# Contain wide audit tables in their own scroll region and allow grid/flex
# children to shrink. Do not hide overflow on the document or clip the data.
p=Path('src/app/(with-nav)/admin/page.tsx');s=p.read_text()
s=s.replace('className="mx-auto max-w-5xl px-4 py-8"','className="mx-auto w-full min-w-0 max-w-5xl px-4 py-8"')
s=s.replace('className="space-y-4"','className="min-w-0 space-y-4"')
s=s.replace('className="mb-6 flex gap-1 overflow-x-auto','className="mb-6 flex min-w-0 max-w-full gap-1 overflow-x-auto')
s=s.replace('className="overflow-x-auto rounded-xl','className="w-full min-w-0 max-w-full overflow-x-auto rounded-xl')
s=s.replace('className="relative flex-1"','className="relative min-w-0 flex-1 basis-48"')
s=s.replace('className="flex items-center justify-between text-xs text-[var(--text-tertiary)]"','className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)]"')
s=s.replace('className="flex items-center gap-1"','className="flex flex-wrap items-center gap-1"')
p.write_text(s)

p=Path('docs/project/handoffs/2026-09-10-nonbilling-feature-quality.md')
p.write_text(p.read_text()+'''
## 브라우저 통합에서 확인한 후속 수리

준비 실행 34492070759는 단위 4,632건과 스크립트164/PDF17을 통과한 뒤 브라우저에서 실패했다. 로컬 계정 상태 오류의 문맥 안내가 사라진 경로, 작성된 알림 컴포넌트가 실제 헤더에 연결되지 않은 경로, 모바일 관리자 표/필터 넘침을 수리했다. 오류는 계정 상태 확인 실패로 명시하되 다른 공급자로 자동 전환하지 않는다. 알림의 데이터는 기존 인증된 사용자 범위이며 결제 역할·요금제·가격은 변경하지 않았다.

OCR의 신규 검사 한 조건은 복수 필드에 같은 안내가 표시되는 것을 단일 텍스트로 지정해 실패했다. 실제 첫 안내를 선택하도록 대상만 좁혔고 원본/수정값·미판독 보완·반출 검사를 유지했다. 모바일 관리자 결과는 본문을 가리지 않고 표 자체의 스크롤로 처리한다. 실패한 준비 실행을 최종 성공으로 소급 표시하지 않는다.
''')
print('Connected notification entrypoint; scoped AI errors and contained mobile audit layout; original behavioral gates preserved.')
