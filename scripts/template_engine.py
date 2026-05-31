"""Template engine for ExamPass HTML generation.

Zero Unicode-in-source: all CJK text lives in JSON/CSS/JS files.
"""

import os
import json

_TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates')


def _read(filename):
    path = os.path.join(_TEMPLATES_DIR, filename)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    return ''


# MathJax 3 config: enable $...$ and $$...$$ delimiters
_MATHJAX_CONFIG = """<script>
MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']]
  }
};
</script>"""
_MATHJAX_SCRIPT = '<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml-full.js"></script>'


def _page_shell(title, body_html, extra_css='', extra_js=''):
    css = _read('base.css') + '\n' + extra_css
    parts = [
        '<!DOCTYPE html>',
        '<html lang="zh-CN">',
        '<head>',
        '<meta charset="utf-8"/>',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0"/>',
        '<title>' + title + '</title>',
        _MATHJAX_CONFIG,
        _MATHJAX_SCRIPT,
        '<style>',
        css,
        '</style>',
        extra_js,
        '</head>',
        '<body>',
        '',
        '<header id="exampass-header">',
        '  <div class="header-left"><span class="header-brand">ExamPass Assistant</span></div>',
        '  <div class="header-right"><span class="header-url">exampass.ai</span></div>',
        '</header>',
        '<hr class="header-divider">',
        '',
        body_html,
        '',
        '</body>',
        '</html>',
    ]
    return '\n'.join(parts)


# ─── Knowledge page ─────────────────────────────────────────────────

def render_knowledge_html(body_html, title):
    return _page_shell(title, body_html)


def save_knowledge_html(body_html, output_path, title):
    html = render_knowledge_html(body_html, title)
    out_dir = os.path.dirname(output_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)


# ─── Interactive test page ──────────────────────────────────────────

def render_test(questions, title, subtitle='', duration_minutes=30):
    """Generate an interactive test page.

    questions: list of dicts with keys:
      type: "choice" | "tf" | "short" | "essay"
      points: int
      question: str (HTML allowed)
      options: list of str (for choice only)
      answer: int (0-index for choice/tf, -1 for open-ended)
      explanation: str (HTML allowed)
      pitfall: str (optional)

    duration_minutes: int, defaults to 30
    """
    questions_json = json.dumps(questions, ensure_ascii=False)
    labels = json.loads(_read('test_labels.json'))
    labels_json = json.dumps(labels, ensure_ascii=False)

    js_template = _read('test_js_template.js')
    js = js_template.replace('__QUESTIONS_PLACEHOLDER__', questions_json)
    js = js.replace('__LABELS_PLACEHOLDER__', labels_json)
    js = '<script>\n' + js + '\n</script>'

    # Subtitle
    sub_html = ''
    if subtitle:
        sub_html = '<p style="text-align:center;color:var(--ink-light);font-size:0.95em">' + subtitle + '</p>'
    elif duration_minutes:
        sub_html = '<p style="text-align:center;color:var(--ink-light);font-size:0.95em">' + labels['duration_prefix'] + str(duration_minutes) + labels['duration_suffix'] + '</p>'

    # Body
    body_parts = [
        '<h1>' + title + '</h1>',
        '<h2 style="text-align:center">' + labels['page_title'] + '</h2>',
        sub_html,
        '',
        '<div id="score-box"><div class="score-num" id="score-num">0</div><div class="score-label">' + labels['score_label'] + '</div></div>',
        '<div id="questions-container"></div>',
        '<div class="grading-bar no-print"><button onclick="gradeAll()" id="grade-btn">' + labels['grade_button'] + '</button></div>',
    ]
    body = '\n'.join(body_parts)

    return _page_shell(title, body, extra_css=_read('test.css'), extra_js=js)


def save_test(questions, output_path, title, subtitle='', duration_minutes=30):
    html = render_test(questions, title, subtitle, duration_minutes)
    out_dir = os.path.dirname(output_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)
