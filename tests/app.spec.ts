import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRecord, makeArchive, withAnalysis, confirmRecord } from '../src/domain';
const appPath = process.env.APP_BASE_PATH || '/';
async function write(page: Page, text: string, gap = false) {
  if (gap) await page.getByRole('button',{name:'新增未知记录',exact:true}).click();
  else await page.getByRole('button',{name:/象限四/}).click();
  await page.getByRole('textbox').fill(text);
  await page.getByRole('button',{name:'保存到本机',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
test('移动端：离线保存、刷新、只读、跳过、导出、恢复和清空', async ({page,context}) => {
  const errors: string[] = []; page.on('pageerror',e => errors.push(e.message));
  await page.goto(appPath); await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await expect(page.getByRole('button',{name:/象限四/})).toBeEnabled();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await write(page,'我喜欢提前看会议议程');
  await write(page,'我还不会炒鸡蛋',true);
  await page.getByRole('button',{name:/全部记录 2/}).click();
  await page.getByRole('button',{name:'跳过',exact:true}).click();
  await expect(page.getByText('最近有没有一件你还不明白、想继续探索的事？')).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('button',{name:/象限四/})).toBeEnabled();
  await write(page,'这是一条离线记录');
  await page.reload();
  await page.getByRole('button',{name:/全部记录 3/}).click();
  await expect(page.getByText('这是一条离线记录',{exact:true})).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'等待接入模型'}).first()).toBeDisabled();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:/象限二/}).click();
  await expect(page.getByText('我还不会炒鸡蛋',{exact:true})).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'数据与隐私',exact:true}).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button',{name:/导出 JSON/}).click();
  const download = await downloadEvent; const file = await download.path(); expect(file).toBeTruthy();
  page.once('dialog',d => d.accept());
  await page.getByRole('button',{name:'清空本机全部资料'}).click();
  await expect(page.getByRole('button',{name:'导出 JSON · 0 条'})).toBeVisible();
  page.once('dialog',d => d.accept());
  await page.locator('input[type=file]').setInputFiles(file!);
  await expect(page.getByRole('button',{name:'导出 JSON · 3 条'})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click(); await page.reload();
  await page.getByRole('button',{name:/全部记录 3/}).click();
  await expect(page.getByText('最近有没有一件你还不明白、想继续探索的事？')).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({path:'docs/mobile-preview.png',fullPage:true});
  await context.setOffline(false);
});
test('失败保留输入；坏归档不覆盖；象限一确认与退回', async ({page}) => {
  await page.goto(appPath); await expect(page.getByRole('button',{name:/象限四/})).toBeEnabled();
  // Force a real transaction-open failure, then verify input remains visible.
  await page.evaluate(() => { IDBDatabase.prototype.transaction = () => { throw new Error('模拟存储不可用'); }; });
  await page.getByRole('button',{name:/象限四/}).click(); await page.getByRole('textbox').fill('不能丢掉的草稿');
  await page.getByRole('button',{name:'保存到本机'}).click();
  await expect(page.getByRole('alert')).toContainText('模拟存储不可用');
  await expect(page.getByRole('textbox')).toHaveValue('不能丢掉的草稿');
  page.once('dialog',d => d.accept()); await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.reload(); await expect(page.getByRole('button',{name:/象限四/})).toBeEnabled();
  await write(page,'原始文字');
  await page.getByRole('button',{name:'数据与隐私',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schemaVersion":99}')});
  await expect(page.getByRole('alert')).toContainText('不支持');
  await expect(page.getByRole('button',{name:'导出 JSON · 1 条'})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  // Seed model evidence only in the test, never expose a fake model in production.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve,reject) => {const r=indexedDB.open('cognitive-quadrants-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise<void>((resolve,reject) => {const tx=db.transaction('records','readwrite');const store=tx.objectStore('records');const r=store.getAll();r.onsuccess=()=>{const record=r.result[0];store.put({...record,status:'understood',quadrant:'upper_right',revision:crypto.randomUUID(),analysis:{summary:'仅测试用理解',provider:'test',model:'fake',generatedAt:new Date().toISOString()}});};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
  });
  await page.reload(); await page.getByRole('button',{name:/象限一/}).click();
  await expect(page.getByText('仅测试用理解',{exact:true})).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button',{name:'确认这次理解'}).click(); await expect(page.getByText('已确认',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'撤回确认'}).click(); await expect(page.getByText('共同认知，慢慢形成')).toBeVisible();
});
test('坐标轴越过卡片边缘，放大及短屏时标注与状态不被覆盖', async ({page}) => {
  await page.goto(`${appPath}?category=feeling`);
  await expect(page.getByRole('heading',{level:1})).toHaveText('知不知');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  for (const [selector,label] of [['.shared','象限一'],['.gaps','象限二'],['.unknown','象限三'],['.inbox','象限四']]) {
    const number = page.locator(`${selector} .quad-number strong`);
    await expect(number).toHaveText(label); await expect(number).toHaveCSS('font-weight','700');
  }
  for (const [width,height,zoom] of [[360,640,1],[390,844,1],[1280,844,1],[1280,600,1],[1280,844,1.5],[1280,844,2]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(scale => {document.documentElement.style.zoom=String(scale);},zoom);
    const geometry = await page.evaluate(() => {
      const rect = (element: Element) => {const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
      const cards = [...document.querySelectorAll('.quadrant')].map(rect);
      const labels = [...document.querySelectorAll('.vertical-label,.horizontal-labels span,.below-map')].map(rect);
      const v=rect(document.querySelector('.vertical-axis')!); const h=rect(document.querySelector('.horizontal-axis')!);
      const overlaps = cards.some(c=>labels.some(l=>c.left<l.right-.5 && c.right>l.left+.5 && c.top<l.bottom-.5 && c.bottom>l.top+.5));
      const contentOverflow = [...document.querySelectorAll('.quadrant')].some(card=>{const c=card.getBoundingClientRect();return [...card.querySelectorAll('h2,p,.quad-number,.quad-foot,.quad-action')].some(child=>child.getBoundingClientRect().bottom>c.bottom+1);});
      return {overlaps,contentOverflow,v,h,minX:Math.min(...cards.map(r=>r.left)),maxX:Math.max(...cards.map(r=>r.right)),minY:Math.min(...cards.map(r=>r.top)),maxY:Math.max(...cards.map(r=>r.bottom)),topBottom:cards[0].bottom,bottomTop:cards[2].top,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    expect(geometry.overlaps,`${width}x${height} @${zoom} 标注遮挡`).toBe(false);
    expect(geometry.contentOverflow,'卡片内容溢出').toBe(false);
    expect(geometry.overflow).toBe(false);
    expect(geometry.v.height).toBeGreaterThan(geometry.h.width);
    expect(geometry.v.top).toBeLessThan(geometry.minY-10);
    expect(geometry.v.bottom).toBeGreaterThan(geometry.maxY+10);
    expect(geometry.h.left).toBeLessThan(geometry.minX-5);
    expect(geometry.h.right).toBeGreaterThan(geometry.maxX+5);
    expect(geometry.h.top).toBeGreaterThan(geometry.topBottom);
    expect(geometry.h.bottom).toBeLessThan(geometry.bottomTop);
  }
  await page.evaluate(()=>{document.documentElement.style.zoom='1';});
  await page.setViewportSize({width:1280,height:844});
  await page.reload(); await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await page.screenshot({path:'docs/desktop-preview.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.reload(); await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await page.screenshot({path:'docs/mobile-preview.png',fullPage:true});
});

for (const version of [1,2,3,4]) test(`v${version} 旧记录合并、离线保存及导出恢复`, async ({page,context}) => {
  await page.goto(appPath); await expect(page.getByRole('button',{name:/象限四/})).toBeEnabled();
  const stamp=new Date().toISOString();
  const records=['knowledge','feeling','unclassified'].map((category,i)=>({id:`legacy-${i}`,revision:`legacy-rev-${i}`,text:`旧${category}记录`,kind:'personal',status:'pending',createdAt:stamp,updatedAt:stamp,...(version===2?{category}:{}),...(version===4?{quadrant:'lower_right',placement:{declaredQuadrant:'lower_right',source:'user',entryPoint:'lower_right'}}:{})}));
  const legacy={schemaVersion:version,exportedAt:stamp,records,skippedQuestionIds:[]};
  await page.getByRole('button',{name:'数据与隐私',exact:true}).click();
  page.once('dialog',d=>d.accept());
  await page.locator('input[type=file]').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await expect(page.getByRole('button',{name:'导出 JSON · 3 条'})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.getByRole('button',{name:/待分类/})).toHaveCount(0);
  await page.getByRole('button',{name:/全部记录 3/}).click();
  for (const record of records) await expect(page.getByText(record.text,{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/归入/})).toHaveCount(0);
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;}); await context.setOffline(true);
  await page.reload(); await write(page,'无需分类的新记录');
  await page.getByRole('button',{name:'数据与隐私',exact:true}).click();
  const downloading=page.waitForEvent('download'); await page.getByRole('button',{name:/导出 JSON/}).click(); const file=await(await downloading).path();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'清空本机全部资料'}).click();
  await expect(page.getByRole('button',{name:'导出 JSON · 0 条'})).toBeVisible();
  page.once('dialog',d=>d.accept());await page.locator('input[type=file]').setInputFiles(file!);
  await expect(page.getByRole('button',{name:'导出 JSON · 4 条'})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click(); await page.reload();
  await page.getByRole('button',{name:/全部记录 4/}).click();
  await expect(page.getByText('无需分类的新记录',{exact:true})).toBeVisible();
  for (const record of records) await expect(page.getByText(record.text,{exact:true})).toBeVisible();
});


test('象限二录入继承归类，JSON 保留来源，用户可调整并离线恢复', async ({page,context}) => {
  await page.goto(appPath);
  await expect(page.getByRole('button',{name:/象限四/})).toBeEnabled();
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.getByRole('button',{name:/象限二/}).click();
  await page.getByRole('button',{name:'记录',exact:true}).click();
  await expect(page.getByRole('group',{name:'记录类型'})).toHaveCount(0);
  await expect(page.getByText(/保存到象限二/)).toBeVisible();
  await page.getByRole('textbox').fill('这是一个我指定放在象限二的陈述');
  await page.getByRole('button',{name:'保存到本机',exact:true}).click();
  await expect(page.getByRole('button',{name:/象限二/})).toContainText('1 条探索');
  await expect(page.getByRole('button',{name:/全部记录 1/})).toBeVisible();
  await write(page,'这是来自象限四的记录');
  await page.getByRole('button',{name:/全部记录 2/}).click();
  await page.getByRole('button',{name:'移到象限二',exact:true}).click();
  await expect(page.getByRole('heading',{name:'全部记录',exact:true})).toBeVisible();
  const moved=page.locator('article').filter({hasText:'这是来自象限四的记录'});
  await expect(moved).toBeVisible();
  await expect(moved).toContainText('象限二');
  await expect(page.locator('article')).toHaveCount(2);
  await moved.getByRole('button',{name:'移到象限四',exact:true}).click();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'数据与隐私',exact:true}).click();
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:/导出 JSON/}).click();
  const file=await(await downloading).path();
  const archive=JSON.parse(await readFile(file!,'utf8'));
  expect(archive.schemaVersion).toBe(5);
  expect(archive.cognitionContext.quadrants.upper_left).toMatchObject({number:2,name:'象限二',label:'知道自己不知道的事'});
  expect(archive.records.find((r:{text:string})=>r.text==='这是一个我指定放在象限二的陈述')).toMatchObject({quadrant:'upper_left',status:'pending',placement:{declaredQuadrant:'upper_left',source:'user',entryPoint:'upper_left'}});
  expect(archive.records.find((r:{text:string})=>r.text==='这是来自象限四的记录')).toMatchObject({quadrant:'lower_right',placement:{declaredQuadrant:'lower_right',source:'user',entryPoint:'lower_right'}});
  // Invalid v4 metadata must not replace good local records.
  const invalid=structuredClone(archive);invalid.records[0].quadrant='lower_left';
  await page.locator('input[type=file]').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
  await expect(page.getByRole('alert')).toContainText('象限');
  await expect(page.getByRole('button',{name:'导出 JSON · 2 条'})).toBeVisible();
  page.once('dialog',d=>d.accept());
  await page.locator('input[type=file]').setInputFiles(file!);
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await context.setOffline(true);await page.reload();
  await expect(page.getByRole('button',{name:/象限二/})).toContainText('1 条探索');
  await expect(page.getByRole('button',{name:/全部记录 2/})).toBeVisible();
  await page.getByRole('button',{name:/象限二/}).click();
  await expect(page.getByText('这是一个我指定放在象限二的陈述',{exact:true})).toBeVisible();
});


test('全部记录包含所有认知状态，归类、确认与退回后仍在同一列表', async ({page,context}) => {
  // Model suggestions are synthetic test evidence; this does not validate a real model.
  const fake = {summary:'仅用于列表测试的建议',provider:'test',model:'fake',generatedAt:new Date().toISOString()};
  const pending = createRecord('全量列表待理解原文','personal');
  const gap = createRecord('全量列表待探索原文','known_unknown');
  const understood = withAnalysis(createRecord('全量列表待确认原文','personal'),fake);
  const confirmed = confirmRecord(withAnalysis(createRecord('全量列表已确认原文','personal'),fake));
  const input = makeArchive([pending,gap,understood,confirmed],['local:help:v3','local:gap:v3']);
  await page.goto(appPath);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.getByRole('button',{name:'数据与隐私',exact:true}).click();
  page.once('dialog',d=>d.accept());
  await page.locator('input[type=file]').setInputFiles({name:'synthetic-states.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(input))});
  await expect(page.getByRole('button',{name:'导出 JSON · 4 条'})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:/全部记录 4/}).click();
  await expect(page.locator('article')).toHaveCount(4);
  for (const record of input.records) await expect(page.getByText(record.text,{exact:true})).toBeVisible();
  const moved=page.locator('article').filter({hasText:pending.text});
  await moved.getByRole('button',{name:'移到象限二',exact:true}).click();
  await expect(moved).toBeVisible(); await expect(moved).toContainText('象限二');
  const proposed=page.locator('article').filter({hasText:understood.text});
  await proposed.getByRole('button',{name:'确认这次理解',exact:true}).click();
  await expect(proposed.locator('.badge')).toHaveText('已确认');
  const withdrawn=page.locator('article').filter({hasText:confirmed.text});
  await withdrawn.getByRole('button',{name:'撤回确认',exact:true}).click();
  await expect(withdrawn).toContainText('象限四');
  await expect(withdrawn.locator('.badge')).toHaveText('待理解');
  await expect(page.locator('article')).toHaveCount(4);
  await context.setOffline(true); await page.reload();
  await page.getByRole('button',{name:/全部记录 4/}).click();
  await expect(page.locator('article')).toHaveCount(4);
  await expect(page.locator('article').filter({hasText:pending.text})).toContainText('象限二');
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'数据与隐私',exact:true}).click();
  const downloading=page.waitForEvent('download'); await page.getByRole('button',{name:'导出 JSON · 4 条'}).click();
  const file=await(await downloading).path();const exported=JSON.parse(await readFile(file!,'utf8'));
  expect(exported.records.map((r:{id:string})=>r.id).sort()).toEqual(input.records.map(r=>r.id).sort());
  expect(exported.cognitionContext.quadrants.upper_right).toMatchObject({number:1,name:'象限一'});
  expect(exported.cognitionContext.quadrants.upper_left).toMatchObject({number:2,name:'象限二'});
});


