from pathlib import Path

def rep(name, a, b, n=1):
    p=Path(name);s=p.read_text();assert s.count(a)==n,(name,s.count(a),a[:90]);p.write_text(s.replace(a,b))

p=Path('src/lib/__tests__/vision-byok-model.test.ts');s=p.read_text()
start=s.index("  it('선택 모델이 text 전용이면 image 지원 모델로 대체하고 없으면 BYOK로 내려간다'")
head,tail=s[:start],s[start:]
tail=tail.replace('선택 모델이 text 전용이면 image 지원 모델로 대체하고 없으면 BYOK로 내려간다','명시적으로 선택한 로컬 연결에 이미지 모델이 없으면 다른 공급자로 조용히 전환하지 않는다')
a=tail.index('    await expect(getFirstAvailableVisionKey()).resolves.toEqual({')
b=tail.index('    });',a)+len('    });')
tail=tail[:a]+"    await expect(getFirstAvailableVisionKey()).rejects.toThrow('다른 공급자로 자동 전환하지 않았습니다');\n    expect(mockStorage.loadStoredProviderKey).not.toHaveBeenCalled();"+tail[b:]
p.write_text(head+tail)
rep('src/lib/__tests__/nonbilling-ai-retrieval.test.ts',
    '"notice":"verify source"}}}\\n', '"notice":"verify source"}}\\n')
p=Path('src/app/api/__tests__/body-parse-guard.test.ts');s=p.read_text()
for line in ["  'field/complete/route.ts',        // 401\n", "  'field/sos/route.ts',             // 401\n"]:
    assert s.count(line)==1;s=s.replace(line,'')
p.write_text(s)
rep('src/app/api/field/__tests__/safety-persistence.test.ts',
    "    expect(page.match(/Authorization/g)?.length ?? 0).toBeGreaterThanOrEqual(2);",
    "    expect(page).toContain(\"}, decodeFieldSos, featureAuthenticatedFetch)\");\n    expect(page).toContain(\"}, decodeFieldCompletion, featureAuthenticatedFetch)\");\n    const transport = read('src/lib/feature-auth.ts');\n    expect(transport).toContain(\"headers.set('Authorization'\");\n    expect(transport).toContain('await getIdToken()');")
# Existing UI flows keep their actions and failure assertions. Only the newly
# descriptive accessible name adds the target member to the remove action.
p=Path('e2e/frontend-project-controls.spec.ts');s=p.read_text()
s=s.replace("name: action === 'delete' ? '삭제' : '멤버 제거', exact: true", "name: action === 'delete' ? /^삭제$/ : /멤버 제거$/")
s=s.replace("name: '멤버 제거', exact: true", "name: /멤버 제거$/")
p.write_text(s)
print('Aligned explicit-provider policy, tighter body-guard baseline, delegated auth assertions and one malformed synthetic JSON frame.')
