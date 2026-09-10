from pathlib import Path

def rep(name, old, new, count=1):
    p=Path(name); s=p.read_text()
    assert s.count(old)==count, (name,s.count(old),old[:100])
    p.write_text(s.replace(old,new))

rep('src/app/(with-nav)/history/page.tsx',
    '  const entries = resource.data?.entries ?? [];',
    '  const entries = useMemo(() => resource.data?.entries ?? [], [resource.data]);')
rep('src/components/NotificationBell.tsx',
    '  const resource = useFeatureResource(`notifications:${uid}`, load);',
    '  const resource = useFeatureResource(`notifications:${uid}`, load);\n  const reload = resource.reload;')
p=Path('src/components/NotificationBell.tsx');s=p.read_text()
s=s.replace('resource.reload()', 'reload()').replace('[resource.reload]', '[reload]')
p.write_text(s)
print('Strict lint dependency fixes; no suppressed rules or relaxed checks.')