test('统一象限称呼，象限三可打开，取消删除保留资料、确认删除持久生效', async ({page,context}) => {
  const fake={summary:'仅用于删除验收的建议',provider:'test',model:'fake',generatedAt:new Date().toISOString()};
  const shared=withAnalysis(createRecord('待确认的删除测试条目','personal'),fake);
  const agreed=confirmRecord(withAnalysis(createRecord('已确认的删除测试条目','personal'),fake));
  const gap=createRecord('象限二删除测试条目','known_unknown');
  const pending=createRecord('象限四删除测试条目','personal');
  const archive=makeArchive([shared,agreed,gap,pending],['local:help:v3','local:gap:v3']);
  await page.goto(appPath); await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.getByRole('button',{name:/象限三/}).click();
  await expect(page.getByRole('heading',{name:'象限三 · 不知道自己不知道的事',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'记录',exact:true})).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(/左上|右上|左下|右下/);
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'数据与隐私',exact:true}).click();
  page.once('dialog',d=>d.accept());
  await page.locator('input[type=file]').setInputFiles({name:'synthetic-delete.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(archive))});
  await expect(page.getByRole('button',{name:'导出 JSON · 4 条'})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:/象限一/}).click();
  await expect(page.getByRole('heading',{name:'象限一 · 共同认知',exact:true})).toBeVisible();
  const record=page.locator('article').filter({hasText:shared.text});
  page.once('dialog',d=>d.dismiss());
  await record.getByRole('button',{name:'删除',exact:true}).click();
  await expect(record).toBeVisible(); await expect(page.locator('article')).toHaveCount(2);
  page.once('dialog',d=>d.accept());
  await record.getByRole('button',{name:'删除',exact:true}).click();
  await expect(record).toHaveCount(0);
  page.once('dialog',d=>d.accept());
  await page.locator('article').filter({hasText:agreed.text}).getByRole('button',{name:'删除',exact:true}).click();
  await expect(page.locator('article')).toHaveCount(0);
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:/象限二/}).click();
  await expect(page.locator('body')).not.toContainText(/左上|右上|左下|右下/);
  page.once('dialog',d=>d.accept());
  await page.locator('article').filter({hasText:gap.text}).getByRole('button',{name:'删除',exact:true}).click();
  await expect(page.locator('article')).toHaveCount(0);
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:/全部记录 1/}).click();
  await expect(page.locator('article')).toContainText(pending.text);
  await expect(page.getByRole('button',{name:'移到象限二',exact:true})).toBeVisible();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'删除',exact:true}).click();
  await expect(page.locator('article')).toHaveCount(0);
  await context.setOffline(true); await page.reload();
  await page.getByRole('button',{name:/全部记录 0/}).click();await expect(page.locator('article')).toHaveCount(0);
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'数据与隐私',exact:true}).click();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'导出 JSON · 0 条'}).click();
  const file=await(await downloading).path();expect(JSON.parse(await readFile(file!,'utf8')).records).toEqual([]);
});


