# 知不知 · Know-unknown

一个手机优先、离线可用的极简认知记录工具。知识、经历与感受放在同一个四象限中，无需分类。采用「动态认知状态底层逻辑 + 极简四象限交互」。当前版本 0.1.0 是可运行的本地 MVP 骨架，不含真实模型、账号或云服务。

## 本地启动

需要 Node.js 22.12+、npm，推荐 Node 24。

```sh
npm ci
npm run dev
```

打开终端显示的 localhost 地址。开发模式支持记录，但不会缓存开发资源。验证完整离线体验请运行生产预览：

```sh
npm run build
npm run preview -- --port 4173
```

打开 http://127.0.0.1:4173 ，等待「已可离线使用」出现，再断网并刷新。固定使用相同地址与端口，不同来源有各自的数据。手机本机 localhost 与电脑 localhost 是不同设备；同一局域网的 HTTP 地址可以看页面，但不能证明 PWA 离线能力。正式手机体验需要 HTTPS 托管；GitHub Pages 发布准备见下文。

## 已有交互

- 打开即四象限，连续实线坐标轴延伸到卡片外侧，纵轴长于横轴，四端标注与卡片独立留白，优先适配手机竖屏。左下抽象留白；右下点击输入、保存。
- 标题为「知不知」，英文名「Know-unknown」，只有一个页面和统一记录入口，不再选择知识型或感受型。
- 右下记录知识、经历、想法或感受；「我知道」保存在待理解队列，「我还不知道」用于主动记下的未知或困惑，显示左上。
- 原来知识型、感受型和待分类记录统一显示，原文、理解建议与确认状态保留。不再显示分类、归类操作或待分类队列。
- 点击右下方「待理解记录」回看已保存内容；左上与右上仅浏览原文和模型结果，不提供原地编辑。
- 模型结果到达后才能成为右上「待确认」；用户确认后才是「已确认」，可退回。首版默认无模型，因此这条路径由测试 adapter 验证，界面不伪造理解。
- 本地问题提示放在「待理解记录」内，首页只保留四象限和必要操作；提示可跳过；点击「记一笔」回答会保存新记录并同时跳过问题。无模型提示明确标注「非 AI 观察」。
- 数据与隐私：JSON 导出包含全部记录，校验后全量恢复、单条删除、全部清空、请求浏览器持久保存。当前归档 schemaVersion=3，可读 v1/v2 归档；旧分类字段在统一视图中不再使用，记录内容与理解证据完整保留。

**保存 ≠ AI 理解建议 ≠ 用户确认。** 数据库里的 `understood` 仅表示模型提供了可核对摘要，不能证明模型真正理解。没有模型时所有新记录保持 `pending`，仍可完整使用记录、离线和导出。

## 架构与工程决策

[工程决策记录](docs/architecture.md) 是产品默认假设和架构依据；[实施清单与交接](docs/next-steps.md) 列出后续顺序；[验证记录](docs/verification.md) 区分自动化与未完成的设备验收。

```text
React 页面
 ├─ 领域模型：状态迁移 / 象限投影 / 运行时校验
 ├─ Repository 接口 → IndexedDB 事务
 └─ AIService → AIAdapter → NoAIAdapter（默认）
```

没有后端、向量库、复杂状态框架或本地大模型下载。只储存进入个人记录范围的信息。当前 PWA 优先快速验证手机操作；原生包和设备密钥安全存储在确有需求后再评估。

## 测试

```sh
npm test
npm run build
npm run test:e2e
# 或一次运行所有检查
npm run check
```

浏览器测试默认使用已安装的 Google Chrome。若环境没有 Chrome，可以运行 `npx playwright install chromium`，并将 playwright.config.ts 的 `channel: 'chrome'` 删除。浏览器测试使用独立浏览器资料，不读取日常 Chrome 中的数据。

单元测试覆盖认知状态约束、无模型、错误/取消、归档校验、事务失败、并发新增和迟到模型结果；浏览器测试覆盖移动布局、存储失败保留输入、离线重开、只读浏览、导出恢复与确认/撤回。测试中的 fake adapter 和测试注入记录不进入生产 UI。

## 隐私与数据限制

应用没有追踪、远程字体或默认模型请求。个人数据保存在当前来源的 IndexedDB，未做应用级加密。浏览器清理/回收、隐私浏览和设备故障可能丢失数据；导出 JSON 是明文备份。恢复会替换本机所有资料，不是云同步或多端合并。

未来 Key 只在用户选择模型后收集，默认仅内存保存，绝不进入 Git、归档、构建变量或日志。目前没有 Key 输入框，也没有共享代理。离线缓存仅包括静态应用资源，不缓存私人记录/API 请求。Service Worker 更新等待旧页面关闭，不会强制刷新正在编辑的页面。

## 项目状态

源代码仓库为 [ZHERLOCK0213/Know-unknown](https://github.com/ZHERLOCK0213/Know-unknown)。已完成命名与 Pages 发布配置；发布状态和实际证据见 [部署记录](docs/deployment.md) 与 [验证记录](docs/verification.md)。手机真机添加主屏幕、iOS 键盘/安全区域和无障碍读屏仍需单独验收。


## GitHub Pages 与 iPhone 安装

发布流程见 [部署和手机验收](docs/deployment.md)。工作流：`.github/workflows/pages.yml`，推送 main 后运行单元测试并构建、发布。GitHub 仓库 Settings → Pages → Source 需要选择 GitHub Actions，且账号必须支持该仓库可见性对应的 Pages 功能。

Pages 地址：`https://zherlock0213.github.io/Know-unknown/`。部署是否成功以 Actions 和部署记录为准。

本地复现相同子路径：

```sh
APP_BASE_PATH=/Know-unknown/ npm run build
APP_BASE_PATH=/Know-unknown/ npm run test:e2e
npm run preview -- --port 4173
```

浏览器访问 `http://127.0.0.1:4173/Know-unknown/`。不设置 APP_BASE_PATH 时仍在根路径开发和预览。修改部署路径必须同步核对资源、Manifest 的 start_url/scope/id、Service Worker 注册和离线导航回退。

正式网址可用后：iPhone Safari 打开 → 分享 → 添加到主屏幕 → 从主屏幕重新打开 → 等待「已可离线使用」 → 飞行模式新建记录并重开确认。Mac 本机资料需要先导出，再在 iPhone 安装后的应用里导入；两个设备不会自动同步。

命名更新保留旧 IndexedDB 名称 `cognitive-quadrants-v1`，防止同一来源的旧记录因改名而丢失；导出文件采用 know-unknown 前缀，归档内容格式仍为 v3。
