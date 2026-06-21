# -*- coding: utf-8 -*-
"""
🐈Comfyui_NyaaCraft
ComfyUI custom node tools for Prompts with Nyaa.

整合三个节点（均为 V1）：
  - 🐈Nyaa_PromptLibrary   层级提示词库（折叠树 + 搜索）
  - 🐈NSFW-Market          结构化 NSFW 提示词选择器
  - 🐈Nyaa_FreeLLM Chat    OpenAI 兼容 Chat API（文本对话 / 图像分析）

FreeLLM Chat 改造自 Lingyuzhou111/Comfyui_Free_API（Apache-2.0），见 LICENSE_FreeLLM_Apache2.0。
"""

import os

from .nodes.prompt_library import (
    NODE_CLASS_MAPPINGS as _PL_CLS,
    NODE_DISPLAY_NAME_MAPPINGS as _PL_DISP,
    LIBRARY_PATH,
)
from .nodes.nsfw_market import (
    NODE_CLASS_MAPPINGS as _NSFW_CLS,
    NODE_DISPLAY_NAME_MAPPINGS as _NSFW_DISP,
)
from .nodes.freellm_chat import (
    NODE_CLASS_MAPPINGS as _LLM_CLS,
    NODE_DISPLAY_NAME_MAPPINGS as _LLM_DISP,
)

NODE_CLASS_MAPPINGS = {}
NODE_CLASS_MAPPINGS.update(_PL_CLS)
NODE_CLASS_MAPPINGS.update(_NSFW_CLS)
NODE_CLASS_MAPPINGS.update(_LLM_CLS)

NODE_DISPLAY_NAME_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS.update(_PL_DISP)
NODE_DISPLAY_NAME_MAPPINGS.update(_NSFW_DISP)
NODE_DISPLAY_NAME_MAPPINGS.update(_LLM_DISP)

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

# ---------------------------------------------------------------------------
# 前端折叠树加载库数据的路由（沿用原路径，前端 js 无需改动）
# ---------------------------------------------------------------------------
try:
    from aiohttp import web
    from server import PromptServer

    @PromptServer.instance.routes.get("/nyaa_promptlibrary/library.json")
    async def _serve_library(request):
        if os.path.isfile(LIBRARY_PATH):
            return web.FileResponse(LIBRARY_PATH, headers={"Cache-Control": "no-cache"})
        return web.json_response(
            {"version": 1, "tree": [], "error": "library.json 不存在，请先运行 build_library.py"},
            status=404,
        )
except Exception as e:  # pragma: no cover
    print(f"[NyaaCraft] 路由注册跳过: {e}")
