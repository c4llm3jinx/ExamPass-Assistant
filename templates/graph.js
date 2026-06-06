// === ExamPass Knowledge Graph Engine ===

const BRANCH_COLORS = [
  '#d4c5b9', '#c5d5cb', '#d5cec0', '#c8d0d8',
  '#d0c8c0', '#ccd4c8'
];

const STORAGE_KEY = 'graph_settings';

// Layout constants
var NODE_W = 160;     // fixed node width (matches .gn width in CSS)
var NOTE_W = 270;     // fixed note card width (matches .gnote width in CSS)
var COL_W = 460;      // horizontal step per depth level (leaves room for note cards)
var ROW_GAP = 16;     // vertical gap between sibling units
var OFFSET_X = 30;    // canvas left padding
var OFFSET_Y = 30;    // canvas top padding

// ─── Tree model ───────────────────────────────────────────

function walkTree(nodes, branch, depth, callback) {
  for (const node of nodes) {
    const isLeaf = !node.children || node.children.length === 0;
    callback(node, branch, depth, isLeaf);
    if (node.children && node.children.length > 0) {
      walkTree(node.children, branch, depth + 1, callback);
    }
  }
}

function assignBranchColors(nodes) {
  nodes.forEach(function(node, i) {
    walkTree([node], i % BRANCH_COLORS.length, 0, function(n, branch) {
      n._branch = branch;
    });
  });
}

function isLeafNode(node) {
  return !node.children || node.children.length === 0;
}

// Walk only the *visible* tree (collapsed nodes hide their children),
// assigning depth and invoking the callback in document order.
function walkVisible(nodes, cb, depth) {
  depth = depth || 0;
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    n._depth = depth;
    cb(n, depth);
    if (!n._collapsed && n.children && n.children.length > 0) {
      walkVisible(n.children, cb, depth + 1);
    }
  }
}

// ─── localStorage helpers ─────────────────────────────────

function loadNotes(nodeId) {
  try {
    return localStorage.getItem('graph_' + nodeId + '_notes') || '';
  } catch(e) { return ''; }
}

function saveNotes(nodeId, html) {
  try {
    if (html) {
      localStorage.setItem('graph_' + nodeId + '_notes', html);
    } else {
      localStorage.removeItem('graph_' + nodeId + '_notes');
    }
    localStorage.setItem('graph_' + nodeId + '_updated', new Date().toISOString());
  } catch(e) {
    if (e.name === 'QuotaExceededError') {
      showToast('存储空间不足，请清理旧笔记或图片');
    }
  }
}

