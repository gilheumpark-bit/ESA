import { test, expect } from '@playwright/test';
import { syntheticAuth } from './helpers/synthetic-auth';
// Browser plugin not available. Existing Playwright path; synthetic identity/API, no real DB writes.
for (const width of [1440,390]) test(`project pagination preserves navigation and filter scope (${width}px)`,async({page},info)=>{
 await page.setViewportSize({width,height:900}); await syntheticAuth(page);
 const errors: string[]=[];page.on('pageerror',(e)=>errors.push(e.message));
 await page.route('**/api/projects?*',(route)=>{
   const u=new URL(route.request().url()),offset=Number(u.searchParams.get('offset')??0),filter=u.searchParams.get('filter');
   return route.fulfill({json:{projects:[{id:`${filter}-${offset}`,name:`검사 프로젝트 ${filter}-${offset}`,status:'active',memberCount:2,calculationCount:3,userRole:'owner',updatedAt:'2026-09-01T00:00:00Z'}],pagination:{nextOffset:offset===0?50:null}}});
 });
 await page.goto('/projects');await expect(page).toHaveURL(/\/projects$/);await expect(page).toHaveTitle(/ESA|ESVA/i);
 await expect(page.getByRole('heading',{name:'검사 프로젝트 all-0',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'다음 페이지',exact:true}).click();
 await expect(page.getByRole('heading',{name:'검사 프로젝트 all-50',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'다음 페이지',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'내 프로젝트',exact:true}).click();
 await expect(page.getByRole('heading',{name:'검사 프로젝트 owned-0',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'이전 페이지',exact:true})).toBeDisabled();
 expect(errors).toEqual([]);expect(await page.locator('nextjs-portal').count()).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath(`projects-pagination-${width}.png`),fullPage:false});
});
