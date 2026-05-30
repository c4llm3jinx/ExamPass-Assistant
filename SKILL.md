---
name: exampass
description: 将课程资料（PPT/Word/PDF）按章节生成知识清单和交互式章节测试，帮助高效期末复习。
---

# ExamPass Assistant

## 触发
用户调用 `/exampass`。

## 执行

使用 `scripts/template_engine.py` 直接生成 HTML，**无需 Markdown 或 Pandoc**。

- 知识清单：Claude 生成 HTML body → `save_knowledge_html(body_html, output_path, title)` 套用暖色纸张模板
- 章节测试：`save_test(questions_list, output_path, title, subtitle)` 生成交互式测试页

模板样式在 `templates/base.css` 和 `templates/test.css`。

## Steps

1. 递归扫描当前工作目录，按文件夹分组（一章一组）
2. 每组：提取文字+表格+图片 → Claude 深度分析
3. Claude 直接输出 HTML body（h2/h3/p/table/blockquote/ul/ol，公式用 $$...$$ 和 $...$）
4. 调用 `save_knowledge_html(body_html, output_path, title)` 生成知识清单
5. 调用 `save_test(questions, output_path, title, subtitle)` 生成交互式章节测试
6. 所有输出放在对应章节文件夹下
7. 浏览器打开 HTML → Ctrl+P 打印为 PDF（MathJax 完美渲染公式）