function loadImages(nodeId) {
  try {
    var raw = localStorage.getItem('graph_' + nodeId + '_images');
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function saveImages(nodeId, images) {
  try {
    if (images.length > 0) {
      localStorage.setItem('graph_' + nodeId + '_images', JSON.stringify(images));
    } else {
      localStorage.removeItem('graph_' + nodeId + '_images');
    }
  } catch(e) {
    if (e.name === 'QuotaExceededError') {
      showToast('图片过大，存储空间不足。请删除部分旧图片');
    }
  }
}

function loadSettings() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch(e) {}
}

// ─── Rendering ────────────────────────────────────────────

var treeData = null;
var settings = loadSettings();

// DOM element references — checked after DOMContentLoaded
var graphCanvas, zoomSlider, zoomLabel, headerTitle, connectionsLayer, tooltip, toast;
function cacheDomRefs() {
  graphCanvas = document.getElementById('graph-canvas');
  zoomSlider = document.getElementById('zoom-slider');
  zoomLabel = document.getElementById('zoom-label');
  headerTitle = document.getElementById('header-title');
  connectionsLayer = document.getElementById('connections-layer');
  tooltip = document.getElementById('tooltip');
  toast = document.getElementById('toast');
}

function render(tree) {
  treeData = tree;
  if (!tree.nodes || tree.nodes.length === 0) {
    graphCanvas.innerHTML =
      '<div style="padding:60px;text-align:center;color:#999;">课程内容为空，无法生成知识图谱</div>';
    return;
  }

  assignBranchColors(tree.nodes);
  applyCollapsed(tree.nodes, settings.collapsed || []);
  applyRenamesData(tree.nodes);

  graphCanvas.innerHTML = '';
  graphCanvas.style.transformOrigin = 'top left';

  // Build DOM for every visible node (and a persistent note card for each leaf).
  walkVisible(tree.nodes, function(node) {
    var el = renderNode(node);
    el.style.position = 'absolute';
    el.style.visibility = 'hidden';
    el.style.left = '0';
    el.style.top = '0';
    graphCanvas.appendChild(el);
    node._el = el;
    node._noteEl = null;

    if (isLeafNode(node)) {
      var note = renderNotePanel(node);
      note.style.position = 'absolute';
      note.style.visibility = 'hidden';
      note.style.left = '0';
      note.style.top = '0';
      graphCanvas.appendChild(note);
      node._noteEl = note;
    }
  });

  // Keep the SVG layer inside the canvas so it scales together under zoom.
  graphCanvas.appendChild(connectionsLayer);

  measureNodes();
  layoutTree(tree.nodes);
  applyPositions();
  drawConnections();

  // Restore zoom
  var zoom = settings.zoom || 1;
  graphCanvas.style.transform = 'scale(' + zoom + ')';
  zoomSlider.value = Math.round(zoom * 100);
  zoomLabel.textContent = Math.round(zoom * 100) + '%';

  // Update header
  headerTitle.textContent = (tree.title || '课程') + ' - 知识图谱';
}

function renderNode(node) {
  var el = document.createElement('div');
  el.className = 'gn gn-lv' + (node._depth || 0);
  el.dataset.id = node.id;
  el.dataset.branch = node._branch;
  el.dataset.depth = node._depth;

  var label = document.createElement('span');
  label.className = 'gn-label';
  label.textContent = node.label;
  el.appendChild(label);

  // Mark nodes that carry notes/images so they read as "filled in".
  if (loadNotes(node.id) || loadImages(node.id).length > 0) {
    el.classList.add('has-notes');
  }

  if (node._collapsed) {
    el.classList.add('collapsed');
  }

  // Tooltip from source summary
  if (node.summary) {
    el.addEventListener('mouseenter', function(e) { showTooltip(e, node.summary); });
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('mousemove', moveTooltip);
  }

  // Click: leaves focus their note card; branches collapse/expand.
  el.addEventListener('click', function(e) {
    e.stopPropagation();
    if (isLeafNode(node)) {
      if (node._noteEl) {
        var body = node._noteEl.querySelector('.gnote-body');
        if (body) body.focus();
      }
    } else {
      toggleCollapse(node);
    }
  });

  el.addEventListener('dblclick', function(e) {
    e.stopPropagation();
    renameNode(node, label);
  });

  return el;
}

// ─── Persistent note card ─────────────────────────────────

function renderNotePanel(node) {
  var el = document.createElement('div');
  el.className = 'gnote';
  el.dataset.forNode = node.id;
  el.dataset.branch = node._branch;

  var body = document.createElement('div');
  body.className = 'gnote-body';
  body.contentEditable = 'true';
  body.dataset.ph = '＋ 记笔记…';
  body.innerHTML = loadNotes(node.id);
  body.addEventListener('blur', function() {
    saveNotes(node.id, body.innerHTML);
    updateNodeMark(node);
    relayout();
  });
  body.addEventListener('paste', function(e) { handlePaste(e, node); });
  el.appendChild(body);

  var images = loadImages(node.id);
  var imagesDiv = document.createElement('div');
  imagesDiv.className = 'gnote-imgs';
  for (var i = 0; i < images.length; i++) {
    imagesDiv.appendChild(createImageElement(images[i], node));
  }
  el.appendChild(imagesDiv);

  return el;
}

function updateNodeMark(node) {
  if (!node._el) return;
  var hasContent = loadNotes(node.id) || loadImages(node.id).length > 0;
  if (hasContent) {
    node._el.classList.add('has-notes');
  } else {
    node._el.classList.remove('has-notes');
  }
}

function createImageElement(src, node) {
  var wrap = document.createElement('div');
  wrap.className = 'ge-img-wrap';

  var img = document.createElement('img');
  img.src = src;
  img.alt = '粘贴的图片';
  wrap.appendChild(img);

  var del = document.createElement('button');
  del.className = 'ge-img-del';
  del.textContent = '✕';
  del.addEventListener('click', function(e) {
    e.stopPropagation();
    var images = loadImages(node.id);
    var idx = images.indexOf(src);
    if (idx !== -1) {
      images.splice(idx, 1);
      saveImages(node.id, images);
    }
    wrap.remove();
    updateNodeMark(node);
    relayout();
  });
  wrap.appendChild(del);

  return wrap;
}

function handlePaste(e, node) {
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;

  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      e.preventDefault();
      var blob = items[i].getAsFile();
      compressImage(blob, function(dataUrl) {
        var images = loadImages(node.id);
        images.push(dataUrl);
        saveImages(node.id, images);
        var panel = node._noteEl;
        if (!panel) return;
        var imagesDiv = panel.querySelector('.gnote-imgs');
        if (imagesDiv) {
          imagesDiv.appendChild(createImageElement(dataUrl, node));
        }
        updateNodeMark(node);
        relayout();
      });
      return;
    }
  }
}