test('批注交互：固定入口、竖排标签、大关闭按钮与原生键盘输入', async ({page}) => {
  await page.goto(appPath);
  await expect(page.locator('.quad-icon')).toHaveCount(0);
  await expect(page.locator('.vertical-word').first()).toHaveCSS('writing-mode','vertical-rl');
  await expect(page.locator('.vertical-word').last()).toHaveCSS('writing-mode','vertical-rl');
  await page.getByRole('button',{name:/象限四/}).click();
  await expect(page.getByRole('heading',{name:'记录',exact:true})).toBeVisible();
  await expect(page.getByRole('group',{name:'记录类型'})).toHaveCount(0);
  await expect(page.locator('.editor-context')).toHaveText('我知道，AI 不知道');
  const close=await page.getByRole('button',{name:'关闭',exact:true}).boundingBox();
  expect(close?.width).toBeGreaterThanOrEqual(44);expect(close?.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole('textbox')).toBeFocused();
  await expect(page.getByRole('button',{name:'键盘听写',exact:true})).toHaveCount(0);
  await page.screenshot({path:'docs/editor-preview.png',fullPage:true});
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'新增未知记录',exact:true}).click();
  await expect(page.getByText(/保存到象限二/)).toBeVisible();
  await expect(page.getByRole('group',{name:'记录类型'})).toHaveCount(0);
});

