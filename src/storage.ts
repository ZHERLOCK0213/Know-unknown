import { makeArchive, parseArchive, parseRecord, type Archive, type CognitiveRecord } from './domain';
export interface Repository {
  read(): Promise<Archive>;
  add(record: CognitiveRecord, answeredQuestionId?: string): Promise<void>;
  update(id: string, change: (current: CognitiveRecord) => CognitiveRecord, expectedRevision?: string): Promise<void>;
  remove(id: string): Promise<void>;
  skip(id: string): Promise<void>;
  replace(archive: Archive): Promise<void>;
  clear(): Promise<void>;
}
export class IndexedDBRepository implements Repository {
  private database?: Promise<IDBDatabase>;
  constructor(private name = 'cognitive-quadrants-v1') {}
  private open(): Promise<IDBDatabase> {
    if (!this.database) this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('records', { keyPath: 'id' }); request.result.createObjectStore('meta'); };
      request.onerror = () => { this.database = undefined; reject(new Error('本地数据库无法打开，请检查浏览器存储权限')); };
      request.onblocked = () => { this.database = undefined; reject(new Error('数据库被其他页面占用，请关闭其他页面后重试')); };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); this.database = undefined; }; resolve(request.result); };
    });
    return this.database;
  }
  private async transaction<T>(mode: IDBTransactionMode, run: (tx: IDBTransaction, result: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['records','meta'], mode);
      let value: T; let error: Error | undefined;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(error ?? tx.error ?? new Error('保存未完成，请重试'));
      const fail = (reason: Error) => { error = reason; tx.abort(); };
      try { run(tx, result => { value = result; }, fail); } catch (reason) { fail(reason instanceof Error ? reason : new Error('数据处理失败')); }
    });
  }
  read(): Promise<Archive> {
    return this.transaction('readonly', (tx, result, fail) => {
      const records = tx.objectStore('records').getAll();
      const skipped = tx.objectStore('meta').get('skipped');
      skipped.onsuccess = () => {
        try { result(makeArchive(records.result.map(row => parseRecord(row)), skipped.result ?? [])); } catch (error) { fail(error as Error); }
      };
    });
  }
  private skipIn(tx: IDBTransaction, id: string) {
    const meta = tx.objectStore('meta'); const request = meta.get('skipped');
    request.onsuccess = () => meta.put([...new Set([...(request.result ?? []), id])], 'skipped');
  }
  add(record: CognitiveRecord, answeredQuestionId?: string): Promise<void> {
    const valid = parseRecord(record);
    return this.transaction('readwrite', tx => { tx.objectStore('records').add(valid); if (answeredQuestionId) this.skipIn(tx, answeredQuestionId); });
  }
  update(id: string, change: (current: CognitiveRecord) => CognitiveRecord, expectedRevision?: string): Promise<void> {
    return this.transaction('readwrite', (tx, _result, fail) => {
      const store = tx.objectStore('records'); const request = store.get(id);
      request.onsuccess = () => {
        try {
          if (!request.result) throw new Error('这条记录已被删除');
          const current = parseRecord(request.result);
          if (expectedRevision && current.revision !== expectedRevision) throw new Error('记录已变化，请重新发起理解');
          const next = parseRecord(change(current));
          if (next.id !== id) throw new Error('记录标识不可变');
          store.put(next);
        } catch (error) { fail(error as Error); }
      };
    });
  }
  remove(id: string): Promise<void> { return this.transaction('readwrite', tx => { tx.objectStore('records').delete(id); }); }
  skip(id: string): Promise<void> { return this.transaction('readwrite', tx => this.skipIn(tx, id)); }
  async replace(archive: Archive): Promise<void> {
    const valid = parseArchive(archive);
    // Restores get fresh version tokens so in-flight model responses cannot write into restored data.
    return this.transaction('readwrite', tx => {
      const records = tx.objectStore('records'); records.clear();
      valid.records.forEach(r => records.add({ ...r, revision: crypto.randomUUID() }));
      tx.objectStore('meta').put(valid.skippedQuestionIds, 'skipped');
    });
  }
  clear(): Promise<void> { return this.transaction('readwrite', tx => { tx.objectStore('records').clear(); tx.objectStore('meta').clear(); }); }
}
