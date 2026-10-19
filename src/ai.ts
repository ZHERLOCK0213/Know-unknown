import { withAnalysis, type CognitiveRecord } from './domain';
import type { Repository } from './storage';
export interface AIAdapter {
  readonly available: boolean;
  analyze(record: Readonly<CognitiveRecord>, signal: AbortSignal): Promise<unknown | null>;
}
export class NoAIAdapter implements AIAdapter {
  readonly available = false;
  async analyze(): Promise<null> { return null; }
}
export class AIService {
  constructor(private repository: Repository, readonly adapter: AIAdapter) {}
  async understand(record: CognitiveRecord, signal: AbortSignal): Promise<boolean> {
    if (record.status !== 'pending') throw new Error('记录不在待理解状态');
    if (signal.aborted) throw new Error('已取消理解');
    const result = await this.adapter.analyze(structuredClone(record), signal);
    if (signal.aborted) throw new Error('已取消理解');
    if (result === null) return false;
    await this.repository.update(record.id, current => withAnalysis(current, result), record.revision);
    return true;
  }
}
