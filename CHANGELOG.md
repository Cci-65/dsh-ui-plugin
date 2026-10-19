# Changelog

## 1.1.41 — 2026-10-10

### 修复（styles.css + client-app.js）——托管卡片工作区行三个图标回到区头右端（撤销 v1.1.40 的反向改动）

**用户契约（截图锁定）**：悬浮卡片抽屉的工作区行，🔍 搜索 / ⇄ 视图选项 / 📁+ 新建工作区三个图标应位于**区头右端**（`[工作区] …… [🔍][⇄][📁+]`），与原生侧边栏一致。用户标注图中蓝框 = 图标当时所在位置，红框 = 要求移到的右端空位。

**v1.1.40 方向判断错误（本版撤销）**：上一版把标注图读反了，将图标组翻转到了左侧。

- 截图按 125% 缩放（335 device px ÷ 1.25 = 268 CSS px，恰为卡片宽度）换算：蓝框 = CSS 64.8–155.2（紧贴「工作区」标签右缘 +4px），红框 = CSS 160.8–250.4（贴内容区右缘，正好是 3 枚 28px 按钮 + 2×4px 间隙）。即图标当时在**左**，目标在**右**。
- 更关键的是机制读反了：把图标组顶到右端的并不是 `justify-content`，而是 `.searchSlot` 的 `margin-left: auto`（自动外边距吸走全部剩余空间，使 searchSlot 与紧随的 `.headerActions` 一并贴右；此时已无剩余空间，`justify-content` 不参与分配）。
- v1.1.40 写入 `justify-content: flex-start` + `margin-left: 0`，**等于亲手取消了这枚「右顶」自动外边距**，图标于是紧贴标签排到左侧 —— 用户看到的蓝框正是这次改动的产物，也是「改了却没变化」的原因。

**修正**（仅在 `.dsh-native-host` 托管卡片作用域内，原生侧边栏不受影响）：

- 区头主轴改回 `justify-content: flex-end !important`；
- searchSlot 规则保留 `flex: none !important`（28px 占位）并**显式补回 `margin-left: auto !important`** —— 不依赖宿主日后是否仍保留该声明；
- 保留 v1.1.39 的可见性修复（`display:flex / opacity:1 / visibility:visible`）与 28px 占位；展开态仍由宿主自适应放宽（`flex: 1 1 auto`）；
- `headerActions` 保持显式 `flex: none`，避免被压缩。

**双保险（内联兜底）**：除样式表外，新增 `enforceWorkspaceHeaderLayout(header)` —— 在托管卡片区头上直接用内联声明钉住 `justify-content: flex-end` 与 searchSlot 的 `margin-left: auto`（均带 `!important`）。内联声明优先级高于任何样式表，可免疫其它插件样式表的后置覆盖；作用域由 `header.closest('.dsh-native-host')` 限定，原生侧边栏不受影响。搜索展开态移除内联 `margin-left`，交还原生自适应。

**生效方式（已实测）**：`dsh-client-hmr` 以 500ms 轮询 bundle 的 mtime/ctime/size，变化即调 `clientModules.rebuilt(id)` 并经 SSE `/plugins/events` 推 `rebuilt` 帧，浏览器半 `entries.reload(id, rev)` 就地热替换 —— **重建 `client.js` 后无需重启宿主**，刷新页面即可（实测宿主已接收新 rev）。

**健壮性**：`ensureWorkspaceSearch` 的原生按钮定位改为「区头内优先 → 区头父级兜底」，注入件查找同理；宿主布局变动时不会因一次性查不到而退化。

**诊断**：`.dsh-ui-debug.json` 的 `workspaceSearch` 快照新增 `geometry`（区头 / 标签 / 搜索槽 / 注入件 / 图标组的左右偏移、`justify-content`，以及关键的 `slotMarginLeft` / `slotFlex`），并在展开动画结束后（180ms + 80ms）补落一次——0ms 那次常赶在宿主完成布局前，几何全为 0，无法用于核实。`slotMarginLeft` 读作 `auto` = 已右顶（红框位置），读作 `0px` = 被拽到标签旁（蓝框位置），可离线判定。

**测试**：契约断言改为锁定右端布局（区头 `flex-end`、searchSlot `margin-left:auto` 右顶），并反向断言 v1.1.40 的左对齐翻转与 `margin-left: 0` 不再存在；另加 4 条锁定内联兜底（函数存在、两条内联 `setProperty`、作用域限定 `.dsh-native-host`）；全量 **24 例通过**。

## 1.1.39 — 2026-10-09

### 修复（client-app.js + styles.css）——三图标位置与顺序锁定为用户截图布局（原生侧栏与悬浮卡片一致）

**用户契约（截图锁定）**：原生侧边栏与悬浮卡片的工作区行均为 `[工作区] …… [🔍][⇄][📁+]`——🔍 居图标组最左、与 ⇄ 零间隙、图标组右端排列。

**根因补全**（用户截图像素分析）：托管卡片里**整个 searchSlot 的 28px 占位消失**（图标组整体左移一枚宽度）——卡片上下文把搜索槽收起/隐藏，这才是 🔍 缺失的直接原因；v1.1.38 把注入件插在槽前，槽不可见时顺序/间距仍会偏离截图布局。

**修正**：

- **CSS**：`.dsh-native-host [class*="searchSlot"]` 强制 `display:flex / opacity:1 / visibility:visible` 并锁 28px 占位（展开态 searchSlotExpanded 仍自适应放宽供输入框使用）——仅托管卡片作用域，原生侧边栏不受影响；
- **JS**：有原生按钮时改回**原位顶替**（插在原生按钮正前方后隐藏原生）——布局与原生零间隙、顺序天然一致 [🔍][⇄][📁+]；无原生按钮的布局维持槽前/图标组前回退。

**测试**：契约断言新增「搜索槽强制可见」与「原位顶替」两条锁定；全量 **24 例通过**。

## 1.1.38 — 2026-10-09

### 修复（client-app.js）——卡片搜索图标仍未出现（用户截图核实后重修）

**截图核实的事实**（用户澄清标注）：图1（无 🔍）= 悬浮卡片，图2（有 🔍）= 原生侧边栏——即**原生侧栏的 searchSlot 正常可见，托管卡片里它整体不可见**；且诊断文件停留在旧载荷，证明用户截图时运行的还是旧构建（v1.1.37 从未加载）。

**v1.1.37 的隐患**（本次一并修正）：注入按钮插在「原生按钮原位」——若 searchSlot 容器整体不可见，注入件会被关进同一不可见容器，照样看不见。

**修正**：

- 注入按钮改插**区头「搜索槽之前」**（图标组最左、槽外独立可见），无搜索槽/图标组时回退区头末尾；
- **先插入成功、再隐藏原生按钮**（顺序保证：插入失败也不会只剩隐藏）；
- 点击查找改为按区头范围定位原生按钮（原先按父元素，位置变动后会失配）。

**测试**：全量 **24 例通过**。若本版仍不出图标，打开一次抽屉后回复即可——`.dsh-ui-debug.json` 的 `workspaceSearch` 快照会给出区头/原生按钮/注入件的 DOM 真相。

## 1.1.37 — 2026-10-09

### 修复（client-app.js）——v1.1.36 搜索补位未生效（用户实测反馈）

