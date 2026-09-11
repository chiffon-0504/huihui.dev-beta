// DIAGNOSTIC ONLY — DO NOT MERGE. No browser method overrides or product changes.
import { writeFile } from 'node:fs/promises';

export function observe() {
  const rows = []; let phase = 'navigation', ratio = null, observed;
  const identify = e => e ? {tag:e.tagName,id:e.id,className:e.className,text:e.textContent?.slice(0,100)} : null;
  const css = e => { const s=getComputedStyle(e); return {node:identify(e),scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollBehavior:s.scrollBehavior,overflowAnchor:s.overflowAnchor,overflowX:s.overflowX,overflowY:s.overflowY,scrollSnapType:s.scrollSnapType,scrollMarginTop:s.scrollMarginTop,scrollMarginBottom:s.scrollMarginBottom,position:s.position}; };
  function sample(event,detail) {
    const target=document.querySelector('#systemStatusIncidents a'), r=target?.getBoundingClientRect();
    const ancestors=[]; for(let e=target;e;e=e.parentElement) ancestors.push(css(e));
    rows.push({t:performance.now(),event,phase,detail,scrollX,scrollY,scrollTop:document.documentElement.scrollTop,viewport:{width:innerWidth,height:innerHeight},documentHeight:document.documentElement.scrollHeight,rect:r?.toJSON(),documentCoordinates:r&&{x:r.x+scrollX,y:r.y+scrollY},activeElement:identify(document.activeElement),focus:target?.matches(':focus'),focusVisible:target?.matches(':focus-visible'),intersectionRatio:ratio,geometricRatio:r&&r.width*r.height?Math.max(0,Math.min(r.right,innerWidth)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,innerHeight)-Math.max(r.top,0))/(r.width*r.height):null,ancestors});
    if(target && target!==observed) {
      observed=target;
      new IntersectionObserver(es=>{ratio=es[0].intersectionRatio;sample('IntersectionObserver');},{threshold:[0,0.01,0.5,1]}).observe(target);
      new ResizeObserver(()=>sample('ResizeObserver')).observe(target);
    }
  }
  window.__scrollDiagnostic={rows,mark(name){phase=name;sample('mark');}};
  for(const name of ['scroll','scrollend','focus','focusin','blur','resize','transitionstart','transitionend','animationstart','animationend']) window.addEventListener(name,e=>sample(name,{target:identify(e.target),property:e.propertyName,animation:e.animationName}),true);
  if(PerformanceObserver.supportedEntryTypes.includes('layout-shift')) new PerformanceObserver(list=>{for(const e of list.getEntries()) sample('layout-shift',{value:e.value,hadRecentInput:e.hadRecentInput,sources:e.sources?.map(s=>({node:identify(s.node),previousRect:s.previousRect.toJSON(),currentRect:s.currentRect.toJSON()}))});}).observe({type:'layout-shift',buffered:true});
  const frame=()=>{sample('frame');requestAnimationFrame(frame);};requestAnimationFrame(frame);
}

export async function mark(page,name) { await page.evaluate(n=>window.__scrollDiagnostic.mark(n),name); }
export async function save(page,testInfo,meta) {
  await mark(page,'capture:finally');
  await writeFile(testInfo.outputPath('timeline.json'),JSON.stringify({meta,...await page.evaluate(()=>window.__scrollDiagnostic)}));
  await writeFile(testInfo.outputPath('dom.html'),await page.content());
  await page.screenshot({path:testInfo.outputPath('final.png')});
}
