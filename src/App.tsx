import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { createRecord, confirmRecord, resetRecord, reclassifyRecord, quadrantLabels, quadrant, statusLabel, nextQuestion, parseArchive, MAX_TEXT, type Archive, type CognitiveRecord, type Kind, type EntryPoint } from './domain';
import { IndexedDBRepository } from './storage';
import { AIService, NoAIAdapter } from './ai';
import { APP_VERSION, subscribeUpdates, getUpdateState, checkForUpdates, applyUpdate } from './pwa';
const repository = new IndexedDBRepository();
const ai = new AIService(repository, new NoAIAdapter());
type Panel = 'inbox' | 'shared' | 'gaps' | 'settings' | 'write';
const panelTitle: Record<Panel, string> = { inbox: '我的记录', shared: '共同认知', gaps: '已知的未知', settings: '数据与隐私', write: '记一笔' };
export default function App() {
  const title = '知不知';
  const update = useSyncExternalStore(subscribeUpdates, getUpdateState);
  const [archive, setArchive] = useState<Archive>();
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [panel, setPanel] = useState<Panel>(); const [text, setText] = useState('');
  const [kind, setKind] = useState<Kind>('personal'); const [entryPoint, setEntryPoint] = useState<EntryPoint>('lower_right'); const [answerId, setAnswerId] = useState<string>();
  const [busy, setBusy] = useState(false); const [online, setOnline] = useState(navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false); const [offlineError, setOfflineError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const channel = useRef<BroadcastChannel | null>(null);
  const mutationLock = useRef(false);
  async function reload() { setArchive(await repository.read()); }
  useEffect(() => {
    void reload().catch(e => setError(e.message));
    const receive = () => { void reload().catch(e => setError(e.message)); };
    const visible = () => { if (document.visibilityState === 'visible') receive(); };
    if ('BroadcastChannel' in window) { channel.current = new BroadcastChannel('cq-changes'); channel.current.onmessage = receive; }
    const connectivity = () => setOnline(navigator.onLine);
    const ready = () => setOfflineReady(true); const failed = () => setOfflineError(true);
    window.addEventListener('online', connectivity); window.addEventListener('offline', connectivity);
    window.addEventListener('cq-offline-ready', ready); window.addEventListener('cq-offline-error', failed);
    document.addEventListener('visibilitychange', visible);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.getRegistration().then(r => { if (r?.active) setOfflineReady(true); });
    return () => { channel.current?.close(); window.removeEventListener('online', connectivity); window.removeEventListener('offline', connectivity); window.removeEventListener('cq-offline-ready', ready); window.removeEventListener('cq-offline-error', failed); document.removeEventListener('visibilitychange', visible); };
  }, []);
  useEffect(() => {
    document.title = `${title} · Know-unknown`;
    const url = new URL(location.href); url.searchParams.delete('category');
    history.replaceState(null, '', url);
  }, [title]);
  useEffect(() => { if (panel && !dialog.current?.open) dialog.current?.showModal(); }, [panel]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (panel === 'write' && text.trim()) e.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [text, panel]);
  async function run(action: () => Promise<void>, message: string) {
    if (mutationLock.current || update.applying) return false;
    mutationLock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); await reload(); channel.current?.postMessage('changed'); setNotice(message); return true; }
    catch (e) { setError(e instanceof Error ? e.message : '操作未完成，请重试'); return false; }
    finally { mutationLock.current = false; setBusy(false); }
  }
  function close() {
    if (busy || update.applying) return;
    if (panel === 'write' && text.trim() && !window.confirm('还没有保存。确定放弃这段记录？')) return;
    dialog.current?.close(); setPanel(undefined); setText(''); setAnswerId(undefined);
  }
  function updateApp() {
    if (mutationLock.current || update.applying || (panel === 'write' && text.length > 0)) return;
    mutationLock.current = true;
    if (!applyUpdate()) mutationLock.current = false;
  }
  useEffect(() => { if (!update.applying) mutationLock.current = false; }, [update.applying]);
  function write(id?: string, initialKind: Kind = 'personal', origin: EntryPoint = 'lower_right') { if (update.applying) return; setText(''); setKind(initialKind); setEntryPoint(origin); setAnswerId(id); setError(''); setPanel('write'); }
  async function save(e: FormEvent) {
    e.preventDefault();
    const success = await run(() => repository.add(createRecord(text, kind, entryPoint), answerId), '已保存在本机。AI 尚未理解这条记录。');
    if (success) { setText(''); setAnswerId(undefined); dialog.current?.close(); setPanel(undefined); }
  }
  async function download() {
    await run(async () => {
      const data = await repository.read();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `know-unknown-${new Date().toISOString().slice(0,10)}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, '导出文件已生成，请妥善保存。');
  }
  async function restore(file: File) {
    await run(async () => {
      if (file.size > 10 * 1024 * 1024) throw new Error('请选择小于 10MB 的归档');
      let value: unknown;
      try { value = JSON.parse(await file.text()); } catch { throw new Error('文件不是有效的 JSON'); }
      const data = parseArchive(value);
      if (!window.confirm(`将用文件中的 ${data.records.length} 条记录替换本机全部资料。建议先导出。确定恢复？`)) return;
      await repository.replace(data);
    }, '文件处理完成。');
  }
  const records = archive?.records ?? [];
  const groups = { inbox: records.filter(r => quadrant(r) === 'inbox'), shared: records.filter(r => quadrant(r) === 'shared'), gaps: records.filter(r => quadrant(r) === 'gaps') };
  const question = archive && nextQuestion(records, archive.skippedQuestionIds);
  function recordView(record: CognitiveRecord) {
    return <article className="record" key={record.id}>
      <div className="record-meta"><span className={`badge ${record.status}`}>{record.kind === 'known_unknown' && record.status === 'pending' ? '待探索' : statusLabel[record.status]}</span><time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleDateString('zh-CN')}</time></div>
      <p className="hint">{quadrantLabels[record.quadrant]} · {record.placement.source === 'user' ? '用户指定归类' : '旧记录推定，原录入入口未留存'}{record.quadrant !== record.placement.declaredQuadrant && <>（用户归类：{quadrantLabels[record.placement.declaredQuadrant]}）</>}</p><p className="original">{record.text}</p>
      {record.analysis ? <div className="analysis"><small>{'AI 的理解建议'}</small><p>{record.analysis.summary}</p><small>{record.analysis.provider} · {record.analysis.model} · {new Date(record.analysis.generatedAt).toLocaleString('zh-CN')}</small></div> : <p className="hint">仅已保存，AI 尚未提供理解。</p>}
      <div className="record-actions">
        {record.status === 'pending' && <button disabled={busy} onClick={() => void run(() => repository.update(record.id, current => reclassifyRecord(current, record.kind === 'personal' ? 'known_unknown' : 'personal'), record.revision), '已按你的选择调整象限，原文保留。')}>{record.kind === 'personal' ? '移到左上' : '移到右下'}</button>}
        {record.status === 'pending' && <button disabled={!ai.adapter.available || busy} title="首版未接入模型">等待接入模型</button>}
        {record.status === 'understood' && <button disabled={busy} onClick={() => void run(() => repository.update(record.id, confirmRecord, record.revision), '已确认这次理解。')}>确认这次理解</button>}
        {record.status !== 'pending' && <button disabled={busy} onClick={() => void run(() => repository.update(record.id, resetRecord, record.revision), '已退回待理解，旧建议已移除。')}>{record.status === 'confirmed' ? '撤回确认' : '理解有误'}</button>}
        <button className="text-button danger" disabled={busy} onClick={() => { if (window.confirm('确定删除这条记录？')) void run(() => repository.remove(record.id), '已删除记录。'); }}>删除</button>
      </div>
    </article>;
  }
  const questionPrompt = question && <aside className="question"><div><small>{question.source === 'local' ? '一个本地小提示 · 非 AI 观察' : 'AI 想多了解一点'}</small><p>{question.text}</p></div><div className="question-actions"><button className="text-button" disabled={busy} onClick={() => void run(() => repository.skip(question.id), '已跳过，不必回答。')}>跳过</button><button className="text-button" disabled={busy} onClick={() => write(question.id, 'personal', 'question_prompt')}>记一笔 ↗</button></div></aside>;
  return <main>
    <header><div className="app-brand"><h1>{title}</h1><span>Know-unknown</span></div><button className="settings-button" onClick={() => { setError(''); setPanel('settings'); }}>数据与隐私</button></header>
    <div className="map-shell"><span className="axis vertical-axis" aria-hidden="true"/><span className="axis horizontal-axis" aria-hidden="true"/><div className="vertical-label top">AI 知道 <span>↑</span></div><div className="horizontal-labels"><span>← 我不知道</span><span>我知道 →</span></div>
      <section className="quadrants" aria-label={title}>
        <button className="quadrant gaps" onClick={() => setPanel('gaps')}><span className="quad-number">01 <span>↗</span></span><span className="quad-icon">?</span><h2>已知的未知</h2><p>我还不明白的事<br/>等待进一步探索</p><span className="quad-foot">{groups.gaps.length ? `${groups.gaps.length} 条探索` : '给好奇心留个位置'} <span>↗</span></span></button>
        <button className="quadrant shared" onClick={() => setPanel('shared')}><span className="quad-number">02 <span>↗</span></span><span className="quad-icon">⌁</span><h2>共同认知</h2><p>AI 给出理解<br/>由我来确认</p><span className="quad-foot">{groups.shared.length} 条理解 · {groups.shared.filter(r => r.status === 'confirmed').length} 已确认 <span>↗</span></span></button>
        <div className="quadrant unknown" aria-label="未知的未知，不可编辑"><span className="quad-number">03</span><span className="quad-icon">∴</span><h2>未知的未知</h2><p>还没有名字的可能<br/>暂且留白</p><span className="quad-foot">无需填满</span></div>
        <button className="quadrant inbox" disabled={!archive} onClick={() => write()}><span className="quad-number">04 <span>＋</span></span><span className="quad-icon plus">＋</span><h2>我的记录</h2><p>知识、经历或感受<br/>都从这里记下</p><span className="quad-foot">点击记下一点 <span>↗</span></span></button>
      </section>
      <div className="vertical-label bottom">AI 不知道 <span>↓</span></div>
    </div>
    <div className="below-map"><span><i className={`dot ${!online ? 'offline' : ''}`}/>{offlineError ? '离线缓存失败，请联网重试' : !online ? '当前离线 · 仍可记录' : offlineReady ? '已可离线使用' : '记录保存在本机'}</span><button className="text-button" disabled={!archive} onClick={() => setPanel('inbox')}>待理解记录 {groups.inbox.length} <span>→</span></button></div>
    {update.available && !panel && <aside className="update-notice" aria-label="应用更新"><span>有新版本</span><button disabled={busy || update.applying} onClick={updateApp}>{update.applying ? '更新中…' : '更新应用'}</button></aside>}
    {!archive && !error && <p role="status">正在读取本机记录…</p>}
    {notice && <p role="status" className="notice">{notice}</p>}
    {!panel && error && <div role="alert" className="error">{error} <button onClick={() => void run(reload, '已重新读取本机资料。')}>重试</button></div>}
    <dialog ref={dialog} onCancel={e => { e.preventDefault(); close(); }} onClose={() => setPanel(undefined)} aria-labelledby="panel-title">
      <div className="dialog-header"><div><p className="eyebrow">Know-unknown</p><h2 id="panel-title">{panel && panelTitle[panel]}</h2></div><button className="close" disabled={busy} onClick={close} aria-label="关闭">×</button></div>
      {panel === 'write' && <form onSubmit={save}><div className="kind-picker" role="group" aria-label="记录类型"><button type="button" aria-pressed={kind === 'personal'} onClick={() => setKind('personal')}>我知道</button><button type="button" aria-pressed={kind === 'known_unknown'} onClick={() => setKind('known_unknown')}>我还不知道</button></div><label htmlFor="note">{kind === 'personal' ? '记下一件你知道的事' : '记下一件你还不明白的事'}</label><textarea id="note" autoFocus value={text} maxLength={MAX_TEXT} disabled={busy} onChange={e => setText(e.target.value)} placeholder={kind === 'personal' ? '一点知识、一个想法、一次感受，都可以。' : '例如：我还不明白，为什么开会前总是紧张。'}/><div className="editor-bottom"><span>{text.length} / {MAX_TEXT}</span><button className="primary" disabled={busy || !text.trim()}>{busy ? '保存中…' : '保存到本机'}</button></div><p className="hint" aria-live="polite">保存到：{kind === 'known_unknown' ? quadrantLabels.upper_left : quadrantLabels.lower_right}。由你决定归类，保存不等于 AI 理解。</p></form>}
      {(panel === 'inbox' || panel === 'shared' || panel === 'gaps') && <div><p className="panel-description">{panel === 'inbox' ? '这些记录已存好，AI 尚未理解。' : panel === 'shared' ? '这里的原文与理解建议只读。确认代表你认可这一次理解。' : '只展示你主动记录的未知与困惑，不替你判断。'}</p>{panel === 'inbox' && questionPrompt}{groups[panel].length ? [...groups[panel]].reverse().map(recordView) : <div className="empty"><span>○</span><h3>{panel === 'shared' ? '共同认知，慢慢形成' : panel === 'gaps' ? '好奇心还未落笔' : '这里还没有记录'}</h3><p>{panel === 'shared' ? '接入模型并核对理解后，记录会出现在这里。' : '从右下角记下一件小事就好。'}</p></div>}{panel !== 'shared' && <button className="primary full" onClick={() => write(undefined, panel === 'gaps' ? 'known_unknown' : 'personal', panel === 'gaps' ? 'upper_left' : 'record_list')}>记一笔</button>}</div>}
      {panel === 'settings' && <div className="settings"><section><h3>应用版本 {APP_VERSION}</h3><p>数据格式 {archive?.schemaVersion ?? '…'} · 更新应用会保留本机已保存记录。</p><div className="record-actions"><button disabled={busy || update.checking || update.applying} onClick={() => void checkForUpdates()}>{update.checking ? '检查中…' : '检查更新'}</button>{update.available && <button disabled={busy || update.applying} onClick={updateApp}>{update.applying ? '更新中…' : '更新应用'}</button>}</div><p role="status">{update.message}</p></section><section><h3>你的记录，留在你的设备上</h3><p>首版没有账号、云同步或真实模型。资料保存在当前浏览器，未作应用级加密。不同浏览器不会自动共享。</p><p>清理站点、隐私浏览或设备空间不足可能导致资料丢失。建议定期导出；导出文件为明文，请妥善保存。</p></section><div className="data-actions"><button disabled={busy || !archive} onClick={() => void download()}>导出 JSON · {records.length} 条</button><label className="file-button">从 JSON 恢复<input type="file" accept=".json,application/json" disabled={busy || !archive} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void restore(file); }}/></label><button disabled={busy} onClick={() => void run(async () => { if (!navigator.storage?.persist) throw new Error('当前浏览器不支持请求持久保存'); const granted = await navigator.storage.persist(); if (!granted) throw new Error('浏览器尚未授予持久保存，请继续定期导出'); }, '浏览器已允许持久保存，仍建议定期导出。')}>请求浏览器保留资料</button></div><section><h3>关于 AI</h3><p>当前不收集 API Key、不发送记录。未来支持自填模型 Key 或可选本地模型；只有你主动要求理解时，才发送选中的记录。</p></section><button className="danger text-button" disabled={busy || !archive} onClick={() => { if (window.confirm('清空全部记录与跳过的问题？此操作无法撤销，建议先导出。')) void run(() => repository.clear(), '本机个人资料已清空。'); }}>清空本机全部资料</button></div>}
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
    </dialog>
  </main>;
}