function compressImage(blob, callback) {
  var img = new Image();
  var url = URL.createObjectURL(blob);
  img.onload = function() {
    URL.revokeObjectURL(url);
    var canvas = document.createElement('canvas');
    var maxW = 800;
    var w = img.width, h = img.height;
    if (w > maxW) { h = h * (maxW / w); w = maxW; }
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', 0.7));
  };
  img.onerror = function() {
    URL.revokeObjectURL(url);
    showToast('图片加载失败，请重试');
  };
  img.src = url;
}

// ─── Layout (tidy tree) ───────────────────────────────────

function measureNodes() {
  walkVisible(treeData.nodes, function(node) {
    if (node._el) node._h = node._el.offsetHeight;
    if (node._noteEl) node._noteH = node._noteEl.offsetHeight;
  });
}

// Assign _x / _top / _y to every visible node. A node's vertical center is
// the midpoint of its children; leaves stack by their own (or note) height.
function layoutTree(nodes) {
  var cursorY = OFFSET_Y;

  function place(node) {
    node._x = OFFSET_X + node._depth * COL_W;
    var kids = (!node._collapsed && node.children && node.children.length > 0) ? node.children : [];
    var nodeH = node._h || 36;

    if (kids.length === 0) {
      var unitH = nodeH;
      if (node._noteH) unitH = Math.max(nodeH, node._noteH);
      node._top = cursorY;
      node._y = cursorY + nodeH / 2;
      cursorY += unitH + ROW_GAP;
    } else {
      for (var i = 0; i < kids.length; i++) place(kids[i]);
      node._y = (kids[0]._y + kids[kids.length - 1]._y) / 2;
      node._top = node._y - nodeH / 2;
    }
  }

  for (var i = 0; i < nodes.length; i++) place(nodes[i]);
  return cursorY;
}

