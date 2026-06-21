// Comfyui_Nyaa_PromptLibrary  前端扩展
// 折叠树 + 搜索：从层级提示词库选择，写入隐藏 selection widget（随工作流保存）。
// 性能：折叠时不建 DOM（懒渲染），搜索在内存数据里做，避免一次性铺 1.4 万个选项。

import { app } from "../../scripts/app.js";

const NODE_NAME = "NyaaPromptLibrary";
const LIB_URL = "/nyaa_promptlibrary/library.json";
const SEARCH_LIMIT = 300; // 搜索结果最多显示条数，防止超长列表卡顿

// ---------------------------------------------------------------------------
// 库数据加载（全局一次，缓存 Promise）
// ---------------------------------------------------------------------------
let _libPromise = null;
function loadLibrary() {
    if (!_libPromise) {
        _libPromise = fetch(LIB_URL)
            .then((r) => r.json())
            .then((data) => {
                data._flat = buildSearchIndex(data.tree || []);
                return data;
            })
            .catch((e) => ({ version: 1, tree: [], _flat: [], error: String(e) }));
    }
    return _libPromise;
}

// 扁平搜索索引：每个非 Null 末端选项一条 {id, path[], name}
function buildSearchIndex(tree) {
    const flat = [];
    const walk = (node, path) => {
        const p = path.concat(node.name);
        if (node.dropdown) {
            for (const o of node.dropdown.options) {
                if (o.name === "Null") continue;
                flat.push({ id: node.dropdown.id, path: p, name: o.name });
            }
        }
        (node.children || []).forEach((c) => walk(c, p));
    };
    (tree || []).forEach((t) => walk(t, []));
    return flat;
}

// ---------------------------------------------------------------------------
// 样式（注入一次）
// ---------------------------------------------------------------------------
function injectStyle() {
    if (document.getElementById("nyaa-pl-style")) return;
    const css = `
.nyaa-pl{display:flex;flex-direction:column;gap:4px;width:100%;height:100%;
  box-sizing:border-box;font-size:12px;color:var(--input-text,#ddd);overflow:hidden;}
.nyaa-pl input.nyaa-search{width:100%;box-sizing:border-box;padding:4px 6px;
  border:1px solid var(--border-color,#444);border-radius:4px;
  background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);}
.nyaa-pl .nyaa-scroll{flex:1;overflow-y:auto;overflow-x:hidden;
  border:1px solid var(--border-color,#444);border-radius:4px;padding:2px;
  background:var(--comfy-menu-bg,#1a1a1a);}
.nyaa-pl .nyaa-row{display:flex;align-items:center;gap:4px;padding:1px 2px;
  cursor:pointer;border-radius:3px;white-space:nowrap;}
.nyaa-pl .nyaa-row:hover{background:rgba(255,255,255,.07);}
.nyaa-pl .nyaa-arrow{width:12px;display:inline-block;text-align:center;opacity:.7;flex:none;}
.nyaa-pl .nyaa-cat-name{overflow:hidden;text-overflow:ellipsis;}
.nyaa-pl .nyaa-children{padding-left:12px;border-left:1px dotted rgba(255,255,255,.12);
  margin-left:5px;}
.nyaa-pl .nyaa-dd{display:flex;flex-direction:column;gap:2px;padding:2px 2px 4px;}
.nyaa-pl .nyaa-dd-label{opacity:.65;font-size:11px;}
.nyaa-pl select.nyaa-select{width:100%;box-sizing:border-box;padding:2px 4px;
  border:1px solid var(--border-color,#444);border-radius:4px;
  background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);}
.nyaa-pl select.nyaa-select.picked{border-color:#5a8;color:#cfe;}
.nyaa-pl .nyaa-results{flex:1;overflow-y:auto;overflow-x:hidden;
  border:1px solid var(--border-color,#444);border-radius:4px;padding:2px;
  background:var(--comfy-menu-bg,#1a1a1a);}
.nyaa-pl .nyaa-res{display:flex;align-items:center;gap:6px;padding:3px 4px;
  cursor:pointer;border-radius:3px;}
.nyaa-pl .nyaa-res:hover{background:rgba(255,255,255,.07);}
.nyaa-pl .nyaa-res .rp{opacity:.55;font-size:10px;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;flex:1;}
.nyaa-pl .nyaa-res .rn{font-weight:600;flex:none;max-width:50%;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nyaa-pl .nyaa-res .rck{color:#5a8;flex:none;width:14px;text-align:center;}
.nyaa-pl .nyaa-hint{opacity:.5;padding:6px;text-align:center;}
.nyaa-pl .nyaa-bar{display:flex;gap:6px;align-items:center;}
.nyaa-pl .nyaa-count{opacity:.6;font-size:11px;flex:none;}
.nyaa-pl button.nyaa-clear{flex:none;padding:2px 6px;border-radius:4px;cursor:pointer;
  border:1px solid var(--border-color,#444);background:var(--comfy-input-bg,#222);
  color:var(--input-text,#ddd);}
`;
    const el = document.createElement("style");
    el.id = "nyaa-pl-style";
    el.textContent = css;
    document.head.appendChild(el);
}

