# 知不知 · Know-unknown 工程决策记录

日期：2026-10-19。状态：已采纳的 MVP 默认假设，可在产品验证后调整。

## ADR-001 目标、范围与默认假设

采用用户确认的「方案 B 动态认知状态底层逻辑 + 方案 A 极简交互」。打开即四象限；横轴左我不知道、右我知道；纵轴上 AI 知道、下 AI 不知道。只讨论已进入个人记录范围的信息，不展示模型的整个知识库。

目标：3 次操作内离线记录；严格区分落盘、模型理解建议与用户确认；随时导出、恢复和删除个人数据。右下是唯一记录入口，可选择「我知道 / 我还不知道」；知识、感受与经历统一输入，后者明确声明已知未知。右上、左上内容只读，确认/退回是状态动作，不允许静默修改原文。左下不生成虚假的未知条目。问题可跳过，回答使用同一个记录入口。

2026-10-19 首页交互调整（用户明确要求）：横纵轴连续实线，纵轴长于横轴，按手机竖屏布局；去掉顶部引导文案及底部口号。问题提示移入待理解记录，首页只保留四象限与必要操作。

默认假设：

1. 第一版为手机优先 PWA，可添加到主屏幕；不承诺 App Store 原生包。使用简体中文。
2. **刚保存的个人记录留在右下的待理解队列**；AI 产生可复核摘要后进入右上（待确认），用户确认后才叫共同认知。这里对「保存后进入共同认知流程」作语义保守解释，避免坐标图错误宣称 AI 已知。
3. 用户主动声明的「我还不会」直接显示左上，但没有模型时知识栏明确为空，不表示 AI 已知答案；左上标题增加状态解释。不会推断用户不知道什么。
4. 无模型首版仅提供标明来源的、本地规则提示，不伪装成 AI 观察。已读不代表已理解，用户确认也不是客观真理。
5. 不预装示例私人记忆。一个浏览器来源是一份本地资料；主页面只有一个四象限，不区分知识与感受，旧 URL 的 category 参数自动移除，无路由库、账户、登录。

非目标：数字分身、自动监听/抓取、人格评分、向量库、RAG、多代理、聊天界面、团队协作、云同步、计费、内置大模型、自动生成未知的未知、证明模型真正理解人类。

## ADR-002 技术栈取舍

React + TypeScript + Vite；浏览器 IndexedDB；轻量自制仓储接口；vite-plugin-pwa 生成静态资源预缓存；Vitest + fake-indexeddb 进行领域/存储测试；Playwright 进行生产包浏览器测试。

| 选择 | 取舍 |
|---|---|
| PWA（采纳） | 单仓库、直接在 iOS/Android/桌面浏览器使用，离线记录足够；浏览器可能回收数据，后台任务能力受限 |
| Expo / React Native（延后） | 原生密钥安全存储、上架更适合后续，但首版会增加构建、设备适配与存储分支 |
| Flutter（未采纳） | 跨平台可行；当前无原生能力需求，引入 Dart 与原生构建不必要 |
| SQLite / 后端（延后） | 当前文本数据规模用 IndexedDB 足够。换存储只实现 Repository；不引入 ORM |

