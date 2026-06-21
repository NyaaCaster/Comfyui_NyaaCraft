#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_library.py  —  Comfyui_NyaaCraft / PromptLibrary 构建脚本

从 library_src/ 下的分支源文件编译出运行时数据 data/library.json。
（已彻底取代旧的 md 解析流程；.ref/ 下的 md 仅作本地存档，不再参与构建。）

源文件 schema（library_src/<NN>_<分支名>.json，每个顶层分支一个）：
  {
    "name": "分支名",
    "options": [ {"name":"选项名","p":"正面提示词","n":"负面提示词"}, ... ],   # 该节点下拉选项，可省略
    "children": [ <同结构子节点>, ... ]                                      # 子分类，可省略
  }

构建时自动完成：
  - 每个含 options 的节点生成一个下拉，下拉 id 由路径 hash 计算（与历史一致，旧工作流不失效）；
  - 每个下拉自动在首位插入 Null 选项（选中表示该分支不输出）；
  - 空的 p/n 自动省略；非空的 p/n 统一补半角英文逗号结尾。

用法（必须用项目内置 python_embeded）：
  & "I:\\ComfyUI_windows_portable\\python_embeded\\python.exe" build_library.py
"""

import os
import sys
import json
import hashlib
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent
SRC_DIR = ROOT / "library_src"
OUT_DIR = ROOT / "data"
OUT_JSON = OUT_DIR / "library.json"

_stats = {"branches": 0, "dropdowns": 0, "options": 0}


def path_id(path_parts):
    raw = "/".join(path_parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def norm_commas(s: str) -> str:
    """拆分、去空白、丢空项、重连；非空则补半角逗号结尾。"""
    if not s:
        return ""
    parts = [p.strip() for p in s.split(",")]
    parts = [p for p in parts if p]
    return (",".join(parts) + ",") if parts else ""


def build_node(node, path_parts):
    """path_parts 已包含本节点名（末段）。返回运行时节点 dict。"""
    name = node["name"]
    out = {"name": name}

    children = node.get("children") or []
    if children:
        out["children"] = [build_node(c, path_parts + [c["name"]]) for c in children]

    options = node.get("options") or []
    if options:
        out_opts = [{"name": "Null"}]
        for o in options:
            opt = {"name": o["name"]}
            p = norm_commas(o.get("p", ""))
            n = norm_commas(o.get("n", ""))
            if p:
                opt["p"] = p
            if n:
                opt["n"] = n
            out_opts.append(opt)
        # 下拉 id：与历史方案一致（末段路径重复一次）
        out["dropdown"] = {"id": path_id(path_parts + [name]), "options": out_opts}
        _stats["dropdowns"] += 1
        _stats["options"] += len(out_opts) - 1
    return out


def main():
    print("=" * 60)
    print("Comfyui_NyaaCraft  PromptLibrary 构建")
    print("=" * 60)
    if not SRC_DIR.is_dir():
        print(f"[错误] 源目录不存在: {SRC_DIR}")
        return

    files = sorted(SRC_DIR.glob("*.json"))
    if not files:
        print(f"[错误] {SRC_DIR} 下没有 .json 源文件")
        return

    tree = []
    for fp in files:
        branch = json.loads(fp.read_text(encoding="utf-8"))
        tree.append(build_node(branch, [branch["name"]]))
        _stats["branches"] += 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {"version": 1, "format": "sd", "tree": tree}
    OUT_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    size_mb = OUT_JSON.stat().st_size / (1024 * 1024)
    print(f"顶层分支: {_stats['branches']}")
    print(f"下拉列表: {_stats['dropdowns']}")
    print(f"选项(不含Null): {_stats['options']}")
    print(f"输出: {OUT_JSON}  ({size_mb:.2f} MB)")
    print("完成。")


if __name__ == "__main__":
    main()
