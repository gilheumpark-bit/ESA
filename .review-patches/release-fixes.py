from pathlib import Path
p=Path('e2e/nonbilling-quality.spec.ts');s=p.read_text()
assert "name: '감사로그', exact: true" in s
s=s.replace("name: '감사로그', exact: true", "name: '감사 로그', exact: true")
s=s.replace("page.getByRole('alert')).toContainText('합성 커뮤니티 장애')", "page.getByRole('main').getByRole('alert')).toContainText('합성 커뮤니티 장애')")
p.write_text(s)
print('Matched actual audit tab label; framework route announcer is not the app error target.')
