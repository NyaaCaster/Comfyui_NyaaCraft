# -*- coding: utf-8 -*-
"""
gen_library_src.py  —  一次性：把 data/library.json 反编译成可维护的分支源文件。

输出到 library_src/<NN>_<分支名>.json，每个顶层分支一个文件。
源 schema 极简，便于手工维护：
  {
    "name": "分支名",
    "options": [ {"name":"选项名","p":"正面,","n":"负面,"}, ... ],   # 该节点下拉的选项（可空/不存在）
    "children": [ <同结构子节点>, ... ]                               # 子分类（可空/不存在）
  }
下拉 id 和首项 Null 由 build_library.py 构建时自动生成，源文件无需关心。

用法：
  & "I:\\...\\python_embeded\\python.exe" tools/gen_library_src.py
"""

import os
import re
import sys
import json
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / "data" / "library.json"
OUT = ROOT / "library_src"


def slugify(name: str) -> str:
    # 替换 Windows 文件名非法字符
    return re.sub(r'[\\/:*?"<>|]', "_", name).strip() or "branch"


def to_src(node: dict) -> dict:
    out = {"name": node["name"]}
    dd = node.get("dropdown")
    if dd:
        opts = []
        for o in dd.get("options", []):
            if o["name"] == "Null":
                continue
            # 始终保留 p/n 槽位，方便手工填写
            opts.append({"name": o["name"], "p": o.get("p", ""), "n": o.get("n", "")})
        out["options"] = opts
    children = node.get("children", [])
    if children:
        out["children"] = [to_src(c) for c in children]
    return out


def main():
    data = json.loads(LIB.read_text(encoding="utf-8"))
    tree = data.get("tree", [])
    OUT.mkdir(parents=True, exist_ok=True)
    for i, branch in enumerate(tree):
        src = to_src(branch)
        fname = f"{i:02d}_{slugify(branch['name'])}.json"
        (OUT / fname).write_text(
            json.dumps(src, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    print(f"已生成 {len(tree)} 个分支源文件 -> {OUT}")


if __name__ == "__main__":
    main()