// ---------------------------------------------------------------------------
// 单个节点的 UI 控制器
// ---------------------------------------------------------------------------
class PromptLibraryUI {
    constructor(node, selWidget) {
        this.node = node;
        this.selWidget = selWidget;
        this.sel = this._parseSel(selWidget.value); // {dropdown_id: option_name}
        this.renderedSelects = {}; // id -> <select>，用于反序列化后刷新
        this.lib = null;
        this.root = this._buildDom();
        loadLibrary().then((lib) => {
            this.lib = lib;
            this._renderTree();
            this._updateCount();
            if (lib.error) {
                this.tree.innerHTML =
                    `<div class="nyaa-hint">加载库失败：${lib.error}<br>请先运行 build_library.py</div>`;
            }
        });
    }

    _parseSel(v) {
        try {
            const o = JSON.parse(v || "{}");
            return o && typeof o === "object" ? o : {};
        } catch (e) {
            return {};
        }
    }

    _syncWidget() {
        this.selWidget.value = JSON.stringify(this.sel);
        this._updateCount();
        // 触发图变更（让序列化与画布刷新感知）
        this.node.setDirtyCanvas?.(true, true);
    }

    _updateCount() {
        if (!this.countEl) return;
        const n = Object.keys(this.sel).filter((k) => this.sel[k] && this.sel[k] !== "Null").length;
        this.countEl.textContent = `已选 ${n}`;
    }

    // ---- DOM 骨架 ----
    _buildDom() {
        const root = document.createElement("div");
        root.className = "nyaa-pl";

        const bar = document.createElement("div");
        bar.className = "nyaa-bar";
        const search = document.createElement("input");
        search.className = "nyaa-search";
        search.placeholder = "搜索选项名（末端标题）…";
        search.addEventListener("input", () => this._onSearch(search.value));
        const count = document.createElement("span");
        count.className = "nyaa-count";
        const clear = document.createElement("button");
        clear.className = "nyaa-clear";
        clear.textContent = "清空";
        clear.title = "清空所有已选";
        clear.addEventListener("click", () => this._clearAll());
        bar.append(search, count, clear);
        this.countEl = count;
        this.searchInput = search;

        const tree = document.createElement("div");
        tree.className = "nyaa-scroll nyaa-tree";
        const results = document.createElement("div");
        results.className = "nyaa-results";
        results.hidden = true;

        root.append(bar, tree, results);
        this.tree = tree;
        this.results = results;
        return root;
    }

    // ---- 树（懒渲染）----
    _renderTree() {
        this.tree.innerHTML = "";
        for (const node of this.lib.tree || []) {
            this.tree.appendChild(this._makeNode(node, []));
        }
        if (!(this.lib.tree || []).length) {
            this.tree.innerHTML = `<div class="nyaa-hint">库为空</div>`;
        }
    }

    _makeNode(node, path) {
        const wrap = document.createElement("div");
        const hasChildren = (node.children || []).length > 0;
        const hasDropdown = !!node.dropdown;

        const row = document.createElement("div");
        row.className = "nyaa-row";
        const arrow = document.createElement("span");
        arrow.className = "nyaa-arrow";
        arrow.textContent = hasChildren || hasDropdown ? "▶" : "·";
        const name = document.createElement("span");
        name.className = "nyaa-cat-name";
        name.textContent = node.name;
        row.append(arrow, name);

        const children = document.createElement("div");
        children.className = "nyaa-children";
        children.style.display = "none";

        let built = false;
        const myPath = path.concat(node.name);
        const toggle = () => {
            const open = children.style.display === "none";
            if (open && !built) {
                this._buildChildren(node, myPath, children);
                built = true;
            }
            children.style.display = open ? "block" : "none";
            arrow.textContent = open ? "▼" : "▶";
        };
        if (hasChildren || hasDropdown) row.addEventListener("click", toggle);

        wrap.append(row, children);
        return wrap;
    }

    _buildChildren(node, path, container) {
        if (node.dropdown) {
            container.appendChild(this._makeDropdown(node.dropdown, path));
        }
        for (const c of node.children || []) {
            container.appendChild(this._makeNode(c, path));
        }
    }

    _makeDropdown(dd, path) {
        const box = document.createElement("div");
        box.className = "nyaa-dd";
        const label = document.createElement("div");
        label.className = "nyaa-dd-label";
        label.textContent = "▾ 选择";

        const select = document.createElement("select");
        select.className = "nyaa-select";
        // 首项 Null
        const nullOpt = document.createElement("option");
        nullOpt.value = "";
        nullOpt.textContent = "Null（不输出）";
        select.appendChild(nullOpt);
        for (const o of dd.options) {
            if (o.name === "Null") continue;
            const opt = document.createElement("option");
            opt.value = o.name;
            opt.textContent = o.name;
            select.appendChild(opt);
        }
        const cur = this.sel[dd.id];
        select.value = cur && cur !== "Null" ? cur : "";
        this._markPicked(select);
        select.addEventListener("change", () => {
            this._setSel(dd.id, select.value);
            this._markPicked(select);
        });
        this.renderedSelects[dd.id] = select;

        box.append(label, select);
        return box;
    }