**根因**：v1.1.36 的「原生搜索可见才让位」门禁误判——原生 `searchButton` 在托管卡片内有几何尺寸（rect 28×28）但实际不可见，`ensureWorkspaceSearch` 判定"原生已渲染"而跳过注入；另调用点位于扫描函数尾部，前面语句异常会连带跳过（scanAndEnhance 整体被 try/catch 静默吞掉）。

**修正**（确定性方案）：

- **注入按钮直接顶替原生按钮的原位**（紧邻其前插入）：布局与原生完全一致、无重复；原生按钮内联 `display:none !important`，但保留其 React onClick——点击注入按钮即转发原生点击，打开原生搜索（展开输入框/结果列表）；
- 原生按钮不存在的布局回退到区头图标组最左；每次扫描幂等对位，React 重挂载原生按钮后自动重新隐藏/归位；
- 点击处理改为**点击时再定位**原生按钮（React 重挂载后旧引用失效），找不到则派发 Ctrl+K（`session.search` 原生快捷键）；
- 调用点前移至 `scanAndEnhance` 顶部（免疫后续语句异常）；
- **诊断**：抽屉打开时落盘工作区搜索入口快照到 `.dsh-ui-debug.json`（`workspaceSearch`：区头数/原生按钮数/注入数/区头 HTML）——若仍不生效，打开一次抽屉即可取证。

**测试**：全量 **24 例通过**。

## 1.1.36 — 2026-10-09

### 新增（client-app.js + styles.css）——悬浮卡片工作区行恢复「搜索」图标（用户需求）

**现象**：托管悬浮卡片的工作区行缺少搜索图标；要求与原生侧边栏一致——图标组右端排列、🔍 居组图标最左（`[🔍 ↕ 📁+]`）。

**背景**（宿主源码核实）：搜索入口属 `dsh-client-ui-workspace` 的 `WorkspaceBrowser`——宽态渲染在区头 `searchSlot`（含展开式搜索输入框），rail/!wide 态渲染为独立行；部分布局下该入口在托管卡片内不渲染或不可见。

**实现**（注入补位 + 原生让位）：

- 新增 `ensureWorkspaceSearch()`（扫描循环驱动、幂等）：区头图标组最左（`headerActions` 之前）注入与原生同形的 🔍 按钮（28px、radius-sm、hover 同款）；
- 图标与宿主 `IconSearchOutlineRegular` **1:1**（16×16 / stroke-width 1，path 原样取自 `dsh-client-ui-primitives`）；
- 点击优先转发原生搜索按钮（React onClick → 原生搜索面板），否则派发原生 `session.search` 快捷键（Ctrl+K，Web 修饰键变体兜底）——搜索交互完全走原生，含展开输入框与结果列表；
- **原生搜索自己渲染且可见时自动撤下注入按钮**（不重复、保留原生交互）。

**测试**：契约断言新增图标 path 与 `ensureWorkspaceSearch` 锁定；全量 **24 例通过**。

## 1.1.35 — 2026-10-09

### 修复（client-app.js）——没碰房屋图标，悬浮卡片也会从图标右侧区域滑出（用户实测反馈）

**根因**（收起流程两处缺陷，v1.1.27 修的是热区几何，本次修的是收起语义）：

1. **淡出定时器被无限重启**：`homeDrawerHide()` 每次移出都 `clearTimeout` 后重新计 180ms——光标只要持续在热区外移动，收尾就永不发生，卡片在**不可见状态下无限挂起**（`homeDrawerOpen` 仍为 true、热区仍激活）；
2. **淡出期间任意热区回移都会复活**：卡片体/过渡走廊命中即 `cancelHide` 拉回——「图标右边区域」正是卡片体与走廊的几何覆盖范围，于是用户滑向图标右侧时，那张不可见挂起的卡片就「无端滑出」。

**修正（新契约：收起一旦开始就收完，只有触碰房屋图标能复活）**：

- `homeDrawerHide()`：淡出进行中不重启定时器——收尾固定在**首次移出后 180ms** 完成；
- 新增复活门禁 `homeDrawerReviveIfAllowed()`：`homeDrawerHideTimer` 在跑（收起进行中）时仅 `homeDrawerPointerOverTrigger`（房屋图标几何轮廓）可 `cancelHide`；卡片体/走廊/卡片段回移一律不拉回，让既定收尾完成；
- `homeDrawerMoveHandler` 与 `homeDrawerLeaveMaybeHide` 的三处复活点统一走该门禁；
- `homeDrawerShow()` 的「侧栏已展开」分支区分两种情形：托管淡出进行中（模板仍钉着）= 回移复活；用户手动展开 = 拒绝接管（原行为），修复淡出中触碰图标被误判为用户手动展开而反手收尾的边角。

**测试**：v1.1.27 回归用例的「走廊/卡片区淡出复活」断言反转为「不得复活」；新增计时回归「连续移出固定在首次移出后 180ms 收尾、仅图标可再唤起」。全量 **24 例通过**（bridge 7 + home-drawer 17）。

## 1.1.34 — 2026-10-09

### 修复（client-app.js）——常驻 ⊕ 图标形状与宿主不一致（用户实测反馈）

**根因**：v1.1.33 的常驻 ⊕ 用了自绘「圆角方气泡+加号」图标，与宿主 `IconNewChatOutlineRegular`（气泡轮廓+加号，16×16 / stroke-width 1）形状不同。

**修正**：从 `dsh-client-ui-primitives` 源码提取 `NewChatOutlineArtwork` 的三条 path 原样内嵌（`M2.37091 11.2501…` 气泡轮廓 + `M8 5V11` / `M5 8H11` 加号），viewBox 与描边宽度同为 16×16 / 1，形状与宿主浮动钮 1:1。

**测试**：契约断言新增图标 path 数据锁定；全量 **23 例通过**。

## 1.1.33 — 2026-10-09

### 修复（client-app.js + styles.css）——顶部栏 ⊕ 改为常驻（用户需求：侧栏展开时不应隐藏）

**根因**：宿主的 `newSession` 是**同一节点**随侧栏状态变形——收起时成为 28px 圆钮 `position:fixed` 浮入标题栏，展开时缩回侧栏变成胶囊。单节点无法两处同显，所以侧栏一展开标题栏 ⊕ 就消失。

**修正**（自绘常驻 + 原生分工）：

- `#dsh-ui-navbtns` 新增第 4 个按钮**常驻 ⊕ 新建会话**（`data-nav-action="new"`，圆形 28px 与宿主浮动钮同形，气泡+加号图标，tooltip「新建会话」），**两态常驻**；动作走 `railGoHome()`（`uiWorkspace.startSession()` 原生优先、DOM/快捷键回退），与固定栏首页同路径；
- 宿主 newSession 的**收起态浮动圆钮**变体防重复隐藏（选择器只命中收起根）；**侧栏展开态的原生胶囊照常显示**（v1.1.30 需求不回退）；
- 撤销 v1.1.32 的 `left: 106px` 让位规则（浮动钮已隐藏，槽位由常驻 ⊕ 占据 100-128）；
- 标题栏布局定格为 [← → 10-68] [侧栏开关 70-98] [常驻 ⊕ 100-128] [菜单 144+]，两态完全一致。

**测试**：契约断言同步（浮动钮隐藏 + 常驻按钮存在 + 菜单起点 144）；全量 **23 例通过**。

## 1.1.32 — 2026-10-09

### 修复（styles.css）——顶部栏 ⊕ 新建会话符号被导航按钮压住一部分（用户实测反馈）

