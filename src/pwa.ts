import { registerSW } from 'virtual:pwa-register';

export const APP_VERSION = '0.1.2';
type UpdateState = { available: boolean; checking: boolean; applying: boolean; message: string };
let state: UpdateState = { available: false, checking: false, applying: false, message: '' };
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | undefined;
let activated = false;
let started = false;
let reloading = false;
let applyTimer: ReturnType<typeof setTimeout> | undefined;
function publish(patch: Partial<UpdateState>) { state = { ...state, ...patch }; listeners.forEach(listener => listener()); }
export const getUpdateState = () => state;
export function subscribeUpdates(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function available() { publish({ available: true, message: '新版已就绪，保存记录后可更新。' }); }
function controllerChanged() {
  activated = true;
  if (state.applying) {
    clearTimeout(applyTimer);
    if (!reloading) { reloading = true; window.location.reload(); }
  }
  else available(); // Another window may activate a worker. Never reload this editor automatically.
}
function observeWorker(worker: ServiceWorker) {
  const changed = () => {
    if (worker.state === 'installed' && registration?.waiting && navigator.serviceWorker.controller) available();
    if (worker.state === 'redundant') publish({ message: '新版缓存未完成，请联网后重试。' });
  };
  worker.addEventListener('statechange', changed);
  changed();
}
export function startUpdates() {
  if (started || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  started = true;
  registerSW({
    onNeedRefresh: available,
    onNeedReload: controllerChanged,
    onOfflineReady: () => window.dispatchEvent(new Event('cq-offline-ready')),
    onRegisterError: () => window.dispatchEvent(new Event('cq-offline-error')),
    onRegisteredSW: (_url, value) => {
      registration = value;
      if (!value) return;
      if (value.waiting) available();
      if (value.installing) observeWorker(value.installing);
      value.addEventListener('updatefound', () => { if (value.installing) observeWorker(value.installing); });
      // Native listener also covers workers installed by another tab after Workbox's heuristic window.
      let previous = navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        const next = navigator.serviceWorker.controller;
        if (previous && next !== previous) controllerChanged();
        previous = next;
      });
    },
  });
  let lastCheck = 0;
  const checkWhenVisible = () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - lastCheck < 60_000) return;
    lastCheck = Date.now(); void checkForUpdates();
  };
  document.addEventListener('visibilitychange', checkWhenVisible);
  window.addEventListener('online', checkWhenVisible);
}
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('检查超时')), 15_000);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
export async function checkForUpdates() {
  if (state.checking || state.applying) return;
  if (!navigator.onLine) { publish({ message: '当前离线，联网后再检查更新。' }); return; }
  if (!registration) { publish({ message: '离线应用尚未就绪，请稍后重试。' }); return; }
  publish({ checking: true, message: '正在检查更新…' });
  try {
    await withTimeout(registration.update());
    const worker = registration.installing;
    if (worker) await withTimeout(new Promise<void>((resolve, reject) => {
      const changed = () => {
        if (worker.state === 'redundant') { worker.removeEventListener('statechange', changed); reject(new Error('缓存失败')); }
        else if (worker.state === 'installed' || worker.state === 'activated') { worker.removeEventListener('statechange', changed); resolve(); }
      };
      worker.addEventListener('statechange', changed); changed();
    }));
    if (registration.waiting || activated) available();
    else publish({ message: '本次检查未发现新版本。' });
  } catch { publish({ message: '未能完成更新检查，请联网后重试；本机记录仍可使用。' }); }
  finally { publish({ checking: false }); }
}
// The caller must hold the same mutation lock as save/restore before invoking this.
export function applyUpdate(): boolean {
  if (!state.available || state.applying) return false;
  if (activated) { window.location.reload(); return true; }
  const worker = registration?.waiting;
  if (!worker) { publish({ message: '新版尚未就绪，请重新检查。' }); return false; }
  publish({ applying: true, message: '正在更新应用…' });
  applyTimer = setTimeout(() => publish({ applying: false, message: '更新尚未完成，请稍后重试。' }), 15_000);
  worker.postMessage({ type: 'SKIP_WAITING' });
  return true;
}
