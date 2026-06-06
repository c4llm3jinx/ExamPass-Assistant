"""Tests for knowledge_graph module."""
import json
import os

import pytest
from knowledge_graph import build_graph_prompt, parse_graph_response, validate_tree_json


def test_build_graph_prompt_contains_text_summary():
    prompt = build_graph_prompt("第一章 深度学习基础\n神经网络概念")
    assert "第一章 深度学习基础" in prompt
    assert "神经网络概念" in prompt
    assert "知识树" in prompt or "tree" in prompt.lower()
    assert "JSON" in prompt


def test_build_graph_prompt_has_schema():
    prompt = build_graph_prompt("test content")
    assert '"id"' in prompt
    assert '"label"' in prompt
    assert '"children"' in prompt
    assert '"summary"' in prompt


def test_build_graph_prompt_empty_content():
    prompt = build_graph_prompt("")
    assert len(prompt) > 0


def test_parse_graph_response_valid_json():
    response = '''```json
{
  "title": "深度学习",
  "nodes": [
    {"id": "n1", "label": "第1章", "summary": "概述", "children": []}
  ]
}
```'''
    result = parse_graph_response(response)
    assert result["title"] == "深度学习"
    assert len(result["nodes"]) == 1
    assert result["nodes"][0]["id"] == "n1"


def test_parse_graph_response_no_code_block():
    response = '{"title": "test", "nodes": []}'
    result = parse_graph_response(response)
    assert result["title"] == "test"


def test_parse_graph_response_invalid_json():
    with pytest.raises(ValueError, match="JSON 解析失败"):
        parse_graph_response("this is not json at all")


def test_parse_graph_response_code_block_no_lang_tag():
    response = '```\n{"title": "t", "nodes": []}\n```'
    result = parse_graph_response(response)
    assert result["title"] == "t"


def test_validate_tree_json_valid():
    data = {
        "title": "课程",
        "nodes": [
            {"id": "n1", "label": "章", "summary": "s", "children": [
                {"id": "n2", "label": "节", "summary": "s2", "children": []}
            ]}
        ]
    }
    validate_tree_json(data)  # should not raise


def test_validate_tree_json_missing_title():
    with pytest.raises(ValueError, match="title"):
        validate_tree_json({"nodes": []})


def test_validate_tree_json_duplicate_ids():
    data = {
        "title": "t",
        "nodes": [
            {"id": "n1", "label": "a", "summary": "s", "children": []},
            {"id": "n1", "label": "b", "summary": "s", "children": []}
        ]
    }
    with pytest.raises(ValueError, match="重复"):
        validate_tree_json(data)


def test_save_graph_html_creates_file(tmp_path):
    from template_engine import save_graph_html

    tree = {
        "title": "测试课程",
        "nodes": [
            {"id": "n1", "label": "第1章", "summary": "概述", "children": [
                {"id": "n2", "label": "知识点1", "summary": "细节", "children": []}
            ]}
        ]
    }
    output = tmp_path / "知识图谱.html"
    save_graph_html(tree, str(output), "测试课程")

    assert output.exists()
    content = output.read_text(encoding='utf-8')
    assert "测试课程" in content
    assert "TREE_DATA" in content
    assert "n1" in content
    assert "n2" in content
    assert "graph-canvas" in content


def test_save_graph_html_creates_parent_dir(tmp_path):
    from template_engine import save_graph_html

    tree = {"title": "t", "nodes": []}
    output = tmp_path / "subdir" / "graph.html"
    save_graph_html(tree, str(output), "t")
    assert output.exists()


def test_save_graph_html_no_nested_script_tags(tmp_path):
    """Verify TREE_DATA is NOT wrapped in double script tags."""
    from template_engine import save_graph_html

    tree = {"title": "t", "nodes": [{"id": "n1", "label": "x", "summary": "y", "children": []}]}
    output = tmp_path / "graph.html"
    save_graph_html(tree, str(output), "t")
    content = output.read_text(encoding='utf-8')
    # Should NOT have nested script tags
    assert '<script><script>' not in content
    # Should have exactly one opening script tag around TREE_DATA
    assert content.count('<script>\nconst TREE_DATA') == 1
