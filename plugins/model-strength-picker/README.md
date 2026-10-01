# model-strength-picker（模型思考强度选择器）

为 DeepSeek Harness（DSH）的**第三方模型**补充可配置的思考强度档位。

UI 分两处：

- **模型选择器座位**（`conversation.input.model` 插槽，低优先级顶替内置选择器）：点击输入框工具行的「选择模型」按钮，弹出 **290px 宽的居中浮层**（按 `model-strength` 原型）：顶部胶囊（档位名 + 模型名 + ›）、底部推理强度滑块（轨道、档位圆点与旋钮全部为 **SVG 几何**：`<rect rx>` / `<circle>`，不使用 `border-radius`、`clip-path`、`transform` 或百分比宽度，因此在桌面端与网页端渲染一致）；**点击胶囊**在其正下方以 150ms 淡入展开模型下拉（44px 选项行、按压实色、选中 ✓，外部按下/Escape 收起，Ctrl+Shift+M 切换，档位名 150ms 淡入淡出）。浮层相对触发按钮水平居中、置于上方，随滚动/窗口变化重定位；面板崩溃时自动退位、内置选择器无缝接管。数据与 `/model` 命令共享同一份会话模型目录（`ctx.modelDirectories`），当前选中状态处处一致。
- **设置 → 模型 页底部**（`settings.models.footer` 插槽）：「思考强度档位」卡片，集中配置每个第三方模型提供的档位与思考开关格式。

## 它做什么

1. **档位声明（第三方模型的核心缺口）**
   手工录入 / 发现的 OpenAI 兼容模型默认不声明任何 reasoning level，组合器的 Effort 菜单不会出现。本插件把你在面板里勾选的档位写进 `llm-pi-ai` 配置中对应模型的 `reasoningEfforts`（档位 id → `reasoning_effort` 线级拼写；`off` 留空 = 不发送参数）。`providers` 是 volatile 配置，写入后立即生效，无需重启。
   - 可勾选档位：`off / minimal / low / medium / high / xhigh / max`
   - **思考开关格式**：DeepSeek 系模型经 OpenAI 兼容网关接入时「默认一直思考」，off 不发送参数无法关闭 —— 选择 `DeepSeek 兼容` 会为该模型写 `compat.thinkingFormat: deepseek`（off 发送 `thinking: {type: disabled}`，其余档位发送 `thinking: {type: enabled}` + effort）。
2. **应用档位（当前会话）**
   滑块提交后调用内置 `session.selectModel`（provider + model + reasoningEffort），即组合器 Effort 菜单的同一通道，并作为新会话的默认选择持久化。

## 安装

任选其一（把 `<路径>` 换成插件目录的绝对路径）：

- **DSH Web UI**：侧边栏「插件 / Plugins」→ 安装 → 本地路径 `<路径>`。
- **在 DSH 会话里让 agent 装**：「请用 plugin_manager 安装本地 bundle：<路径>」。
- **CLI**：`dsh plugin --profile <profile> add <路径>`

`<路径>` = 本目录（含 `package.json` 与 `cordis.patch.yml`）。本 bundle **零外部依赖**，可离线安装。

## 使用

1. 安装后（必要时刷新页面），点击输入框里的「选择模型」按钮即弹出模型 + 强度面板。
2. 列表选模型、拖动滑块选强度，即选即用（提交完整选择，并保存为新会话默认）。
3. 配置档位：打开 **设置 → 模型**，页面底部「思考强度档位」卡片列出所有第三方（OpenAI 兼容）模型——点「编辑」勾选要提供的档位、按需选择思考开关格式 → 保存。保存后立即生效，选择器的强度滑块即出现这些档位。

## 文件结构

```
model-strength-picker/
├── package.json          dsh.bundle.patch + dsh.client（web 客户端模块）
├── cordis.patch.yml      插入宿主插件行（id: model-strength-picker）
├── index.js              宿主半边：空实现（全部逻辑在客户端模块）
├── client.js             Web 面板（React，挂 conversation.composer.dock）
├── icon.svg / locale/    插件卡片图标与展示文案
└── README.md
```

## 注意事项与边界

- **适用范围**：档位声明只对 `llm-pi-ai` 路由的模型可编辑；DeepSeek 官方路由（`llm-deepseek` 适配器）自带 Off/Low/High/Max，无需也不可在此配置。
- 档位的线级拼写默认与档位同名（如 `high` → `reasoning_effort: "high"`）；网关自有词汇（如 `max: xhigh`）可手动编辑 profile 的 `cordis.patch.yml` 微调。
- 面板写入 `llm-pi-ai` 时会把读取到的该路由 `models` 列表整体回写（数组整体替换语义），因此对同一模型条目上其它字段是保留式编辑；与 Models 页共用同一配置层。
- **从 v0.1.x 升级**：旧版的「子 Agent 默认」功能已删除。若你当时设置过，其值仍留在 profile 补丁 `tool-subagent` 行的 `agentOptions.reasoningEffort`，不需要时请在 `$DSH_HOME/profiles/<profile>/cordis.patch.yml` 中手动移除该键。
- DSH 处于开发者预览阶段，`settings` / `session` remote 的形态可能变化；若更新后失效，按新版本调整 `client.js`。

## 实现备注：滑块为什么用 SVG

桌面端（Electron 壳）曾经把滑块画错：档位圆点渲染成**方块**（`border-radius: 50%` 被丢弃）、旋钮渲染成**方圆角**（`border-radius: 9999px` 解析异常），而同样的写法在浏览器里完全正常。逐步排查后确认：

- 不是版本或缓存问题（已核对三份副本与符号链接）；
- 不是圆角写法问题（隔离页面上 `3px` / `50%` / `9999px` / SVG 四种写法在桌面端**全部正常**）；
- 因此把几何整体移入 SVG 后，桌面端与网页端渲染一致。

滑块相关的 `border-radius`、`clip-path`、`transform`、百分比宽度已**全部移除**，请勿在后续改动中重新引入。
