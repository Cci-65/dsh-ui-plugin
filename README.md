# DeepSeek Harness 视觉皮肤与输入栏交互增强 (`@local/dsh-ui`)

专为 **DeepSeek Harness** 定制的 1:1 视觉还原与交互增强套件，完美复刻 Antigravity 风格的空状态欢迎区（Hero）与输入卡片（Composer）交互界面。

## 🗂 首页悬浮卡片抽屉（v1.1.25 起为「原生侧栏托管模式」）

**仅在侧栏收起状态**（`[data-sidebar-collapsed]`）下，鼠标移到固定栏**首页按钮**即唤出一张独立悬浮卡片——**内容就是宿主原生宽态侧栏本身**（品牌行 / 新会话胶囊 / 工作区三入口 / 工作区文件夹 / 会话列表 / 底部设置全部原生渲染，零复刻、零维护）：

- **开合**：悬停（真实移动门禁）/ 键盘 focus 唤起 → 原生 `toggleSidebar` 展开 + 托管类把侧栏列套进卡片壳；移出热区 → 壳 180ms 淡出 → 瞬时收回。先淡出再收回，聊天区零推挤零闪跳。**无点击钉住**。
- **防推挤**：托管期间把 frame 的 `grid-template-columns` 用 `!important` 钉在收起态值，聊天区纹丝不动；收起动画结束才解钉。用户自己展开的侧栏绝不接管；插件卸载自动恢复宿主原状。
- **定位**：`left: 72px`（距固定栏 8px）／顶部避开标题栏 +6px／底部悬空 14px／宽 268px／14px 全圆角／纯白底 + 1px `#E5E7EB` 封闭浅灰边框／柔和悬浮投影／`z-index: 1000`。纯 Overlay 悬浮覆盖，**不参与文档流、不推挤聊天区**。
- **内容**：v1.1.25 起不再复刻——品牌行（鲸鱼 + deepseek + HARNESS 徽标）、`新会话` 胶囊、`工作区` 小节（搜索 / 排序与筛选 / 新建工作区三入口）、工作区文件夹、会话列表、底部设置，全部来自宿主原生渲染，视觉与交互与原生侧栏 100% 一致且随宿主升级自动跟随。
- **工作区行图标布局**（v1.1.41，截图锁定）：三个图标 **位于区头右端**（`[工作区] …… [🔍][⇄][📁+]`），与原生侧边栏一致。宿主区头是 `justify-content:flex-end`，把图标组顶到右端的真正机制是搜索槽的 `flex:1 + margin-left:auto`（自动外边距吸走剩余空间，使 searchSlot 与紧随的 ⇄ / 📁+ 一并贴右）。v1.1.40 曾误读标注图、将其翻转为左对齐并清零 `margin-left`，反而把图标拽到「工作区」标签旁；本版撤销该翻转，并在托管卡片作用域内**显式补回 `margin-left:auto`**，不依赖宿主日后是否仍保留该声明——**仅托管卡片作用域**，原生侧边栏不受影响。
- **数据**：会话/工作区直接读 `ctx.sessions.list` / `ctx.workspaces.list` 快照；打开会话 = 原生 `uiWorkspace.openSession(id)`，新建会话 = 原生 `uiWorkspace.startSession()`。
- **终止条件**：侧栏一展开立即收起隐藏，且由 `data-sidebar-collapsed` 属性观察器即时响应。

```powershell
node --test tests/bridge.test.mjs tests/home-drawer.test.mjs   # 或 npm test（22 例；pretest 会先自动构建）
```

## 🧱 源码结构与构建（v1.1.26 起）

client 代码已做**源码层拆分、构建期合成**：宿主 client-modules 的组合路由要求「每个包一个 bundle 文件」（`/plugins/??<pkg>/client.js&rev=<rev>` 以 `<script>` 注入，非 ESM、无包内子路径 require——已在宿主源码层面核实），因此运行时保持单文件产物，维护时 CSS 与 JS 分离：

| 文件 | 角色 |
|---|---|
| `client-app.js` | 模块逻辑源文件（CSS 位置是 `const CSS = "__DSH_UI_STYLES__";` 占位符） |
| `styles.css` | 皮肤样式源文件（原始 CSS，构建时转义内嵌进产物模板字面量） |
| `build.mjs` | 构建脚本：占位符替换 + 转义 + `vm.Script` 语法检查，输出确定性 |
| `client.js` | **构建产物**（文件头有「请勿直接编辑」横幅），宿主实际加载的文件 |

日常修改流程：编辑 `client-app.js` / `styles.css` → `node build.mjs`（`npm test` 的 pretest 也会先构建）→ 重启 DeepSeek Harness。宿主按 `client.js` 的 mtime/ctime/size 计算组合路由 rev，重新构建即自动失效缓存，无需手动清理。

锚点维护：皮肤依赖的全部宿主 DOM 锚点集中在 `client-app.js` 的 `HOST_ANCHORS` 注册表（27 项，含 tier 分级与用途说明）；控制台可随时 `window.__dshUiHealth.check()` 全量复检。