test('象限一只修订反馈不新增：保留原文与模型原建议，保存失败留草稿，离线导出恢复', async ({page,context}) => {
  const fake={summary:'模型原始建议',provider:'test',model:'fake',generatedAt:new Date().toISOString()};
  const record=confirmRecord(withAnalysis(createRecord('不可被反馈编辑覆盖的用户原文','personal'),fake));
  await page.goto(appPath);await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.getByRole('button',{name:'数据与隐私',exact:true}).click();page.once('dialog',d=>d.accept());
  await page.locator('input[type=file]').setInputFiles({name:'synthetic-feedback.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(makeArchive([record],[])))});
  await expect(page.getByRole('button',{name:'导出 JSON · 1 条'})).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:/象限一/}).click();
  await expect(page.getByRole('button',{name:'记录',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'编辑反馈',exact:true}).click();
  await expect(page.getByRole('heading',{name:'修订 AI 反馈',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveValue(fake.summary);
  await expect(page.getByRole('button',{name:'保存修改',exact:true})).toBeDisabled();
  await page.getByRole('textbox').fill('用户认为更准确的理解');
  // Force an actual transaction failure; edit must remain in the input.
  await page.evaluate(() => {const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args:Parameters<IDBDatabase['transaction']>){IDBDatabase.prototype.transaction=original;throw new Error('模拟编辑保存失败');};});
  await page.getByRole('button',{name:'保存修改',exact:true}).click();
  await expect(page.getByRole('textbox')).toHaveValue('用户认为更准确的理解');
  await expect(page.getByRole('alert')).toContainText('模拟编辑保存失败');
  await page.getByRole('button',{name:'保存修改',exact:true}).click();
  await expect(page.getByRole('heading',{name:'象限一 · 共同认知',exact:true})).toBeVisible();
  await expect(page.getByText(record.text,{exact:true})).toBeVisible();await expect(page.getByText('用户认为更准确的理解',{exact:true})).toBeVisible();
  await expect(page.locator('.badge')).toHaveText('待确认');
  await page.getByText('查看 AI 原建议',{exact:true}).click();await expect(page.getByText(fake.summary,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'确认修订',exact:true}).click();await expect(page.locator('.badge')).toHaveText('已确认');
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'撤回确认',exact:true}).click();
  await expect(page.getByText('用户认为更准确的理解',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'数据与隐私',exact:true}).click();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'导出 JSON · 1 条'}).click();
  const file=await(await downloading).path();const archive=JSON.parse(await readFile(file!,'utf8'));
  expect(archive.schemaVersion).toBe(5);expect(archive.records[0]).toMatchObject({id:record.id,text:record.text,status:'confirmed',quadrant:'upper_right',analysis:{summary:fake.summary,userRevision:{summary:'用户认为更准确的理解'}}});
  page.once('dialog',d=>d.accept());await page.locator('input[type=file]').setInputFiles(file!);
  await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:/象限一/}).click();
  await expect(page.getByText('用户认为更准确的理解',{exact:true})).toBeVisible();await expect(page.getByText(record.text,{exact:true})).toBeVisible();
});