    _markPicked(select) {
        select.classList.toggle("picked", !!select.value);
    }

    _setSel(id, name) {
        if (!name || name === "Null") delete this.sel[id];
        else this.sel[id] = name; // 同 id 覆盖 → 天然单选互斥
        this._syncWidget();
    }

    _clearAll() {
        this.sel = {};
        this._syncWidget();
        for (const id in this.renderedSelects) {
            const s = this.renderedSelects[id];
            s.value = "";
            this._markPicked(s);
        }
        if (!this.results.hidden) this._onSearch(this.searchInput.value);
    }

    // ---- 搜索 ----
    _onSearch(kw) {
        kw = (kw || "").trim().toLowerCase();
        if (!kw) {
            this.results.hidden = true;
            this.tree.hidden = false;
            return;
        }
        this.tree.hidden = true;
        this.results.hidden = false;
        this.results.innerHTML = "";
        if (!this.lib) return;

        const hits = [];
        for (const f of this.lib._flat) {
            if (f.name.toLowerCase().includes(kw)) {
                hits.push(f);
                if (hits.length >= SEARCH_LIMIT + 1) break;
            }
        }
        if (!hits.length) {
            this.results.innerHTML = `<div class="nyaa-hint">无匹配</div>`;
            return;
        }
        const frag = document.createDocumentFragment();
        hits.slice(0, SEARCH_LIMIT).forEach((f) => frag.appendChild(this._makeResult(f)));
        this.results.appendChild(frag);
        if (hits.length > SEARCH_LIMIT) {
            const more = document.createElement("div");
            more.className = "nyaa-hint";
            more.textContent = `仅显示前 ${SEARCH_LIMIT} 条，请细化关键词`;
            this.results.appendChild(more);
        }
    }

    _makeResult(f) {
        const row = document.createElement("div");
        row.className = "nyaa-res";
        const ck = document.createElement("span");
        ck.className = "rck";
        const nm = document.createElement("span");
        nm.className = "rn";
        nm.textContent = f.name;
        const pp = document.createElement("span");
        pp.className = "rp";
        pp.textContent = f.path.join(" / ");
        const refresh = () => {
            ck.textContent = this.sel[f.id] === f.name ? "✓" : "";
        };
        refresh();
        row.append(ck, nm, pp);
        row.title = `${f.path.join(" / ")} → ${f.name}\n点击：选中 / 取消`;
        row.addEventListener("click", () => {
            // 点击切换：已选则取消，否则选中（同下拉互斥）
            const newVal = this.sel[f.id] === f.name ? "" : f.name;
            this._setSel(f.id, newVal);
            const s = this.renderedSelects[f.id];
            if (s) {
                s.value = newVal;
                this._markPicked(s);
            }
            refresh();
        });
        return row;
    }

    // 反序列化后（loadGraph）刷新已渲染的 select
    refreshFromValue() {
        this.sel = this._parseSel(this.selWidget.value);
        for (const id in this.renderedSelects) {
            const s = this.renderedSelects[id];
            const v = this.sel[id];
            s.value = v && v !== "Null" ? v : "";
            this._markPicked(s);
        }
        this._updateCount();
    }
}

// ---------------------------------------------------------------------------
// 隐藏后端自动生成的 selection 文本 widget（保留用于序列化与提交）
// ---------------------------------------------------------------------------
function hideWidget(widget) {
    widget.hidden = true;
    widget.computeSize = () => [0, -4];
    // 保持默认序列化（STRING widget 默认会序列化 value）
}

// ---------------------------------------------------------------------------
// 扩展注册
// ---------------------------------------------------------------------------
app.registerExtension({
    name: "nyaa.promptlibrary",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_NAME) return;
        injectStyle();

        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origCreated?.apply(this, arguments);

            const selWidget = this.widgets?.find((w) => w.name === "selection");
            if (!selWidget) return;
            hideWidget(selWidget);

            const ui = new PromptLibraryUI(this, selWidget);
            this._nyaaUI = ui;

            this.addDOMWidget("nyaa_tree", "nyaa", ui.root, {
                serialize: false, // 真正的值在 selection widget 上
                getHeight: () => 360,
            });

            // 给个合适初始尺寸
            const sz = this.computeSize();
            this.size[0] = Math.max(this.size[0], 300);
            this.size[1] = Math.max(this.size[1], sz[1] + 360);
        };

        const origLoaded = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            origLoaded?.apply(this, arguments);
            // 工作流加载后，selection widget.value 已恢复，刷新 UI
            if (this._nyaaUI) {
                // 延迟到下一帧，确保 widget.value 已写入
                requestAnimationFrame(() => this._nyaaUI.refreshFromValue());
            }
        };
    },
});