**根因**（宿主源码 `dsh-client-ui-sidebar` 核实）：标题栏的 ⊕ 就是侧栏 `newSession` 按钮的**收起态变体**——侧栏收起时宿主把它钉成 28px 圆钮 `position:fixed; left:48px` 浮入标题栏（`top: (标题栏高-28)/2`，`z-index:30`）。而我们的 `#dsh-ui-navbtns`（← → + 侧栏开关三个 28px 按钮，`left:10px`，gap 2）实际占据 10-98，正好把 ⊕（48-76）整只压在下面：按钮常态透明所以能看到一部分，但悬停遮挡与点击拦截让 ⊕ 不可用。

**修正**：

- ⊕ 让位到侧栏开关（70-98）之后：`left: 106px`（8px 间距），28px 圆钮完整露出、可点；选择器带哈希精确（`._2H3hWW_collapsed ._2H3hWW_newSession`）与哈希无关（`[class*="_root"][class*="_collapsed"] [class*="_newSession"]`）双形态；
- 菜单起点 `--dsh-windows-menu-start` 由 118px 调至 **144px 常驻**（两态同值，让出 ⊕ 槽位 106-134；保持 v1.1.0 确立的「常驻不跳动」策略，不跟随宿主的 84px 收起态变体）；
- 标题栏布局注释更新为 [← → 10-68] [侧栏开关 70-98] [收起态 ⊕ 106-134] [菜单 144+]。

**测试**：CSS 契约断言新增 ⊕ 让位规则与菜单起点 144 锁定；全量 **23 例通过**。

## 1.1.31 — 2026-10-09

### 修复（styles.css）——胶囊内容（图标+文字）不再居中对齐（用户实测反馈）

**根因**：v1.1.28-30 用「全局隐藏 + `display:flex !important` 豁免」恢复胶囊——强制 flex 覆盖了宿主胶囊的原生布局（按钮默认 `inline-block` + `text-align:center` 居中），flex 容器默认 `justify-content: flex-start`，图标与文字全部左挤，居中失效。原生侧边栏与托管抽屉两处同症，均源于此。

**修正（取代 v1.1.28/29/30 的豁免方案）**：不再动胶囊的 display——把 v1.1.0 的隐藏规则作用域直接收窄为「侧栏列之外」（`:not([class*="_sidebarCol"] *)`）：

- 侧栏胶囊（原生展开与托管抽屉）从头到尾不被规则触碰，display / 居中 / 间距全部保持宿主原生样式；
- 顶部栏 ⊕ 新建会话图标不在侧栏列内，照旧隐藏（v1.1.0 既定：由固定栏首页接管）；
- 三组豁免显示规则（v1.1.28 托管模式 / 1.1.29 修正 / 1.1.30 侧栏列作用域）整体删除。

**测试**：CSS 契约断言改为锁定「作用域收窄」形态，并反向断言不得再存在覆盖胶囊 display 的豁免规则；全量 **23 例通过**。

## 1.1.30 — 2026-10-09

### 新增（styles.css）——原生侧边栏（正常展开态）也恢复「新会话」胶囊（用户需求）

v1.1.29 恢复了托管抽屉内的胶囊；按用户要求，原生侧边栏正常展开时的胶囊同样恢复显示。

- 显示豁免作用域扩展到「侧栏列内 + 非收起态」（html 与 frame 均无 `data-sidebar-collapsed`）：正常展开与托管抽屉均命中；收起态窄条布局仍由宿主自己的收起态规则负责，不以 !important 抢占。
- 顶部栏 ⊕ 新建会话图标保持移除（v1.1.0 既定：由固定栏首页接管）——它不在侧栏列内，不受本规则影响。
- 与 v1.1.28/29 的托管模式豁免并存：后者作为侧栏列类名哈希漂移时的兜底。

**测试**：CSS 契约断言新增侧栏列作用域规则锁定；全量 **23 例通过**。

## 1.1.29 — 2026-10-09

### 修复（styles.css）——1.1.28 的豁免选择器从未命中（胶囊仍不显示，用户实测反馈）

**根因**：1.1.28 豁免规则把 `[data-windows-titlebar]` 写成了 `html.dsh-native-host-mode` 的**后代**复合（`html.dsh-native-host-mode [data-windows-titlebar] ...`）。但 `data-windows-titlebar` 属性就在 `<html>` 本体上——不存在携带它的后代元素，「后代要求」永不命中，整条规则因此失效；而原隐藏规则能生效，恰是因为它的第一个复合 `[data-windows-titlebar]` 直接匹配到 html 祖先。

**修正**：改为 html 本体复合 `html.dsh-native-host-mode[data-windows-titlebar]`（无空格），`body:has(.dsh-native-host)` 路径同步去掉多余后代要求。特异性 (0,3,1)/(0,2,1) 仍高于隐藏规则 (0,2,0)，!important 对决成立。

**测试**：CSS 契约断言同步更新为修正后的选择器；全量 **23 例通过**。

## 1.1.28 — 2026-10-09

### 修复（styles.css）——托管悬浮卡片上的「新会话」胶囊不见了（用户实测反馈）

**根因**：v1.1.0 时代固定栏首页接管新会话职责后，全局隐藏了原生新会话入口：
`[data-windows-titlebar] [class*="_newSession"] { display: none !important; }`（本意是移除顶部栏 ⊕ 图标，但选择器同时命中侧栏胶囊）。v1.1.25 抽屉改为「原生侧栏托管」后，卡片内容就是原生侧栏——这条全局规则在卡片内依然生效，新会话胶囊随之消失。

**修正**：新增托管模式豁免规则（`html.dsh-native-host-mode` 与 `body:has(.dsh-native-host)` 双路径，特异性高于原 !important 规则），托管期间恢复胶囊 `display: flex`；常规展开态仍隐藏（避免与固定栏首页按钮重复入口）。

**测试**：CSS 契约用例新增断言，锁定豁免规则存在且为 flex 恢复；全量 **23 例通过**。

## 1.1.27 — 2026-10-09

### 修复（client-app.js）——首页抽屉热区吞掉固定栏与图标留白（用户实测反馈）

**现象**：触碰房屋图标唤起托管卡片后，光标只是靠近图标右侧白色区域、还没碰到图标本身，卡片就（重新）滑出/收不掉。

**根因**：v1.1.25 把卡片壳改到 `left: 6px`（左段 6..64px 压在 64px 固定栏下方），但 `homeDrawerHotzoneHit` 的几何仍是按旧布局「卡片整体在图标右侧（left:72）」写的：

1. **卡片本体热区从 `colR.left`（6px）起算**——把固定栏右半、图标周围留白整片吞进热区；
2. **走廊 min/max 反转**——`Math.min(svgR.right, colR.left)` 在 colR.left(6) < svgR.right(≈43) 时得到 [4, 51]，走廊从「图标右缘 → 卡片左缘」反转成「覆盖图标本体及其左侧留白」，垂直方向还被 `colR.top + 50` 魔数向下拖了 60px。

展开与 180ms 淡出期间，热区实际覆盖了图标周围整片区域：光标回移到图标右侧白色区域（甚至左侧留白、图标本体以外的任何位置）都会 `cancelHide` 复活卡片或使其永不收起。

**修正**（`homeDrawerHotzoneHit`）：

