# Knowledge Graph Feature — Design Spec

## Overview

Add an interactive knowledge graph (mind map) to ExamPass Assistant. Users run `/exampass graph` to generate a horizontal tree visualization of course knowledge, with inline editing and image paste support.

## Command

```
/exampass graph              # current directory
/exampass graph <dir>        # specific directory
/exampass graph --from-json <json>  # re-render from saved JSON
```

## Data Model

### Knowledge Tree JSON

```json
{
  "title": "深度学习",
  "nodes": [
    {
      "id": "n1",
      "label": "第1章 绪论",
      "summary": "PPT原文摘要，悬浮tooltip显示",
      "children": [
        {
          "id": "n2",
          "label": "神经元模型",
          "summary": "M-P神经元：加权求和+激活函数",
          "children": [
            {"id": "n3", "label": "激活函数", "summary": "...", "children": []},
            {"id": "n4", "label": "前向传播", "summary": "...", "children": []}
          ]
        }
      ]
    }
  ]
}
```

- `id`: globally unique, used as localStorage key prefix
- `children: []`: leaf node (editable); non-empty: intermediate node (collapsible)
- `summary`: extracted from PPT, shown in tooltip on hover

### localStorage Schema

```
graph_{nodeId}_notes     → HTML string (rich text notes)
graph_{nodeId}_images    → JSON array of base64 strings
graph_{nodeId}_updated   → ISO timestamp
graph_settings           → {"zoom": 1, "collapsed": ["n5","n8"], "renamed": {"n1":"自定义名"}}
```

## Page Layout

Horizontal tree, root on left, children expand right. Page scrolls vertically for large trees.

```
Lv0(root)    Lv1(chapter)    Lv2(topic)     Lv3(detail)     Edit Panel
                                                             
             ┌──────────┐                                   
             │ 神经元模型 │                                   
             ┌────┤ M-P模型  ├──────────────────┐            
             │    └──────────┘                  │            
             │                                  ▼            
┌──────┐ ┌───┴──────┐ ┌──────────┐  ┌──────────────────┐   
│      │ │ 第1章    │ │ Sigmoid  │  │ 📝 笔记:         │   
│ 深度 │─│ 绪论     │ │ Tanh     │  │ 考试重点是...     │   
│ 学习 │ └──────────┘ │ ReLU     │  │                  │   
│      │              └──────────┘  │ 🖼️ [粘贴的截图]  │   
│      │                            └──────────────────┘   
│      │ ┌──────────┐              ┌──────────┐            
│      │ │ 第2章    │──────────────│ 反向传播 │─[点击编辑] 
│      │─│ 神经网络 │              └──────────┘            
│      │ └──────────┘                                       
└──────┘                                                    
```

## Color Scheme

Muted, low-saturation academic palette. Each Lv1 chapter gets a branch color; all descendants share the same hue with decreasing saturation at deeper levels.

| Branch | Base Color | Description |
|--------|-----------|-------------|
| Root | `#d4c5b9` | Warm gray-brown |
| Chapter A | `#c5d5cb` | Muted sage green |
| Chapter B | `#d5cec0` | Warm camel |
| Chapter C | `#c8d0d8` | Cool gray-blue |
| Chapter D | `#d0c8c0` | Warm gray-brown |
| Chapter E | `#ccd4c8` | Olive gray |
| Chapter F+ | cycle through above | Rotate palette |

Children at deeper levels use lighter tints of their chapter's base color. Connection lines inherit branch color.

## Interaction

| Action | Behavior |
|--------|----------|
| Hover node | Tooltip shows PPT summary |
| Click leaf node | Toggle edit panel next to it |
| Click intermediate node | Collapse/expand subtree |
| Double-click label | Rename (saved to localStorage) |
| Ctrl+V in edit panel | Paste image (auto-compress, base64) |
| Blur / scroll panel out of view | Auto-save to localStorage |
| Close edit panel | Save and hide |

### Edit Panel

- Inline, attached to the right/below the clicked leaf node
- `contenteditable` div for rich text notes
- Image paste area: Ctrl+V directly pastes clipboard images
- Auto-compress: max 800px wide, JPEG quality 0.7, ~50-150KB per image
- Delete button per image
- Auto-save on blur, on scroll-out-of-view, or after 2s idle
- Max width 500px, follows the node's branch color with lighter background

### Search

Top search bar. Type to filter nodes: matching nodes get highlighted (subtle glow), non-matching dim. Scroll to first match.

### Zoom

Bottom zoom slider (50%–200%). Scales the entire tree. Default 100%.

## Generation Pipeline

```
Course dir/                      
  ├── PPT/PDF              ──→ scanner.py ──→ extractor.py
  └── ...                                          │
                                                   ▼
                                        text_summary (merged)
                                                   │
                                                   ▼
                                        Claude deep analysis
                                        (prompt: knowledge_graph.py)
                                                   │
                                                   ▼
                                        knowledge_graph.json
                                                   │
                                          ┌────────┴────────┐
                                          ▼                  ▼
                                   template_engine.py   Direct re-render
                                   save_graph_html()    (--from-json)
                                          │
                                          ▼
                                   知识图谱.html
```

### Claude Prompt Constraints

- Root = course name
- Lv1 = chapters (one color branch per chapter)
- Lv2+ = knowledge points, progressively detailed
- Every node has `summary` from source material
- Leaf nodes are concrete concepts/formulas/methods
- Target depth: 3-5 levels depending on material complexity
- Cross-chapter relationships noted in summary where relevant

## Files

| File | Purpose |
|------|---------|
| `scripts/knowledge_graph.py` | Build prompt, call Claude, parse JSON response |
| `templates/graph_template.html` | HTML shell with root containers |
| `templates/graph.css` | Tree layout, node styles, edit panel, animations |
| `templates/graph.js` | Tree renderer, SVG connections, edit panel, localStorage, search, zoom |
| `SKILL.md` | Add `graph` subcommand routing |

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Single-chapter course | Lv1 has one node; tree still renders normally |
| Deep nesting (5+ levels) | Horizontal scrollbar appears; drag to pan horizontally |
| Empty directory / no content | "No course materials found" message |
| localStorage full | Alert user, suggest clearing old images |
| Very large tree (100+ nodes) | Virtual scrolling: only render nodes within ±2 viewports; collapse all by default past Lv3 |
| No images in PPT | Edit panel still works for text notes only |
| JSON parse failure | Show error with line number, offer to retry |
| Duplicate node IDs | Auto-deduplicate on generation |
