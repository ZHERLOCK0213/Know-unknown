import { test, expect } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, extname, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

// Serve two real production precaches from the same origin. Only the HTML release marker changes;
// this exercises installation/waiting/activation, not a mocked update event.
const appPath = process.env.APP_BASE_PATH || '/';
let server: Server;
let directory: string;
let fixture: string;
let url: string;
test.beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'know-unknown-updates-'));
  const next = join(fixture, 'next');
  await cp('dist', next, { recursive: true });
  const html = (await readFile(join(next, 'index.html'), 'utf8')).replace('</head>', '<meta name="release-fixture" content="next"></head>');
  await writeFile(join(next, 'index.html'), html);
  const sw = await readFile(join(next, 'sw.js'), 'utf8');
  const revised = sw.replace(/(url:"index.html",revision:")[^"]+/, `$1${createHash('md5').update(html).digest('hex')}`);
  if (sw === revised) throw new Error('Cannot locate production HTML precache revision');
  await writeFile(join(next, 'sw.js'), revised);
  directory = resolve('dist');
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url!, 'http://localhost').pathname;
      if (!pathname.startsWith(appPath)) { res.writeHead(404).end(); return; }
      const file = resolve(directory, pathname.slice(appPath.length) || 'index.html');
      if (!file.startsWith(directory + sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing update test address');
  url = `http://127.0.0.1:${address.port}${appPath}`;
});
test.afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (fixture) await rm(fixture, { recursive: true, force: true });
});
test('真实静态版本升级：等待用户操作、保留另一窗口草稿与本机记录、升级后离线重开', async ({ page, context }) => {
  const errors: string[] = [];
  context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.getByRole('button', { name: /象限二/ }).click();
  await page.getByRole('button', { name: '记录', exact: true }).click();
  await page.getByRole('textbox').fill('升级前象限二测试');
  await page.getByRole('button', { name: '保存到本机', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const editor = await context.newPage();
  await editor.goto(url);
  await editor.getByRole('button', { name: /象限四/ }).click();
  await editor.getByRole('textbox').fill('另一个窗口未保存的草稿');
  directory = join(fixture, 'next');
  await page.getByRole('button', { name: '数据与隐私', exact: true }).click();
  await expect(page.getByRole('heading', { name: '应用版本 0.1.4' })).toBeVisible();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(page.getByRole('button', { name: '更新应用', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  await expect(page.locator('meta[name=release-fixture]')).toHaveCount(0);
  await expect(editor.getByRole('textbox')).toHaveValue('另一个窗口未保存的草稿');
  await page.getByRole('button', { name: '更新应用', exact: true }).click();
  await expect(page.locator('meta[name=release-fixture]')).toHaveAttribute('content', 'next');
  await expect(editor.getByRole('textbox')).toHaveValue('另一个窗口未保存的草稿');
  await expect(editor.locator('meta[name=release-fixture]')).toHaveCount(0);
  await editor.getByRole('button', { name: '保存到本机', exact: true }).click();
  await expect(editor.getByRole('dialog')).not.toBeVisible();
  await expect(editor.getByRole('button', { name: '更新应用', exact: true })).toBeVisible();
  await editor.close();
  await page.getByRole('button', { name: '数据与隐私', exact: true }).click();
  await expect(page.getByRole('button', { name: '导出 JSON · 2 条' })).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON · 2 条' }).click();
  const download = await downloading; const file = await download.path();
  const archive = JSON.parse(await readFile(file!, 'utf8'));
  expect(archive.schemaVersion).toBe(5);
  expect(archive.records.map((r: { quadrant: string }) => r.quadrant).sort()).toEqual(['lower_right', 'upper_left']);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('meta[name=release-fixture]')).toHaveAttribute('content', 'next');
  await page.getByRole('button', { name: '数据与隐私', exact: true }).click();
  await expect(page.getByRole('button', { name: '导出 JSON · 2 条' })).toBeVisible();
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(page.getByText('当前离线，联网后再检查更新。', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