- 新增「卡片可见左缘」锚点：`visibleLeft = max(colR.left, 固定栏右缘)`（固定栏不可测时回退 `colR.left` 保持旧行为）；
- 2a 卡片本体热区左缘钳制到可见左缘（2px 边界容差），压在固定栏下方的不可见卡片段不再参与命中；
- 2b 过渡走廊改为 `min/max(图标右缘, 可见左缘)` 双向成立：压栏布局下为 [图标右缘-2, 可见左缘+8]，旧布局（卡片整体在右）下行为不变；
- 走廊垂直带收敛为 `[min(图标顶, 卡片顶)-8, max(图标底, 卡片顶)+8]`，移除 `+50` 魔数；
- 删除已被上述常量取代的死常量 `HOME_DRAWER_HOTZONE_PAD_PX`（其注释还停留在旧几何，正是误导源头之一）。

**测试**：新增压栏几何回归用例（切真实矩形：col left:6 / rail 64px / 图标 22×22 居中），锁定 ① 图标左侧留白为冷区、② 走廊（固定栏右条）复活、③ 固定栏下方不可见卡片段为冷区、④ 卡片可见区为热区、⑤ 图标本体仍为热区。全量 **23 例通过**（bridge 7 + home-drawer 16）。

## 1.1.26 — 2026-10-09

### 工程（① client.js 物理拆包落地——源码拆分 + 构建合成，运行时契约零变更）

宿主加载契约已在 app.asar 源码层面核实完毕（`@deepseek-ai/dsh-client-modules/lib/index.js`）：

- 静态 client 包经 `/plugins/??<pkg>/client.js&rev=<rev>` 组合脚本以 `<script>` 注入页面，**每个包一个 bundle 文件**；
- bundle 非 ESM、无包内子路径 `require`（模块系统的 require 仅把 `<pkg>/client` 与裸包名归一化到同一导出）；
- `dsh.client` 声明仅支持 platform / inject / external / immediately；
- 包内 `client.*.js` chunk 路由虽存在，但无公开 API 让 factory 获知自身 rev，且异步加载 CSS 必然引入皮肤 FOUC。

结论：运行时物理拆包无一等公民机制。本版改为「源码拆分 + 构建期合成」，CSS 不再与 JS 混在一个手写模板串里，而运行时产物保持宿主要求的单文件：

- 新增 `styles.css`（皮肤样式源文件）与 `client-app.js`（模块逻辑源文件，CSS 位置为 `const CSS = "__DSH_UI_STYLES__";` 占位符）；
- 新增 `build.mjs`：占位符替换 + 模板字面量转义（反斜杠/反引号/`${`）+ `vm.Script` 编译检查，输出确定性（相同输入字节相同）；
- `client.js` 变为构建产物（文件头加「请勿直接编辑」横幅）；拆分经**字节级往返校验**（banner + 原文件 === 产物）；
- `package.json`：版本 1.1.26；新增 `build` / `pretest` 脚本（npm test 前自动构建）；files 清单补齐三个新文件；
- 宿主按 client.js 的 mtime/ctime/size 计算 rev，重新构建即自动更新组合路由，无需清缓存。

### 优化（② LAPTOP/CLOUD 像素行 SVG 矢量重绘）

- 两枚图标原为媒体位图的逐像素行转写 path（合计约 8KB 文本只在描述位图）；重绘为与固定栏图标同风格的 24×24 描边矢量（笔记本 = 圆角屏 + 基线，云 = lucide 云形路径），视觉等价，源码 −7.8KB；
- 仅用于执行环境选择器视觉路径（`SHOW_EXEC_TARGET=false` 时本就不挂载），无行为影响。

### 增强（③ HOST_ANCHORS 锚点注册表 + 全量选择器健康自检）

- 新增 `HOST_ANCHORS` 注册表：皮肤依赖的全部 **27 个**宿主 DOM 锚点集中一处，逐条带 tier（required / expected / context）与中文用途说明，修改选择器时按表同步；
- `runSelectorHealthCheck` 由注册表驱动**全量探测**（原仅 6 项），结果含 `missingRequired / missingExpected / missingContext`（保留 `missingOptional` 兼容字段）；
- `window.__dshUiHealth` 新增 `check()`（控制台随时重跑）与 `anchors`（全表可查）；移除一次性 `selectorHealthDone` 门禁。

### 清理（④ tests/debug17.mjs）

- 删除无断言的遗留空壳测试文件（仅一行 console.log，从未纳入 test 脚本）。

### 文档（⑤ README）

- 测试计数修正：18 例 → **22 例**（bridge 7 + 首页抽屉 15，实测为准）；
- 新增「源码结构与构建」章节：拆分文件职责表、日常修改流程、HOST_ANCHORS 维护约定。

### 测试

- 全量 **22 例通过**（bridge 7 + home-drawer 15，进程内实跑）；`node build.mjs` 产物经 vm.Script 编译检查与字节级往返校验。

## 1.1.25 — 2026-10-09

### 重构（client.js）——抽屉改为「原生侧栏托管模式」（架构转向，用户拍板）
不再自绘抽屉内容。hover 首页按钮时把**宿主宽态侧栏整体套进悬浮卡片壳**：品牌行 / 新会话胶囊 / 工作区三入口 / 工作区文件夹 / 会话列表 / 底部设置全部原生渲染（数据、交互、快捷键零复刻，宿主升级自动跟随）。卡片壳几何契约（left 72 / width 268 / top 标题栏+6 / bottom 14 / radius 14 / 边框 / 投影 / z-index 1000）与 hover/热区/键盘交互、零缓冲淡出收回、真实移动门禁等已打磨行为全部保留。

**工作原理**
1. 唤起：hover（真实移动门禁）/键盘 focus → 取消在途收起 → `<html>` 打 `dsh-native-host-mode` → **钉住 frame 的 `grid-template-columns`（!important，值为唤起前记住的收起态模板）** → `layout.toggleSidebar()` 展开原生侧栏。防推挤核心：宿主展开会把 grid 模板改成宽态（聊天区右移 ~220px），托管期间钉死在收起态值，聊天区纹丝不动。
2. 挂壳：`data-sidebar-collapsed` 属性观察器在展开完成后给 `[class*="_sidebarCol"]` 加 `dsh-native-host` 类 → CSS 把它变成悬浮卡片（position:absolute 相对 frame、left 72 / top 标题栏+6 / bottom 14 / width 268 / radius 14 / 边框 / 投影 / 180ms 入场动画）。绝对定位而非 fixed，规避「祖先含 transform 导致 fixed 偏移」的坑。托管期间压制 frame 的 grid 模板动画并隐藏拖拽手柄。
3. 收回：移出热区 → 壳加 `dsh-native-host-closing`（180ms 淡出）→ 到时 `toggleSidebar` 瞬时收回 + 解钉 + 摘类。先淡出再收回，避免「壳落回停靠位、聊天区被推一下」的闪跳。用户主动原生收起（属性恢复）→ 立即收尾且不重复 toggle；用户自己展开的侧栏绝不触碰（仅当「钉过模板」才 toggle）。
4. 兜底：layout.toggleSidebar 缺失时回退点击 `[class*="_toggle"]`；插件卸载/热重载时若处于托管中，自动恢复宿主侧栏原状。

**退役清单（复刻实现整体移除）**
- 自绘 DOM：抽屉容器/头部品牌行/新会话胶囊/工作区小节/分组列表/会话行/空态（~300 行 CSS + ~350 行 JS）。
- 数据绑定：dshCtx sessions/workspaces 快照读取、分组收集、展开态记忆、相对时间、openSession/startSession/createWorkspace 包装与回退。
- 自绘 SVG：用户提供的一体化 logo（源文件仍在 `D:/桌面/logo.svg`）、搜索/排序/文件夹/文件夹+号/chevron/新会话图标。

