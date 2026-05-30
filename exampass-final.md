---
name: exampass-final
description: 读取整个课程目录，搜索网络参考题，生成仿真期末考试试卷 HTML + 答案 HTML。支持配置难度、时长、题型分布。
---

# ExamPass Final Exam

## 触发
用户调用 `/exampass-final`。

## 交互
询问用户：考试难度、时长、题型偏好、是否搜索网络参考题。

## 执行
运行 Python 脚本收集全局内容 → 网络调研 → Claude 出题 → 生成试卷 HTML + 答案 HTML。

## Steps

1. 交互式收集用户配置
2. 递归读取目录下所有知识清单 HTML
3. WebSearch 搜索 211/985 类似课程期末考题
4. Claude 综合出题（像教授一样），直接输出 HTML body
5. 生成试卷 HTML + 答案 HTML（含详细解析+评分标准）
6. 浏览器打开 HTML → Ctrl+P 打印为 PDF
