import { describe, expect, it } from 'vitest';
import { confirmRecord, createRecord, makeArchive, nextQuestion, parseArchive, parseAnalysis, quadrant, resetRecord, withAnalysis } from './domain';
const analysis = { summary: '你偏好有明确议程的会议。', provider: 'test', model: 'fake', generatedAt: new Date().toISOString(), question: '哪些会议例外？' };
describe('认知状态与信任边界', () => {
  it('保存与 AI 理解分开；不能从保存直接确认', () => {
    const record = createRecord(' 我喜欢提前拿到会议议程 ', 'personal');
    expect(record.text).toBe('我喜欢提前拿到会议议程');
    expect(record.status).toBe('pending'); expect(quadrant(record)).toBe('inbox');
    expect(() => confirmRecord(record)).toThrow();
  });
  it('理解需要证据，确认再撤回；原文不被摘要覆盖', () => {
    const original = createRecord('会议前给我议程', 'personal');
    expect(() => withAnalysis(original, {summary: '空来源'})).toThrow();
    const understood = withAnalysis(original, analysis);
    expect(quadrant(understood)).toBe('shared');
    const confirmed = confirmRecord(understood);
    expect(confirmed.text).toBe(original.text); expect(confirmed.status).toBe('confirmed');
    expect(() => withAnalysis(confirmed, analysis)).toThrow();
    const reset = resetRecord(confirmed);
    expect(reset.status).toBe('pending'); expect(reset.analysis).toBeUndefined(); expect(reset.revision).not.toBe(original.revision);
  });
  it('只允许显式已知未知；相关知识不表示用户已学会', () => {
    const gap = createRecord('我不会炒鸡蛋', 'known_unknown');
    expect(quadrant(gap)).toBe('gaps'); expect(quadrant(confirmRecord(withAnalysis(gap, analysis)))).toBe('gaps');
  });
  it('拒绝空内容与超长内容，移除模型结果中的额外字段', () => {
    expect(() => createRecord('  ', 'personal')).toThrow(); expect(() => createRecord('x'.repeat(4001), 'personal')).toThrow();
    expect(parseAnalysis({...analysis, apiKey: 'never-export'})).not.toHaveProperty('apiKey');
  });
  it('归档版本、重复 id 和伪造无证据状态校验', () => {
    const record = createRecord('abc', 'personal'); const archive = makeArchive([record], []);
    expect(parseArchive(archive)).toEqual(archive);
    expect(() => parseArchive({...archive, schemaVersion: 99})).toThrow();
    expect(() => parseArchive({...archive, records:[record,record]})).toThrow();
    expect(() => parseArchive({...archive, records:[{...record,status:'confirmed'}]})).toThrow();
    expect(() => parseArchive({...archive, records:[{...record,createdAt:'yesterday'}]})).toThrow();
  });
  it('问题可跳过，模型问题有来源且恢复/确认不改变问题标识', () => {
    expect(nextQuestion([], [])?.source).toBe('local');
    const record = withAnalysis(createRecord('abc', 'personal'), analysis);
    const q = nextQuestion([record], [])!;
    expect(q.source).toBe('ai'); expect(nextQuestion([confirmRecord(record)], [])?.id).toBe(q.id);
    expect(nextQuestion([record], [q.id])?.source).toBe('local');
    expect(nextQuestion([], ['local:help:v1', 'local:gap:v1'])).toBeUndefined();
  });
});


describe('知识与感受合并兼容', () => {
  it('旧版三个分类统一保留原文、状态和理解证据，导出为无分类 v3', () => {
    const base = createRecord('知识原文', 'personal');
    const feeling = confirmRecord(withAnalysis({...createRecord('感受原文', 'personal')}, analysis));
    const pending = createRecord('曾经未分类', 'personal');
    const old = {schemaVersion:2,exportedAt:new Date().toISOString(),records:[{...base,category:'knowledge'},{...feeling,category:'feeling'},{...pending,category:'unclassified'}],skippedQuestionIds:[]};
    const result = parseArchive(old);
    expect(result.schemaVersion).toBe(3); expect(result.records).toEqual([base,feeling,pending]);
    expect(JSON.stringify(result)).not.toContain('category');
    const exported = makeArchive(result.records,[]); expect(parseArchive(exported)).toEqual(exported);
  });
  it('读取无分类 v1；拒绝损坏的 v2、未来版本和无证据确认', () => {
    const record = createRecord('旧版原文', 'personal');
    const old = {schemaVersion:1,exportedAt:new Date().toISOString(),records:[record],skippedQuestionIds:[]};
    expect(parseArchive(old).records).toEqual([record]);
    expect(() => parseArchive({...old,schemaVersion:2})).toThrow('分类字段');
    expect(() => parseArchive({...old,schemaVersion:4})).toThrow();
    expect(() => parseArchive({...old,records:[{...record,status:'confirmed'}]})).toThrow();
  });
  it('旧版已跳过提示合并继承，模型问题来源和标识仍保留', () => {
    const record = withAnalysis(createRecord('经历', 'personal'), analysis);
    const oldSkipped = ['local:knowledge:0:v2','local:feeling:1:v2'];
    expect(nextQuestion([],oldSkipped)).toBeUndefined();
    expect(nextQuestion([record],oldSkipped)?.source).toBe('ai');
    const archive = parseArchive({schemaVersion:1,exportedAt:new Date().toISOString(),records:[],skippedQuestionIds:oldSkipped});
    expect(archive.skippedQuestionIds).toEqual(['local:help:v3','local:gap:v3']);
  });
});