### 测试
- `tests/home-drawer.test.mjs` 重写为托管契约：不自绘 DOM、CSS 壳契约（几何/动画/模式类压制/深色/减少动效）、虚假 mouseenter 拒绝、展开态拒绝、无点击钉住、唤起= toggle+模式类+模板钉扎（important+收起态值）、展开完成挂壳、按钮↔卡片连贯不闪断、移出=先淡出后收回解钉、淡出中取消、外力收尾不重复 toggle、窗口离开收尾、键盘 focus/focusout、生命周期绑定。
- 测试基建：fake frame/sidebarCol + layout.toggleSidebar 桩 + 同步属性触发（消除跨用例 setTimeout 竞态）；计数断言全部改差值口径。
- 全量 **21 例通过**。

### 备注（待实测微调）
- 原生侧栏内部细节（如 logoRow 高度、内部 toggle 位置）如与卡片壳冲突，拿到实际截图后按需补 CSS。

## 1.1.24 — 2026-10-09

### 调整（client.js）——品牌 Logo 按基准图占比放大
用户反馈品牌行（鲸鱼 + 字标 + 实心徽标）太小，要求放大到与基准图一致的比例。对基准图（326×983）做像素测量：

- 卡片宽 324，品牌墨迹 x=17..249 → **宽 233，占卡片 72%**；高 25；左边距 17。
- 原抽屉 logo 高 20px → 宽 66.5px，仅占 268 卡片的 24.8%。

换算：`268 × (233/324) ≈ 193px` 宽 → 按 1080:325 纵横比 → **高 58px**。`.dsh-drawer-brand-logo svg` 由 `height: 20px` 改为 `height: 58px`（`width: auto` 不变）。外框与内边距契约不动。

### 测试
- logo 契约用例的 20px 断言更新为 58px，并补「58px + width:auto 成对出现」断言。
- 全量 **27 例通过**。

## 1.1.23 — 2026-10-09

### 调整（client.js）——抽屉内部结构按原生侧栏参考图还原
用户给出一张原生侧栏截图（370×1028）作为还原基准。当前模型无法直读图像，改用像素解码（PNG 手工解码 + 逐行墨迹连通段分析）把参考图量成可核对数据，再据此对齐。**外框几何契约（left 72 / width 268 / top+6 / bottom 14 / radius 14）保持不变。**

参考图实测 → 抽屉现状 → 处理：

| 项 | 参考图实测（设备px） | 原抽屉 | 处理 |
|---|---|---|---|
| 工作区行入口 | 3 个图标（搜索 / 排序与筛选 / 新建工作区） | 2 个 | 补第三个「新建工作区」（文件夹+加号），接原生 `workspaces.createWorkspace`，不可用时展开侧栏交还原生流程 |
| 列表行右侧箭头 | **没有任何箭头** | 恒定显示 ▸ | 箭头改为静止态隐藏（`opacity: 0`），仅悬停/聚焦/已展开时浮现；会话仍嵌在行下展开，折叠能力不丢 |
| 新会话胶囊 | 全宽描边胶囊，高 46 | 高 32、左右外边距 10 | 高 36、左右外边距 16 |
| 列表行距 | 47 | 30 | 行高 34 + 上间距 2（行距 36） |
| 内容左右内边距 | 左 20 / 右 21 | 12 / 10 | 头部与工作区行均改 16，列表区 12 |
| 品牌行 | 鲸鱼 + deepseek 字标 + 实心 HARNESS 徽标 | ✅ 1.1.22 已换一体化 logo | 无需改动 |

换算口径：参考图面板宽 348 → 抽屉卡片 268，比例 0.77，所有纵向/间距尺寸按此比例折算（46→36、47→36、20→16）。

### 测试
- 新增「参考图还原」契约用例：三个入口及其 `aria-label`、静止态 chevron 隐藏、悬停/展开浮现、胶囊 36px、行高 34px、头/工作区行内边距 16px，并反向锁定外框仍是 268/72（防后续被顺手改宽）。
- 新增「点击新建工作区 → 收起抽屉且不抛错」用例。
- 全量 **27 例通过**。

## 1.1.22 — 2026-10-09

### 调整（client.js）——首页悬浮抽屉品牌行换用用户提供的一体化 Logo
- **品牌行整体替换**：头部由「鲸鱼标记 + 文字 deepseek + HARNESS 文字徽标」三件拼接，改为用户提供的官方一体化矢量 Logo（鲸鱼标记 + deepseek 字标 + HARNESS 徽标，`viewBox 0 0 1080 325`），内嵌为 `HOME_DRAWER_LOGO_SVG` 常量；原 `HOME_DRAWER_MARK_SVG_FALLBACK`（单鲸鱼）及 `.dsh-drawer-brand-word` / `.dsh-drawer-harness-badge` 样式一并移除。
- **安全内嵌处理**：源文件为 Illustrator 导出（`<style>` 块 + `.st0`–`.st14` 通用类名）——通用类名极易被宿主或其他内联 SVG 的样式表污染，已全部展开为内联 `fill` 并剔除 `<style>` 块、XML 声明与冗余命名空间；压缩至单行后按 SVG 安全断点（元素边界 / path 数据空格）折行内嵌。
- **显示契约**：`.dsh-drawer-brand-logo svg` 锁定 `height: 20px`、`width: auto`（1080:325 ≈ 3.32:1 纵横比自适应，绝不拉伸）；容器带 `role="img"` + `aria-label="deepseek HARNESS"`。
- **深色主题适配**：logo 为近黑（`#0B0C0F` 系）+ 近白（`#F1F1F2` 系）配色，深色底上经 `filter: invert(0.92)` 整体反色——近黑→近白、HARNESS 徽标反转为浅底深字，观感与浅色主题一致。

### 测试
- `tests/home-drawer.test.mjs` 新增「品牌行为用户提供的一体化 logo」用例：锁定 `.dsh-drawer-brand-logo` 容器、`aria-label`、`viewBox="0 0 1080 325"`、无残留 `class="st*"` / `<style>` 块、20px 高度契约与深色反色规则。
- 全量 **25 例通过**。

## 1.1.21 — 2026-10-09

### 调整（client.js）——首页悬浮抽屉「移出即收」，去掉收起缓冲
- **移出「首页按钮 ∪ 抽屉」热区即刻收起**：`HOME_DRAWER_HIDE_DELAY_MS` 由 `150` 改为 `0`，`homeDrawerScheduleHide()` 在零缓冲下**同步**执行收起（不再排定时器）。平滑感完全由 CSS 180ms 缓出过渡提供，而不是靠延迟等待——原 150ms 缓冲窗口带来的体感是「移开了还赖着不走」。
- **mouseleave 去抖（`homeDrawerLeaveMaybeHide`）**：`mouseleave` 的坐标必然落在元素边界上（也就落在热区外扩的 14px 之内），「离开某个元素」不等于「离开悬停热区」。现在只在指针确实脱离热区时才收起；若 `relatedTarget` 仍是首页按钮或抽屉本体则一律视为仍在区内。这样「按钮 → 8px 间隙 → 抽屉」的连贯移动在零缓冲下也**不会关了又开地闪断**。
- **抽屉本体纳入唤起区**：`homeDrawerCheckOpen()` 增加「指针命中抽屉自身」判定（收起态 `pointer-events: none`，事件不可能命中抽屉，因此不会引入「扫过抽屉占位区就弹出」的误触），保证极端时序下的瞬时收起能被随后的移动立即纠正回来。
- 主判定仍是 `pointermove` 逐帧几何复核（离开热区无条件收起），`mouseleave` 只做补位；指针移出窗口、焦点离开、侧栏重新展开三条终止路径保持立即收起。

