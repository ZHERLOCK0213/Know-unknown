export type Kind = 'personal' | 'known_unknown';
export type Status = 'pending' | 'understood' | 'confirmed';
export interface Analysis {
  summary: string; provider: string; model: string; generatedAt: string; question?: string;
}
export interface CognitiveRecord {
  id: string; revision: string; kind: Kind; text: string; status: Status;
  createdAt: string; updatedAt: string; analysis?: Analysis;
}
export interface Archive {
  schemaVersion: 3; exportedAt: string; records: CognitiveRecord[]; skippedQuestionIds: string[];
}
export const MAX_TEXT = 4000;
export const statusLabel: Record<Status, string> = { pending: '待理解', understood: '待确认', confirmed: '已确认' };
const now = () => new Date().toISOString();
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
export function parseAnalysis(v: unknown): Analysis {
  if (!object(v) || !string(v.summary) || !string(v.provider, 200) || !string(v.model, 200) || !date(v.generatedAt) || (v.question !== undefined && !string(v.question))) throw new Error('理解结果缺少有效摘要或来源');
  // Copy only allowed fields. Never retain credentials or arbitrary model output.
  return { summary: v.summary.trim(), provider: v.provider, model: v.model, generatedAt: v.generatedAt, ...(v.question ? { question: v.question as string } : {}) };
}
export function parseRecord(v: unknown): CognitiveRecord {
  if (!object(v) || !string(v.id, 200) || !string(v.revision, 200) || !string(v.text) || !['personal','known_unknown'].includes(v.kind as string) || !['pending','understood','confirmed'].includes(v.status as string) || !date(v.createdAt) || !date(v.updatedAt)) throw new Error('记录格式无效');
  const analysis = v.analysis === undefined ? undefined : parseAnalysis(v.analysis);
  if ((v.status === 'pending' && analysis) || (v.status !== 'pending' && !analysis)) throw new Error('认知状态与理解证据不一致');
  return { id: v.id, revision: v.revision, kind: v.kind as Kind, text: v.text, status: v.status as Status, createdAt: v.createdAt, updatedAt: v.updatedAt, ...(analysis ? { analysis } : {}) };
}
export function createRecord(text: string, kind: Kind): CognitiveRecord {
  const timestamp = now();
  return parseRecord({ id: crypto.randomUUID(), revision: crypto.randomUUID(), text: text.trim(), kind, status: 'pending', createdAt: timestamp, updatedAt: timestamp });
}
function revise(record: CognitiveRecord, fields: Partial<CognitiveRecord>): CognitiveRecord {
  return parseRecord({ ...record, ...fields, revision: crypto.randomUUID(), updatedAt: now() });
}
export function withAnalysis(record: CognitiveRecord, analysis: unknown): CognitiveRecord {
  if (record.status !== 'pending') throw new Error('只有待理解的记录可以接收理解结果');
  return revise(record, { status: 'understood', analysis: parseAnalysis(analysis) });
}
export function confirmRecord(record: CognitiveRecord): CognitiveRecord {
  if (record.status !== 'understood') throw new Error('请先获得理解建议，再确认');
  return revise(record, { status: 'confirmed' });
}
export function resetRecord(record: CognitiveRecord): CognitiveRecord {
  if (record.status === 'pending') throw new Error('记录已经在待理解中');
  return revise(record, { status: 'pending', analysis: undefined });
}
export function quadrant(record: CognitiveRecord): 'gaps' | 'shared' | 'inbox' {
  return record.kind === 'known_unknown' ? 'gaps' : record.status === 'pending' ? 'inbox' : 'shared';
}
export function makeArchive(records: CognitiveRecord[], skippedQuestionIds: string[]): Archive {
  return parseArchive({ schemaVersion: 3, exportedAt: now(), records, skippedQuestionIds });
}
export function parseArchive(v: unknown): Archive {
  if (!object(v) || ![1, 2, 3].includes(v.schemaVersion as number) || !date(v.exportedAt) || !Array.isArray(v.records) || v.records.length > 10000 || !Array.isArray(v.skippedQuestionIds) || v.skippedQuestionIds.length > 10000 || !v.skippedQuestionIds.every(id => string(id, 300))) throw new Error('不支持的归档格式或版本');
  if (v.schemaVersion === 2 && v.records.some(row => !object(row) || !['knowledge','feeling','unclassified'].includes(row.category as string))) throw new Error('旧归档分类字段无效');
  const records = v.records.map(row => parseRecord(row));
  if (new Set(records.map(r => r.id)).size !== records.length) throw new Error('归档包含重复记录');
  return { schemaVersion: 3, exportedAt: v.exportedAt, records, skippedQuestionIds: normalizeSkipped(v.skippedQuestionIds as string[]) };
}
// Carry skipped prompts forward when merging v1/v2 records into one view.
function normalizeSkipped(ids: string[]): string[] {
  return [...new Set(ids.map(id => {
    if (id === 'local:help:v1' || /^local:(knowledge|feeling):0:v2$/.test(id)) return 'local:help:v3';
    if (id === 'local:gap:v1' || /^local:(knowledge|feeling):1:v2$/.test(id)) return 'local:gap:v3';
    return id;
  }))];
}
export interface Question { id: string; text: string; source: 'local' | 'ai' }
export function nextQuestion(records: CognitiveRecord[], skipped: string[]): Question | undefined {
  const generated: Question[] = records.filter(r => r.analysis?.question).map(r => ({ id: `ai:${r.id}:${r.analysis!.generatedAt}`, text: r.analysis!.question!, source: 'ai' }));
  const local: Question[] = [
    {id:'local:help:v3',text:'你希望这个小工具，先帮你记住哪一件事？',source:'local'},
    {id:'local:gap:v3',text:'最近有没有一件你还不明白、想继续探索的事？',source:'local'},
  ];
  const ignored = normalizeSkipped(skipped);
  return [...generated, ...local].find(q => !ignored.includes(q.id));
}
