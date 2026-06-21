# -*- coding: utf-8 -*-
"""
🐈Nyaa_PromptLibrary（NyaaCraft 工程内 · V1 节点）

从预处理生成的 data/library.json 读取带层级的提示词库。
前端折叠树/搜索负责选择，把选择状态（{dropdown_id: 选中项名}）写入隐藏的
`selection` STRING widget。本节点在执行时按选择拼接 Prompt / Negative，
去重、保证半角英文逗号结尾后从两个输出端口输出。
"""

import os
import json

# ---------------------------------------------------------------------------
# 库数据加载（模块级懒加载 + 缓存）
# 本文件位于 <工程>/nodes/，data 在工程根目录下，故上溯一级。
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
LIBRARY_PATH = os.path.join(_ROOT, "data", "library.json")

# 索引：dropdown_id -> { option_name -> {"p":.., "n":..} }
_INDEX = None
# 顺序：dropdown_id -> 树遍历序号（保证多选拼接顺序稳定，符合分类从上到下）
_ORDER = None
_LOAD_MTIME = None


def _build_index(tree):
    index = {}
    order = {}
    counter = [0]

    def walk(node):
        dd = node.get("dropdown")
        if dd:
            opts = {}
            for o in dd.get("options", []):
                if o["name"] == "Null":
                    continue
                opts[o["name"]] = {"p": o.get("p", ""), "n": o.get("n", "")}
            index[dd["id"]] = opts
            order[dd["id"]] = counter[0]
            counter[0] += 1
        for c in node.get("children", []):
            walk(c)

    for t in tree:
        walk(t)
    return index, order


def _ensure_loaded():
    """加载并缓存索引；library.json 改动（mtime 变化）时自动重载。"""
    global _INDEX, _ORDER, _LOAD_MTIME
    try:
        mtime = os.path.getmtime(LIBRARY_PATH)
    except OSError:
        _INDEX, _ORDER = {}, {}
        return _INDEX, _ORDER
    if _INDEX is None or mtime != _LOAD_MTIME:
        with open(LIBRARY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        _INDEX, _ORDER = _build_index(data.get("tree", []))
        _LOAD_MTIME = mtime
    return _INDEX, _ORDER


# ---------------------------------------------------------------------------
# 括号感知切分 + 去重（避免 (a,b:1.2) 这类复合权重被逗号拆坏）
# ---------------------------------------------------------------------------
def _split_tags(s):
    """按顶层逗号切分，括号内逗号不切。返回去空白后的非空 token 列表。"""
    tags = []
    buf = []
    depth = 0
    for ch in s:
        if ch in "([":
            depth += 1
            buf.append(ch)
        elif ch in ")]":
            depth = max(0, depth - 1)
            buf.append(ch)
        elif ch == "," and depth == 0:
            tok = "".join(buf).strip()
            if tok:
                tags.append(tok)
            buf = []
        else:
            buf.append(ch)
    tok = "".join(buf).strip()
    if tok:
        tags.append(tok)
    return tags


def _join_dedup(parts):
    """合并多段提示词，去重（保序留首次，按小写归一），保证非空时逗号结尾。"""
    seen = set()
    out = []
    for seg in parts:
        for tag in _split_tags(seg):
            key = tag.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(tag)
    if not out:
        return ""
    return ",".join(out) + ","


# ---------------------------------------------------------------------------
# 节点（V1）
# ---------------------------------------------------------------------------
class NyaaPromptLibrary:
    CATEGORY = "🐈Comfyui_NyaaCraft"
    FUNCTION = "run"
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("Prompt", "Negative Prompt")
    DESCRIPTION = "从层级提示词库中选择并输出 Prompt / Negative Prompt（折叠树 + 搜索）。"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # 前端折叠树把选择状态写入此隐藏 widget：{dropdown_id: 选中项名}
                "selection": ("STRING", {"multiline": True, "default": "{}"}),
            }
        }

    def run(self, selection):
        index, order = _ensure_loaded()

        try:
            sel = json.loads(selection) if selection else {}
            if not isinstance(sel, dict):
                sel = {}
        except (ValueError, TypeError):
            sel = {}

        # 按树遍历顺序排序选中的下拉，保证拼接稳定
        chosen = []
        for dd_id, opt_name in sel.items():
            if not opt_name or opt_name == "Null":
                continue
            opts = index.get(dd_id)
            if not opts:
                continue
            entry = opts.get(opt_name)
            if entry is None:
                continue
            chosen.append((order.get(dd_id, 1 << 30), entry))
        chosen.sort(key=lambda x: x[0])

        prompt = _join_dedup([e["p"] for _, e in chosen if e.get("p")])
        negative = _join_dedup([e["n"] for _, e in chosen if e.get("n")])

        return (prompt, negative)


NODE_CLASS_MAPPINGS = {"NyaaPromptLibrary": NyaaPromptLibrary}
NODE_DISPLAY_NAME_MAPPINGS = {"NyaaPromptLibrary": "🐈Nyaa_PromptLibrary"}