### 测试
- `tests/home-drawer.test.mjs` 更新收起相关用例：由「150ms 后收起」改为「**同步立即收起**」（事件返回同一刻即已收起，且不得自行复活），并新增断言锁定 `HOME_DRAWER_HIDE_DELAY_MS = 0` 与「零缓冲必须同步 hide 而非排定时器」的实现方式；保留「按钮 ↔ 抽屉跨越间隙不闪断」的连贯性用例。
- 全量 **24 例通过**。

## 1.1.20 — 2026-10-09

### 新增（client.js）——固定栏首页「独立悬浮卡片抽屉」（Floating Card Drawer）
仅侧栏收起态（`.BynINW_frame[data-sidebar-collapsed]`）生效：鼠标进入固定栏首页按钮即展开一张独立悬浮卡片（纯 Overlay，`position: fixed`，不参与文档流、不推挤右侧聊天区）。

- **触发契约**：指针**真实移动**到首页按钮上才展开（`mouseenter` 命中按钮，或 `pointermove` 期间按钮矩形被命中）；`mouseleave` 后 **150ms** 自动收起，延迟窗口内回到任一区域即取消收起。**无点击钉住/无 Pin 逻辑**——点击只负责内部动作（新会话/打开会话/折叠分组）。
  - 「真实移动」门禁：页面重载或宿主重挂载按钮时，指针恰好停在按钮上会触发一次虚假 `mouseenter`（表现为「还没触摸就展开」）。现要求先观察到指针位移超过 3px 才允许展开，虚假事件被忽略。
  - 「悬停热区」= 首页按钮矩形 ∪ 抽屉矩形（各自外扩 14px，覆盖二者之间 8px 间隙），由几何判定而非 `:hover`（收起动画期间 `pointer-events: none`，`:hover` 不可靠）。`pointermove` 逐帧复核位置：离开热区**无条件**重排 150ms 收起（不会被更长的兜底定时器顶掉，修掉「移出后不收起」），指针移出窗口（`mouseleave`/`pointerleave` 且 `relatedTarget` 为空）则立即收起。
  - 键盘可达性：`focusin` 到首页按钮可展开，焦点离开「按钮 ∪ 抽屉」由 `focusout` 收起（取代此前不可预测的 1200ms 兜底定时器）。
- **几何契约**（严格还原，勿改）：`left: 72px`（距 64px 固定栏 8px）/ `top: calc(var(--dsh-windows-titlebar-height, 48px) + 6px)`（不覆盖标题栏）/ `bottom: 14px`（底部悬空）/ `width: 268px` / `border-radius: 14px` / `z-index: 1000` / 纯白 `#FFFFFF` + `1px solid #E5E7EB` 封闭边框 + `0 6px 24px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.04)` 柔和投影；开合 140ms 位移+淡入，全程 `visibility` 兜底不捕获指针。
- **开合动画（平滑收起）**：开与合均为 180ms `cubic-bezier(0.22, 0.61, 0.36, 1)` 缓出动画——由 `translateX(-8px) scale(0.985)`（收起前，`transform-origin: left center`）+ `opacity` 合成，`visibility` 延迟到动画结束才隐藏，**收起没有跳变**；系统「减少动效」偏好下自动降级为 120ms 纯淡入淡出（不做位移/缩放）。
- **内容与原生侧栏同源**：品牌行（官方鲸鱼标记 + deepseek 字标 + HARNESS 徽标）、`新会话` 按钮、`工作区` 小节、按工作区分组的会话列表（文件夹图标 + 折叠箭头，默认展开当前会话所在组），会话行显示标题与相对时间（刚刚 / N 分钟 / N 小时 / N 天 / 日期）。
- **数据对接原生接口**：会话与工作区直接读 `dshCtx` 的 `ctx.sessions.list` / `ctx.workspaces.list` 快照（与 `dsh-client-ui-workspace` 同一数据源，含归档/子代理/空会话过滤规则）；打开会话走 `uiWorkspace.openSession(id)`，`新会话` 走 `uiWorkspace.startSession()`，均带 DOM 点击回退。
- **终止条件与懒渲染兜底**：侧栏重新展开时抽屉立即收起（拒绝弹出）；`data-sidebar-collapsed` 属性观察器在每次挂载时**重试补挂**（宿主侧栏懒渲染，首次调用时 frame 可能尚不存在），并有启动后 20 秒、每秒一次的有界自愈定时器覆盖「宿主渲染晚于插件」的窗口，超时自动停止。
- 首页按钮在抽屉可弹/已弹状态下不再渲染黑色胶囊 tooltip（避免与卡片抢位），侧栏展开态的原生提示保持不变。

### 测试
- 新增 `tests/home-drawer.test.mjs`（17 例，内置极简 DOM/BOM 仿真 + 宿主 ctx 桩，加载真实 `client.js`）：覆盖几何契约、无 Pin 逻辑、收起态才展开、**虚假 mouseenter 不展开（回归）**、指针移动后立即展开、150ms 缓冲收起与取消、按钮↔抽屉往返连贯、移出热区/移出窗口、分组折叠、`openSession`/`startSession` 对接、展开态自动收起、动画曲线。
- `package.json` 的 `test` 脚本改为显式文件列表（`node --test tests/bridge.test.mjs tests/home-drawer.test.mjs`），全量 **24 例通过**。

## 1.1.19 — 2026-10-07

### 修复（client.js）
- **左上角返回按钮 ← 黑色提示框左侧裁切修复**：返回按钮紧贴窗口左上角（x=10px），原 `left: 50%; transform: translateX(-50%)` 导致提示框左侧超出屏幕边界（x < 0）被窗口硬切；调整为 `left: 0; transform: none;`，让提示框左边缘对齐按钮左缘，完整保留 8px 圆角与全部字符。
- **侧栏开关按钮 [|] 黑色提示框左侧被固定栏遮挡修复**：原生侧栏开关按钮 Tooltip（`[role="tooltip"]`）默认 `z-index: 100`，被 64px 宽的最左固定栏（`#dsh-ui-rail`，`z-index: 1001`）覆盖压在底层，导致文字左侧 44px（"收起"/"隐藏"二字）被固定栏底色切断。现将 `[role="tooltip"]` 及导航按钮层级统一提升至 `z-index: 1105`，使其浮于固定栏上方，完整无缺展示。

## 1.1.18 — 2026-10-06

### 回滚
- **client.js 会话锁定回滚至 1.1.13 状态**：撤销 1.1.14（hasBox 无盒跳过 + 探针）、1.1.15（data-conversation-region 锚点）、1.1.16（基准布局记录门禁）、1.1.17（探针移除）的全部差异——恢复 1.1.13 原始实现（data-message-id 锚点的 LCA 发现 + 简单宽度记录）。已知：该锚点在当前宿主会话视图中不匹配（探针实测 conv=0），会话模式实际为原生伸缩。
- 欢迎区宽度锁定与其余功能不受影响。

## 1.1.17 — 2026-10-06