test('编辑反馈后返回原象限和滚动位置：关闭、放弃、Esc、保存均保留上下文', async ({page}) => {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const fake={summary:'仅用于回归的模型建议。'.repeat(8),provider:'test',model:'fake',generatedAt:new Date().toISOString()};
  const records=Array.from({length:10},(_,i)=>withAnalysis(createRecord(`返回测试条目 ${i}：这段原文需要保留。`,'personal'),fake));
  await page.goto(appPath);
  await page.getByRole('button',{name:'数据与隐私',exact:true}).click();page.once('dialog',d=>d.accept());
  await page.locator('input[type=file]').setInputFiles({name:'synthetic-editor-return.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(makeArchive(records,[])))});
  await expect(page.getByRole('button',{name:'导出 JSON · 10 条'})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:/象限一/}).click();
  const target=page.locator('article').filter({hasText:records[4].text});
  const edit=target.getByRole('button',{name:'编辑反馈',exact:true});
  const dialog=page.getByRole('dialog');
  await edit.scrollIntoViewIfNeeded();
  const scrollTop=await dialog.evaluate(element=>element.scrollTop);expect(scrollTop).toBeGreaterThan(100);
  const returned=async()=>{
    await expect(page.getByRole('heading',{name:'象限一 · 共同认知',exact:true})).toBeVisible();
    await expect(edit).toBeFocused();
    await expect.poll(async()=>Math.abs(await dialog.evaluate(element=>element.scrollTop)-scrollTop)).toBeLessThanOrEqual(2);
  };
  await edit.click();await expect(page.getByRole('textbox')).toBeFocused();
  await page.getByRole('button',{name:'关闭',exact:true}).click();await returned();
  // Cancel discarding a changed draft, then explicitly discard it.
  await edit.click();await page.getByRole('textbox').fill('尚未保存的反馈草稿');
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(page.getByRole('textbox')).toHaveValue('尚未保存的反馈草稿');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'关闭',exact:true}).click();await returned();
  await edit.click();await expect(page.getByRole('textbox')).toHaveValue(fake.summary);
  await page.keyboard.press('Escape');await returned();
  await edit.click();await page.getByRole('textbox').fill('保存后应在原条目看到的用户修订');
  await page.getByRole('button',{name:'保存修改',exact:true}).click();await returned();
  await expect(target.getByText('保存后应在原条目看到的用户修订',{exact:true})).toBeVisible();
  await expect(target.locator('.original')).toHaveText(records[4].text);
  await target.getByText('查看 AI 原建议',{exact:true}).click();
  await edit.click();await page.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(target.locator('details')).toHaveAttribute('open','');
  // Closing the list still returns home; a new record must not reopen an old list.
  await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:/象限四/}).click();await page.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(dialog).not.toBeVisible();expect(errors).toEqual([]);
});

test('全部记录与象限二的原文编辑也返回原列表', async ({page}) => {
  await page.goto(appPath);await write(page,'原文编辑返回入口测试',true);
  for(const entry of ['象限二','全部记录 1']){
    await page.getByRole('button',{name:new RegExp(entry)}).click();
    const title=entry==='象限二'?'象限二 · 知道自己不知道的事':'全部记录';
    const target=page.getByRole('button',{name:'编辑记录',exact:true});
    await target.click();await page.getByRole('button',{name:'关闭',exact:true}).click();
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(target).toBeFocused();
    await target.click();await page.getByRole('textbox').fill(`从${entry}修改的原文`);
    await page.getByRole('button',{name:'保存修改',exact:true}).click();
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
    await expect(page.locator('.original')).toHaveText(`从${entry}修改的原文`);
    await page.getByRole('button',{name:'关闭',exact:true}).click();
  }
});
