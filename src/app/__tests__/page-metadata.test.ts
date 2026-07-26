/**
 * 페이지마다 제 제목이 있는가.
 *
 * 27쪽 중 18쪽이 사이트 기본값("ESVA - The Engineer's Search Engine" + 같은
 * 설명 한 줄)을 그대로 달고 있었다(실측 2026-07-26, SSR HTML <title> 대조).
 * 계산기 상세는 57쪽이 전부 같은 제목이었다 — 탭을 여러 개 열면 어느 것이
 * 전압강하고 어느 것이 조도인지 구분되지 않고, 즐겨찾기·방문 기록·검색 결과도
 * 같은 줄로 남는다.
 *
 * 페이지 대부분이 'use client' 라 page.tsx 에서 metadata 를 못 내보낸다.
 * 그래서 같은 폴더의 layout.tsx 가 제목을 대는 구조다 — 새 페이지를 만들 때
 * 그 파일을 빠뜨리기 쉬워서 여기서 잠근다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP = join(process.cwd(), 'src/app');

function findPages(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'api' || entry === '__tests__') continue;
      findPages(full, found);
    } else if (entry === 'page.tsx') {
      found.push(dir);
    }
  }
  return found;
}

/**
 * 홈은 예외다 — 루트 layout 의 "ESVA - The Engineer's Search Engine" 이
 * 곧 홈의 제목이다. 여기에 같은 문구를 한 번 더 두면 사본이 하나 늘 뿐이다.
 */
const ROOT_TITLE_OK = new Set([join(APP, '(with-nav)')]);

const pageDirs = findPages(APP).filter((d) => !ROOT_TITLE_OK.has(d));

/** 그 폴더(또는 page.tsx 자체)가 제목을 대는가. 루트 layout 의 기본값은 세지 않는다. */
function declaresTitle(dir: string): boolean {
  for (const file of ['layout.tsx', 'page.tsx']) {
    let source: string;
    try {
      source = readFileSync(join(dir, file), 'utf-8');
    } catch {
      continue;
    }
    if (/export const metadata|export async function generateMetadata|export function generateMetadata/.test(source)) {
      return true;
    }
  }
  return false;
}

describe('페이지 제목', () => {
  it('페이지를 찾긴 했다', () => {
    expect(pageDirs.length).toBeGreaterThan(20);
  });

  it.each(pageDirs.map((d) => [d.replace(APP, '').replace(/\\/g, '/') || '/', d]))(
    '%s — 제 제목을 선언한다',
    (_label, dir) => {
      expect(declaresTitle(dir)).toBe(true);
    },
  );

  it('브랜드 표기가 하나다 — ESVA · 구분자', () => {
    const wrong: string[] = [];
    for (const dir of pageDirs) {
      for (const file of ['layout.tsx', 'page.tsx']) {
        let source: string;
        try {
          source = readFileSync(join(dir, file), 'utf-8');
        } catch {
          continue;
        }
        // metadata 블록의 title 만 본다 — 본문 섹션 제목은 대상이 아니다.
        const meta = source.match(/export const metadata[\s\S]{0,400}?\n\};/)?.[0] ?? '';
        const title = meta.match(/title:\s*'([^']+)'/)?.[1];
        if (!title) continue;
        if (/\|\s*ESA\b/.test(title) || /ESA\b(?!VA)/.test(title.replace('ESVA', ''))) {
          wrong.push(`${dir.replace(APP, '')}/${file}: ${title}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