### 清理（client.js）
- 会话宽度锁定确认生效后，移除窗口标题诊断探针及随附的 LCA 信息采集；锁定功能本体（LCA 发现、标记类、基准布局门禁、CSS 收放）不变。

## 1.1.16 — 2026-10-06

### 修复（client.js）
- **宽度记录增加基准布局门禁**：仅在"侧栏完全展开且右栏关闭"时记录会话列宽度——右栏开启会把中栏挤压到 minmax 下限（~400px），此前若在该状态记录，收起后内容会被锁成窄条。诊断探针窗口延长至 30 分钟并增加 stored/parw/rbar 字段。

## 1.1.15 — 2026-10-06

### 修复（client.js）
- **会话判定的锚点修正**：宿主会话视图并不存在 `[data-message-id]`（探针实测 conv=0），会话锁定因此从未启动。现改用宿主自身的区域标记 `data-conversation-region`（layout 源码确认：消息区=`chat`、输入区=`composer`）：会话判定用 `"chat"` 区域存在性，锁定目标 = 两区域的最低公共"有盒"祖先。标题诊断探针保留 10 分钟窗口供复验。

## 1.1.14 — 2026-10-06

### 修复（client.js）
- **会话宽度锁定的 LCA 发现跳过无盒包装层**：React 组件包装 div 常见 `display: contents`——对无盒元素 `max-width`/`margin` 完全无效，且其 `getBoundingClientRect().width === 0` 导致宽度记录静默失败（表现为锁定完全不起作用）。发现最低公共祖先时现跳过 `display: contents`/`none`/零宽元素，锁定真正有盒的容器。
- 附带 10 分钟窗口标题诊断探针（convlock conv/col/lca/inframe/w/disp/bg/cls/var/maxw），定位后移除。

## 1.1.13 — 2026-10-06

### 修复（client.js）
- **会话模式宽度锁定（重做，与欢迎区同机制）**：锁定目标为"消息线程 + 输入卡片"的最低公共祖先列，运行时发现并打标记类 `dsh-conv-lock-target`（视图切换自动迁移）；展开态记录宽度到 `--dsh-conv-lock-w`（持久化 localStorage `dsh_conv_lock_w`），收起态 CSS 封顶 `min(记录值, 100%)` 并 `margin: auto` 居中——对话内容与输入框保持原宽、平移到中栏中央，再展开恢复原宽。CSS 随 `data-sidebar-collapsed` 属性即时收放，不依赖扫描触发。
- 与 v1.1.9 的差异：锁定经由 CSS 变量 + 标记类即时生效（此前内联样式依赖扫描触发，切换后不生效）；白底由中栏面板自然铺满（不裁剪 Grid 轨道，无 v1.1.10 的两侧异色问题）。
- 欢迎区宽度记录改为仅在非会话态进行，避免会话视图复用同类容器时污染变量。

## 1.1.12 — 2026-10-06

### 回滚
- **client.js 回滚至 1.1.8 状态**：撤销 1.1.9（会话 LCA 宽度锁定）、1.1.10（Grid 轨道覆盖 + 属性监听）、1.1.11（收起态帧底色白底）的全部改动。恢复为 1.1.8 行为——欢迎区宽度锁定（CSS 变量方案），会话模式维持宿主原生伸缩。回滚副本：`recovery/client-v118.js`（回滚前 1.1.11 状态留档 `recovery/client-v1111-backup.js`）。
- 其余功能（头像正圆、弹窗等高、侧栏纯白、分隔线、诊断通道等）不受影响，均为 1.1.8 之前已合入的内容。

## 1.1.11 — 2026-10-06

### 修复（client.js）
- **E2 侧栏收起后两侧底部异色块**：中栏面板居中后，两侧露出帧底色（`--dsw-alias-bg-base`，非纯白），与视频里 ChatGPT"收起后通体白、内容居中"的观感不符。现收起态（浅色主题）将帧底色同步为 `#FFFFFF`——居中面板与背景融为一体，左右底部不再出现异色块；深色主题宿主底色与面板本就同色系，不处理。

## 1.1.10 — 2026-10-06

### 修复（client.js）——替换 1.1.8/1.1.9 的宽度锁定方案
- **根因修正**：宿主帧是 CSS Grid，列模板为 `侧栏px minmax(400px, 1fr) 右栏px`（layout-client.js）——中栏轨道是 `1fr`，侧栏一收它必然吸收空出的宽度，子元素层面的锁定既治标又依赖不可靠的触发。
- **新机制（唯一机制，同时覆盖欢迎区与会话）**：展开态记录中栏轨道（`.BynINW_centerCol`）实际宽度到 `--dsh-center-lock-w`（持久化 localStorage `dsh_center_lock_w`）；收起态以 `!important` 覆盖帧 `grid-template-columns` 为 `0px minmax(400px, 记录值) minmax(0px, 0px)` 并 `justify-content: center`——宽度不变、内容随宿主原生过渡动画平滑滑动居中。仅在 `[data-rightbar-collapsed]` 时生效，不影响右栏。
- **触发修正**：MutationObserver 此前只监听 childList，而侧栏切换仅变更内联 style 与 data-* 属性，扫描从不触发——现增加 `attributes: true`（attributeFilter: style / data-sidebar-collapsed / data-rightbar-collapsed），切换即时生效。
- 移除 1.1.8 欢迎区 CSS 锁定与 1.1.9 会话 LCA 内联锁定（被本机制取代）。

## 1.1.9 — 2026-10-06

### 修复（client.js）
- **E2 侧栏开关切换时会话内容不再拉宽**：会话模式下对"消息线程 + 输入卡片的最低公共祖先列"（运行时自动发现，不依赖原生类名）做与欢迎区相同的宽度锁定——展开态记录宽度（`--dsh-conv-lock-w`，持久化 localStorage `dsh_conv_lock_w`），收起态内联 `max-width: min(记录值, 100%)` 并 `margin: auto` 居中，宽度不变仅重新居中。展开态自动清除内联锁定后按真实布局重新记录。
- 欢迎区宽度记录改为仅在非会话态进行，避免会话视图复用同类容器时被误锁定。
- 附带 10 分钟窗口标题诊断探针（convlock collapsed/lca/lock/cur），确认生效后随 1.1.10 移除。

## 1.1.8 — 2026-10-06

### 修复（client.js）
- **E2 侧栏开关切换时欢迎区不再拉宽**：此前卡片宽度 = 中栏宽度与 1140px 取小，收起侧栏后中栏变宽、输入卡片/工作区行/底部灰条跟着变宽。现展开态由扫描循环持续记录欢迎区实际宽度（`--dsh-hero-lock-w`，并持久化到 localStorage `dsh_hero_lock_w`），收起态以记录值封顶（`min(记录值, 100%)`，窗口变窄仍能回缩）——宽度保持不变、仅整体重新居中，对齐 ChatGPT 桌面版行为。冷启动即收起态时先用上次会话记录校准，展开一次后自动更新。

## 1.1.7 — 2026-10-06

### 清理（client.js）
- A6 头像正圆修复确认生效后，移除诊断用的荧光绿显形底色与窗口标题探针；`clip-path` 正圆锁定与 `/api/debug` 静默诊断通道保留。

## 1.1.6 — 2026-10-06

