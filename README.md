# 🐈Comfyui_NyaaCraft

ComfyUI custom node tools for Prompts with Nyaa.

整合三个节点，统一归属于 `🐈Comfyui_NyaaCraft` 分类：

| 节点 | 内部 ID | 说明 |
|---|---|---|
| 🐈Nyaa_PromptLibrary | `NyaaPromptLibrary` | 层级提示词库，折叠树 + 搜索，输出 Prompt / Negative Prompt |
| 🐈Nyaa_NSFW-Market | `NSFWPromptSelector` | 结构化 NSFW 提示词选择器，输出正面 / 负面 / 完整提示词 |
| 🐈Nyaa_FreeLLM Chat | `OpenAI_Chat_API` | OpenAI 兼容 Chat API，文本对话 / 图像分析 |

## 安装

进入 ComfyUI 的 `custom_nodes` 目录，克隆本仓库：

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/NyaaCaster/Comfyui_NyaaCraft.git
```

安装依赖（Windows 便携版请使用内置 `python_embeded`，下面用相对路径执行）：

```powershell
cd Comfyui_NyaaCraft
& "..\..\..\python_embeded\python.exe" -m pip install -r requirements.txt
```

重启 ComfyUI，三个节点都在菜单 `🐈Comfyui_NyaaCraft` 分类下。

> 依赖仅 `requests`（🐈Nyaa_FreeLLM Chat 调用 API 用）。其余 torch / numpy / Pillow / aiohttp 均为 ComfyUI 自带，通常无需安装。

## 目录结构

```
Comfyui_NyaaCraft/
├── __init__.py              # 聚合三节点映射 + WEB_DIRECTORY + library 路由
├── nodes/
│   ├── prompt_library.py    # 🐈Nyaa_PromptLibrary
│   ├── nsfw_market.py       # 🐈Nyaa_NSFW-Market
│   └── freellm_chat.py      # 🐈Nyaa_FreeLLM Chat
├── js/prompt_library.js     # PromptLibrary 前端（折叠树 + 搜索）
├── library_src/             # PromptLibrary 维护源：按顶层分支拆分的 JSON（手工编辑这里）
│   └── NN_<分支名>.json
├── data/library.json        # 运行时提示词库（由 build_library.py 从 library_src/ 生成）
├── build_library.py         # 构建：library_src/*.json → data/library.json
├── tools/gen_library_src.py # 一次性：从 library.json 反向生成 library_src/（已用过，备查）
├── requirements.txt         # 仅 requests
├── LICENSE                  # Apache-2.0
├── pyproject.toml / README.md
```

## 提示词库维护（仅 PromptLibrary）

直接编辑 `library_src/` 下对应分支的 JSON 文件（按顶层分类拆分，每个文件结构清晰）：

- 节点 schema：`{"name": "...", "options": [{"name":"...","p":"正面","n":"负面"}], "children": [...]}`
- 新增一个选项 = 在某节点的 `options` 数组里加一条；新增分类 = 加一个 `children` 节点。
- `p` / `n` 留空即可（构建时自动省略）；非空内容会自动补半角逗号结尾，无需手动加。
- 下拉 id 和首位的 `Null` 选项由构建脚本自动生成，**不要手写**。

编辑后在本目录（`ComfyUI/custom_nodes/Comfyui_NyaaCraft`）用便携版内置 Python 重新构建：

```powershell
& "..\..\..\python_embeded\python.exe" build_library.py
```

节点按 `library.json` 的修改时间自动重载，无需重启 ComfyUI。

> 注：下拉 id 由"分类路径"hash 得出。只要不改动某分类的层级路径，重命名/增删选项都不会让旧工作流里该下拉的已选项失效；若重命名了某层**分类名**，该分支下拉的旧选择会失效（属预期）。


## 致谢 / License

本仓库以 **Apache-2.0** 发布。其中 🐈Nyaa_FreeLLM Chat 节点改造自
[Lingyuzhou111/Comfyui_Free_API](https://github.com/Lingyuzhou111/Comfyui_Free_API)（同为 Apache-2.0），
原始作者与贡献者的版权及署名予以保留。
