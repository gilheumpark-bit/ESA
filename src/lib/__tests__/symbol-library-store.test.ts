import {
  SYMBOL_LIBRARY_CATALOG_KEY,
  deleteSymbolLibrary,
  getActiveSymbolLibrary,
  importSymbolLibraryText,
  readSymbolLibraryCatalog,
  saveSymbolLibrary,
  selectSymbolLibrary,
  upsertSymbolMappings,
} from '@/lib/symbol-library-store';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const A_LIBRARY = {
  schemaVersion: 1 as const,
  organization: 'A전기',
  entries: [
    {
      fingerprint: 'fp1:0123456789abcdef',
      blockNames: ['A-CB-01'],
      deviceType: 'breaker' as const,
    },
  ],
};

describe('고객사 심볼 라이브러리 브라우저 저장', () => {
  it('가져온 라이브러리를 활성 상태로 저장하고 새 페이지에서도 복원한다', () => {
    const storage = new MemoryStorage();

    importSymbolLibraryText(JSON.stringify(A_LIBRARY), storage);

    const reloaded = readSymbolLibraryCatalog(storage);
    expect(reloaded.warning).toBeUndefined();
    expect(reloaded.catalog.activeOrganization).toBe('A전기');
    expect(getActiveSymbolLibrary(reloaded.catalog)).toEqual(A_LIBRARY);
  });

  it('여러 회사를 보존하고 사용자가 선택한 회사만 다음 분석의 활성 라이브러리로 둔다', () => {
    const storage = new MemoryStorage();
    saveSymbolLibrary(A_LIBRARY, storage);
    saveSymbolLibrary({
      schemaVersion: 1,
      organization: 'B설계',
      entries: [{ blockNames: ['B-TR'], deviceType: 'transformer' }],
    }, storage);

    const selected = selectSymbolLibrary('A전기', storage);

    expect(selected.catalog.libraries.map((library) => library.organization)).toEqual(['A전기', 'B설계']);
    expect(getActiveSymbolLibrary(selected.catalog)?.organization).toBe('A전기');
  });

  it('미인식 지문을 화면에서 확정하면 신규 등록하고 같은 지문의 재확정은 중복 없이 교정한다', () => {
    const storage = new MemoryStorage();

    upsertSymbolMappings('A전기', [{
      blockName: 'XX-7Q',
      fingerprint: 'fp1:aaaaaaaaaaaaaaaa',
      deviceType: 'breaker',
    }], storage, '2026-08-26T01:00:00.000Z');
    const corrected = upsertSymbolMappings('A전기', [{
      blockName: 'XX-7Q',
      fingerprint: 'fp1:aaaaaaaaaaaaaaaa',
      deviceType: 'switch',
    }], storage, '2026-08-26T02:00:00.000Z');

    const active = getActiveSymbolLibrary(corrected.catalog);
    expect(active?.entries).toHaveLength(1);
    expect(active?.entries[0]).toMatchObject({
      fingerprint: 'fp1:aaaaaaaaaaaaaaaa',
      blockNames: ['XX-7Q'],
      deviceType: 'switch',
      confirmedAt: '2026-08-26T02:00:00.000Z',
    });
  });

  it('기하 지문이 같아도 다른 블록명을 다른 기기로 확정하면 한 항목으로 오염시키지 않는다', () => {
    const storage = new MemoryStorage();
    upsertSymbolMappings('A전기', [{
      blockName: 'RECT-CB',
      fingerprint: 'fp1:cccccccccccccccc',
      deviceType: 'breaker',
    }], storage);

    const stored = upsertSymbolMappings('A전기', [{
      blockName: 'RECT-SW',
      fingerprint: 'fp1:cccccccccccccccc',
      deviceType: 'switch',
    }], storage);

    expect(getActiveSymbolLibrary(stored.catalog)?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ blockNames: ['RECT-CB'], deviceType: 'breaker' }),
      expect.objectContaining({ blockNames: ['RECT-SW'], deviceType: 'switch' }),
    ]));
  });

  it('변조되거나 깨진 저장값은 자동 적용하지 않고 경고와 빈 활성 상태를 반환한다', () => {
    const storage = new MemoryStorage();
    storage.setItem(SYMBOL_LIBRARY_CATALOG_KEY, JSON.stringify({
      schemaVersion: 1,
      activeOrganization: 'A전기',
      libraries: [{
        schemaVersion: 1,
        organization: 'A전기',
        entries: [{ blockNames: ['BAD'], deviceType: 'not-a-device' }],
      }],
    }));

    const result = readSymbolLibraryCatalog(storage);

    expect(result.catalog.libraries).toHaveLength(0);
    expect(result.catalog.activeOrganization).toBeNull();
    expect(result.warning).toContain('적용하지 않았습니다');
  });

  it('저장소를 직접 변조해 회사당 1MB를 넘긴 값도 읽을 때 자동 적용하지 않는다', () => {
    const storage = new MemoryStorage();
    const oversizedLibrary = {
      schemaVersion: 1,
      organization: 'oversized',
      entries: Array.from({ length: 500 }, (_, entryIndex) => ({
        blockNames: Array.from(
          { length: 20 },
          (_, nameIndex) => `${entryIndex}-${nameIndex}-${'가'.repeat(100)}`,
        ),
        deviceType: 'breaker',
      })),
    };
    const serialized = JSON.stringify({
      schemaVersion: 1,
      activeOrganization: 'oversized',
      libraries: [oversizedLibrary],
    });
    expect(new TextEncoder().encode(JSON.stringify(oversizedLibrary)).byteLength).toBeGreaterThan(1024 * 1024);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(4 * 1024 * 1024);
    storage.setItem(SYMBOL_LIBRARY_CATALOG_KEY, serialized);

    const result = readSymbolLibraryCatalog(storage);

    expect(result.catalog.libraries).toEqual([]);
    expect(result.catalog.activeOrganization).toBeNull();
    expect(result.warning).toContain('적용하지 않았습니다');
  });

  it('무효 JSON 가져오기는 기존 정상 라이브러리를 덮어쓰지 않는다', () => {
    const storage = new MemoryStorage();
    saveSymbolLibrary(A_LIBRARY, storage);

    expect(() => importSymbolLibraryText('{broken', storage)).toThrow('JSON');
    expect(getActiveSymbolLibrary(readSymbolLibraryCatalog(storage).catalog)).toEqual(A_LIBRARY);
  });

  it('활성 회사를 삭제하면 남은 라이브러리를 임의 적용하지 않고 선택 없음으로 둔다', () => {
    const storage = new MemoryStorage();
    saveSymbolLibrary(A_LIBRARY, storage);
    saveSymbolLibrary({
      schemaVersion: 1,
      organization: 'B설계',
      entries: [{ blockNames: ['B-TR'], deviceType: 'transformer' }],
    }, storage);

    const deleted = deleteSymbolLibrary('B설계', storage);

    expect(deleted.catalog.libraries).toHaveLength(1);
    expect(deleted.catalog.activeOrganization).toBeNull();
    expect(getActiveSymbolLibrary(deleted.catalog)).toBeNull();
  });
});