### 修复（client.js）
- **A6 头像在合成层下照片不裁圆**：`#dsh-ui-rail` 为 `position:fixed`，其子元素被 Chromium 提升为 GPU 合成层后，`border-radius` 计算值虽为 50%、绘制却不裁剪（表现为"照片是圆角方块、绿底按钮是圆"）。按钮/图片/兜底图标统一叠加 `clip-path: circle(50% at 50% 50%)`（合成器层面蒙版），镜像 `<img>` 内联样式同步携带，彻底锁定正圆。

### 事故恢复
- 一次用 PowerShell 批量替换 client.js 时误以系统 ANSI（GBK）编码读写 UTF-8 文件，导致全文中文损坏。已从 ZCode 会话编辑快照（编辑前完整文件内容）无损恢复至损坏前状态，并补齐最后两个编辑；恢复副本留档于 `recovery/client-rebuilt.js`。教训：本项目一切文本编辑只走 Edit 工具。

## 1.1.5 — 2026-10-06

### 界面（client.js）
- **S 区（侧栏列）底色统一为 C 区（中央内容区）同款纯白**：浅色主题下在 `.BynINW_sidebarCol` 上将 `--dsw-specific-sidebar-fill` 改写为 `#FFFFFF` 并同步列背景，列内整棵子树（含原生拖拽条 `.BynINW_handle`）跟随变白，不再出现列体白色而顶部残留灰条的拼接感；深色主题维持宿主原生配色。标题栏与固定栏的 `#f5f5f5` 底色不变。
- **S/C 交界分隔线 1px → 2px**（颜色维持浅色主题 #f5f5f5、深色主题宿主边框色不变）。
- **A6 头像按钮锁死正圆**：实际渲染曾被其他规则改写为圆角方块，现对按钮、头像图片、人像兜底图标三处统一 `border-radius: 50% !important`，图片尺寸钉死 30×30（含 min/max 与 `aspect-ratio: 1/1`、`object-fit: cover`）；镜像 `<img>` 额外内联 `border-radius:50% !important`（内联 !important 优先级最高，任何原生规则都无法改写）。
- **修复头像偶发"消失"**：镜像的原生头像 URL 偶发加载失败（会话级地址失效），img 变成透明块导致固定栏底部空无一物；现在图片 `error` 时立即切换为人像兜底图标（dataset 指纹防重渲染循环）。
- **新增头像诊断通道**：bridge 新增 `POST /api/debug`（仅本机、固定落盘路径 `.dsh-ui-debug.json`、64KB 上限）；client 在启动后 90 秒内每 5 秒采集固定栏头像的真实 DOM、计算样式（width/height/borderRadius/clipPath/transform 等）、`elementFromPoint` 命中元素与注入次数计数并落盘，用于离线定位"正圆被改写"类渲染异常，采集结束后自动停止。

## 1.1.4 — 2026-10-06

### 界面（client.js）
- **D1 技能弹窗与 D2 插件弹窗统一等高**：新增共享变量 `--dsh-ag-popover-menu-h: 210px`（= 技能行 34px × 6 + 容器内边距 3px × 2），两弹窗容器固定同一总高；技能视口与插件列表改为弹性填充剩余高度、超出滚动（原技能视口 280px / 插件列表 150px 的各自为政上限移除），底部"浏览所有插件"栏仍贴底不变。两弹窗均保留 `max-height: calc(100vh - 24px)` 小窗口保护。

## 1.1.3 — 2026-10-05

全面安全加固与稳定性修复（审查驱动，详见审查报告）。

### 安全（bridge.mjs）
- **写接口不再对任意网页开放**：新增 Host 白名单（仅 loopback，防 DNS rebinding）与 Origin 白名单（仅本机来源页面，防跨站 CSRF）；CORS 由 `*` 改为按校验结果回显。
- **配置注入封堵**：所有进入 `cordis.patch.yml` 的插件 id 先过白名单校验（`^[@A-Za-z0-9/_.-]+$`），正则构造前统一 `escapeRegExp`；恶意 id 直接拒绝且不落盘。
- **图标 XSS 封堵**：插件 `icon.svg` 含 `<script>`/事件属性/`javascript:`/`<foreignObject>` 等活性内容时回退默认图标（client 注入 innerHTML 可执行）。
- **请求体 64KB 上限**，超限即断流（本地 DoS 防护）。
- 删除无消费者的 `/api/log` 死端点；新增 `/api/version` 供版本/健康探测。

### 修复（client.js）
- `railDispatchKey` 三处调用点 code/key 传参颠倒：Ctrl+N / Ctrl+, / Ctrl+/ 兜底路径恢复可用。
- 执行环境弹窗事件监听泄漏：`closeExecPopover` 现在统一释放 dismiss 监听（所有关闭路径）。
- 撤销 `window.matchMedia` 全局覆写：不再把整个宿主的 `prefers-reduced-motion` 强制为 true（入场动画改由既有 `._oGoKq_intro*` CSS 精准压制）。
- 技能插入回退路径不再清空输入框：统一 `insertTextAtCursor`（原生 value setter / Selection-Range），光标处插入。
- 技能/插件名称、头像 src 等拼接进 innerHTML 前统一 HTML 转义。
- 「执行环境（本地/云端）」为纯视觉空壳（仅写 localStorage），默认隐藏避免误导；`SHOW_EXEC_TARGET` 置 true 可恢复。
- bridge 服务接入 dispose 生命周期：插件禁用时释放 19389 端口（index.js）。

### 健壮性
- `install.py`：新增自毁守卫（在已安装目录内运行不再 rmtree 自身）；profile `package.json` 先备份 `.bak` 再临时文件原子替换。
- `install.ps1`：与 py 版对齐——自毁守卫、profile 结构 null 安全、junction 失败回退目录拷贝、`.bak`+原子写入、安装后拉起 bridge、patch entry 含 name 行。
- `sync_skills.py`：删除从未使用却会导致 ImportError 的 `import yaml`；技能清单补齐为 6 项（与 client `KNOWN_SKILL_META` 一致）；源文件缺失改为警告跳过。
- 账号菜单重定位增加"菜单指纹"门槛：武装窗口期内出现的无关浮层（toast/对话框/其他插件气泡）不再被误拽到左下角。
- `fetchLiveSkills` 优先取主视图会话（`retainedBy.mainView`），不再盲取列表首位。
- `Ctrl+[` / `Ctrl+]` 在输入焦点内不再接管，交还编辑器/宿主快捷键。
- 新增启动选择器健康自检：关键锚点缺失时控制台告警，结果暴露于 `window.__dshUiHealth`。
- bridge 扫描对畸形 `package.json`（非字符串依赖值）容错。

### 工程化
- 三个弹层 + rail 菜单的统一 dismiss 逻辑抽为 `attachPopoverDismiss` 基座（消重 3 份复制）。
- 端口、锚点坐标、历史栈上限等魔法数集中为常量（bridge 支持 `DSH_UI_BRIDGE_PORT` 等 env 覆盖）。
- 新增 `tests/bridge.test.mjs`（node:test，7 例）：id 校验、SVG 消毒、patch 读写、注入拒绝、插件扫描。
- 新增本 CHANGELOG。

### 已知遗留
- `client.js` 物理拆包暂缓：宿主 `__ModuleLoader__` 对多文件/ESM import 的契约未验证，拆分有运行时风险；待确认加载机制后再拆。
- 历史状态应用仍用 400ms 固定抑制窗（B9）：改为宿主导航完成事件驱动需要宿主 API 支持，待评估。
- 像素行 SVG 图标（LAPTOP/CLOUD）保留原样：重绘为矢量 path 属视觉改动，需对比确认后单独进行。
