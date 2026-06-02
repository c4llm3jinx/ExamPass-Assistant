---
name: exampass-update
description: 一键更新 ExamPass Assistant 到最新版本。
---

# ExamPass Update

> 更新逻辑由 `SKILL.md` 中的「技能更新」章节实现，通过 `/exampass update` 调用。
> 该流程自动处理脏工作树（stash）、网络检测、冲突恢复和依赖安装。

## 使用方式

```
/exampass update
```

## 更新流程

1. 定位技能仓库 `$env:USERPROFILE\.claude\skills\exampass`
2. 获取远程更新并显示落后 commits
3. 自动 stash 本地修改（如有）
4. 拉取最新代码
5. 自动恢复本地修改（冲突时给出指引）
6. 安装/更新 Python 依赖
7. 显示更新摘要

详情见 `SKILL.md` 中的 `## 技能更新` 章节。