开发使用 Node 22.12+（本轮 Node 24）。具体依赖由 package-lock.json 固定。PWA 首次成功加载并缓存后才能离线重开；HTTPS 或 localhost 才能注册 Service Worker。参考 [Vite 官方](https://vite.dev/guide/)、[MDN Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)。

## ADR-003 状态机与四象限投影

记录具有独立的 kind 与认知状态，不持久化象限编号；象限由状态投影。不会用布尔 aiKnows 冒充认知证明。

```mermaid
stateDiagram-v2
  [*] --> pending: 本地事务提交
  pending --> understood: 显式请求模型 + 有效结构化结果
  understood --> confirmed: 用户确认本次理解
  understood --> pending: 用户退回
  confirmed --> pending: 用户撤回确认并要求重理解
```

- pending：已保存，AI 尚未给出理解。无模型、取消、超时、网络失败均保留该状态。
- understood：模型已返回理解建议，**不表示客观上真正理解**；UI 写「待确认」。只有有 provider、model、生成时间与非空摘要的结果才允许转入。
- confirmed：用户确认了该版本的摘要，UI 写「已确认」；撤回会删除旧建议，回 pending。
- 我知道（personal）：pending → 右下；understood/confirmed → 右上。
- 我不知道（known_unknown）：用户显式声明 → 左上；无模型显示「知识待补充」。模型结果只是知识建议，不自动表示用户已学会；学会/迁移到右上延后。
- 左下为空的概念区域。AI 不能凭空枚举双方未知。
- 处理期间是短暂 UI busy，不保存 processing；刷新后不出现卡死的 processing。
- 保存状态与认知状态正交：UI 只在 IndexedDB transaction complete 后显示保存成功。拒绝空输入，最多 4000 字。失败保留输入，可重试。

## ADR-004 数据结构与约束

详见 src/domain.ts 的可执行类型与校验。当前导出格式 schemaVersion=3，兼容读取 v1/v2；旧库中的知识、感受、待分类及缺失分类字段记录统一归一化，不再区分类别：

- Record：id、revision（每次变更的随机版本标记）、kind（personal/known_unknown）、text、status、createdAt、updatedAt、可选 analysis。
- Analysis：summary、provider、model、generatedAt、可选 question；这是模型推断，原文始终不被覆盖。known_unknown 的 summary 是相关知识建议。
- Question：由记录中的 analysis.question 派生；无模型仅使用稳定 id 的本地通用提示；跳过 id 持久化，回答保存为新记录并跳过原问题。
- Archive：schemaVersion、exportedAt、records、skippedQuestionIds。无 Key、设备标识或隐藏模型设置。

不采用事件溯源。导出/恢复与每次字段变更都进行运行时校验；除 v1/v2→v3 明确兼容路径外，未知版本拒绝。v2 归档先验证旧 category 有效，再移除这一字段；v3 不包含分类。导入是原子替换，UI 明确二次确认；失败不改变原档案；10MB 文件上限。重复 id、非法状态、无证据的 confirmed 都拒绝。模型内容只能以 React 纯文本展示，不渲染 HTML。

## ADR-005 存储层、隐私与可迁移性

Repository.read / add / update / skip / replace / clear 提供事务边界。IndexedDB 一个 records store + meta store；单条写入事务读取当前值、再变更，不用全量旧快照覆盖其他标签页。事务完成后再更新 UI；广播变更供其他标签页重读，页面恢复可见时也重读。

本地数据不出设备；没有分析 SDK、追踪、外部字体或默认联网请求。浏览器数据库未做应用级加密；同一设备/来源访问者可能读取。清除站点数据、隐私模式、空间回收会导致数据丢失，JSON 导出为明文。可在设置请求持久存储，但浏览器可以拒绝，不能承诺永久保留。用户可删除单条或清空全部个人数据。

手工导出/导入 JSON 是首版跨设备迁移方式。导出只包含归档内容。导入先解析验证，再提示替换本机数据；不信任外部文件中的任何文本指令。

## ADR-006 AI adapter 与信任边界

AIAdapter.analyze(record, signal) → Analysis | null。NoAIAdapter 是运行时默认实现，返回 null、不发请求。AIService 仅接受有效结果；错误不改变 pending；只给选中的一条原文，不默认发送所有记忆。

本轮实现 NoAIAdapter、服务编排边界和测试用 fake adapter。**不实现真实远程模型、不实现本地推理，界面也不收集 Key**。模型不可用时理解按钮禁用；不能用规则或回声摘要标记 understood。

后续远程 adapter：用户显式选择 provider/endpoint/model，在每次提交前能看到要发送的记录；Key 默认只在内存、永不进入归档/日志/Git。浏览器 API 受 CORS 影响；需要代理时由用户自行部署，不内置共享中转。原生包装阶段改用 Keychain/Keystore。禁止把 Key 写入 VITE_* 构建环境变量。网络设置单独校验 HTTPS/localhost，模型响应为不可信数据；无工具调用/任意代码执行。

后续本地 adapter：同一接口，对模型下载量、设备内存、响应时间和许可做真实验证；绝不宣称已内置轻量模型。远程分析需 timeout + AbortSignal，不自动批量发送、不在后台重试。模型生成问题必须关联记录，能跳过；不构造人格缺陷判断。

## ADR-007 离线、同步与并发

首版 local-only，**无云同步或后台 AI 队列**。离线与无模型不会阻止保存、读取、导出、跳过和删除。Service Worker 仅缓存同源静态 GET 资源，不缓存 API 请求/Key/私人文本；更新等待旧窗口关闭，避免编辑中强制刷新。

IndexedDB 事务串行化写入；记录 revision 是内容版本标记，AIService 提交理解时校验当前记录仍是发起时的 pending 版本，删除/撤回/重导入后迟到的结果不得回写。跨设备只支持用户确认的全量恢复，不声称合并或自动冲突解决。将来云同步需新增版本号、墓碑、冲突副本与端到端加密决策，不能把当前导入当同步协议。

## ADR-008 代码层次与验证

UI → Repository / AIService → 领域状态机；IndexedDB 和模型为边界适配器。无 Redux、后端、DI 容器。

```text
src/domain.ts              类型、状态迁移、导入校验、象限投影
src/storage.ts             IndexedDB 仓储 / 事务
src/ai.ts                  NoAIAdapter / AIService
src/App.tsx + styles.css    四象限、记录、只读浏览、数据设置
```

验收优先：无模型不会进入 understood；确认必须有摘要证据；保存失败不丢输入；刷新仍在；导出恢复不丢数据；并发新增不覆盖；离线冷重开；360px 宽无横向溢出；左上右上无编辑器；跳过问题不再提示。自动化证据写入 docs/verification.md，真机手动验收另列。


## ADR-009 · 统一四象限（替代双导航设计）

用户最新决定：取消知识型与感受型的区分，降低输入负担。本条替代此前双导航的决策；历史验证记录仅记录当时的结果。

- 标题现为「知不知 / Know-unknown」（原型阶段为「你和AI的认知四象限」），没有分类导航、分类控件或待分类入口。
- 新记录没有 category 字段。所有已保存记录按 kind 与认知状态投影到同一个四象限，不以知识/感受过滤。
- 原有数据库名与对象仓库保持不变，读取所有旧记录并规范化；保留原文、id、revision、时间、状态、模型建议、来源和用户确认。读取不会清空或重建数据库。
- 新归档为 schemaVersion=3。v1/v2 归档在完整校验后统一恢复，v2 的旧分类元数据在规范化后不再使用，不丢弃任何记录。已有本地提示的跳过状态从旧 id 映射到统一 id；模型问题保留原标识和来源。
- 保存、AI 理解建议与用户确认仍严格区分。通用知识不是关于用户的事实，感受也不能被推断为客观能力；统一展示不自动认可任何模型推断。
- 当前仍只有 NoAIAdapter，默认只传选中的原文给未来 adapter；合并界面不等于实现了模型长期记忆或跨记录推理，也不授权自动上传整个数据库。

## ADR-010 · 轴线与标注的布局边界

用户截图暴露旧 `aspect-ratio + max-height` 外壳与 `height:100%` 子网格在受限高度/放大显示时可能不一致，卡片溢出，导致轴线过短、标注与底部状态被覆盖。

- 外壳使用明确的响应式 height。网格通过 absolute inset 在同一坐标区域内定位，不再依赖百分比高度与自动比例之间的循环计算。
- 网格上/下保留 52px、横纵轴两端留 24px，因此纵轴比卡片范围上下各延伸 28px。横轴横贯外壳，也延伸到左右卡片边缘之外。
- 中央横向间隔 44px、纵向间隔 36px，四端标注及状态区域不与任何卡片相交。
- 短屏保持最小可读高度，允许页面纵向滚动，避免硬压缩卡片；纵轴仍长于横轴。
- 浏览器验收检查实际几何关系：轴线越过卡片、卡片不与标注/状态相交、卡片子内容无溢出，并覆盖窄屏、短屏、150%/200% CSS 放大。


## ADR-011 · 正式名称与 GitHub Pages 路径

用户指定应用中文名「知不知」，英文名「Know-unknown」，仓库为 `ZHERLOCK0213/Know-unknown`。页面标题、浏览器标题、PWA Manifest、iPhone 主屏幕名称、导出文件名前缀与包名同步更新。旧 IndexedDB 名称保留，不更换本地资料库。

- Pages 构建通过 APP_BASE_PATH=/Know-unknown/ 设置 Vite base、Manifest id/start_url/scope、Service Worker scope 和离线导航回退；本地开发默认根路径。
- iPhone 图标使用同一前缀的 apple-touch-icon；应用资源不引用其他仓库路径。
- 发布工作流仅上传 dist，依赖锁定，CI 先跑测试与构建；部署权限仅 deploy job 获取。GitHub Actions 版本固定到官方示例中的完整 SHA。
- main 推送及手动 workflow_dispatch 触发部署。需要用户仓库权限和 Pages 的 GitHub Actions Source；私有仓库的 Pages 资格以账号实际设置为准，不能擅自公开源码。
- 不向先前未发布的 Sites 站点继续上传；旧工作目录在 work/ 中，Git 忽略。目标已切换为用户指定的 GitHub 仓库。
- 当前仅为静态离线记录工具，GitHub Pages 不提供 Codex 订阅推理或后端。AI 接入是后续独立任务。
