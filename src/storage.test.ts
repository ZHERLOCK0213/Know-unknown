import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDBRepository } from './storage';
import { createRecord, confirmRecord, makeArchive, resetRecord, editRecord, reclassifyRecord, withAnalysis } from './domain';
import { AIService, NoAIAdapter, type AIAdapter } from './ai';
const analysis = {summary:'理解建议',provider:'test',model:'fake',generatedAt:new Date().toISOString()};
const repo = () => new IndexedDBRepository(`test-${crypto.randomUUID()}`);
describe('本地持久化与 AI 服务', () => {
  it('重新创建仓储仍读到记录；并发新增不覆盖', async () => {
    const name = crypto.randomUUID(); const a = new IndexedDBRepository(name); const b = new IndexedDBRepository(name);
    await Promise.all([a.add(createRecord('a','personal')), b.add(createRecord('b','personal'))]);
    expect((await new IndexedDBRepository(name).read()).records).toHaveLength(2);
  });
  it('事务失败不写入，重复 id 不影响原数据', async () => {
    const repository = repo(); const record = createRecord('a','personal'); await repository.add(record);
    await expect(repository.add({...record,text:'wrong'})).rejects.toThrow();
    await expect(repository.update(record.id, confirmRecord)).rejects.toThrow();
    expect((await repository.read()).records[0]).toEqual(record);
  });
  it('回答与跳过在一次事务保存；恢复原子替换，清空包含问题', async () => {
    const repository = repo(); const record = createRecord('answer','personal'); await repository.add(record,'local:help:v1');
    const exported = await repository.read();
    await repository.add(createRecord('later','personal'));
    await repository.replace(exported);
    const restored = await repository.read();
    expect(restored.records).toHaveLength(1); expect(restored.records[0].text).toBe('answer');
    expect(restored.skippedQuestionIds).toEqual(['local:help:v3']);
    expect(restored.records[0].revision).not.toBe(record.revision);
    await expect(repository.replace({...exported, schemaVersion:99} as never)).rejects.toThrow();
    expect((await repository.read()).records).toHaveLength(1);
    await repository.clear(); expect((await repository.read()).records).toEqual([]); expect((await repository.read()).skippedQuestionIds).toEqual([]);
  });
  it('无模型、模型错误、取消和非法结果不会假装理解', async () => {
    const repository = repo(); const record = createRecord('a','personal'); await repository.add(record);
    const noAI = new AIService(repository,new NoAIAdapter());
    expect(await noAI.understand(record,new AbortController().signal)).toBe(false);
    for (const analyze of [async () => {throw new Error('offline');}, async () => ({summary:'incomplete'})]) {
      const service = new AIService(repository,{available:true,analyze});
      await expect(service.understand(record,new AbortController().signal)).rejects.toThrow();
    }
    const controller = new AbortController(); controller.abort();
    await expect(noAI.understand(record,controller.signal)).rejects.toThrow();
    expect((await repository.read()).records[0].status).toBe('pending');
  });
  it('真实接口边界可接入 fake adapter 完成理解，用户再确认', async () => {
    const repository = repo(); const record = createRecord('a','personal'); await repository.add(record);
    const adapter: AIAdapter = {available:true,analyze:async () => analysis};
    expect(await new AIService(repository,adapter).understand(record,new AbortController().signal)).toBe(true);
    const current = (await repository.read()).records[0];
    expect(current.status).toBe('understood'); await repository.update(record.id,confirmRecord,current.revision);
    expect((await repository.read()).records[0].status).toBe('confirmed');
  });
  it('迟到模型结果不能复活已删除的记录，或覆盖恢复后的版本', async () => {
    for (const mutation of ['delete','restore'] as const) {
      const repository = repo(); const record = createRecord('a','personal'); await repository.add(record);
      let resolve!: (value:unknown) => void;
      const service = new AIService(repository,{available:true,analyze:() => new Promise(r => {resolve = r;})});
      const pending = service.understand(record,new AbortController().signal);
      if (mutation === 'delete') await repository.remove(record.id); else await repository.replace(makeArchive([record],[]));
      resolve(analysis); await expect(pending).rejects.toThrow();
      const records = (await repository.read()).records;
      expect(records.every(r => r.status === 'pending')).toBe(true);
      if (mutation === 'delete') expect(records).toHaveLength(0);
    }
  });
  it('拒绝过时的用户动作，保留新状态', async () => {
    const repository = repo(); const record = createRecord('a','personal'); await repository.add(record);
    await repository.update(record.id,current => withAnalysis(current,analysis),record.revision);
    await expect(repository.update(record.id,resetRecord,record.revision)).rejects.toThrow();
    expect((await repository.read()).records[0].status).toBe('understood');
  });
});