## ⬅️➡️ 左上角历史导航（v1.1.2 新增）

标题栏**左上角**（贴窗口最左上、位于固定栏顶部拖拽区内，即视频里 ChatGPT 的 ← → 位置）新增 ← → 两个按钮：

- **← 返回**（快捷键 `Ctrl+[`）/ **→ 前进**（快捷键 `Ctrl+]`），在按钮上悬停可见快捷键提示。
- 记录**两级视图历史**：全局面板（会话/插件/定时任务）+ 当前展示的会话，浏览器式前进后退；例如 会话 → 插件面板 → 定时任务面板 后，`Ctrl+[` 两次回到会话，`Ctrl+]` 前进。
- 无历史可退/可进时按钮自动置灰；对接原生 `layout.selectPanel` 与 `uiWorkspace.openSession`，历史变更由 MutationObserver（aria-current）与每帧扫描共同驱动，插件禁用即整体移除。

## 🧭 最左固定图标栏 (Fixed Icon Rail, v1.1.0 新增)

复刻 ChatGPT 桌面版最左侧的固定图标栏：64px 全高、始终固定显示（主界面/会话/设置模态下均不消失），应用框架整体右移让位。

| 槽位（从上到下） | 图标 | 行为（原生优先，逐级回退） |
|---|---|---|
| 首页 | 双态房子（灰描边/黑实心） | `uiWorkspace.startSession()` 新建会话 → 回退：点击原生「新会话」按钮 → 回退：Ctrl+N；处于会话视图时为选中态 |
| 自动化任务 | 双态时钟（灰描边/黑实心） | `layout.selectPanel('schedules')` 打开原生定时任务面板 → 回退：点击原生面板行 |
| 插件 | 双态插头（灰描边/黑实心，2-01.svg） | `layout.selectPanel('plugins')` 打开原生插件管理面板 → 回退：点击原生面板行 |
| 用量统计 | 双态柱状图（灰条/黑框柱状图，2-02.svg；原技能槽位） | **作为独立页面在中央打开**（注册 key 为 `usage` 的主面板，整页嵌入用量仪表盘，与插件/定时任务面板同机制；面板打开期间为选中态）。回退：原生用量按钮（弹原生 Modal）→ iframe 兜底弹窗 |
| 更多 | 三个点 | 弹出菜单：设置（Ctrl+,）／用量统计／快捷键速查（Ctrl+/）／重新加载界面 |
| 头像（底部） | 头像（登录后镜像原生头像） | **唯一的账号入口（S5 已并入）**：触发原生账号菜单（弹出位置统一校正到固定栏右侧 68px、贴窗口底 10px——视频位置，展开/收起态一致）；原生触发器不可用时回退自制菜单：头部（名称+余额）＋剩余用量／设置／帮助子菜单 |

双态图标（v1.1.1）：未点击 = `#C5C5C5` 描边，点击选中 = 黑色实心 + 浅灰圆角底（深色主题下选中色跟随主标签色）；图标源文件为用户提供的三张 AI 矢量（每张含左右两态，按左右半区拆分）。技能按钮已按需求从固定栏移除（技能面板仍可从输入栏底部「技能」打开）。

细节：

- **标题栏（含 T4 窗口控制按钮）统一底色 #f5f5f5**：原生 WCO 按钮底色由 preload 探针读取 `--dsw-specific-sidebar-fill` 后经 `windowsAppearance` IPC 同步给主进程；插件将探针元素上的该变量覆写为 #f5f5f5（仅浅色主题，S 区与深色主题不受影响），注入样式即触发同步。
- 悬停显示黑色胶囊 tooltip（与视频原版一致），激活面板（插件/自动化任务）带浅灰圆角底高亮，通过订阅 `panelInfo` 实时同步。
- **账号菜单接真数据**：bridge 新增 `/api/usage`（读取 `.dshw-usage.json` 与 `.dsh-usage-stats.json`），菜单头部显示「余额 ¥X.XX」，「剩余用量」行右侧同步显示，点击打开用量统计仪表盘（原生按钮优先，缺失时 iframe 兜底）；「帮助」行悬停展开二级子菜单（快捷键速查／用量统计），与视频同款交互。
- **设置模态下固定栏常亮**：栏 z-index 1001，高于原生模态遮罩（1000）、低于原生菜单/气泡（1100），复刻视频"设置视图里侧栏不变暗"。
- **头像镜像原生账户**：登录后自动镜像原生账号头像（`<img>` 与 `background-image` 两种形态都支持），未登录显示人像兜底图。
- 用量统计优先点击原生「用量统计」按钮（token-usage-stats 插件的仪表盘），缺失时用内嵌 iframe 兜底弹窗。
- 配色全部走宿主 `--dsw-*` 变量，深色主题自动适配；标题栏侧栏开关按钮与菜单起点同步右移，不与固定栏重叠。
- 第二列侧栏中的原生「插件/定时任务」行由固定栏接管，已隐藏避免重复；禁用本插件即自动恢复。

## 🌟 视觉与交互特性 (1:1 还原)

