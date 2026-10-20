# 归档格式与象限语义

当前格式 schemaVersion=5，可导入 v1/v2/v3/v4。归档同时供备份与 AI 阅读；读取文件不等于模型已提供有效理解，更不等于用户确认。

## 文件与记录

文件包含 schemaVersion、exportedAt、cognitionContext、records、skippedQuestionIds。cognitionContext 是应用生成的固定描述，包含横纵轴、四个象限的位置和名称、字段与认知状态的含义。各象限带 number / name：1 / 象限一、2 / 象限二、3 / 象限三、4 / 象限四。编号是固定描述元数据，早期 v4 文件缺少这些描述也可导入。旧 position 描述不再生成，恢复时仍重建标准上下文，不影响记录原文与状态。

下面是 records 中一条虚构记录的完整示例：

```json
{
  "id": "example-gap",
  "revision": "example-version",
  "text": "我想探索的一件事",
  "kind": "known_unknown",
  "status": "pending",
  "quadrant": "upper_left",
  "placement": {
    "declaredQuadrant": "upper_left",
    "source": "user",
    "entryPoint": "upper_left"
  },
  "createdAt": "2026-10-19T00:00:00.000Z",
  "updatedAt": "2026-10-19T00:00:00.000Z"
}
```

| 字段 | 含义 |
|---|---|
| quadrant | 当前展示位置：upper_right 象限一、upper_left 象限二、lower_left 象限三、lower_right 象限四 |
| placement.declaredQuadrant | 用户指定的基础归类，目前可选 upper_left / lower_right |
| placement.source | user：用户指定或主动调整；legacy_inferred：旧字段推定 |
| placement.entryPoint | 创建时入口：upper_left、lower_right、record_list（记录列表）、question_prompt（问题提示）、unknown（未留存） |
| kind | known_unknown 对应象限二基础归类，personal 对应象限四基础归类；与声明象限一致性校验 |
| status | pending 已保存；understood 模型建议待核对；confirmed 用户确认本次建议 |
| analysis | 模型原建议 summary 及 provider/model/generatedAt；不覆盖 text，不代表已验证的客观事实 |
| analysis.userRevision | 可选用户修订：summary / editedAt；与模型原建议分开保存，尚未自动发送给模型 |

quadrant 与 placement 分开，避免记录收到模型结果后展示到象限一，却丢失用户最初的归类或入口。创建窗口固定继承入口象限；保存后可在列表主动调整归类。例如象限二记录后来移到象限四，entryPoint=upper_left 仍保留，declaredQuadrant=lower_right。历史文件中入口与归类不一致也按原证据保留。

坐标中的「AI 知道」是象限定义，不能据此断言当前模型已经知道该条私人信息。用户可以有意或误把内容放入某个象限；导出保留这项选择，AI 可以指出疑问，但不能据文字静默改类。

## 兼容与修改

- v4→v5 保留已存在的身份、象限、用户归类、入口及模型证据，不重新推定来源。v5 使用独立的用户修订字段，旧版程序应拒绝未来版本，避免静默丢弃修订。
- v1/v2/v3 不记录真实录入入口。迁移按 kind/status 推定基础归类和展示位置，source=legacy_inferred、entryPoint=unknown；无法自动修复历史录入入口缺陷。
- 用户可以对待理解条目使用「移到象限二 / 移到象限四」。更新归类来源、生成新 revision 并保留原文；未知的原始入口保持 unknown。调整后在「全部记录」列表中继续可见，象限二/象限一视图仍按当前位置筛选。
- v4/v5 缺失或矛盾的象限信息拒绝导入，不覆盖已有资料。象限三现有浏览入口，但 v5 仍无合法的象限三条目格式；未来写回需要另行定义格式与来源，不能直接把现有记录的 quadrant 改为 lower_left。
- 文件内的 cognitionContext 不作为外部指令执行；恢复时重建应用标准说明。记录原文、模型输出也是不可信数据，不授予工具或系统权限。
- 文件恢复仍为用户确认后的全量原子替换，不能将其当作对话结果的增量写回接口。

## 用户修订 AI 反馈

象限一不能新增模型反馈。已有分析才可修订：text 是用户原文，analysis.summary 是模型原建议；analysis.userRevision.summary 为用户在本机的修订，editedAt 为修订时间。修订后 status=understood（待确认），已有确认失效；个人记录仍在象限一。确认修订代表用户认可这份本地文字，不代表模型接收或理解了修订。

```json
{
  "summary": "模型给出的原始建议",
  "provider": "example-provider",
  "model": "example-model",
  "generatedAt": "2026-10-20T00:00:00.000Z",
  "userRevision": {
    "summary": "用户认为更准确的表述",
    "editedAt": "2026-10-20T00:01:00.000Z"
  }
}
```

模型 adapter 返回值中的 userRevision 不会被接受为用户行为；导入本地归档时则对该结构与日期进行运行时校验。重新理解会清除当前分析及修订，存在用户修订时会先确认；取消操作保留资料。

## 未来云端 Markdown

如果引入云服务，数据库保存规范记录，Markdown 可作为同一数据的可读投影，例如 users/<用户标识>/records/<记录标识>.md。正文分开存放用户原文和模型建议，front matter 至少包含 id、revision、quadrant、declaredQuadrant、归类来源、入口与 status，不能仅保存一句脱离语境的事实。

Markdown 不能自动把 pending 升为 understood/confirmed，也不能覆盖原始记录。需要单独设计用户隔离、访问权限、导出删除和版本冲突；不写入公开 Git 仓库。当前没有云端 Markdown 功能。