function applyPositions() {
  var maxX = 0, maxY = 0;
  walkVisible(treeData.nodes, function(node) {
    node._el.style.left = node._x + 'px';
    node._el.style.top = node._top + 'px';
    node._el.style.visibility = 'visible';

    var rightX = node._x + NODE_W;
    var bottomY = node._top + (node._h || 36);

    if (node._noteEl) {
      var noteX = node._x + NODE_W + 16;
      node._noteEl.style.left = noteX + 'px';
      node._noteEl.style.top = node._top + 'px';
      node._noteEl.style.visibility = 'visible';
      rightX = noteX + NOTE_W;
      bottomY = Math.max(bottomY, node._top + (node._noteH || 0));
    }

    if (rightX > maxX) maxX = rightX;
    if (bottomY > maxY) maxY = bottomY;
  });

  graphCanvas.style.width = (maxX + 40) + 'px';
  graphCanvas.style.height = (maxY + 60) + 'px';
}

// Re-measure and re-position without rebuilding DOM (used after note edits).
function relayout() {
  if (!treeData) return;
  measureNodes();
  layoutTree(treeData.nodes);
  applyPositions();
  drawConnections();
}

// ─── Collapse / Expand ────────────────────────────────────

function applyCollapsed(nodes, collapsedIds) {
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (collapsedIds.indexOf(node.id) !== -1) {
      node._collapsed = true;
    } else {
      node._collapsed = false;
    }
    if (node.children && node.children.length > 0) {
      applyCollapsed(node.children, collapsedIds);
    }
  }
}

function toggleCollapse(node) {
  node._collapsed = !node._collapsed;
  var collapsed = settings.collapsed || [];
  if (node._collapsed) {
    if (collapsed.indexOf(node.id) === -1) collapsed.push(node.id);
  } else {
    var idx = collapsed.indexOf(node.id);
    if (idx !== -1) collapsed.splice(idx, 1);
  }
  settings.collapsed = collapsed;
  saveSettings(settings);
  render(treeData);
}

// ─── Rename ────────────────────────────────────────────────

function renameNode(node, labelEl) {
  var oldLabel = node.label;
  var input = document.createElement('input');
  input.type = 'text';
  input.value = oldLabel;
  input.style.cssText = 'font-weight:600;font-size:0.95em;width:100%;border:1px solid #ccc;border-radius:4px;padding:2px 6px;box-sizing:border-box;';
  input.addEventListener('click', function(e) { e.stopPropagation(); });
  input.addEventListener('blur', function() { finishRename(node, input.value.trim() || oldLabel); });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = oldLabel; input.blur(); }
  });
  labelEl.replaceWith(input);
  input.focus();
  input.select();
}

function finishRename(node, newLabel) {
  node.label = newLabel;
  settings.renamed = settings.renamed || {};
  settings.renamed[node.id] = newLabel;
  saveSettings(settings);
  render(treeData);
}

function applyRenamesData(nodes) {
  var renamed = settings.renamed || {};
  walkTree(nodes, 0, 0, function(n) {
    if (renamed[n.id] != null) n.label = renamed[n.id];
  });
}

// ─── Connections (SVG) ────────────────────────────────────

function collectEdges(nodes, acc) {
  for (var i = 0; i < nodes.length; i++) {
    var p = nodes[i];
    if (!p._collapsed && p.children && p.children.length > 0) {
      for (var j = 0; j < p.children.length; j++) {
        acc.push({ p: p, c: p.children[j] });
      }
      collectEdges(p.children, acc);
    }
  }
}

function drawConnections() {
  var w = parseFloat(graphCanvas.style.width) || graphCanvas.scrollWidth;
  var h = parseFloat(graphCanvas.style.height) || graphCanvas.scrollHeight;

  connectionsLayer.style.width = w + 'px';
  connectionsLayer.style.height = h + 'px';
  connectionsLayer.setAttribute('viewBox', '0 0 ' + w + ' ' + h);

  var edges = [];
  collectEdges(treeData.nodes, edges);

  var html = '';
  for (var i = 0; i < edges.length; i++) {
    var p = edges[i].p, c = edges[i].c;
    var x1 = p._x + NODE_W, y1 = p._y;
    var x2 = c._x, y2 = c._y;
    var cx1 = x1 + (x2 - x1) * 0.4;
    var cx2 = x1 + (x2 - x1) * 0.6;
    html += '<path class="conn-path" data-branch="' + p._branch +
      '" stroke="' + BRANCH_COLORS[p._branch] + '"' +
      ' d="M' + x1 + ',' + y1 + ' C' + cx1 + ',' + y1 + ' ' + cx2 + ',' + y2 + ' ' + x2 + ',' + y2 + '" />';
  }

  connectionsLayer.innerHTML = html;
}