it('现有数据库的知识、感受、待分类与无字段旧记录统一可读且不丢状态', async () => {
  const name = crypto.randomUUID(); const repository = new IndexedDBRepository(name);
  await repository.read();
  const db = await new Promise<IDBDatabase>(resolve => {const request = indexedDB.open(name,1); request.onsuccess=()=>resolve(request.result);});
  const rows = [
    {...createRecord('旧知识', 'personal'),category:'knowledge'},
    {...confirmRecord(withAnalysis(createRecord('旧感受', 'personal'),analysis)),category:'feeling'},
    {...createRecord('旧未分类', 'personal'),category:'unclassified'},
    createRecord('最初的记录', 'personal'),
  ];
  await new Promise<void>((resolve,reject) => {const tx=db.transaction('records','readwrite');rows.forEach(row=>{const {placement:_placement,quadrant:_quadrant,...legacy}=row;tx.objectStore('records').add(legacy);});tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
  const restored = await new IndexedDBRepository(name).read();
  expect(restored.records).toHaveLength(4);
  expect(restored.records.find(r=>r.text==='旧感受')).toMatchObject({status:'confirmed',analysis});
  expect(restored.records.every(r=>!('category' in r) && r.placement.source==='legacy_inferred' && r.placement.entryPoint==='unknown')).toBe(true);
  await repository.replace(restored);
  expect((await repository.read()).records.map(r=>r.text).sort()).toEqual(rows.map(r=>r.text).sort());
});


it('AI adapter 收到象限上下文；用户改类后的迟到结果不能覆盖', async () => {
  const repository=repo(); const record=createRecord('来自象限二入口的陈述','known_unknown','upper_left');
  await repository.add(record);
  let resolve!: (value:unknown)=>void;
  let captured: unknown;
  const service=new AIService(repository,{available:true,analyze:input=>{captured=input;return new Promise(r=>{resolve=r;});}});
  const pending=service.understand(record,new AbortController().signal);
  expect(captured).toMatchObject({schemaVersion:5,record:{quadrant:'upper_left',placement:{declaredQuadrant:'upper_left',entryPoint:'upper_left',source:'user'}},cognitionContext:{quadrants:{upper_left:{label:'知道自己不知道的事'}}}});
  await repository.update(record.id,current=>reclassifyRecord(current,'personal'),record.revision);
  resolve(analysis); await expect(pending).rejects.toThrow();
  expect((await repository.read()).records[0]).toMatchObject({status:'pending',quadrant:'lower_right',text:record.text});
});


it('编辑保留草稿保护边界：迟到结果与过时编辑不能覆盖新原文', async () => {
  const repository=repo();const record=createRecord('原文','personal');await repository.add(record);
  let resolve!:(value:unknown)=>void;
  const service=new AIService(repository,{available:true,analyze:()=>new Promise(r=>{resolve=r;})});
  const pending=service.understand(record,new AbortController().signal);
  await repository.update(record.id,current=>editRecord(current,'先保存的新原文'),record.revision);
  await expect(repository.update(record.id,current=>editRecord(current,'旧窗口的修改'),record.revision)).rejects.toThrow();
  resolve(analysis);await expect(pending).rejects.toThrow();
  expect((await repository.read()).records).toMatchObject([{id:record.id,text:'先保存的新原文',status:'pending',quadrant:'lower_right'}]);
});
