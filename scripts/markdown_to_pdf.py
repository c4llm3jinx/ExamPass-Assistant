"""Generate styled HTML directly — no markdown or pandoc needed.

For knowledge pages: generate HTML body, wrap with save_knowledge_html().
For test pages: pass question data to save_test().
"""

import os
from template_engine import save_knowledge_html, save_test


def markdown_to_html(body_html, output_path, title='知识清单'):
    """Generate a knowledge page from raw HTML body content."""
    try:
        save_knowledge_html(body_html, output_path, title)
        return os.path.exists(output_path) and os.path.getsize(output_path) > 100
    except Exception as e:
        print(f"生成失败: {e}")
        return False


def markdown_to_pdf(body_html, output_path):
    """Backward-compat. Always outputs .html."""
    if output_path.endswith('.pdf'):
        output_path = output_path[:-4] + '.html'
    return markdown_to_html(body_html, output_path)
