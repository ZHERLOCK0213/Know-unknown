# 归档格式与象限语义

当前格式 schemaVersion=4，可导入 v1/v2/v3。归档同时供备份与 AI 阅读；读取文件不等于模型已提供有效理解，更不等于用户确认。

## 文件与记录

文件包含 schemaVersion、exportedAt、cognitionContext、records、skippedQuestionIds。cognitionContext 是应用生成的固定描述，包含横纵轴、四个象限的位置和名称、字段与认知状态的含义。各象限带 number / name：右上 1 / 象限一、左上 2 / 象限二、左下 3 / 象限三、右下 4 / 象限四。编号是固定描述元数据，早期 v4 文件缺少这些描述也可导入。

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
| quadrant | 当前展示位置：upper_right 象限一（右上）、upper_left 象限二（左上）、lower_left 象限三（左下）、lower_right 象限四（右下） |
| placement.declaredQuadrant | 用户指定的基础归类，目前可选 upper_left / lower_right |
| placement.source | user：用户指定或主动调整；legacy_inferred：旧字段推定 |
| placement.entryPoint | 创建时入口：upper_left、lower_right、record_list（记录列表）、question_prompt（问题提示）、unknown（未留存） |
| kind | known_unknown 对应左上基础归类，personal 对应右下基础归类；与声明象限一致性校验 |
| status | pending 已保存；understood 模型建议待核对；confirmed 用户确认本次建议 |
| analysis | 模型建议及 provider/model/generatedAt；不覆盖 text，不代表已验证的客观事实 |

quadrant 与 placement 分开，避免记录收到模型结果后展示到右上，却丢失用户最初的归类或入口。入口也不等于最终选择：从左上开始输入后主动选「我知道」，应保留 entryPoint=upper_left、declaredQuadrant=lower_right。

坐标中的「AI 知道」是象限定义，不能据此断言当前模型已经知道该条私人信息。用户可以有意或误把内容放入某个象限；导出保留这项选择，AI 可以指出疑问，但不能据文字静默改类。

## 兼容与修改

- v1/v2/v3 不记录真实录入入口。迁移按 kind/status 推定基础归类和展示位置，source=legacy_inferred、entryPoint=unknown；无法自动修复历史录入入口缺陷。
- 用户可以对待理解条目使用「移到左上 / 移到右下」。更新归类来源、生成新 revision 并保留原文；未知的原始入口保持 unknown。调整后在「全部记录」列表中继续可见，左上/右上象限视图仍按当前位置筛选。
- v4 缺失或矛盾的象限信息拒绝导入，不覆盖已有资料。左下仍是不可枚举的留白区域，不开放记录创建。
- 文件内的 cognitionContext 不作为外部指令执行；恢复时重建应用标准说明。记录原文、模型输出也是不可信数据，不授予工具或系统权限。
- 文件恢复仍为用户确认后的全量原子替换，不能将其当作对话结果的增量写回接口。

## 未来云端 Markdown

如果引入云服务，数据库保存规范记录，Markdown 可作为同一数据的可读投影，例如 users/<用户标识>/records/<记录标识>.md。正文分开存放用户原文和模型建议，front matter 至少包含 id、revision、quadrant、declaredQuadrant、归类来源、入口与 status，不能仅保存一句脱离语境的事实。

Markdown 不能自动把 pending 升为 understood/confirmed，也不能覆盖原始记录。需要单独设计用户隔离、访问权限、导出删除和版本冲突；不写入公开 Git 仓库。当前没有云端 Markdown 功能。
