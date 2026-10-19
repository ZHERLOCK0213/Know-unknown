# 知不知 · GitHub 发布与 iPhone 验收

更新：2026-10-19。目标仓库：[ZHERLOCK0213/Know-unknown](https://github.com/ZHERLOCK0213/Know-unknown)。

## 当前状态

应用已改名、配置 GitHub Pages 子路径、构建和离线浏览器验收通过。GitHub CLI 官方网页登录已完成，账号为 ZHERLOCK0213。用户已通过 GitHub Desktop 克隆仓库，已将 29 个项目文件复制并逐字节核对，保留原仓库初始化历史。

原仓库为 Private，创建 Pages 返回 HTTP 422，明确指出当前套餐不支持此仓库。用户明确授权改为 Public 并发布后，已完成公开并成功创建 Pages，build_type=workflow。**当前仍待源码推送和首次部署完成，不能仅凭 Pages 配置成功宣称上线。**

目标网址：`https://zherlock0213.github.io/Know-unknown/`。

后续开发以 GitHub Desktop 中的 Documents/GitHub/Know-unknown 克隆为准；原 AI四象限 工作目录保留为旧工作副本。个人记录位于浏览器 IndexedDB，代码目录复制不会迁移这些资料。

## 需要用户完成

1. 授权与仓库可见性选择已完成，无需再输入之前的一次性验证码。GitHub CLI 来自 cli/cli 官方发行包，并已核对官方 SHA-256 校验值；工具与登录配置不提交。
2. 等待首次 Actions 部署与公网验证完成；GitHub Pages Source 已配置为 GitHub Actions。
3. 发布成功后，用 iPhone Safari 打开正式地址。添加到主屏幕，从图标重新打开并等待离线资源就绪，再开启飞行模式验收。

## 发布步骤

- 确认目标仓库身份、可见性、默认分支和现有内容，不覆盖已有文件或强制推送。
- 上传经检查的应用源码、锁文件和 `.github/workflows/pages.yml`，不上传 work、node_modules、dist、个人 JSON 备份、密钥或登录凭据。
- main 工作流运行单元测试、生产构建并上传 dist；部署 job 使用 Pages/OIDC 权限，固定官方示例 action 的完整 SHA。
- 检查 Actions 终态与 Pages URL，访问正式网址验证标题、Manifest、图标、sw.js 与静态资源响应。只有验证后才记录上线成功。

## 路径配置

APP_BASE_PATH=/Know-unknown/ 影响 Vite 资源路径、Manifest 的 id/start_url/scope、Service Worker scope 与离线回退。主屏幕启动和离线刷新都必须留在 /Know-unknown/，不能跳回 github.io 根站点。

## 手机验收

- 安装后的名称为「知不知」，图标正常，打开显示「知不知 / Know-unknown」。
- 飞行模式下从主屏幕打开，新建记录，关闭后重开仍存在。
- 开启网络后更新不会强制覆盖未保存输入。
- 能导出 JSON、恢复资料与删除；手机与 Mac 的本地资料不会自动同步。
- 真实模型仍未接入；离线新记录只会保持待理解，不能假装 AI 已理解。

## 本轮本地证据

原工作目录：17 项单元测试通过；在 /Know-unknown/ 项目子路径下，5 项浏览器验收通过，包含离线重开、保存、恢复、坐标几何与放大显示。生产包包含完整子路径的 Manifest、图标与 Service Worker。GitHub Desktop 新克隆目录另行安装锁定依赖并验证测试和构建，结果记录在 verification.md。手机真机、GitHub Actions 运行和公网网址尚未验证。

参考：[Vite 静态部署](https://vite.dev/guide/static-deploy)、[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