// ─── Tooltip ───────────────────────────────────────────────

function showTooltip(e, text) {
  tooltip.textContent = text;
  tooltip.classList.add('tooltip-show');
  moveTooltip(e);
}

function moveTooltip(e) {
  var x = e.clientX + 14;
  var y = e.clientY + 14;
  if (x + 300 > window.innerWidth) x = e.clientX - 310;
  if (y + 80 > window.innerHeight) y = e.clientY - 90;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

function hideTooltip() {
  tooltip.classList.remove('tooltip-show');
}

// ─── Toast ─────────────────────────────────────────────────

var toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('toast-show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { toast.classList.remove('toast-show'); }, 2000);
}

// ─── Format helpers ────────────────────────────────────────

function formatTime(iso) {
  try {
    var d = new Date(iso);
    var pad = function(n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  } catch(e) { return ''; }
}

// ─── Search ────────────────────────────────────────────────

var searchTimer = null;
document.addEventListener('DOMContentLoaded', function() {
  var searchInput = document.getElementById('search-input');
  if (!searchInput) return;
  searchInput.addEventListener('input', function() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(doSearch, 200);
  });
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { searchInput.value = ''; doSearch(); }
  });
});

function doSearch() {
  var query = document.getElementById('search-input').value.trim().toLowerCase();
  var allNodes = document.querySelectorAll('.gn');
  var firstHit = null;

  allNodes.forEach(function(el) {
    el.classList.remove('search-hit', 'search-dim');
  });

  if (!query) return;

  allNodes.forEach(function(el) {
    var label = (el.querySelector('.gn-label') || {}).textContent || '';
    if (label.toLowerCase().indexOf(query) !== -1) {
      el.classList.add('search-hit');
      if (!firstHit) firstHit = el;
    } else {
      el.classList.add('search-dim');
    }
  });

  if (firstHit) {
    firstHit.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ─── Zoom ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  var slider = zoomSlider;
  var label = zoomLabel;
  var outBtn = document.getElementById('zoom-out');
  var inBtn = document.getElementById('zoom-in');
  var resetBtn = document.getElementById('reset-btn');

  if (!slider) return;

  var zoom = settings.zoom || 1;

  function applyZoom(z) {
    zoom = Math.max(0.5, Math.min(2, z));
    if (graphCanvas) graphCanvas.style.transform = 'scale(' + zoom + ')';
    slider.value = Math.round(zoom * 100);
    label.textContent = Math.round(zoom * 100) + '%';
    settings.zoom = zoom;
    saveSettings(settings);
  }

  slider.addEventListener('input', function() { applyZoom(this.value / 100); });
  outBtn.addEventListener('click', function() { applyZoom(zoom - 0.1); });
  inBtn.addEventListener('click', function() { applyZoom(zoom + 0.1); });

  resetBtn.addEventListener('click', function() {
    settings.collapsed = [];
    settings.renamed = {};
    saveSettings(settings);
    document.getElementById('search-input').value = '';
    doSearch();
    applyZoom(1);
    render(treeData);
  });
});

// ─── Init ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  cacheDomRefs();

  if (typeof TREE_DATA === 'undefined') {
    graphCanvas.innerHTML =
      '<div style="padding:60px;text-align:center;color:#999;">未找到知识图谱数据</div>';
    return;
  }
  render(TREE_DATA);

  // Redraw connections on resize (positions are fixed, only the SVG box needs a refresh).
  var resizeTimer = null;
  window.addEventListener('resize', function() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawConnections, 300);
  });
});
