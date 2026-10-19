# 部署指南

知不知是静态 PWA，无需应用后端。正式站点：[知不知 · Know-unknown](https://zherlock0213.github.io/Know-unknown/)。

最近发布：应用提交 dbdb17c，[构建与部署](https://github.com/ZHERLOCK0213/Know-unknown/actions/runs/39218141213) 成功。正式站点已验证 schema v4 象限来源导出和离线重开。iPhone 真机更新与旧记录调整仍需设备上验收。

## GitHub Pages

仓库包含 [.github/workflows/pages.yml](../.github/workflows/pages.yml)。

1. 确认仓库及账号支持 GitHub Pages，在 Settings → Pages 中将 Source 选择为 GitHub Actions。
2. 推送到 main，或在 Actions 中手动运行发布工作流。
3. 工作流安装锁定依赖、运行单元测试并构建，随后发布 dist。
4. 在 Actions 中确认构建和部署均成功，再访问部署生成的网址。

仓库源代码和静态资源参与发布；浏览器中的个人记录不在仓库或部署包内。不要提交依赖目录、构建产物、个人备份、密钥或登录凭据。

## 部署路径

当前项目路径为 /Know-unknown/，工作流通过 APP_BASE_PATH 设置。该值统一控制资源前缀、Manifest 的 id/start_url/scope、Service Worker scope 与离线导航回退。

本地复现：

```sh
npm ci
npm test
APP_BASE_PATH=/Know-unknown/ npm run build
APP_BASE_PATH=/Know-unknown/ npm run test:e2e
APP_BASE_PATH=/Know-unknown/ npm run preview -- --port 4173
```

访问 `http://127.0.0.1:4173/Know-unknown/`。浏览器验收默认使用本机 Google Chrome。

部署到其他仓库子路径时，修改工作流中的 APP_BASE_PATH；值必须以 / 开头和结尾。部署在域名根目录时使用 /，也是不设置此变量时的默认值。路径变化后需核对所有静态资源和离线刷新。

正式离线使用需要 HTTPS；localhost 可用于本地验证，普通局域网 HTTP 地址不能验证 Service Worker 离线能力。

## 发布后验收

- 首页、Manifest、图标、sw.js 及脚本样式可访问，资源路径正确。
- 等待「已可离线使用」，关闭页面后断网重新打开，应用仍能加载。
- 离线新建记录，关闭重开后仍能读取。
- 记录仍为待理解，不因保存而自动变成模型已理解。
- 导出、恢复和删除可用；恢复操作明确提示替换资料。
- 手机竖屏下坐标轴、标注、记录弹窗和保存按钮无相互遮挡。
- 更新不会强制刷新正在编辑的页面。

## iPhone 与数据迁移

用 Safari 打开正式站点 → 分享 → 添加到主屏幕 → 从图标重新打开，等待离线就绪后再测试飞行模式。

不同设备、浏览器和站点来源各自保存资料。部署网页不会搬迁本机记录；从本地预览切换到正式站点时，需要手动导出并恢复。导出文件是明文，恢复会替换目标浏览器的全部资料。

当前版本没有真实模型。浏览器自动化的离线验证不等于 iPhone Safari 真机验收，具体证据和未验证事项见 [验证记录](verification.md)。