1. **顶部品牌区 (Hero Header)**：
   - 居中呈现 DeepSeek 标志性深色小鲸鱼图标
   - **探索未至之境** 主标题（26px，字重 500）
   - **预览版** 药丸状小徽标（淡紫蓝背景 `#EEF2FB`，深蓝文字 `#2F54EB`，999px 全圆角）

2. **核心输入卡片 (Composer Card)**：
   - 纯白极简卡片容器（`#FFFFFF`，24px 大圆角，微阴影与精致边框）
   - 占位符提示词：`描述你想要构建的内容, / 调用指令, @ 文件或对话`
   - **底部左侧工具栏**：
     - 圆形背景的 `+` 指令/附加菜单按钮（直径 28px，底色 `#F4F5F6`）
     - `工作区内修改` 权限/模式指示芯片（盾牌图标 + 下拉指示箭头 `v`）
   - **底部右侧工具栏**：
     - 模型指示器（支持 `DeepSeek-V4.1-Flash High` 及动态切换）
     - 经典圆形发送按钮（直径 34px，空内容时呈淡柔蓝 `#B2C7F4`，输入文字后动态高亮为深蓝 `#4176E6`，居中实体白色上升箭头 `↑`）

3. **底部附着状态栏 (Attached Bottom Bar)**：
   - 严丝合缝紧贴输入卡片下方，底色采用优雅浅灰 `#F3F3F3`（圆角 `0 0 16px 16px`）
   - **📁 选择项目**（工作区选择芯片，默认显示“选择项目”，选定后即显示对应项目名称，已消除切换抖动）
   - **⚛ 标准模式**（当前智能体模式芯片，已消除过渡动画抖动）
   - **🧊 技能**（技能快捷芯片，带有立体三层等轴六边形图标，点击即弹出精美技能快捷面板并支持一键插入 `/使用技能`）

---

## 🚀 安装方式 (直接安装到 DeepSeek Harness)

### 方法一：自动安装脚本（推荐）

安装脚本会更新 DeepSeek Harness Desktop Profile，替换已有的 `dsh-ui` 安装，并清理旧版 `dsh-antigravity-composer` 安装目录与注册项。运行前请确认这些旧文件不需要保留。

在终端中运行：
```powershell
python install.py
```
或
```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

### 方法二：手动安装

1. **链接插件包**：
   将本目录拷贝或软链接至 `%USERPROFILE%\.dsh\plugin\dsh-ui`。

2. **在 Desktop Profile 中注册**：
   - 在 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 的 `dsh.profile.bundles` 中添加 `"@local/dsh-ui"`。
   - 在 `dependencies` 中添加 `"@local/dsh-ui": "link:<你的用户目录>/.dsh/plugin/dsh-ui"`。

3. **启用插件补丁**：
   在 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 中添加：
   ```yaml
   - id: dsh-ui
     disabled: false
     config: {}
   ```

4. 重启 DeepSeek Harness 即可生效。

---

## 🛡 v1.1.3 安全与稳定性说明

本版本为审查驱动的加固版本，行为变化如下（完整清单见 [CHANGELOG.md](./CHANGELOG.md)）：

**bridge（本地服务，127.0.0.1:19389）**
- 仅接受本机来源请求：校验 Host（防 DNS rebinding）与 Origin（防网页 CSRF），其余来源一律 403。
- 所有写入 `cordis.patch.yml` 的插件 id 先过白名单校验，杜绝配置注入。
- 插件图标 SVG 经活性内容消毒；请求体限 64KB；删除 `/api/log`，新增 `/api/version`。
- 插件禁用时自动释放 19389 端口（dispose 生命周期）。

**客户端**
- 修复 Ctrl+N / Ctrl+, / Ctrl+/ 兜底快捷键（此前 code/key 传参颠倒，静默失效）。
- `Ctrl+[` / `Ctrl+]` 在输入框焦点内不再接管，交还编辑器。
- 技能插入不再可能清空已输入内容；修复执行环境弹窗的监听泄漏。
- 「执行环境（本地/云端）」按钮目前仅为视觉组件（无真实行为对接），**默认隐藏**；待宿主提供真实 API 后将 `client.js` 中 `SHOW_EXEC_TARGET` 置 `true` 即可恢复。
- 不再全局覆写 `window.matchMedia`（旧版会把整个应用的动效偏好强制为 reduced-motion 且不可还原）。
- 新增启动选择器健康自检：宿主升级导致锚点失效时控制台可见告警（`window.__dshUiHealth`）。

**安装器**
- `install.py` / `install.ps1` 行为已对齐：在已安装目录内运行不会再自我清空；改写 profile `package.json` 前自动备份 `.bak` 并原子写入；junction 失败自动回退为目录拷贝；安装完成后自动拉起 bridge。
- `sync_skills.py` 与客户端技能清单（6 项）完全同步；源缺失时跳过而非报错。

**测试**
```powershell
node --test tests/bridge.test.mjs   # 或 npm test（7 例 bridge 纯逻辑单测）
```
