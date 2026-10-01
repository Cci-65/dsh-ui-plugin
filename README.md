# DeepSeek Harness 视觉皮肤与输入栏交互增强 (`@local/dsh-ui`)

专为 **DeepSeek Harness** 定制的 1:1 视觉还原与交互增强套件，完美复刻 Antigravity 风格的空状态欢迎区（Hero）与输入卡片（Composer）交互界面。

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
