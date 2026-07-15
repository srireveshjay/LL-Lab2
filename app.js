(function () {
  "use strict";

  /* ============================================================
     0. STARTER PROGRAM
     ============================================================ */
  var EXAMPLE = [
    "class Node:",
    "    def __init__(self, data):",
    "        self.data = data",
    "        self.next = None",
    "",
    "New = Node(5)",
    "head = New",
    "",
    "New2 = Node(10)",
    "New.next = New2",
    "",
    "New3 = Node(15)",
    "New2.next = New3",
    "",
    "curr = head",
    "while curr is not None:",
    "    print(curr.data)",
    "    curr = curr.next"
  ].join("\n");

  /* ============================================================
     1. GEOMETRY CONSTANTS
     ============================================================ */
  var NODE_W = 108, NODE_H = 52, LABEL_H = 18;
  var ROW_Y = 120, STEP_X = 190, MARGIN_X = 50;
  var TRAY_X = 18, TRAY_Y = 30;

  function rightAnchor(n) { return { x: n.x + NODE_W - 6, y: n.y + LABEL_H + NODE_H / 2 }; }
  function leftAnchor(n) { return { x: n.x + 3, y: n.y + LABEL_H + NODE_H / 2 }; }
  function topAnchor(n) { return { x: n.x + NODE_W / 2, y: n.y - 2 }; }
  function noneAnchor(n) { return { x: n.x + NODE_W + 54, y: n.y + LABEL_H + NODE_H / 2 }; }

  /* ============================================================
     2. STATE
     ============================================================ */
  var state = {
    nodes: {},      // id -> {id, label, data, x, y, next, el, noneEl}
    pointers: {},   // name -> {name, target, el, dragging}
    nodeCounter: 0
  };

  var canvasEl = document.getElementById("canvas");
  var content, svg;

  function buildCanvasShell() {
    canvasEl.innerHTML = "";
    content = document.createElement("div");
    content.id = "canvas-content";
    content.style.position = "relative";
    content.style.width = "100%";
    content.style.height = "560px";
    canvasEl.appendChild(content);

    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "2000");
    svg.setAttribute("height", "560");
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    svg.style.pointerEvents = "none";
    svg.innerHTML =
      '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">' +
      '<path d="M0,0 L8,4 L0,8 Z" class="arrow-head"></path></marker></defs>';
    content.appendChild(svg);
  }
  buildCanvasShell();

  function resetState() {
    state.nodes = {};
    state.pointers = {};
    state.nodeCounter = 0;
    buildCanvasShell();
  }

  function growCanvas() {
    var w = Math.max(2000, MARGIN_X * 2 + state.nodeCounter * STEP_X + 260);
    content.style.width = w + "px";
    svg.setAttribute("width", w);
  }

  /* ============================================================
     3. CONSOLE LOG
     ============================================================ */
  var logEl = document.getElementById("console-log");
  function log(text, kind) {
    var line = document.createElement("div");
    line.className = "log-line" + (kind ? " log-" + kind : "");
    line.textContent = text;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function clearLog() { logEl.innerHTML = ""; }

  /* ============================================================
     4. TOKENIZER + INDENTATION-AWARE PARSER
     ============================================================ */
  function tokenizeLines(code) {
    return code.split("\n").map(function (raw, i) {
      var expanded = raw.replace(/\t/g, "    ");
      var trimmed = expanded.trim();
      var indent = expanded.length - expanded.replace(/^\s+/, "").length;
      return { lineNo: i, indent: indent, text: trimmed };
    });
  }

  function isBoilerplate(text) {
    if (!text) return true;
    if (text.charAt(0) === "#") return true;
    if (/^class\s+/i.test(text)) return true;
    if (/^def\s+/i.test(text)) return true;
    if (/^self\./.test(text)) return true;
    return false;
  }

  // builds a tree of {type:'exec', text, lineNo} and {type:'while', cond, body, lineNo}
  function buildBlock(lines, startIdx, minIndent) {
    var stmts = [], i = startIdx, blockIndent = null;
    while (i < lines.length) {
      var ln = lines[i];
      if (ln.text === "" || isBoilerplate(ln.text)) { i++; continue; }
      if (ln.indent < minIndent) break;
      if (blockIndent === null) blockIndent = ln.indent;
      if (ln.indent !== blockIndent) {
        if (ln.indent < blockIndent) break;
        i++; continue; // deeper than expected — skip stray line
      }
      var whileMatch = ln.text.match(/^while\s+(.+):$/i);
      if (whileMatch) {
        var res = buildBlock(lines, i + 1, blockIndent + 1);
        stmts.push({ type: "while", cond: whileMatch[1], body: res.stmts, lineNo: ln.lineNo });
        i = res.next;
      } else {
        stmts.push({ type: "exec", text: ln.text, lineNo: ln.lineNo });
        i++;
      }
    }
    return { stmts: stmts, next: i };
  }

  /* ============================================================
     5. EXECUTOR
     ============================================================ */
  var RE_CREATE = /^([A-Za-z_]\w*)\s*=\s*(?:Node|node)\(\s*(.*?)\s*\)$/;
  var RE_NEXT_LINK = /^([A-Za-z_]\w*)\.next\s*=\s*([A-Za-z_]\w*|None)$/i;
  var RE_CHAIN_STEP = /^([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)((?:\s*\.\s*next)+)$/i;
  var RE_ALIAS = /^([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*|None)$/i;
  var RE_PRINT = /^print\(\s*([A-Za-z_]\w*)(?:\.data)?\s*\)$/i;

  function newNodeDefaultPos(index) {
    return { x: MARGIN_X + index * STEP_X, y: ROW_Y };
  }

  function createNode(data) {
    var id = "n" + state.nodeCounter;
    var pos = newNodeDefaultPos(state.nodeCounter);
    state.nodeCounter++;
    var node = { id: id, label: id, data: data, x: pos.x, y: pos.y, next: null };
    state.nodes[id] = node;
    growCanvas();
    return node;
  }

  function setPointer(name, target) {
    if (!state.pointers[name]) state.pointers[name] = { name: name, target: null };
    state.pointers[name].target = target;
  }

  function requirePointerNode(name) {
    var p = state.pointers[name];
    if (!p) throw new Error("NameError: name '" + name + "' is not defined");
    if (p.target == null) throw new Error("AttributeError: '" + name + "' is None, has no attribute 'next'");
    return state.nodes[p.target];
  }

  function execLine(text) {
    var m;

    if ((m = text.match(RE_CREATE))) {
      var varName = m[1];
      var value = m[2].trim().replace(/^["']|["']$/g, "");
      var node = createNode(value === "" ? "?" : value);
      setPointer(varName, node.id);
      log(text, "ok");
      return;
    }

    if ((m = text.match(RE_NEXT_LINK))) {
      var lhsNode = requirePointerNode(m[1]);
      var rhs = m[2];
      if (/^none$/i.test(rhs)) {
        lhsNode.next = null;
      } else {
        var rp = state.pointers[rhs];
        if (!rp) throw new Error("NameError: name '" + rhs + "' is not defined");
        lhsNode.next = rp.target;
      }
      flashNode(lhsNode.id);
      log(text, "ok");
      return;
    }

    if ((m = text.match(RE_CHAIN_STEP))) {
      var varName2 = m[1], fromVar = m[2];
      var steps = (m[3].match(/next/gi) || []).length;
      var fp = state.pointers[fromVar];
      if (!fp) throw new Error("NameError: name '" + fromVar + "' is not defined");
      var cur = fp.target;
      for (var s = 0; s < steps; s++) {
        if (cur == null) throw new Error("AttributeError: hit None while walking '.next' " + steps + " time(s)");
        cur = state.nodes[cur].next;
      }
      setPointer(varName2, cur);
      if (cur != null) flashNode(cur);
      log(text, "ok");
      return;
    }

    if ((m = text.match(RE_PRINT))) {
      var pn = state.pointers[m[1]];
      var val = (pn && pn.target != null) ? state.nodes[pn.target].data : "None";
      log("> " + val, "print");
      if (pn && pn.target != null) flashNode(pn.target);
      return;
    }

    if ((m = text.match(RE_ALIAS))) {
      var lhs4 = m[1], rhsName = m[2];
      if (/^none$/i.test(rhsName)) { setPointer(lhs4, null); log(text, "ok"); return; }
      var rp3 = state.pointers[rhsName];
      if (!rp3) throw new Error("NameError: name '" + rhsName + "' is not defined");
      setPointer(lhs4, rp3.target);
      log(text, "ok");
      return;
    }

    throw new Error("SyntaxError: couldn't parse — " + text);
  }

  function evalCond(cond) {
    var m;
    if ((m = cond.match(/^([A-Za-z_]\w*)\s+is\s+not\s+None$/i))) return req(m[1]) != null;
    if ((m = cond.match(/^([A-Za-z_]\w*)\s+is\s+None$/i))) return req(m[1]) == null;
    if ((m = cond.match(/^([A-Za-z_]\w*)\s*!=\s*None$/i))) return req(m[1]) != null;
    if ((m = cond.match(/^([A-Za-z_]\w*)\s*==\s*None$/i))) return req(m[1]) == null;
    if ((m = cond.match(/^([A-Za-z_]\w*)$/))) return req(m[1]) != null;
    throw new Error("SyntaxError: can't evaluate while-condition — " + cond);
    function req(name) {
      var p = state.pointers[name];
      if (!p) throw new Error("NameError: name '" + name + "' is not defined");
      return p.target;
    }
  }

  function* runProgram(stmts) {
    for (var i = 0; i < stmts.length; i++) {
      var stmt = stmts[i];
      if (stmt.type === "while") {
        while (evalCond(stmt.cond)) {
          yield* runProgram(stmt.body);
        }
      } else {
        execLine(stmt.text);
        yield { lineNo: stmt.lineNo };
      }
    }
  }

  /* ============================================================
     6. RENDERING
     ============================================================ */
  function ensureNodeEl(node) {
    if (node.el) return node.el;
    var wrap = document.createElement("div");
    wrap.className = "node";
    wrap.dataset.id = node.id;
    wrap.style.left = node.x + "px";
    wrap.style.top = node.y + "px";
    wrap.innerHTML =
      '<div class="node-label">' + node.label + '</div>' +
      '<div class="node-body">' +
      '<div class="cell data"></div>' +
      '<div class="cell next"><span class="next-anchor"></span></div>' +
      '</div>';
    wrap.querySelector(".cell.data").textContent = node.data;
    wrap.querySelector(".cell.data").title = node.data;
    content.appendChild(wrap);
    node.el = wrap;

    var noneEl = document.createElement("div");
    noneEl.className = "none-ground";
    noneEl.innerHTML =
      '<svg width="30" height="24" viewBox="0 0 30 24">' +
      '<line x1="15" y1="0" x2="15" y2="8"></line>' +
      '<line x1="4" y1="8" x2="26" y2="8"></line>' +
      '<line x1="8" y1="13" x2="22" y2="13"></line>' +
      '<line x1="12" y1="18" x2="18" y2="18"></line>' +
      '</svg><div class="none-text">None</div>';
    content.appendChild(noneEl);
    node.noneEl = noneEl;

    attachNodeDrag(wrap, node);
    attachLinkDrag(wrap.querySelector(".next-anchor"), node);
    return wrap;
  }

  function flashNode(id) {
    var node = state.nodes[id];
    if (!node || !node.el) return;
    node.el.classList.add("flash");
    setTimeout(function () { node.el.classList.remove("flash"); }, 500);
  }

  function positionNodeEl(node) {
    node.el.style.left = node.x + "px";
    node.el.style.top = node.y + "px";
    var ga = noneAnchor(node);
    node.noneEl.style.left = (ga.x - 15) + "px";
    node.noneEl.style.top = (ga.y - 10) + "px";
    node.noneEl.style.display = node.next == null ? "block" : "none";
  }

  function ensurePointerEl(ptr) {
    if (ptr.el) return ptr.el;
    var flag = document.createElement("div");
    flag.className = "pointer-flag" + (ptr.name === "head" ? " is-head" : "");
    flag.textContent = ptr.name;
    flag.dataset.name = ptr.name;
    content.appendChild(flag);
    ptr.el = flag;
    attachPointerDrag(flag, ptr);
    return flag;
  }

  function layoutPointers() {
    var byTarget = {};
    var trayNames = [];
    Object.keys(state.pointers).forEach(function (name) {
      var ptr = state.pointers[name];
      if (ptr.dragging) return;
      if (ptr.target == null) { trayNames.push(name); return; }
      (byTarget[ptr.target] = byTarget[ptr.target] || []).push(name);
    });

    Object.keys(byTarget).forEach(function (nodeId) {
      var node = state.nodes[nodeId];
      if (!node) return;
      byTarget[nodeId].forEach(function (name, idx) {
        var ptr = state.pointers[name];
        var el = ensurePointerEl(ptr);
        el.style.left = (node.x + 6 + idx * 60) + "px";
        el.style.top = (node.y - 32 - Math.floor(idx / 3) * 34) + "px";
      });
    });

    trayNames.forEach(function (name, idx) {
      var ptr = state.pointers[name];
      var el = ensurePointerEl(ptr);
      var col = idx % 2, row = Math.floor(idx / 2);
      el.style.left = (TRAY_X + col * 62) + "px";
      el.style.top = (TRAY_Y + row * 30) + "px";
    });

    var tray = document.getElementById("unassigned-tray");
    var rows = Math.ceil(trayNames.length / 2) || 1;
    tray.style.height = (26 + rows * 30) + "px";
    tray.style.width = "148px";
  }

  function drawArrows() {
    var parts = [];
    Object.keys(state.nodes).forEach(function (id) {
      var node = state.nodes[id];
      var a = rightAnchor(node);
      var b = node.next != null && state.nodes[node.next] ? leftAnchor(state.nodes[node.next]) : noneAnchor(node);
      parts.push(curvePath(a, b, "arrow-path"));
    });
    Object.keys(state.pointers).forEach(function (name) {
      var ptr = state.pointers[name];
      if (ptr.target == null || !state.nodes[ptr.target]) return;
      var node = state.nodes[ptr.target];
      var flagBottom = ptr.el ? { x: parseFloat(ptr.el.style.left) + ptr.el.offsetWidth / 2, y: parseFloat(ptr.el.style.top) + ptr.el.offsetHeight } : null;
      if (!flagBottom) return;
      var target = topAnchor(node);
      parts.push(curvePath(flagBottom, target, "arrow-path pointer-line", true));
    });
    svg.querySelectorAll("path.dynamic").forEach(function (p) { p.remove(); });
    parts.forEach(function (html) { svg.insertAdjacentHTML("beforeend", html); });
  }

  function curvePath(a, b, cls, noHead) {
    var midX = (a.x + b.x) / 2;
    var d = "M " + a.x + " " + a.y + " C " + midX + " " + a.y + ", " + midX + " " + b.y + ", " + b.x + " " + b.y;
    return '<path class="dynamic ' + cls + '" d="' + d + '"' + (noHead ? "" : ' marker-end="url(#arrow)"') + "></path>";
  }

  function renderAll() {
    Object.keys(state.nodes).forEach(function (id) {
      var node = state.nodes[id];
      ensureNodeEl(node);
      positionNodeEl(node);
    });
    layoutPointers();
    drawArrows();
  }

  /* ============================================================
     7. DRAG INTERACTIONS
     ============================================================ */
  function localPoint(evt) {
    var rect = content.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function nodeIdAtPoint(clientX, clientY, excludeId) {
    var els = document.elementsFromPoint(clientX, clientY);
    for (var i = 0; i < els.length; i++) {
      var n = els[i].closest && els[i].closest(".node");
      if (n && n.dataset.id !== excludeId) return n.dataset.id;
    }
    return null;
  }

  function attachNodeDrag(wrap, node) {
    var body = wrap.querySelector(".node-body");
    body.addEventListener("mousedown", function (e) {
      if (e.target.closest(".next-anchor")) return;
      e.preventDefault();
      var start = localPoint(e);
      var offX = start.x - node.x, offY = start.y - node.y;
      wrap.style.transition = "none";
      function move(ev) {
        var p = localPoint(ev);
        node.x = Math.max(0, p.x - offX);
        node.y = Math.max(20, p.y - offY);
        positionNodeEl(node);
        layoutPointers();
        drawArrows();
      }
      function up() {
        wrap.style.transition = "";
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  function attachLinkDrag(anchor, fromNode) {
    anchor.addEventListener("mousedown", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var previewId = "link-preview-tmp";
      function move(ev) {
        var p = localPoint(ev);
        var a = rightAnchor(fromNode);
        var d = "M " + a.x + " " + a.y + " C " + ((a.x + p.x) / 2) + " " + a.y + ", " + ((a.x + p.x) / 2) + " " + p.y + ", " + p.x + " " + p.y;
        var existing = document.getElementById(previewId);
        if (existing) existing.setAttribute("d", d);
        else svg.insertAdjacentHTML("beforeend", '<path id="' + previewId + '" class="link-preview" d="' + d + '"></path>');
      }
      function up(ev) {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        var existing = document.getElementById(previewId);
        if (existing) existing.remove();
        var targetId = nodeIdAtPoint(ev.clientX, ev.clientY, fromNode.id);
        if (targetId) {
          fromNode.next = targetId;
          log(fromNode.label + ".next = " + targetId, "ok");
        } else {
          fromNode.next = null;
          log(fromNode.label + ".next = None", "ok");
        }
        renderAll();
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  function attachPointerDrag(flag, ptr) {
    flag.addEventListener("mousedown", function (e) {
      e.preventDefault();
      var start = localPoint(e);
      var offX = start.x - parseFloat(flag.style.left || 0);
      var offY = start.y - parseFloat(flag.style.top || 0);
      ptr.dragging = true;
      flag.classList.add("dragging");
      function move(ev) {
        var p = localPoint(ev);
        flag.style.left = (p.x - offX) + "px";
        flag.style.top = (p.y - offY) + "px";
        drawArrows();
      }
      function up(ev) {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        flag.classList.remove("dragging");
        ptr.dragging = false;
        var targetId = nodeIdAtPoint(ev.clientX, ev.clientY, null);
        if (targetId) {
          ptr.target = targetId;
          log(ptr.name + " = " + targetId, "ok");
        } else {
          ptr.target = null;
          log(ptr.name + " = None", "ok");
        }
        renderAll();
      }
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  /* ============================================================
     8. LINE-NUMBER GUTTER
     ============================================================ */
  var codeInput = document.getElementById("code-input");
  var lineNumbers = document.getElementById("line-numbers");

  function rebuildGutter() {
    var count = codeInput.value.split("\n").length;
    var html = "";
    for (var i = 0; i < count; i++) html += '<div class="ln" data-i="' + i + '">' + (i + 1) + "</div>";
    lineNumbers.innerHTML = html;
    lineNumbers.scrollTop = codeInput.scrollTop;
  }
  codeInput.addEventListener("input", function () { rebuildGutter(); haltProgram(); });
  codeInput.addEventListener("scroll", function () { lineNumbers.scrollTop = codeInput.scrollTop; });

  var activeLn = null;
  function highlightLine(lineNo) {
    if (activeLn) activeLn.classList.remove("active");
    if (lineNo == null) { activeLn = null; return; }
    activeLn = lineNumbers.querySelector('.ln[data-i="' + lineNo + '"]');
    if (activeLn) activeLn.classList.add("active");
  }
  function flashErrorLine(lineNo) {
    var el = lineNo == null ? null : lineNumbers.querySelector('.ln[data-i="' + lineNo + '"]');
    if (el) el.classList.add("err");
  }

  /* ============================================================
     9. EXECUTION DRIVER
     ============================================================ */
  var gen = null, finished = true, autoTimer = null, lastLineNo = null;

  function haltProgram() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; setRunLabel(false); }
    gen = null; finished = true;
    highlightLine(null);
  }

  function startProgram() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; setRunLabel(false); }
    resetState();
    clearLog();
    renderAll();
    var lines = tokenizeLines(codeInput.value);
    var built = buildBlock(lines, 0, 0);
    gen = runProgram(built.stmts);
    finished = false;
    lastLineNo = null;
    log("· running from the top ·", "hint");
  }

  function stepOnce() {
    if (!gen || finished) startProgram();
    try {
      var res = gen.next();
      if (res.done) {
        finished = true;
        highlightLine(null);
        log("· program finished — Restart to run again ·", "hint");
        if (autoTimer) { clearInterval(autoTimer); autoTimer = null; setRunLabel(false); }
        return false;
      }
      lastLineNo = res.value.lineNo;
      highlightLine(lastLineNo);
      renderAll();
      return true;
    } catch (e) {
      finished = true;
      log(e.message, "error");
      flashErrorLine(lastLineNo);
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; setRunLabel(false); }
      return false;
    }
  }

  function setRunLabel(running) {
    btnRun.textContent = running ? "⏸ Pause" : "▶ Run";
  }

  var btnStep = document.getElementById("btn-step");
  var btnRun = document.getElementById("btn-run");
  var btnReset = document.getElementById("btn-reset");
  var btnExample = document.getElementById("btn-example");
  var btnHelp = document.getElementById("btn-help");
  var popover = document.getElementById("popover");

  btnStep.addEventListener("click", function () {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; setRunLabel(false); }
    stepOnce();
  });

  btnRun.addEventListener("click", function () {
    if (autoTimer) {
      clearInterval(autoTimer); autoTimer = null; setRunLabel(false);
      return;
    }
    if (finished) startProgram();
    setRunLabel(true);
    autoTimer = setInterval(function () {
      var ok = stepOnce();
      if (!ok) { clearInterval(autoTimer); autoTimer = null; setRunLabel(false); }
    }, 800);
  });

  btnReset.addEventListener("click", function () {
    startProgram();
  });

  btnExample.addEventListener("click", function () {
    codeInput.value = EXAMPLE;
    rebuildGutter();
    startProgram();
  });

  btnHelp.addEventListener("click", function (e) {
    e.stopPropagation();
    popover.classList.toggle("show");
  });
  document.addEventListener("click", function (e) {
    if (!popover.contains(e.target) && e.target !== btnHelp) popover.classList.remove("show");
  });

  /* ============================================================
     10. RESIZABLE DIVIDER
     ============================================================ */
  (function () {
    var resizer = document.getElementById("resizer");
    var editorPane = document.getElementById("editor-pane");
    var dragging = false;
    resizer.addEventListener("mousedown", function () {
      dragging = true;
      resizer.classList.add("active");
      document.body.style.userSelect = "none";
    });
    document.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      var workRect = document.querySelector(".workspace").getBoundingClientRect();
      var w = Math.min(720, Math.max(340, e.clientX - workRect.left));
      editorPane.style.width = w + "px";
    });
    document.addEventListener("mouseup", function () {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove("active");
      document.body.style.userSelect = "";
    });
  })();

  /* ============================================================
     11. INIT
     ============================================================ */
  codeInput.value = EXAMPLE;
  rebuildGutter();
  renderAll();
  log("· press Step ▸ or Run to build the list ·", "hint");
})();
