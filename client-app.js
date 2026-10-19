/**
 * @local/dsh-ui Client Module
 *
 * DeepSeek Harness 视觉皮肤与输入栏交互增强
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-ui',
  factory(require) {
    const React = require('react');

    // 诊断：统计本页 client 模块被评估的次数（>1 意味着有重复注入），
    // 随 /api/debug 一并落盘。
    try { window.__dshUiBootCount = (window.__dshUiBootCount || 0) + 1; } catch (e) {}

    // NOTE: 旧版本曾 monkey-patch window.matchMedia，让 prefers-reduced-motion
    // 恒为 true 以压制 AgentPresetSeat 入场动画。该写法会泄漏到整个宿主应用
    // （所有插件与原生组件都丢失真实的动效偏好），且插件 dispose 后无法还原。
    // 现在改由下方 `._oGoKq_intro*` 精准 CSS 规则压制同一动画，不碰全局状态。

    const STYLE_TAG_ID = 'dsh-ui-css';

    // ------------------------------------------------------------------
    // 共享常量（原魔法数集中管理，附取值依据）
    // ------------------------------------------------------------------
    const BRIDGE_API = 'http://127.0.0.1:19389'; // dsh-ui 本地桥接（bridge.mjs）
    const ACCOUNT_MENU_ANCHOR_LEFT_PX = 68;      // 账号菜单锚点：固定栏右侧（视频位置）
    const ACCOUNT_MENU_ANCHOR_BOTTOM_PX = 10;    // 账号菜单锚点：贴窗口底部
    const ACCOUNT_MENU_ARM_WINDOW_MS = 1200;     // 点击账号触发器后监听菜单浮层的窗口
    const ACCOUNT_MENU_WATCH_INTERVAL_MS = 120;  // 菜单回跳盯防间隔
    const ACCOUNT_MENU_WATCH_WINDOW_MS = 1500;   // 盯防总时长
    const HISTORY_SUPPRESS_STEP_MS = 80;   // 历史抑制解除的探测步长
    const HISTORY_SUPPRESS_MIN_MS = 240;   // 抑制最短窗口（防快导航被吞）
    const HISTORY_SUPPRESS_CAP_MS = 600;   // 抑制上限（防慢导航早泄漏）
    const HISTORY_MAX_ENTRIES = 60;              // 视图历史栈上限
    // 执行环境（本地/云端）选择目前只是视觉组件：选择仅写 localStorage、
    // 没有真实行为对接。默认隐藏避免误导；宿主提供真实执行目标 API 后
    // 置 true 即可恢复整套交互。
    const SHOW_EXEC_TARGET = false;

    // HTML-escape any string before it is concatenated into innerHTML.
    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // 调试开关：localStorage.dsh_ui_debug = '1' 后，关键 catch 不再静默
    // （默认保持静默：宿主 DOM 变动导致的良性失败不应刷屏）。
    const DEBUG = (() => { try { return localStorage.getItem('dsh_ui_debug') === '1'; } catch (e) { return false; } })();
    function dbg(...args) {
      if (!DEBUG) return;
      try { console.debug('[dsh-ui]', ...args); } catch (e) {}
    }

    const CSS = "__DSH_UI_STYLES__";

    // Cached handle for the injected <style>. The "restore if something overwrote it"
    // check below still runs on every call — we only skip the repeated getElementById
    // lookup while the element we installed is still the one carrying the tag id.
    let styleElRef = null;
    function ensureStyles() {
      if (typeof document === 'undefined') return;
      let el = (styleElRef && styleElRef.isConnected && styleElRef.id === STYLE_TAG_ID)
        ? styleElRef
        : document.getElementById(STYLE_TAG_ID);
      if (!el) {
        el = document.createElement('style');
        el.id = STYLE_TAG_ID;
        el.textContent = CSS;
        document.head.appendChild(el);
      } else if (el.textContent !== CSS) {
        el.textContent = CSS;
      }
      styleElRef = el;
    }

    // Known metadata for installed DeepSeek Harness skills.
    // 与 sync_skills.py 的安装清单一一对应（6 项）；新增/下架技能时两边必须同步。
    const KNOWN_SKILL_META = {
      'ai-video-prompt': { name: 'AI视频提示词生成专家', command: 'ai-video-prompt' },
      'storyboard-director': { name: '分镜导演·SD2.0', command: 'storyboard-director' },
      'storyboard-director-sd25': { name: '分镜导演·SD2.5', command: 'storyboard-director-sd25' },
      'screenplay-adaptation': { name: '影视剧本改编大师', command: 'screenplay-adaptation' },
      'art-direction': { name: '艺术指导', command: 'art-direction' },
      'c-drive-cleanup': { name: 'C盘清理', command: 'c-drive-cleanup' },
    };

    // Installed and verified skills in DeepSeek Harness (~/.dsh/skills).
    // Derived from KNOWN_SKILL_META above so the two lists can never drift apart.
    const INSTALLED_SKILLS = Object.entries(KNOWN_SKILL_META)
      .map(([id, meta]) => ({ id, name: meta.name, command: meta.command }));

    let popoverNode = null;
    let popoverCleanup = null;
    let dshCtx = null;
    let liveSkills = [...INSTALLED_SKILLS];
    // 会话宽度锁定的当前目标（消息线程+输入卡片的最低公共祖先），视图切换时迁移标记
    let convLockTarget = null;


    async function fetchLiveSkills() {
      if (!dshCtx) return;
      try {
        const sessions = dshCtx.get?.('sessions') || dshCtx.sessions;
        const remoteSkills = dshCtx.get?.('remote.skills') || dshCtx.remote?.skills;
        if (!sessions || !remoteSkills) return;

        const snapshot = sessions.list?.getSnapshot?.();
        // 优先取主视图会话（retainedBy.mainView），与历史导航的会话判定一致；
        // 取不到再回退列表首位（旧行为，可能不是活动会话）。
        let sessionId = null;
        if (snapshot?.byId) {
          const main = Object.values(snapshot.byId).find(s => ((s.retainedBy || {}).mainView || 0) > 0);
          if (main) sessionId = main.id;
        }
        if (!sessionId) sessionId = (snapshot?.order || [])[0];
        if (!sessionId) return;

        const res = await remoteSkills.list({ sessionId });
        if (res?.ok && Array.isArray(res.value?.skills)) {
          const list = res.value.skills.map(s => {
            const meta = KNOWN_SKILL_META[s.name];
            return {
              id: s.name,
              name: meta?.name || s.name,
              command: s.name,
              description: s.description || ''
            };
          });
          if (list.length > 0) {
            liveSkills = list;
          }
        }
      } catch (e) {
        // Silently preserve verified installed list
        dbg('fetchLiveSkills failed', e);
      }
    }

    // ------------------------------------------------------------------
    // 弹层共用基座：外部点击 / Escape / 窗口 resize / 外部滚动 统一关闭；
    // 面板内部滚动不关闭。监听延迟 10ms 挂载，避免触发打开的那次点击立刻
    // 又命中 outside。返回的 cleanup 幂等，关闭路径必须调用（防监听泄漏）。
    // ------------------------------------------------------------------
    function attachPopoverDismiss({ node, anchorEl, onClose, isInsideExtra }) {
      const isInside = (target) => {
        if (!target || target.nodeType !== 1) return false;
        if (node && node.contains(target)) return true;
        if (anchorEl && anchorEl.contains && anchorEl.contains(target)) return true;
        return isInsideExtra ? !!isInsideExtra(target) : false;
      };
      const onOutside = (e) => {
        if (node && !isInside(e.target)) onClose();
      };
      const onKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      const onResizeOrScroll = (e) => {
        const t = e && e.target;
        if (t && t.nodeType === 1 && isInside(t)) return;
        onClose();
      };
      let attached = false;
      const attach = () => {
        if (attached) return;
        attached = true;
        document.addEventListener('pointerdown', onOutside, true);
        document.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('resize', onResizeOrScroll);
        window.addEventListener('scroll', onResizeOrScroll, true);
      };
      const timer = setTimeout(() => {
        // 面板可能已关闭（节点脱离 DOM），仍打开才挂监听
        if (!node || node.isConnected === false) return;
        attach();
      }, 10);
      let cleaned = false;
      return () => {
        if (cleaned) return;
        cleaned = true;
        clearTimeout(timer);
        document.removeEventListener('pointerdown', onOutside, true);
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('resize', onResizeOrScroll);
        window.removeEventListener('scroll', onResizeOrScroll, true);
      };
    }

    // 光标处插入文本，不回溯清空已有内容。
    // 优先 execCommand('insertText')（与 React 受控编辑器兼容性最好）；
    // 回退路径：textarea/input 走原生 value setter 触发宿主监听，
    // contenteditable 走 Selection/Range，最后统一派发 input 事件。
    function insertTextAtCursor(editor, text) {
      try {
        if (document.execCommand && document.execCommand('insertText', false, text)) {
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
      } catch (e) {}
      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
        const proto = editor instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        const start = editor.selectionStart != null ? editor.selectionStart : editor.value.length;
        const end = editor.selectionEnd != null ? editor.selectionEnd : editor.value.length;
        const next = editor.value.slice(0, start) + text + editor.value.slice(end);
        if (setter) setter.call(editor, next); else editor.value = next;
        const caret = start + text.length;
        try { editor.setSelectionRange(caret, caret); } catch (e) {}
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (editor.isContentEditable) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const node = document.createTextNode(text);
          range.insertNode(node);
          range.setStartAfter(node);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          editor.appendChild(document.createTextNode(text));
        }
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    function closePopover() {
      if (popoverCleanup) {
        popoverCleanup();
        popoverCleanup = null;
      }
      if (popoverNode && popoverNode.parentNode) {
        popoverNode.parentNode.removeChild(popoverNode);
        popoverNode = null;
      }
      // closeExecPopover is a hoisted function declaration, so the typeof guard that
      // used to wrap this call always passed. The three call sites are plain calls now.
      closeExecPopover();
    }

    function toggleSkillsPopover(anchorEl) {
      closeExecPopover();
      if (popoverNode) {
        closePopover();
        return;
      }

      fetchLiveSkills().catch(() => {});

      const rect = anchorEl.getBoundingClientRect();
      const fromRail = !!(anchorEl.closest && anchorEl.closest('#dsh-ui-rail'));
      const popover = document.createElement('div');
      popover.className = '_3tUStW_list _3tUStW_portal dsh-ag-skills-menu';
      popover.setAttribute('role', 'menu');
      popover.style.position = 'fixed';

      const MARGIN = 12;
      if (fromRail) {
        // 从固定栏弹出：贴图标右侧展开，垂直与图标对齐
        popover.style.top = Math.max(MARGIN, rect.top - 4) + 'px';
        popover.style.left = (rect.right + 10) + 'px';
      } else {
        popover.style.top = (rect.bottom + 4) + 'px';

        // Clamp horizontally inside viewport
        const initialLeft = rect.left;
        popover.style.left = Math.max(MARGIN, initialLeft) + 'px';
      }

      const skillsToRender = (liveSkills && liveSkills.length > 0) ? liveSkills : INSTALLED_SKILLS;

      popover.innerHTML = `
        <div class="_3tUStW_viewport" role="presentation">
          ${skillsToRender.map(s => {
            return `
              <div class="_3tUStW_itemWrap">
                <button type="button" role="menuitem" class="_3tUStW_item" data-skill-id="${escapeHtml(s.id)}" data-skill-command="${escapeHtml(s.command || s.id)}" data-skill-name="${escapeHtml(s.name)}">
                  <span class="_3tUStW_itemIcon">
                    <svg width="14" height="14" viewBox="0 0 176 150" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:var(--dsw-alias-label-tertiary,#4B5563);flex:none;" aria-hidden="true">
                      <path d="M108 4L30 40V126L72 147L150 111V25L108 4Z" stroke="currentColor" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
                      <path d="M72 61V147" stroke="currentColor" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>
                      <path d="M30 40L72 61L150 25" stroke="currentColor" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
                      <path d="M30 83L72 104L150 68" stroke="currentColor" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
                    </svg>
                  </span>
                  <span class="_3tUStW_itemLabel">${escapeHtml(s.name)}</span>
                </button>
              </div>
            `;
          }).join('')}
        </div>
      `;

      popover.querySelectorAll('button[data-skill-id]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const skillId = btn.dataset.skillId;
          const command = btn.dataset.skillCommand || skillId;
          closePopover();
          // Find composer input and focus/insert native Harness skill trigger
          // (insert at caret — never overwrite what the user already typed)
          const editor = document.querySelector('.RlGAzG_input, [data-composer-input], textarea, div[contenteditable="true"]');
          if (editor) {
            editor.focus();
            insertTextAtCursor(editor, `/${command} `);
          }
        });
      });

      document.body.appendChild(popover);
      popoverNode = popover;

      // Adjust position if overflow
      const actualWidth = popover.offsetWidth || 200;
      if (fromRail) {
        const actualHeight = popover.offsetHeight || 200;
        if (rect.top - 4 + actualHeight > window.innerHeight - MARGIN) {
          popover.style.top = Math.max(MARGIN, window.innerHeight - MARGIN - actualHeight) + 'px';
        }
      } else if (rect.left + actualWidth > window.innerWidth - MARGIN) {
        popover.style.left = Math.max(MARGIN, window.innerWidth - MARGIN - actualWidth) + 'px';
      }

      popoverCleanup = attachPopoverDismiss({
        node: popover,
        anchorEl,
        onClose: closePopover,
      });
    }

    // Custom plugin chip icon: user-supplied artwork (端-01-01.svg). Trimmed to
    // the visible path — the export also carried an ellipse outside the
    // viewBox and a .st0 class referencing a clipPath that does not exist.
    const PLUGIN_SVG_HTML = `
      <svg width="15" height="13" viewBox="0 0 998.8 852.6" fill="currentColor" xmlns="http://www.w3.org/2000/svg" class="dsh-ag-plugin-icon" style="flex:none;margin:0;display:inline-block;vertical-align:middle;color:currentColor;" aria-hidden="true" data-plugin-icon="custom">
        <path d="M794.8,264.5C764.7,250,731,238,694.6,228.7c-9.3-36.4-21.3-70.1-35.8-100.1C617.8,43.3,561.1-3.6,499.1-3.6 S380.5,43.3,339.4,128.5c-14.5,30.1-26.5,63.8-35.8,100.1c-36.4,9.3-70.1,21.3-100.1,35.8c-85.2,41-132.1,97.7-132.1,159.7 c0,61.9,46.9,118.6,132.1,159.7c30.1,14.5,63.8,26.5,100.1,35.8c9.3,36.4,21.3,70.1,35.8,100.1c41,85.2,97.7,132.1,159.7,132.1 S617.8,805,658.8,719.8c14.5-30.1,26.5-63.8,35.8-100.1c36.4-9.3,70.1-21.3,100.1-35.8c85.2-41,132.1-97.7,132.1-159.7 C926.9,362.2,879.9,305.5,794.8,264.5z M773.1,538.8c-20.4,9.8-42.8,18.4-66.7,25.7c7.7-44.5,11.7-91.8,11.7-140.3h-0.3 c-0.2-13.5-11.2-24.5-24.8-24.5s-24.6,10.9-24.8,24.5h0c0,53.9-5.2,106-15.1,153.9c-3.8,18.5-8.3,36.3-13.5,53.4 c-7.3,23.9-15.9,46.2-25.7,66.7c-31.8,66-73.5,103.8-114.6,103.8s-82.9-37.8-114.6-103.8c-9.8-20.4-18.4-42.8-25.7-66.7 c44.5,7.7,91.8,11.7,140.3,11.7v0c13.7-0.1,24.7-11.2,24.7-24.9v0c0-13.7-11.1-24.8-24.7-24.9v-0.3c-53.9,0-106-5.2-153.9-15.1 c-18.5-3.8-36.3-8.3-53.4-13.5c-23.9-7.3-46.2-15.9-66.7-25.7c-66-31.8-103.8-73.5-103.8-114.6s37.8-82.9,103.8-114.6 c20.4-9.8,42.8-18.4,66.7-25.7c-7.7,44.5-11.7,91.8-11.7,140.3v0h0c0.1,13.6,11.2,24.6,24.8,24.6h0c13.7,0,24.7-11,24.8-24.6h0.3v0 c0-53.9,5.2-106,15.1-153.9c3.8-18.5,8.3-36.3,13.5-53.4c7.3-23.9,15.9-46.2,25.7-66.7c31.8-66,73.5-103.8,114.6-103.8 c41.1,0,82.9,37.8,114.6,103.8c9.8,20.4,18.4,42.8,25.7,66.7c-44.5-7.7-91.8-11.7-140.3-11.7h0v0c-13.6,0.2-24.6,11.2-24.6,24.8v0 c0,13.6,11,24.7,24.6,24.8v0.3h0c53.9,0,106,5.2,153.9,15.1c18.5,3.8,36.3,8.3,53.4,13.5c23.9,7.3,46.2,15.9,66.7,25.7 c66,31.8,103.8,73.5,103.8,114.6S839,507,773.1,538.8z"/>
      </svg>
    `;

    // Custom skill icon geometry (cube/ice crystal)
    const SKILL_SVG_HTML = `
      <svg width="15" height="13" viewBox="0 0 176 150" fill="none" xmlns="http://www.w3.org/2000/svg" class="dsh-ag-skill-icon" style="flex:none;margin:0;display:inline-block;vertical-align:middle;color:currentColor;" aria-hidden="true">
        <path d="M108 4L30 40V126L72 147L150 111V25L108 4Z" stroke="currentColor" stroke-width="8.5" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
        <path d="M72 61V147" stroke="currentColor" stroke-width="8.5" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="M30 40L72 61L150 25" stroke="currentColor" stroke-width="8.5" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
        <path d="M30 83L72 104L150 68" stroke="currentColor" stroke-width="8.5" stroke-linejoin="round" stroke-linecap="round" fill="none"/>
      </svg>
    `;
    // Laptop icon（v1.1.26 矢量重绘：原为媒体位图的逐像素行转写 path，数千字符
    // 仅在描述位图；现改为与固定栏图标同风格的 24×24 描边矢量，视觉等价、体积 <1%）
    const LAPTOP_SVG_HTML = `
      <svg width="16" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" class="dsh-ag-laptop-icon" style="flex:none;margin:0;display:inline-block;vertical-align:middle;color:currentColor;" aria-hidden="true">
        <rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/>
        <path d="M2.5 18.5h19"/>
      </svg>
    `;

    // Cloud icon（v1.1.26 矢量重绘，同 LAPTOP）
    const CLOUD_SVG_HTML = `
      <svg width="16" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" class="dsh-ag-cloud-icon" style="flex:none;margin:0;display:inline-block;vertical-align:middle;color:currentColor;" aria-hidden="true">
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
      </svg>
    `;


    // Checkmark icon geometry
    const CHECKMARK_SVG_HTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="dsh-ag-check-icon">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;

    let execPopoverNode = null;
    let execPopoverCleanup = null;

    function getExecTarget() {
      try {
        return localStorage.getItem('dsh_ag_exec_target') || 'local';
      } catch (e) {
        return 'local';
      }
    }

    function setExecTarget(target) {
      try {
        localStorage.setItem('dsh_ag_exec_target', target);
      } catch (e) {}
    }

    function updateExecBtnIcon(btn) {
      if (!btn) return;
      const target = getExecTarget();
      // Guarded: this runs on every scan, and an unconditional innerHTML write
      // here recreates the icon node each pass (wasted layout/paint churn and
      // avoidable MutationObserver noise for other plugins).
      if (btn.dataset.dshAgExecTarget === target) return;
      btn.dataset.dshAgExecTarget = target;
      btn.innerHTML = target === 'cloud' ? CLOUD_SVG_HTML : LAPTOP_SVG_HTML;
      btn.title = target === 'cloud' ? '在云端' : '在你的计算机上';
    }

    function closeExecPopover() {
      // 先摘监听再摘节点：所有关闭路径（点选/点外部/Esc/被 closePopover
      // 间接调用）都必须释放 dismiss 监听，否则每次使用都会泄漏一组。
      if (execPopoverCleanup) {
        execPopoverCleanup();
        execPopoverCleanup = null;
      }
      if (execPopoverNode) {
        if (execPopoverNode.parentNode) {
          execPopoverNode.parentNode.removeChild(execPopoverNode);
        }
        execPopoverNode = null;
        document.querySelectorAll('.dsh-ag-exec-target-btn').forEach(b => b.classList.remove('active'));
      }
    }

    function toggleExecPopover(anchorEl) {
      if (execPopoverNode) {
        closeExecPopover();
        return;
      }

      closePopover();

      anchorEl.classList.add('active');

      const rect = anchorEl.getBoundingClientRect();
      const bottomBar = anchorEl.closest('.dsh-ag-bottom-bar') || anchorEl;
      const barRect = bottomBar.getBoundingClientRect();

      // 动态获取 DeepSeek Harness 对话框高度，使卡片高度与对话框高度完全一致，且宽度等比例缩放
      const composerCard = document.querySelector('.RlGAzG_card, [data-composer-card], .RlGAzG_root');
      const composerHeight = (composerCard && composerCard.offsetHeight > 50) ? composerCard.offsetHeight : 106;

      const BASE_HEIGHT = 182;
      const scale = composerHeight / BASE_HEIGHT;

      const popover = document.createElement('div');
      popover.className = 'dsh-ag-exec-popover';
      popover.setAttribute('role', 'dialog');
      popover.setAttribute('aria-modal', 'false');
      popover.style.position = 'fixed';
      popover.style.setProperty('--dsh-ag-exec-scale', scale.toFixed(4));

      // 与点击“技能”后出现的卡片顶部位置严格对齐
      const skillChip = document.querySelector('.dsh-ag-skill-chip');
      const alignedTop = skillChip ? (skillChip.getBoundingClientRect().bottom + 4) : (rect.bottom + 4);
      popover.style.top = alignedTop + 'px';
      popover.style.bottom = 'auto';

      // 右边缘对齐按钮右边缘（或视口安全边界）
      const MARGIN = 12;
      let right = window.innerWidth - rect.right;
      if (right < MARGIN) right = MARGIN;
      popover.style.right = right + 'px';
      popover.style.left = 'auto';

      const currentTarget = getExecTarget();

      popover.innerHTML = `
        <div class="dsh-ag-exec-title">此聊天要在哪里运行？</div>
        <div class="dsh-ag-exec-list" role="menu">
          <div class="dsh-ag-exec-item ${currentTarget === 'local' ? 'dsh-ag-exec-selected' : ''}" data-target="local" role="menuitem" tabindex="0">
            <div class="dsh-ag-exec-icon">
              ${LAPTOP_SVG_HTML}
            </div>
            <div class="dsh-ag-exec-text">
              <div class="dsh-ag-exec-name">在你的计算机上</div>
              <div class="dsh-ag-exec-desc">经许可读取和编辑本地文件</div>
            </div>
            <div class="dsh-ag-exec-check">
              ${CHECKMARK_SVG_HTML}
            </div>
          </div>
          <div class="dsh-ag-exec-item ${currentTarget === 'cloud' ? 'dsh-ag-exec-selected' : ''}" data-target="cloud" role="menuitem" tabindex="0">
            <div class="dsh-ag-exec-icon">
              ${CLOUD_SVG_HTML}
            </div>
            <div class="dsh-ag-exec-text">
              <div class="dsh-ag-exec-name">在云端</div>
              <div class="dsh-ag-exec-desc">除非已附加，否则无法访问本地文件</div>
            </div>
            <div class="dsh-ag-exec-check">
              ${CHECKMARK_SVG_HTML}
            </div>
          </div>
        </div>
      `;

      popover.querySelectorAll('.dsh-ag-exec-item').forEach(item => {
        const target = item.dataset.target;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          setExecTarget(target);

          popover.querySelectorAll('.dsh-ag-exec-item').forEach(el => {
            el.classList.toggle('dsh-ag-exec-selected', el.dataset.target === target);
          });

          document.querySelectorAll('.dsh-ag-exec-target-btn').forEach(btn => {
            updateExecBtnIcon(btn);
          });

          setTimeout(() => {
            closeExecPopover();
          }, 120);
        });

        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.click();
          }
        });
      });

      document.body.appendChild(popover);
      execPopoverNode = popover;

      execPopoverCleanup = attachPopoverDismiss({
        node: popover,
        anchorEl,
        onClose: closeExecPopover,
      });
    }

    // DSH 本地实际安装的可用插件与服务列表 (真实反映本地配置与加载状态)
    const UNINSTALLED_PLUGIN_IDS = new Set([
      'dsh-media-gen',
      '@local/dsh-media-gen',
      'chatgpt-skin',
      'dsh-ivory',
      'yingqiwu-hero',
      '@local/yingqiwu-hero',
      'dsh-catppuccin',
      '@nonamelego/dsh-catppuccin',
      'auto-review',
      '@deepseek-ai/dsh-experimental-auto-review',
      'github-mcp',
    ]);

    // 默认真实基础插件（在桥接服务扫描返回前作为初始占位）
    const LOCAL_INSTALLED_PLUGINS = [
      {
        id: '@local/model-strength-picker',
        rowId: 'model-strength-picker',
        name: '模型思考强度选择器',
        desc: '配置模型思考强度档位。',
        searchText: 'moxing sikao qiangdu strength brain think picker',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
        defaultOn: true,
      },
      {
        id: 'dshmarket',
        aliasId: 'dsh-market',
        rowId: 'dsh-market',
        name: '插件市场',
        desc: '逛一逛，点一下，装好。',
        searchText: 'chajian shichang market dshmarket goumai shangcheng',
        icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
        defaultOn: true,
      }
    ];

    let livePluginsList = null;

    // 获取当前 DSH 本地实际安装及运行时加载的插件列表 (严格过滤卸载项)
    function getInstalledPlugins() {
      if (livePluginsList && livePluginsList.length > 0) {
        return livePluginsList.filter(p => !UNINSTALLED_PLUGIN_IDS.has(p.id) && !UNINSTALLED_PLUGIN_IDS.has(p.rowId));
      }
      return [...LOCAL_INSTALLED_PLUGINS];
    }

    const PLUGIN_STORAGE_KEY = 'dsh_plugins_state';
    function loadPluginState() {
      try {
        const raw = localStorage.getItem(PLUGIN_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            UNINSTALLED_PLUGIN_IDS.forEach(id => { delete parsed[id]; });
            delete parsed['adobe'];
            delete parsed['remotion'];
            delete parsed['figma'];
            delete parsed['hyperframes'];
            delete parsed['documents'];
            delete parsed['github'];
            return parsed;
          }
        }
      } catch (e) {}
      return {};
    }

    // Only touch localStorage when the serialised state actually changed. The stored
    // value is byte-identical either way, so this is behaviour-preserving.
    let lastPluginStateJson = null;
    function savePluginState(state) {
      try {
        const json = JSON.stringify(state);
        if (json === lastPluginStateJson) return;
        localStorage.setItem(PLUGIN_STORAGE_KEY, json);
        lastPluginStateJson = json;
      } catch (e) {}
    }

    let pluginState = loadPluginState();

    // `plugins` can be supplied by callers that already computed the list, which keeps
    // the hot loops below O(N) instead of O(N^2). The default preserves the result for
    // any caller that passes nothing.
    function isPluginEnabled(pluginId, plugins = getInstalledPlugins()) {
      if (pluginState[pluginId] !== undefined) {
        return Boolean(pluginState[pluginId]);
      }
      const found = plugins.find(p => p.id === pluginId || p.aliasId === pluginId || p.rowId === pluginId);
      return found ? (found.enabled !== undefined ? found.enabled : found.defaultOn) : true;
    }

    function renderToggleSwitch(isOn, extraClass = '', extraAttrs = '') {
      return `
        <span class="dsh-ag-toggle-switch ${isOn ? 'dsh-ag-toggle-on' : ''} ${extraClass}" role="switch" aria-checked="${isOn ? 'true' : 'false'}" ${extraAttrs} tabindex="0">
          <span class="dsh-ag-toggle-thumb"></span>
        </span>
      `;
    }

    function syncSwitchVisual(switchEl, isOn) {
      if (!switchEl) return;
      if (isOn) {
        switchEl.classList.add('dsh-ag-toggle-on');
        switchEl.setAttribute('aria-checked', 'true');
      } else {
        switchEl.classList.remove('dsh-ag-toggle-on');
        switchEl.setAttribute('aria-checked', 'false');
      }
    }

    function renderPluginItemsInPopover(popover) {
      if (!popover) return;
      const listContainer = popover.querySelector('.dsh-ag-plugins-list');
      if (!listContainer) return;

      const currentPlugins = getInstalledPlugins();

      const itemsHtml = currentPlugins.map(p => {
        const isEnabled = isPluginEnabled(p.id, currentPlugins);
        const pName = p.name || p.id;
        const pDesc = p.desc || '';
        const pSearchText = p.searchText || p.pinyin || (pName + ' ' + pDesc); // pinyin 为 ≤1.1.3 的旧字段名，兜底兼容
        return `
          <div class="dsh-ag-plugin-item" role="menuitem" data-plugin-id="${escapeHtml(p.id)}" data-plugin-name="${escapeHtml(pName)}" data-plugin-desc="${escapeHtml(pDesc)}" data-plugin-pinyin="${escapeHtml(pSearchText)}" style="display: flex;">
            <div class="dsh-ag-plugin-item-left">
              <span class="dsh-ag-plugin-item-icon">
                ${p.icon || '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F6FED" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'}
              </span>
              <span class="dsh-ag-plugin-item-name">${escapeHtml(pName)}</span>
            </div>
            ${renderToggleSwitch(isEnabled, 'dsh-ag-item-switch', `data-plugin-id="${p.id}" title="${isEnabled ? '已启用（点击禁用）' : '已禁用（点击启用）'}"`)}
          </div>
        `;
      }).join('');

      listContainer.innerHTML = itemsHtml + `<div class="dsh-ag-plugins-empty" style="display: ${currentPlugins.length === 0 ? 'block' : 'none'};">暂无插件</div>`;

      // 绑定每个插件项的点击与开关事件
      listContainer.querySelectorAll('.dsh-ag-plugin-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const pId = item.dataset.pluginId;
          if (pId) togglePluginItem(pId);
        });
        const sw = item.querySelector('.dsh-ag-item-switch');
        if (sw) {
          sw.addEventListener('click', (e) => {
            e.stopPropagation();
            const pId = sw.dataset.pluginId;
            if (pId) togglePluginItem(pId);
          });
        }
      });
    }

    async function fetchLivePlugins() {
      // 1. 尝试从 DSH-UI 本地桥接服务获取真实扫描的插件列表
      try {
        const res = await fetch(`${BRIDGE_API}/api/plugins`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.plugins)) {
            livePluginsList = data.plugins.filter(p => !UNINSTALLED_PLUGIN_IDS.has(p.id) && !UNINSTALLED_PLUGIN_IDS.has(p.rowId));
            livePluginsList.forEach(p => {
              pluginState[p.id] = p.enabled;
              if (p.aliasId) pluginState[p.aliasId] = p.enabled;
              if (p.rowId) pluginState[p.rowId] = p.enabled;
            });
            savePluginState(pluginState);
            if (popoverNode) {
              renderPluginItemsInPopover(popoverNode);
            }
            updateAllSwitches();
            return;
          }
        }
      } catch (e) { dbg('bridge /api/plugins failed', e); }

      // 2. 备用方式：从 DSH 官方宿主 /dsh-market/installed 获取
      try {
        const res = await fetch('/dsh-market/installed', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.installed) {
            const patchDisables = new Set(data.patch?.disables || []);
            const patchDisabledSet = new Set(data.patchDisabled || []);
            const installedKeys = Object.keys(data.installed).filter(k => 
              k !== '@deepseek-ai/dsh-base' && 
              k !== '@deepseek-ai/dsh-web-app' && 
              k !== '@deepseek-ai/dsh-headless' && 
              k !== '@local/dsh-ui' && 
              k !== 'dsh-ui' && 
              !UNINSTALLED_PLUGIN_IDS.has(k)
            );

            livePluginsList = installedKeys.map(k => {
              const row = k.replace(/^@[^/]+\//, '');
              const isOff = patchDisables.has(row) || patchDisabledSet.has(k) || (Array.isArray(data.disabled) && data.disabled.includes(k));
              return {
                id: k,
                rowId: row,
                name: k === 'dshmarket' ? '插件市场' : (k === '@local/model-strength-picker' ? '模型思考强度选择器' : row),
                desc: '',
                enabled: !isOff,
                icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F6FED" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`
              };
            });

            livePluginsList.forEach(p => {
              pluginState[p.id] = p.enabled;
              if (p.rowId) pluginState[p.rowId] = p.enabled;
            });
            savePluginState(pluginState);
            if (popoverNode) {
              renderPluginItemsInPopover(popoverNode);
            }
            updateAllSwitches();
          }
        }
      } catch (e) { dbg('/dsh-market/installed fallback failed', e); }
    }

    async function togglePluginItem(pluginId) {
      const current = isPluginEnabled(pluginId);
      const next = !current;

      // 1. Optimistic instant visual switch
      pluginState[pluginId] = next;
      savePluginState(pluginState);
      updateAllSwitches();

      // 2. Market endpoint first: it performs the full multi-layer toggle
      //    (live mount/unmount, state.json, bundles stack, patch rows) and
      //    its reply carries the restart/refresh verdict needed to explain
      //    plugins that cannot hot-unload — without it a working toggle
      //    reads as a dead one.
      let result = null;
      try {
        const res = await fetch('/dsh-market/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: pluginId, enabled: next })
        });
        if (res.status !== 404) {
          const data = await res.json().catch(() => null);
          if (data && data.ok) {
            result = { ok: true, restart: !!data.restart, refresh: !!data.refresh, patchOnly: false };
          } else if (data && (data.error || data.reason)) {
            result = { ok: false, reason: String(data.error || data.reason) };
          }
        }
      } catch (e) { dbg('/dsh-market/toggle failed', e); }

      // 3. Bridge fallback (writes the patch row and notifies the market itself)
      if (!result) {
        try {
          const res = await fetch(`${BRIDGE_API}/api/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: pluginId, enabled: next })
          });
          if (res.ok) {
            const data = await res.json().catch(() => null);
            if (data && data.ok) {
              pluginState[pluginId] = data.enabled;
              if (data.rowId) pluginState[data.rowId] = data.enabled;
              savePluginState(pluginState);
              updateAllSwitches();
              result = { ok: true, restart: !!data.restart, refresh: !!data.refresh, patchOnly: data.via !== 'market' };
            }
          }
        } catch (e) { dbg('bridge /api/toggle failed', e); }
      }

      // 4. Both channels failed: roll the switch back so the visual never lies,
      //    then flag the row inline (red flash + shake) instead of a toast.
      if (!result || !result.ok) {
        pluginState[pluginId] = current;
        savePluginState(pluginState);
        updateAllSwitches();
        flagToggleRow(pluginId, 'error', '切换失败', result && result.reason);
        return;
      }

      // 5. Durable but not live: the page keeps running its already-loaded
      //    client code, and Desktop cannot self-restart the host (the market
      //    hardcodes allowRestart:false there — the shell owns the process).
      //    The strongest step we can offer is a page reload, one click away
      //    on the hint itself.
      if (result.restart || result.refresh || result.patchOnly) {
        flagToggleRow(pluginId, 'deferred', '已保存，点击刷新生效',
          '已写入配置。点击提示刷新页面查看效果；若刷新后仍未生效，重启应用即可。', 'reload');
      }
    }

    // Marks the affected row for a short window: failures shake the switch
    // and flash a red "切换失败" hint; deferred successes show an amber
    // actionable hint ("已保存，点击刷新生效") — clicking it reloads the
    // page, which is the strongest immediate step Desktop allows (self-
    // restart is hardcoded off there; the shell owns the process lifecycle).
    // Guard prevents stacking animations when the same row is clicked
    // repeatedly. `detail` rides on the row title for hover.
    function flagToggleRow(pluginId, kind, text, detail, action) {
      if (!popoverNode) return;
      let item = null;
      popoverNode.querySelectorAll('.dsh-ag-plugin-item[data-plugin-id]').forEach(el => {
        if (el.dataset.pluginId === pluginId) item = el;
      });
      if (!item || item.dataset.dshAgFlagging === 'true') return;
      item.dataset.dshAgFlagging = 'true';

      const isError = kind === 'error';
      const sw = item.querySelector('.dsh-ag-item-switch');
      // Append the hint to the flex row container, not inside the name span:
      // the name has ellipsis overflow, so a long plugin name would clip a
      // nested hint. As a flex:none sibling it always stays fully visible.
      const left = item.querySelector('.dsh-ag-plugin-item-left');
      item.classList.add(isError ? 'dsh-ag-toggle-failed' : 'dsh-ag-toggle-deferred');
      if (detail) item.title = detail;
      let hint = left && left.querySelector('.dsh-ag-toggle-error');
      if (!hint && left) {
        hint = document.createElement('span');
        hint.className = 'dsh-ag-toggle-error';
        hint.textContent = text;
        left.appendChild(hint);
      }
      // Actionable hint: one click applies the change. stopPropagation keeps
      // the row's own click (toggle the switch) from firing underneath.
      if (!isError && action === 'reload' && hint) {
        hint.classList.add('dsh-ag-toggle-action');
        hint.addEventListener('click', (e) => {
          e.stopPropagation();
          location.reload();
        });
      }
      if (isError && sw) sw.classList.add('dsh-ag-toggle-shake');

      const TTL = isError ? 1600 : 8000;
      setTimeout(() => {
        item.classList.remove('dsh-ag-toggle-failed', 'dsh-ag-toggle-deferred');
        item.removeAttribute('title');
        const oldHint = left && left.querySelector('.dsh-ag-toggle-error');
        if (oldHint) oldHint.remove();
        if (sw) sw.classList.remove('dsh-ag-toggle-shake');
        delete item.dataset.dshAgFlagging;
      }, TTL);
    }

    function updateAllSwitches() {
      if (popoverNode) {
        const plugins = getInstalledPlugins();
        popoverNode.querySelectorAll('.dsh-ag-plugin-item[data-plugin-id]').forEach(item => {
          const pId = item.dataset.pluginId;
          const isOn = isPluginEnabled(pId, plugins);
          const sw = item.querySelector('.dsh-ag-item-switch');
          if (sw) {
            syncSwitchVisual(sw, isOn);
            sw.title = isOn ? '已启用（点击禁用）' : '已禁用（点击启用）';
          }
        });
      }
    }

    function openSystemPluginSettings() {
      closePopover();

      // 寻找设置弹窗左侧导航中的「插件」项。精确匹配优先，避免命中「插件市场」。
      function findPluginNavButton() {
        const navBtns = document.querySelectorAll(
          '[data-shortcut-modal="settings"] nav button, ' +
          '[role="dialog"] nav button, ' +
          '[class*="_panel"] nav button, ' +
          '[class*="_navCell"], ' +
          '[class*="wCInkW_navCell"], ' +
          'nav button'
        );
        for (const btn of navBtns) {
          const txt = (btn.textContent || '').trim();
          if (txt === '插件' || txt === 'Plugins' || txt === 'Plugin') {
            return btn;
          }
        }
        for (const btn of navBtns) {
          const txt = (btn.textContent || '').trim();
          const lower = txt.toLowerCase();
          if ((txt.includes('插件') && !txt.includes('市场')) || lower === 'plugins' || lower.includes('plugin')) {
            return btn;
          }
        }
        return null;
      }

      function safeClick(el) {
        if (!el) return;
        try {
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        } catch (e) {}
        try {
          el.click();
        } catch (e) {}
      }

      // 如果设置弹窗已经处于打开状态，直接跳转到插件面板
      const existingBtn = findPluginNavButton();
      if (existingBtn) {
        safeClick(existingBtn);
        return;
      }

      // 2. 精准定位设置入口按钮（位于侧边栏底部 footArea / settingsArea 中）
      function findSettingsButton() {
        // 优先级 1: 侧边栏底部 settingsArea / footArea 内的按钮
        const inSettingsArea = document.querySelector(
          '[class*="settingsArea"] button, ' +
          '[class*="footArea"] [class*="triggerRow"] button, ' +
          '[class*="triggerRow"] button[aria-haspopup="dialog"], ' +
          '[class*="triggerRow"] button'
        );
        if (inSettingsArea) return inSettingsArea;

        // 优先级 2: 明确带有“设置”或“Settings”标签的按钮
        const byLabel = document.querySelector(
          'button[aria-label="设置"], button[aria-label="Settings"], ' +
          'button[title="设置"], button[title="Settings"]'
        );
        if (byLabel) return byLabel;

        // 优先级 3: 包含设置特征类名的 trigger 按钮
        const byClass = document.querySelector(
          'button[class*="wCInkW_trigger"], ' +
          'button[class*="_trigger"][class*="rail"]'
        );
        if (byClass) return byClass;

        // 优先级 4: 全局遍历带有“设置”文本/图标且具有 dialog popup 的按钮
        for (const b of document.querySelectorAll('button')) {
          const aria = (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').trim();
          if ((aria === '设置' || aria === 'Settings') && b.getAttribute('aria-haspopup') === 'dialog') {
            return b;
          }
        }
        return null;
      }

      const settingsBtn = findSettingsButton();
      let clickedSettings = false;
      if (settingsBtn) {
        safeClick(settingsBtn);
        clickedSettings = true;
      }

      // 3. 原生全局快捷键保障（桌面端 Ctrl+, / Web 端 Ctrl+Alt+, 以及 macOS Cmd+,）
      const isMac = typeof navigator !== 'undefined' && navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      function dispatchShortcut() {
        const events = [
          new KeyboardEvent('keydown', {
            key: ',',
            code: 'Comma',
            ctrlKey: !isMac,
            metaKey: isMac,
            bubbles: true,
            cancelable: true
          }),
          new KeyboardEvent('keydown', {
            key: ',',
            code: 'Comma',
            ctrlKey: true,
            altKey: true,
            bubbles: true,
            cancelable: true
          })
        ];
        for (const evt of events) {
          window.dispatchEvent(evt);
          document.dispatchEvent(evt);
        }
      }

      // 如果未找到按钮，或作为双保险派发快捷键
      if (!clickedSettings) {
        dispatchShortcut();
      }

      // 4. 使用 MutationObserver + 高频快速轮询，第一时间激活「插件」面板
      let settled = false;
      function trySelectPluginNav() {
        if (settled) return true;
        const pluginBtn = findPluginNavButton();
        if (pluginBtn) {
          settled = true;
          safeClick(pluginBtn);
          return true;
        }
        return false;
      }

      if (trySelectPluginNav()) return;

      const observer = new MutationObserver(() => {
        if (trySelectPluginNav()) {
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (attempts === 8 && !settled) {
          // 200ms 后若未弹出，补发一次快捷键兜底
          dispatchShortcut();
        }
        if (trySelectPluginNav() || attempts >= 80) {
          clearInterval(interval);
          observer.disconnect();
        }
      }, 25);
    }

    function togglePluginsPopover(anchorEl) {
      closeExecPopover();
      if (popoverNode) {
        closePopover();
        return;
      }

      fetchLivePlugins();

      const rect = anchorEl.getBoundingClientRect();
      const fromRail = !!(anchorEl.closest && anchorEl.closest('#dsh-ui-rail'));
      const popover = document.createElement('div');
      popover.className = 'dsh-ag-plugins-menu';
      popover.setAttribute('role', 'menu');
      popover.style.position = 'fixed';

      const MARGIN = 12;
      if (fromRail) {
        // 从固定栏弹出：贴图标右侧展开，垂直与图标对齐
        popover.style.top = Math.max(MARGIN, rect.top - 4) + 'px';
        popover.style.left = (rect.right + 10) + 'px';
        popover.style.bottom = 'auto';
        popover.style.right = 'auto';
      } else {
        // 与”技能”和执行环境卡片顶部位置严格对齐（在按钮下方 4px 展开）
        const skillChip = document.querySelector('.dsh-ag-skill-chip');
        const alignedTop = skillChip ? (skillChip.getBoundingClientRect().bottom + 4) : (rect.bottom + 4);
        popover.style.top = alignedTop + 'px';
        popover.style.bottom = 'auto';

        const initialLeft = rect.left;
        popover.style.left = Math.max(MARGIN, initialLeft) + 'px';
        popover.style.right = 'auto';
      }

      popover.innerHTML = `
        <div class="dsh-ag-plugins-list" role="presentation">
          <div class="dsh-ag-plugins-empty">暂无插件</div>
        </div>
        <div class="dsh-ag-plugins-footer" role="button" tabindex="0" title="浏览所有插件">
          <div class="dsh-ag-plugins-footer-left">
            ${PLUGIN_SVG_HTML}
            <span>浏览所有插件</span>
          </div>
          <svg class="dsh-ag-footer-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="7" y1="17" x2="17" y2="7"></line>
            <polyline points="7 7 17 7 17 17"></polyline>
          </svg>
        </div>
      `;

      // 实时渲染当前已发现插件列表
      renderPluginItemsInPopover(popover);

      // Footer click: open the system plugin settings page
      const footer = popover.querySelector('.dsh-ag-plugins-footer');
      if (footer) {
        footer.addEventListener('click', (e) => {
          e.stopPropagation();
          openSystemPluginSettings();
        });
        footer.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            openSystemPluginSettings();
          }
        });
      }

      document.body.appendChild(popover);
      popoverNode = popover;

      const actualWidth = popover.offsetWidth || 280;
      if (fromRail) {
        const actualHeight = popover.offsetHeight || 200;
        if (rect.top - 4 + actualHeight > window.innerHeight - MARGIN) {
          popover.style.top = Math.max(MARGIN, window.innerHeight - MARGIN - actualHeight) + 'px';
        }
      } else if (rect.left + actualWidth > window.innerWidth - MARGIN) {
        popover.style.left = Math.max(MARGIN, window.innerWidth - MARGIN - actualWidth) + 'px';
      }

      popoverCleanup = attachPopoverDismiss({
        node: popover,
        anchorEl,
        onClose: closePopover,
      });
    }

    // Attach bottom bar on grey block holding "插件" (前) and "技能" (后) (从左到右排列)
    function attachBottomBar(heroContainer) {
      if (!heroContainer) return;
      let bar = heroContainer.querySelector('.dsh-ag-bottom-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'dsh-ag-bottom-bar';
        heroContainer.appendChild(bar);
      }

      // 1. "插件" (排在前面，采用用户专属的 @ 插头图标)
      let pluginChip = bar.querySelector('.dsh-ag-plugin-chip');
      if (!pluginChip) {
        pluginChip = document.createElement('button');
        pluginChip.className = 'dsh-ag-plugin-chip';
        pluginChip.type = 'button';
        pluginChip.setAttribute('aria-label', '插件');
        pluginChip.innerHTML = `${PLUGIN_SVG_HTML}<span>插件</span>`;
        pluginChip.addEventListener('click', (e) => {
          e.stopPropagation();
          togglePluginsPopover(pluginChip);
        });
        bar.appendChild(pluginChip);
      } else {
        const existingSvg = pluginChip.querySelector('svg');
        if (existingSvg && (!existingSvg.classList.contains('dsh-ag-plugin-icon') || existingSvg.getAttribute('viewBox') !== '0 0 998.8 852.6')) {
          existingSvg.outerHTML = PLUGIN_SVG_HTML;
        }
        const oldSwitch = pluginChip.querySelector('.dsh-ag-chip-switch, .dsh-ag-toggle-switch');
        if (oldSwitch) oldSwitch.remove();
        pluginChip.classList.remove('dsh-ag-plugin-off');
      }

      // 2. "技能" (排在后面)
      let skillChip = bar.querySelector('.dsh-ag-skill-chip');
      if (!skillChip) {
        skillChip = document.createElement('button');
        skillChip.className = 'dsh-ag-skill-chip';
        skillChip.type = 'button';
        skillChip.setAttribute('aria-label', '技能');
        skillChip.innerHTML = `${SKILL_SVG_HTML}<span>技能</span>`;
        skillChip.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleSkillsPopover(skillChip);
        });
        bar.appendChild(skillChip);
      } else {
        const existingSvg = skillChip.querySelector('svg');
        if (existingSvg && existingSvg.getAttribute('viewBox') !== '0 0 176 150') {
          existingSvg.outerHTML = SKILL_SVG_HTML;
        }
      }

      // 严格保证顺序：插件在前，技能在后
      if (pluginChip && skillChip && pluginChip.nextElementSibling !== skillChip) {
        bar.insertBefore(pluginChip, skillChip);
      }

      // 3. 执行目标环境按钮 —— 目前是纯视觉组件（选择仅写 localStorage，
      //    无行为对接），SHOW_EXEC_TARGET 默认 false 不挂载以免误导；
      //    宿主提供真实执行目标 API 后置 true 即恢复完整交互。
      if (SHOW_EXEC_TARGET) {
        let execBtn = bar.querySelector('.dsh-ag-exec-target-btn');
        if (!execBtn) {
          execBtn = document.createElement('button');
          execBtn.className = 'dsh-ag-exec-target-btn';
          execBtn.type = 'button';
          execBtn.setAttribute('aria-label', '此聊天要在哪里运行？');
          updateExecBtnIcon(execBtn);
          execBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleExecPopover(execBtn);
          });
          bar.appendChild(execBtn);
        } else {
          updateExecBtnIcon(execBtn);
        }

        if (execBtn && bar.lastElementChild !== execBtn) {
          bar.appendChild(execBtn);
        }
      } else {
        bar.querySelectorAll('.dsh-ag-exec-target-btn').forEach(b => b.remove());
      }
    }

    // Custom workspace icon geometry extracted 1:1 from media_1790822141172.png
    const WORKSPACE_SVG_PATHS = `
      <path d="M4 24C4 13 13 4 24 4H64C76 4 86 16 94 27C98 32 103 35 110 35H152C163 35 172 44 172 55V126C172 137 163 146 152 146H24C13 146 4 137 4 126V24Z" stroke="currentColor" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <path d="M4 70H172" stroke="currentColor" stroke-width="8.5" fill="none"/>
    `;

    function updateWorkspaceSvgNode(svgNode) {
      if (!svgNode) return;
      if (svgNode.dataset.dshAgReplaced === 'true' && svgNode.getAttribute('viewBox') === '0 0 176 150') return;
      svgNode.dataset.dshAgReplaced = 'true';
      svgNode.setAttribute('viewBox', '0 0 176 150');
      svgNode.setAttribute('width', '15');
      svgNode.setAttribute('height', '13');
      svgNode.classList.add('dsh-ag-workspace-icon');
      svgNode.style.cssText = 'flex:none;width:15px;height:13px;min-width:15px;min-height:13px;max-width:15px;max-height:13px;margin:0;display:inline-block;vertical-align:middle;color:currentColor;box-sizing:border-box;';
      svgNode.innerHTML = WORKSPACE_SVG_PATHS;
    }

    function createWorkspaceSvgNode() {
      const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      newSvg.setAttribute('viewBox', '0 0 176 150');
      newSvg.setAttribute('width', '15');
      newSvg.setAttribute('height', '13');
      newSvg.classList.add('Hqq-bq_folder', 'dsh-ag-workspace-icon');
      newSvg.style.cssText = 'flex:none;width:15px;height:13px;min-width:15px;min-height:13px;margin:0;display:inline-block;vertical-align:middle;color:currentColor;';
      newSvg.innerHTML = WORKSPACE_SVG_PATHS;
      return newSvg;
    }

    function sanitizeWorkspaceLabel(row) {
      if (!row) return;
      const wsBtn = row.querySelector('.Hqq-bq_workspace, button[class*="workspace"]');
      if (!wsBtn) return;
      const label = wsBtn.querySelector('.Hqq-bq_workspaceLabel, [class*="workspaceLabel"]');
      if (label) {
        const text = label.textContent?.trim();
        if (!text || text === '选择工作区' || text === '默认' || text === 'Default') {
          if (label.textContent !== '选择项目') {
            label.textContent = '选择项目';
          }
        }
      }
    }

    function replaceWorkspaceFolderIcon(row) {
      if (!row) return;
      let wsBtn = row.querySelector('.Hqq-bq_workspace, [class*="workspace"]');
      if (!wsBtn) {
        const firstBtn = row.querySelector('button:not(.dsh-ag-skill-chip)');
        if (firstBtn && !firstBtn.classList.contains('dsh-ag-skill-chip')) {
          wsBtn = firstBtn;
        }
      }
      if (!wsBtn) return;

      const folderSvg = wsBtn.querySelector('.Hqq-bq_folder, [class*="folder"], svg:not([class*="chevron"]):not(.dsh-ag-workspace-icon)');
      if (folderSvg) {
        updateWorkspaceSvgNode(folderSvg);
      } else if (!wsBtn.querySelector('.dsh-ag-workspace-icon')) {
        const newSvg = createWorkspaceSvgNode();
        const label = wsBtn.querySelector('.Hqq-bq_workspaceLabel, [class*="workspaceLabel"]');
        if (label) {
          wsBtn.insertBefore(newSvg, label);
        } else {
          wsBtn.prepend(newSvg);
        }
      }
    }

    function replaceAllWorkspaceIcons(root = document) {
      const wsButtons = root.querySelectorAll('.Hqq-bq_workspace, button[class*="workspace"]');
      wsButtons.forEach(wsBtn => {
        const label = wsBtn.querySelector('.Hqq-bq_workspaceLabel, [class*="workspaceLabel"]');
        if (label) {
          const text = label.textContent?.trim();
          if (!text || text === '选择工作区' || text === '默认' || text === 'Default') {
            if (label.textContent !== '选择项目') {
              label.textContent = '选择项目';
            }
          }
        }
        const folderSvg = wsBtn.querySelector('.Hqq-bq_folder, [class*="folder"], svg:not([class*="chevron"]):not(.dsh-ag-workspace-icon)');
        if (folderSvg) {
          updateWorkspaceSvgNode(folderSvg);
        } else if (!wsBtn.querySelector('.dsh-ag-workspace-icon')) {
          const newSvg = createWorkspaceSvgNode();
          if (label) {
            wsBtn.insertBefore(newSvg, label);
          } else {
            wsBtn.prepend(newSvg);
          }
        }
      });
    }

    /* v1.1.36 工作区行搜索图标：与宿主 IconSearchOutlineRegular 1:1（16x16、
       stroke-width 1，两条 path 原样取自 dsh-client-ui-primitives）。 */
    const SEARCH_SVG_HTML = `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M6.58727 11.8586C9.55061 11.8586 11.9529 9.45637 11.9529 6.49304C11.9529 3.5297 9.55061 1.12744 6.58727 1.12744C3.62394 1.12744 1.22168 3.5297 1.22168 6.49304C1.22168 9.45637 3.62394 11.8586 6.58727 11.8586Z" stroke="currentColor"/>
        <path d="M10.2991 10.3933L14.7783 14.8725" stroke="currentColor"/>
      </svg>
    `;

    /* v1.1.38：工作区行搜索入口恢复（图标组右端、🔍 居组图标最左，与原生一致）。
       事实（用户截图核实）：原生侧边栏 searchSlot 正常可见；托管卡片里它整体
       不可见（卡片的 🔍 因此缺失）。v1.1.37 把注入按钮插进原生按钮原位——若
       searchSlot 整体不可见，注入件会被关进同一不可见容器。现改为插进区头
       「搜索槽之前」（图标组最左，槽外独立可见）：
       - 先插入成功、再隐藏原生按钮（失败也不会只剩隐藏）；
       - 每次扫描幂等对位，React 重挂载后自动重新隐藏/归位；
       - 点击时再定位原生按钮转发（隐藏态仍可触发其 React onClick → 原生
         搜索展开），找不到则派发 Ctrl+K（session.search 原生快捷键）。

       v1.1.41：图标组回到区头右端（见 styles.css 的托管区头规则），并放宽原生按钮
       的定位范围（区头内优先 → 区头父级兜底）——宿主布局变动时注入件不会因为
       一次性查不到原生按钮而退化。 */
    function buildWorkspaceSearchBtn() {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dsh-ag-search-btn';
      btn.setAttribute('aria-label', '搜索会话');
      btn.title = '搜索会话（Ctrl+K）';
      btn.innerHTML = SEARCH_SVG_HTML;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 点击时再定位原生按钮（React 重挂载后旧引用会失效）；隐藏态仍可触发其 onClick
        let native = null;
        try {
          const host = btn.closest('[class*="_sectionHeader"]') || btn.parentElement;
          native = host && (host.querySelector('[class*="searchButton"]:not(.dsh-ag-search-btn)')
            || (host.parentElement && host.parentElement.querySelector('[class*="searchButton"]:not(.dsh-ag-search-btn)')));
        } catch (err) {}
        if (native) {
          try { native.click(); return; } catch (err) {}
        }
        railDispatchKey('KeyK', 'k', { ctrl: true });
        setTimeout(() => railDispatchKey('KeyK', 'k', { ctrl: true, alt: true }), 60);
      });
      return btn;
    }

    // v1.1.41：把托管卡片工作区区头的图标组钉在「右端」。
    //
    // 宿主原生布局（dsh-client-ui-workspace）里，把图标组顶到右端的不是
    // justify-content，而是 .searchSlot 的 `margin-left: auto`——这枚自动外边距
    // 吸走区头全部剩余空间，紧随其后的 headerActions（⇄ / 📁+）便贴到右端。
    // 一旦这条声明在托管上下文里被覆盖，图标组就会塌回「工作区」标签旁
    // （即用户截图蓝框所示的位置）。
    //
    // styles.css 已用 !important 声明过同一件事；这里再用「内联 !important」
    // 钉一次：内联声明的优先级高于任何样式表，可免疫其它插件样式表的后置覆盖。
    // 仅作用于托管卡片（.dsh-native-host）内部，原生侧边栏不受影响。
    function enforceWorkspaceHeaderLayout(header) {
      if (!header || header.nodeType !== 1) return;
      try {
        if (!header.closest('.dsh-native-host')) return;
        header.style.setProperty('justify-content', 'flex-end', 'important');
        const slot = header.querySelector('[class*="searchSlot"]');
        if (!slot) return;
        if (/searchSlotExpanded/.test(String(slot.className))) {
          // 搜索展开态：搜索框自身吃掉剩余宽度，交还原生自适应
          slot.style.removeProperty('margin-left');
        } else {
          slot.style.setProperty('margin-left', 'auto', 'important');
        }
      } catch (e) { dbg('enforceWorkspaceHeaderLayout failed', e); }
    }

    function ensureWorkspaceSearch(root = document) {
      try {
        const headers = root.querySelectorAll('[class*="_sectionHeader"]');
        headers.forEach(header => {
          enforceWorkspaceHeaderLayout(header);
          const scope = header.parentElement || header;
          // 区头内优先，父级兜底：宿主不同布局下 searchButton 的落点会变
          const findNative = () => header.querySelector('[class*="searchButton"]:not(.dsh-ag-search-btn)')
            || scope.querySelector('[class*="searchButton"]:not(.dsh-ag-search-btn)');
          const findMine = () => header.querySelector('.dsh-ag-search-btn')
            || scope.querySelector('.dsh-ag-search-btn');
          const nativeBtn = findNative();
          let mine = findMine();
          if (nativeBtn) {
            // 原位注入（原生按钮正前方）：与原生布局零间隙、顺序天然一致
            // [🔍][⇄][📁+]（用户截图锁定的契约）
            if (!mine) mine = buildWorkspaceSearchBtn();
            try { nativeBtn.parentNode.insertBefore(mine, nativeBtn); } catch (e) {
              if (!mine.parentNode) header.appendChild(mine);
            }
            // 注入成功后再隐藏原生按钮（顺序保证：插入失败也不会只剩隐藏）
            try { nativeBtn.style.setProperty('display', 'none', 'important'); } catch (e) {}
            return;
          }
          // 无原生按钮的布局：搜索槽之前（图标组最左）→ 图标组之前 → 区头末尾
          const anchor = header.querySelector('[class*="searchSlot"]')
            || header.querySelector('[class*="_headerActions"]')
            || null;
          if (mine) {
            if (anchor && mine.parentNode === header && mine.nextElementSibling !== anchor) {
              try { header.insertBefore(mine, anchor); } catch (e) {}
            }
            return;
          }
          mine = buildWorkspaceSearchBtn();
          if (anchor) header.insertBefore(mine, anchor);
          else header.appendChild(mine);
        });
      } catch (e) { dbg('ensureWorkspaceSearch failed', e); }
    }

    // Custom standard mode icon geometry extracted 1:1 from media_1790823474988.png
    const MODE_SVG_PATHS = `
      <circle cx="85" cy="28.5" r="25.5" stroke="currentColor" stroke-width="8.5" fill="none"/>
      <circle cx="43.5" cy="120" r="25.5" stroke="currentColor" stroke-width="8.5" fill="none"/>
      <circle cx="126.5" cy="120" r="25.5" stroke="currentColor" stroke-width="8.5" fill="none"/>
      <path d="M118 39A57.5 57.5 0 0 1 142.5 86.5" stroke="currentColor" stroke-width="8.5" stroke-linecap="round"/>
      <path d="M109 138.5A57.5 57.5 0 0 1 71 142.5" stroke="currentColor" stroke-width="8.5" stroke-linecap="round"/>
      <path d="M28 91.5A57.5 57.5 0 0 1 47 43.7" stroke="currentColor" stroke-width="8.5" stroke-linecap="round"/>
    `;

    function updateModeSvgNode(svgNode) {
      if (!svgNode) return;
      if (svgNode.dataset.dshAgReplaced === 'true' && svgNode.getAttribute('viewBox') === '0 0 176 150') return;
      svgNode.dataset.dshAgReplaced = 'true';
      svgNode.setAttribute('viewBox', '0 0 176 150');
      svgNode.setAttribute('width', '15');
      svgNode.setAttribute('height', '13');
      svgNode.classList.add('dsh-ag-mode-icon');
      svgNode.style.cssText = 'flex:none;width:15px;height:13px;min-width:15px;min-height:13px;max-width:15px;max-height:13px;margin:0;display:inline-block;vertical-align:middle;color:currentColor;box-sizing:border-box;';
      svgNode.innerHTML = MODE_SVG_PATHS;
    }

    function createModeSvgNode() {
      const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      newSvg.setAttribute('viewBox', '0 0 176 150');
      newSvg.setAttribute('width', '15');
      newSvg.setAttribute('height', '13');
      newSvg.classList.add('_oGoKq_seatIcon', 'dsh-ag-mode-icon');
      newSvg.style.cssText = 'flex:none;width:15px;height:13px;min-width:15px;min-height:13px;margin:0;display:inline-block;vertical-align:middle;color:currentColor;';
      newSvg.innerHTML = MODE_SVG_PATHS;
      return newSvg;
    }

    function replaceModeIcon(row) {
      if (!row) return;
      let modeBtn = row.querySelector('._oGoKq_seat, [class*="seat"]');
      if (!modeBtn) {
        const buttons = Array.from(row.querySelectorAll('button:not(.dsh-ag-skill-chip)'));
        if (buttons.length >= 2) {
          modeBtn = buttons[1];
        }
      }
      if (!modeBtn) return;

      if (!modeBtn.dataset.dshAgHooked) {
        modeBtn.dataset.dshAgHooked = 'true';
        modeBtn.addEventListener('click', () => {
          requestAnimationFrame(() => enhancePresetMenuItems());
          setTimeout(enhancePresetMenuItems, 10);
          setTimeout(enhancePresetMenuItems, 50);
        });
      }

      const modeSvg = modeBtn.querySelector('._oGoKq_seatIcon, [class*="seatIcon"], svg:not([class*="chevron"]):not(.dsh-ag-mode-icon)');
      if (modeSvg) {
        updateModeSvgNode(modeSvg);
      } else if (!modeBtn.querySelector('.dsh-ag-mode-icon')) {
        const newSvg = createModeSvgNode();
        const label = modeBtn.querySelector('._oGoKq_seatLabel, [class*="seatLabel"], span');
        if (label) {
          modeBtn.insertBefore(newSvg, label);
        } else {
          modeBtn.prepend(newSvg);
        }
      }
    }

    // Debounced preset menu enhancement
    let enhancePresetRafId = null;
    function scheduleEnhancePreset() {
      if (enhancePresetRafId) return;
      enhancePresetRafId = requestAnimationFrame(() => {
        enhancePresetRafId = null;
        enhancePresetMenuItems();
      });
    }

    function replaceAllModeIcons(root = document) {
      const modeButtons = root.querySelectorAll('._oGoKq_seat, button[class*="seat"]');
      modeButtons.forEach(modeBtn => {
        if (!modeBtn.dataset.dshAgHooked) {
          modeBtn.dataset.dshAgHooked = 'true';
          modeBtn.addEventListener('click', () => {
            scheduleEnhancePreset();
          });
        }

        const modeSvg = modeBtn.querySelector('._oGoKq_seatIcon, [class*="seatIcon"], svg:not([class*="chevron"]):not(.dsh-ag-mode-icon)');
        if (modeSvg) {
          updateModeSvgNode(modeSvg);
        } else if (!modeBtn.querySelector('.dsh-ag-mode-icon')) {
          const newSvg = createModeSvgNode();
          const label = modeBtn.querySelector('._oGoKq_seatLabel, [class*="seatLabel"], span');
          if (label) {
            modeBtn.insertBefore(newSvg, label);
          } else {
            modeBtn.prepend(newSvg);
          }
        }
      });
    }

    function enhancePresetMenuItems() {
      const presetLabels = document.querySelectorAll('._oGoKq_item');
      presetLabels.forEach(presetSpan => {
        const btn = presetSpan.closest('button._3tUStW_item, button[role="menuitem"]');
        if (btn && !btn.querySelector('.dsh-ag-mode-menu-icon')) {
          const iconSpan = document.createElement('span');
          iconSpan.className = '_3tUStW_itemIcon dsh-ag-mode-menu-icon';
          iconSpan.setAttribute('aria-hidden', 'true');
          iconSpan.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 176 150" fill="none" xmlns="http://www.w3.org/2000/svg" style="color:var(--dsw-alias-label-tertiary,#4B5563);flex:none;">
              <circle cx="85" cy="28.5" r="25.5" stroke="currentColor" stroke-width="9" fill="none"/>
              <circle cx="43.5" cy="120" r="25.5" stroke="currentColor" stroke-width="9" fill="none"/>
              <circle cx="126.5" cy="120" r="25.5" stroke="currentColor" stroke-width="9" fill="none"/>
              <path d="M118 39A57.5 57.5 0 0 1 142.5 86.5" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>
              <path d="M109 138.5A57.5 57.5 0 0 1 71 142.5" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>
              <path d="M28 91.5A57.5 57.5 0 0 1 47 43.7" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>
            </svg>
          `;
          btn.insertBefore(iconSpan, btn.firstChild);
        }
      });
    }

    /* ======================================================================
       14. Fixed Icon Rail（最左固定图标栏）
       槽位：首页 / 自动化任务 / 插件 / 技能 / 更多 + 底部头像。
       行为全部优先走宿主原生服务（uiWorkspace / layout / 快捷键），
       原生 API 不可用时逐级回退到 DOM 点击与合成快捷键。
       ====================================================================== */
    const RAIL_ID = 'dsh-ui-rail';

    /* R1/R2/R3 双态图标（用户 supplied SVG：左=未点击 #C5C5C5，右=点击选中 实心黑） */
    const RAIL_ICON_HOME_NORMAL = `
      <svg width="22" height="22" viewBox="0 0 200 200" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M165.9,186.8h-48.7v-51.1c0-4.8-5.9-13.6-17.2-13.6c-11.3,0-17.2,8.9-17.2,13.6v51.1H34.2c-11,0-20-9-20-20V89.7c-4.2,1.7-9,0.5-12-3.2c-1.7-2.2-2.5-4.9-2.2-7.7c0.3-2.8,1.7-5.3,4-7L85,8.7c8.4-6.6,21.6-6.5,30,0l81,63.1c2.2,1.7,3.6,4.2,3.9,7c0.3,2.8-0.5,5.5-2.2,7.7c-2,2.5-5,3.9-8.3,3.9c-1.2,0-2.4-0.2-3.5-0.6v77.1C185.9,177.9,177,186.8,165.9,186.8z M125.5,178.6h40.4c6.5,0,11.7-5.3,11.7-11.7v-80c0-2.4,1.3-4.6,3.4-5.7c2.1-1.1,4.6-1,6.6,0.3l0.3,0.2c0.9,0.7,2.6,0.6,3.3-0.3c0.4-0.5,0.5-1,0.5-1.6c-0.1-0.6-0.4-1.1-0.8-1.4l-81-63.1c-5.5-4.3-14.3-4.3-19.8,0l-81,63.1c-0.5,0.4-0.8,0.9-0.8,1.4c-0.1,0.6,0.1,1.1,0.5,1.6c0.8,1,2.2,1.1,3.1,0.4l0.4-0.3l0.5-0.3c2-1.2,4.5-1.2,6.5-0.1c2,1.1,3.3,3.3,3.3,5.6v80.2c0,6.5,5.3,11.7,11.7,11.7h40.4v-42.8c0-9.1,9.7-21.9,25.4-21.9c15.8,0,25.4,12.7,25.4,21.9V178.6z"/>
      </svg>
    `;
    const RAIL_ICON_HOME_ACTIVE = `
      <svg width="22" height="22" viewBox="203.4 0 203.4 200" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M217.5,84.5l0.5-0.3c1.6-1,3.7,0.2,3.7,2.1l0.5,83.7c0,9.1,7.4,16.5,16.5,16.5h46.5l-0.5-48.9c0-7.6,8.5-18.5,22.2-18.5c13.7,0,22.2,10.9,22.2,18.5l0.5,48.9h46.5c9.1,0,16.5-7.4,16.5-16.5l-0.5-83.4c0-2,2.2-3.1,3.8-2.1l0,0c1.2,1,2.7,1.4,4.2,1.4c2,0,3.9-0.9,5.3-2.5c2.3-2.8,1.8-7-1.1-9.2L319.8,8.4c-7.3-5.7-18.7-5.7-26,0l-84.5,65.8c-2.9,2.2-3.4,6.4-1.1,9.2C210.5,86.2,214.6,86.7,217.5,84.5z"/>
      </svg>
    `;
    const RAIL_ICON_SCHEDULE_NORMAL = `
      <svg width="22" height="22" viewBox="0 0 200 200" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M100,4.1c-52.9,0-95.9,43-95.9,95.9c0,52.9,43,95.9,95.9,95.9c52.9,0,95.9-43,95.9-95.9C195.9,47.1,152.9,4.1,100,4.1z M100,185.8c-47.3,0-85.8-38.5-85.8-85.8S52.7,14.2,100,14.2s85.8,38.5,85.8,85.8S147.3,185.8,100,185.8z"/>
        <path d="M93.1,46.1c-2.8,0-5,2.3-5,5.1V107c0,2.8,2.3,5,5,5H135c2.8,0,5.1-2.3,5.1-5c0-2.8-2.3-5.1-5.1-5.1H98.1V51.1C98.1,48.3,95.8,46.1,93.1,46.1z"/>
      </svg>
    `;
    const RAIL_ICON_SCHEDULE_ACTIVE = `
      <svg width="22" height="22" viewBox="203.4 0 203.4 200" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M306.8,4.1c-52.9,0-95.9,43-95.9,95.9c0,52.9,43,95.9,95.9,95.9c52.9,0,95.9-43,95.9-95.9C402.7,47.1,359.7,4.1,306.8,4.1z M341.8,112.1h-41.9c-2.8,0-5-2.3-5-5V51.1c0-2.8,2.3-5.1,5-5.1c2.8,0,5,2.3,5,5.1V102h36.9c2.8,0,5,2.3,5.1,5.1C346.9,109.8,344.6,112.1,341.8,112.1z"/>
      </svg>
    `;
    const RAIL_ICON_PLUGIN_NORMAL = `
      <svg width="22" height="22" viewBox="0 0 200 200" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M166.3,64.2a116.58,116.58,0,0,0-22.5-8,122.58,122.58,0,0,0-8-22.4C126.6,14.6,113.9,4.1,100,4.1S73.4,14.6,64.2,33.7a118,118,0,0,0-8,22.4,122.58,122.58,0,0,0-22.4,8C14.6,73.4,4.1,86.1,4.1,100s10.5,26.6,29.6,35.8a118,118,0,0,0,22.4,8,122.58,122.58,0,0,0,8,22.4c9.2,19.1,21.9,29.6,35.8,29.6s26.6-10.5,35.8-29.6a118,118,0,0,0,8-22.4,122.58,122.58,0,0,0,22.4-8c19.1-9.2,29.6-21.9,29.6-35.8C195.9,86.1,185.4,73.4,166.3,64.2Zm-4.9,61.5a114.27,114.27,0,0,1-15,5.8,188.28,188.28,0,0,0,2.6-31.4h0a5.6,5.6,0,0,0-11.2,0h0a172.5,172.5,0,0,1-3.4,34.5q-1.35,6.15-3,12a101.75,101.75,0,0,1-5.8,15c-7.1,14.8-16.5,23.3-25.7,23.3s-18.6-8.5-25.7-23.3a114.27,114.27,0,0,1-5.8-15,188.28,188.28,0,0,0,31.4,2.6h0a5.51,5.51,0,0,0,5.5-5.6h0a5.57,5.57,0,0,0-5.5-5.6v-.1a172.5,172.5,0,0,1-34.5-3.4q-6.15-1.35-12-3a101.75,101.75,0,0,1-15-5.8C23.5,118.6,15,109.2,15,100s8.5-18.6,23.3-25.7a114.27,114.27,0,0,1,15-5.8A228.81,228.81,0,0,0,51,100h0a5.57,5.57,0,0,0,5.6,5.5h0a5.64,5.64,0,0,0,5.6-5.5h.1a172.5,172.5,0,0,1,3.4-34.5q1.35-6.15,3-12a101.75,101.75,0,0,1,5.8-15C81.6,23.7,91,15.2,100.2,15.2s18.6,8.5,25.7,23.3a114.27,114.27,0,0,1,5.8,15,188.28,188.28,0,0,0-31.4-2.6h0a5.57,5.57,0,0,0-5.5,5.6h0a5.7,5.7,0,0,0,5.5,5.6v.1h0a172.5,172.5,0,0,1,34.5,3.4q6.15,1.35,12,3a101.75,101.75,0,0,1,15,5.8c14.8,7.1,23.3,16.5,23.3,25.7S176.2,118.6,161.4,125.7Z"/>
      </svg>
    `;
    const RAIL_ICON_PLUGIN_ACTIVE = `
      <svg width="22" height="22" viewBox="203.4 0 203.4 200" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M396.74,82.66c-8.07-11.92-24.49-21.77-45.59-27.59C342.77,24.71,326.06,4,306.8,4s-36,20.71-44.35,51.07c-23.69,6.54-41.5,18.15-48.19,32.09v0l0,.06a28.13,28.13,0,0,0-3,12.51c0,12.77,8.9,24.53,25.19,33.48a112.78,112.78,0,0,0,26,10.53c3.32,12,8,22.56,13.55,30.88,8.56,13.41,19.26,20.67,30.8,20.67s22.23-7.25,30.78-20.64c5.6-8.32,10.25-18.85,13.57-30.91a112.87,112.87,0,0,0,26-10.54c16.29-8.95,25.18-20.7,25.18-33.47A29.3,29.3,0,0,0,396.74,82.66Zm-31.41,48.65a107.78,107.78,0,0,1-19.81,7.07,103.46,103.46,0,0,1-7.07,19.81c-8.13,16.89-19.36,26.17-31.65,26.17s-23.52-9.28-31.65-26.17a107.78,107.78,0,0,1-7.07-19.81,103.46,103.46,0,0,1-19.81-7.07C231.38,123.18,222.1,112,222.1,99.66S231.38,76.14,248.27,68a108.53,108.53,0,0,1,19.81-7.08,103.6,103.6,0,0,1,7.07-19.8C283.28,24.24,294.51,15,306.8,15s23.52,9.28,31.65,26.17a107.68,107.68,0,0,1,7.07,19.8A103.36,103.36,0,0,1,365.42,68c16.88,8.13,26.17,19.36,26.08,31.65S382.22,123.18,365.33,131.31Z"/>
        <path d="M361.09,76.94a88.9,88.9,0,0,0-13.27-5.13q-5.16-1.45-10.61-2.65a152.11,152.11,0,0,0-30.5-3v-.09a5,5,0,0,1-4.86-5,4.92,4.92,0,0,1,4.86-5,166.74,166.74,0,0,1,27.76,2.3,100.6,100.6,0,0,0-5.12-13.26c-6.28-13.09-14.59-20.6-22.73-20.6s-16.44,7.51-22.72,20.6a90.56,90.56,0,0,0-5.13,13.26q-1.45,5.17-2.65,10.61a152.84,152.84,0,0,0-3,30.5H273a5,5,0,0,1-4.95,4.86,4.93,4.93,0,0,1-5-4.86,166.74,166.74,0,0,1,2.3-27.76,100.29,100.29,0,0,0-13.26,5.13c-13.08,6.27-20.6,14.59-20.6,22.72s7.52,16.44,20.6,22.72a90.31,90.31,0,0,0,13.26,5.13Q270.6,129,276,130.16a152.18,152.18,0,0,0,30.5,3v.09a4.93,4.93,0,0,1,4.87,5,4.87,4.87,0,0,1-4.87,4.95,166.83,166.83,0,0,1-27.76-2.3,103.14,103.14,0,0,0,5.13,13.26c6.28,13.09,14.59,20.6,22.72,20.6s16.45-7.51,22.73-20.6a90.3,90.3,0,0,0,5.12-13.26q1.47-5.18,2.66-10.61a152.86,152.86,0,0,0,3-30.5,5,5,0,0,1,9.9,0h.09a165.68,165.68,0,0,1-2.3,27.76,99.9,99.9,0,0,0,13.27-5.13c13.08-6.28,20.6-14.59,20.6-22.72S374.17,83.21,361.09,76.94Z"/>
      </svg>
    `;

    const RAIL_ICON_USAGE_NORMAL = `
      <svg width="22" height="22" viewBox="0 0 200 200" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="35.82" y="98.47" width="24.4" height="56.88"/>
        <rect x="82.15" y="61.53" width="24.4" height="93.82"/>
        <rect x="128.49" y="35.86" width="24.4" height="119.49"/>
      </svg>
    `;
    const RAIL_ICON_USAGE_ACTIVE = `
      <svg width="22" height="22" viewBox="170.7 -4.4 200 200" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M292.64,22.87V48.54H246.57V85.61l-47.37-.26v83h143V22.87ZM236.56,155.32h-24.4V98.44h24.4Zm46.33,0h-24.4V61.5h24.4Zm46.34,0h-24.4V35.83h24.4Z"/>
      </svg>
    `;

    /* 双态图标映射：选中时切换为实心变体 */
    const RAIL_TWO_STATE_ICONS = {
      home: { normal: RAIL_ICON_HOME_NORMAL, active: RAIL_ICON_HOME_ACTIVE },
      schedules: { normal: RAIL_ICON_SCHEDULE_NORMAL, active: RAIL_ICON_SCHEDULE_ACTIVE },
      plugins: { normal: RAIL_ICON_PLUGIN_NORMAL, active: RAIL_ICON_PLUGIN_ACTIVE },
      usage: { normal: RAIL_ICON_USAGE_NORMAL, active: RAIL_ICON_USAGE_ACTIVE }
    };

    const RAIL_MORE_SVG_HTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>
      </svg>
    `;

    const RAIL_SETTINGS_SVG_HTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    `;

    const RAIL_DIAL_SVG_HTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="8.7"/>
        <path d="M12 12l3.6-3.6"/>
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
      </svg>
    `;

    const RAIL_KEYBOARD_SVG_HTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="2.8" y="6" width="18.4" height="12" rx="2.5"/>
        <path d="M6.4 9.8h.01M9.9 9.8h.01M13.4 9.8h.01M16.9 9.8h.01M6.4 12.9h.01M9.9 12.9h.01M13.4 12.9h.01M16.9 12.9h.01M7.2 15.6h9.6"/>
      </svg>
    `;

    const RAIL_RELOAD_SVG_HTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <polyline points="21.5 3.8 21.5 9.4 15.9 9.4"/>
        <path d="M20.3 14.6a8.7 8.7 0 1 1-2-8.9l3.2 3.7"/>
      </svg>
    `;

    const RAIL_USER_SVG_HTML = `
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2" stroke="currentColor" stroke-width="1.6"/>
        <circle cx="12" cy="10" r="3" fill="currentColor"/>
        <path d="M6.4 18.3c1.1-2.5 3.1-3.9 5.6-3.9s4.5 1.4 5.6 3.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
    `;

    const RAIL_HELP_SVG_HTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2"/>
        <path d="M9.2 9.1a2.9 2.9 0 0 1 5.6.9c0 1.9-2.8 2.4-2.8 4"/>
        <circle cx="12" cy="17.3" r="0.7" fill="currentColor" stroke="none"/>
      </svg>
    `;

    const RAIL_CHEVRON_SVG_HTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <polyline points="9 6 15 12 9 18"/>
      </svg>
    `;

    function railResizeSvg(svgHtml, w, h) {
      return svgHtml.replace(/width="\d+" height="\d+"/, `width="${w}" height="${h}"`);
    }

    let railNode = null;
    let railMenuNode = null;
    let railMenuAnchor = null;
    let railMenuCleanup = null;
    let railSubMenuNode = null;
    let railUsageNode = null;
    let railPanelUnsubscribe = null;
    let railAttrObserver = null;

    function getRailLayoutFace() {
      try {
        if (!dshCtx) return null;
        if (dshCtx.layout) return dshCtx.layout;
        if (typeof dshCtx.get === 'function') return dshCtx.get('layout') || null;
      } catch (e) {}
      return null;
    }

    function getRailWorkspaceFace() {
      try {
        if (!dshCtx) return null;
        if (dshCtx.uiWorkspace) return dshCtx.uiWorkspace;
        if (typeof dshCtx.get === 'function') return dshCtx.get('uiWorkspace') || null;
      } catch (e) {}
      return null;
    }

    function railDispatchKey(code, key, opts = {}) {
      const base = {
        bubbles: true,
        cancelable: true,
        code,
        key,
        ctrlKey: !!opts.ctrl,
        metaKey: !!opts.meta,
        altKey: !!opts.alt,
        shiftKey: !!opts.shift
      };
      try {
        window.dispatchEvent(new KeyboardEvent('keydown', base));
        document.dispatchEvent(new KeyboardEvent('keydown', base));
      } catch (e) {}
      setTimeout(() => {
        try {
          window.dispatchEvent(new KeyboardEvent('keyup', base));
          document.dispatchEvent(new KeyboardEvent('keyup', base));
        } catch (e) {}
      }, 40);
    }

    function railGoHome() {
      const ws = getRailWorkspaceFace();
      if (ws && typeof ws.startSession === 'function') {
        try {
          // 与原生行为一致：只调 startSession（内部自会导航到新会话/回会话视图）。
          // 切勿在其后追加 layout.selectPanel(null) —— 那会 abort 掉 startSession
          // 进行中的导航，导致停留在旧会话而不是新建会话界面。
          ws.startSession();
        } catch (e) {}
      } else {
        const newBtn = document.querySelector('[class*="_newSession"]');
        if (newBtn) newBtn.click();
        else railDispatchKey('KeyN', 'n', { ctrl: true });
      }
    }

    function railSelectPanel(panelId, rowKeywords) {
      const layout = getRailLayoutFace();
      if (layout && typeof layout.selectPanel === 'function') {
        try {
          layout.selectPanel(panelId);
          return;
        } catch (e) {}
      }
      const rows = Array.from(document.querySelectorAll('[class*="_panelRow"]'));
      let target = rows.find(r => rowKeywords.some(k => (r.getAttribute('aria-label') || r.textContent || '').includes(k)));
      if (!target && rows.length > 1) {
        target = panelId === 'plugins' ? rows[0] : rows[rows.length - 1];
      }
      if (target) {
        target.click();
        // 兜底即时同步一次激活态（正常由 aria-current 观察器驱动）
        setTimeout(() => syncRailActive(), 60);
      }
    }

    function railOpenSettings() {
      railDispatchKey('Comma', ',', { ctrl: true });
    }

    function railOpenShortcuts() {
      railDispatchKey('Slash', '/', { ctrl: true });
    }

    /* 用量统计独立页面（中央主面板，与插件/定时任务面板同机制） */
    function RailUsagePanelPage() {
      return React.createElement('iframe', {
        src: '/token-usage-stats',
        title: '用量统计',
        className: 'dsh-usage-page-frame',
        'aria-label': '用量统计'
      });
    }

    function railOpenUsage() {
      // 首选：作为独立页面在中央打开（与插件/定时任务面板一致）
      const layout = getRailLayoutFace();
      if (layout && typeof layout.selectPanel === 'function') {
        try {
          layout.selectPanel('usage');
          return;
        } catch (e) {}
      }
      // 回退1：原生用量按钮（弹原生 Modal）
      const nativeBtn = document.querySelector('[aria-label="打开用量统计面板"], [class*="UcfOsa_root"]');
      if (nativeBtn) {
        nativeBtn.click();
        return;
      }
      // 回退2：iframe 兜底弹窗
      if (railUsageNode) {
        railUsageNode.remove();
        railUsageNode = null;
        return;
      }
      const overlay = document.createElement('div');
      overlay.className = 'dsh-ui-usage-overlay';
      overlay.innerHTML = `
        <div class="dsh-ui-usage-card" role="dialog" aria-label="用量统计">
          <div class="dsh-ui-usage-head">
            <span>用量统计</span>
            <button type="button" class="dsh-ui-usage-close" aria-label="关闭">×</button>
          </div>
          <iframe class="dsh-ui-usage-frame" src="/token-usage-stats" title="用量统计"></iframe>
        </div>
      `;
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('.dsh-ui-usage-close')) {
          overlay.remove();
          railUsageNode = null;
        }
      });
      document.body.appendChild(overlay);
      railUsageNode = overlay;
    }

    function closeRailSubMenu() {
      if (railSubMenuNode && railSubMenuNode.parentNode) {
        railSubMenuNode.parentNode.removeChild(railSubMenuNode);
      }
      railSubMenuNode = null;
    }

    function closeRailMenu() {
      if (railMenuCleanup) {
        railMenuCleanup();
        railMenuCleanup = null;
      }
      if (railMenuNode && railMenuNode.parentNode) {
        railMenuNode.parentNode.removeChild(railMenuNode);
      }
      railMenuNode = null;
      railMenuAnchor = null;
      closeRailSubMenu();
    }

    function railMenuRowsHtml(items) {
      return items.map((item, index) => `
        <button type="button" role="menuitem" class="dsh-rail-menu-item" data-rail-menu-index="${index}">
          ${item.icon}
          <span>${item.label}</span>
          ${item.hint ? `<span class="dsh-rail-menu-hint">${item.hint}</span>` : ''}
          ${(item.children || item.chevron) ? `<span class="dsh-rail-menu-hint dsh-rail-menu-chevron">${RAIL_CHEVRON_SVG_HTML}</span>` : ''}
        </button>
      `).join('');
    }

    function bindRailMenuItems(menuEl, items, parentMenu) {
      menuEl.querySelectorAll('.dsh-rail-menu-item').forEach(btn => {
        const item = items[Number(btn.dataset.railMenuIndex)];
        if (!item) return;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (item.children) {
            openRailSubmenu(btn, item.children, parentMenu);
            return;
          }
          closeRailMenu();
          if (typeof item.onClick === 'function') item.onClick();
        });
        if (item.children) {
          btn.addEventListener('mouseenter', () => {
            openRailSubmenu(btn, item.children, parentMenu);
          });
        }
      });
    }

    function openRailSubmenu(anchorItemEl, children, parentMenu) {
      closeRailSubMenu();
      if (!parentMenu || !parentMenu.isConnected) return;
      const sub = document.createElement('div');
      sub.className = 'dsh-rail-menu dsh-rail-submenu';
      sub.setAttribute('role', 'menu');
      sub.innerHTML = railMenuRowsHtml(children);
      bindRailMenuItems(sub, children, parentMenu);
      document.body.appendChild(sub);
      railSubMenuNode = sub;

      const rect = anchorItemEl.getBoundingClientRect();
      const width = sub.offsetWidth || 200;
      const height = sub.offsetHeight || 100;
      let left = rect.right + 8;
      if (left + width > window.innerWidth - 12) {
        left = Math.max(12, rect.left - width - 8);
      }
      let top = rect.top - 6;
      if (top + height > window.innerHeight - 12) top = window.innerHeight - height - 12;
      if (top < 12) top = 12;
      sub.style.left = `${Math.round(left)}px`;
      sub.style.top = `${Math.round(top)}px`;
    }

    function openRailMenu(anchorEl, { place, head, sub, items }) {
      const wasSameAnchor = railMenuAnchor === anchorEl;
      closeRailMenu();
      closePopover();
      closeExecPopover();
      if (wasSameAnchor) return null;

      const menu = document.createElement('div');
      menu.className = 'dsh-rail-menu';
      menu.setAttribute('role', 'menu');

      let html = '';
      if (head) {
        html += `
          <div class="dsh-rail-menu-head">
            <span class="dsh-rail-menu-avatar">${railAvatarHtml()}</span>
            <span class="dsh-rail-menu-id">
              <span class="dsh-rail-menu-name">DeepSeek Harness</span>
              <span class="dsh-rail-menu-sub">${sub || '本地工作台'}</span>
            </span>
          </div>
          <div class="dsh-rail-menu-sep"></div>
        `;
      }
      html += railMenuRowsHtml(items);
      menu.innerHTML = html;

      bindRailMenuItems(menu, items, menu);

      document.body.appendChild(menu);
      railMenuNode = menu;
      railMenuAnchor = anchorEl;

      const rect = anchorEl.getBoundingClientRect();
      const width = menu.offsetWidth || 264;
      const height = menu.offsetHeight || 200;
      let left = rect.right + 12;
      if (left + width > window.innerWidth - 12) {
        left = Math.max(12, rect.left - width - 12);
      }
      let top;
      if (place === 'bottom') {
        top = window.innerHeight - height - 14;
        if (top < 12) top = 12;
        if (rect.bottom < top + height * 0.5) top = Math.max(12, rect.bottom - height + 10);
      } else {
        top = Math.min(rect.top - 4, window.innerHeight - height - 12);
        if (top < 12) top = 12;
      }
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(top)}px`;

      railMenuCleanup = attachPopoverDismiss({
        node: menu,
        anchorEl,
        onClose: closeRailMenu,
        isInsideExtra: (t) => !!(railSubMenuNode && railSubMenuNode.contains(t)),
      });

      return menu;
    }

    function railAvatarHtml() {
      // 镜像原生账号头像：<img> 优先，回退 background-image 内联样式。
      // 内联 border-radius !important 为最高优先级，杜绝任何原生规则把头像改回方圆角。
      const img = document.querySelector('[class*="_settingsArea"] img, [class*="_footArea"] img');
      const src = img ? img.getAttribute('src') : null;
      if (src) {
        return `<img class="dsh-rail-avatar-img" style="border-radius:50% !important;clip-path:circle(50% at 50% 50%) !important" src="${escapeHtml(src)}" alt="" referrerpolicy="no-referrer"/>`;
      }
      const styled = document.querySelector(
        '[class*="_settingsArea"] [style*="background-image"], [class*="_footArea"] [style*="background-image"]'
      );
      if (styled) {
        const m = /background-image:\s*url\(["']?([^"')]+)["']?\)/.exec(styled.getAttribute('style') || '');
        if (m) {
          return `<img class="dsh-rail-avatar-img" style="border-radius:50% !important;clip-path:circle(50% at 50% 50%) !important" src="${escapeHtml(m[1])}" alt="" referrerpolicy="no-referrer"/>`;
        }
      }
      return `<span class="dsh-rail-avatar-fallback">${RAIL_USER_SVG_HTML}</span>`;
    }

    // ------------------------------------------------------------------
    // 头像诊断：把按钮/图片的真实 DOM、计算样式、"按钮中心点上实际命中的
    // 元素"通过 bridge 落盘（.dsh-ui-debug.json）。启动后 90 秒内每 5 秒
    // 采集一次，之后停止——只为离线排查形状异常，不影响运行。
    // ------------------------------------------------------------------
    const AVATAR_DUMP_WINDOW_MS = 90000;
    const AVATAR_DUMP_INTERVAL_MS = 5000;
    let avatarDumpDeadline = 0;
    let avatarDumpLast = 0;

    function dumpAvatarDiagnostics() {
      try {
        const rail = document.getElementById(RAIL_ID);
        const btn = rail ? rail.querySelector('.dsh-rail-avatar-btn') : null;
        const img = btn ? btn.querySelector('img.dsh-rail-avatar-img') : null;
        const pick = (el) => {
          if (!el) return null;
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            cls: String(el.className).slice(0, 160),
            rect: { w: Math.round(r.width), h: Math.round(r.height) },
            width: cs.width, height: cs.height,
            borderRadius: cs.borderRadius,
            clipPath: cs.clipPath,
            overflow: cs.overflow,
            transform: cs.transform,
            objectFit: cs.objectFit,
            aspectRatio: cs.aspectRatio,
            backgroundImage: cs.backgroundImage.slice(0, 140),
            inlineStyle: (el.getAttribute('style') || '').slice(0, 200),
          };
        };
        let topElement = null;
        if (btn) {
          const r = btn.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          topElement = hit ? {
            tag: hit.tagName,
            cls: String(hit.className).slice(0, 160),
            isBtnChild: btn.contains(hit),
          } : null;
        }
        const payload = {
          at: new Date().toISOString(),
          bootCount: (typeof window !== 'undefined' && window.__dshUiBootCount) || 0,
          railCount: document.querySelectorAll('#dsh-ui-rail').length,
          avatarBtnCount: document.querySelectorAll('.dsh-rail-avatar-btn').length,
          avatarImgCount: document.querySelectorAll('img.dsh-rail-avatar-img').length,
          styleTagCount: document.querySelectorAll(`style[id="${STYLE_TAG_ID}"]`).length,
          btn: pick(btn),
          img: pick(img),
          imgState: img ? {
            complete: img.complete,
            naturalW: img.naturalWidth,
            naturalH: img.naturalHeight,
            src: String(img.currentSrc || img.getAttribute('src') || '').slice(0, 200),
          } : null,
          topElement,
          // v1.1.37：工作区搜索入口快照（排查注入是否落位）
          // v1.1.40：补区头几何（标签 / 搜索槽 / 图标组 / 注入件的左右偏移），
          // v1.1.41：用于离线核实「三个图标是否真的位于区头右端」（即 searchSlot
          // 的 margin-left:auto 是否仍生效）；v1.1.40 曾据此误判为应靠左。
          workspaceSearch: (() => {
            try {
              const hs = document.querySelectorAll('[class*="_sectionHeader"]');
              const box = (el) => {
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return {
                  cls: String(el.className).slice(0, 80),
                  left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
                };
              };
              const h0 = hs[0];
              return {
                headerCount: hs.length,
                nativeBtnCount: document.querySelectorAll('[class*="searchButton"]:not(.dsh-ag-search-btn)').length,
                injectedCount: document.querySelectorAll('.dsh-ag-search-btn').length,
                firstHeaderHtml: h0 ? String(h0.outerHTML).slice(0, 500) : null,
                geometry: h0 ? (() => {
                  const slot = h0.querySelector('[class*="searchSlot"]');
                  const prop = (el, k) => { try { return el ? getComputedStyle(el)[k] : null; } catch (e) { return null; } };
                  return {
                    header: box(h0),
                    label: box(h0.querySelector('[class*="sectionLabel"]')),
                    searchSlot: box(slot),
                    injected: box(h0.querySelector('.dsh-ag-search-btn')),
                    actions: box(h0.querySelector('[class*="headerActions"]')),
                    justify: prop(h0, 'justifyContent'),
                    // v1.1.41：margin-left 是把图标组顶到右端的关键机制量——
                    // auto = 已右顶（红框位置）；0px = 被拽到标签旁（蓝框位置）。
                    slotMarginLeft: prop(slot, 'marginLeft'),
                    slotFlex: prop(slot, 'flex'),
                  };
                })() : null,
              };
            } catch (e) { return null; }
          })(),
        };
        fetch(`${BRIDGE_API}/api/debug`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {});
      } catch (e) {
        dbg('dumpAvatarDiagnostics failed', e);
      }
    }

    function maybeDumpAvatarDiagnostics() {
      const now = Date.now();
      if (now > avatarDumpDeadline) return;
      if (now - avatarDumpLast < AVATAR_DUMP_INTERVAL_MS) return;
      avatarDumpLast = now;
      dumpAvatarDiagnostics();
    }

    function railFetchUsageSummary() {
      try {
        return fetch(`${BRIDGE_API}/api/usage`, { cache: 'no-store' })
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null);
      } catch (e) {
        return Promise.resolve(null);
      }
    }

    /* 原生账号菜单弹出后重定位：原生 Menu 对高弹窗会顶到界面左上，
       监听新出现的菜单浮层并校正到固定栏右侧、贴窗口底（视频位置） */
    function railRepositionAccountMenuSurface(surface) {
      const rect = surface.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      surface.style.left = ACCOUNT_MENU_ANCHOR_LEFT_PX + 'px';
      surface.style.top = Math.max(12, window.innerHeight - ACCOUNT_MENU_ANCHOR_BOTTOM_PX - rect.height) + 'px';
      surface.style.right = 'auto';
      surface.style.bottom = 'auto';
      return true;
    }

    function railArmAccountMenuReposition() {
      if (typeof MutationObserver === 'undefined') return;
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.addedNodes) {
            if (!n || n.nodeType !== 1) continue;
            if (n.id && String(n.id).indexOf('dsh') === 0) continue;
            const candidates = [n].concat(Array.prototype.slice.call(n.querySelectorAll('*')));
            for (const el of candidates) {
              let cs;
              try { cs = getComputedStyle(el); } catch (e) { continue; }
              if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
              const r = el.getBoundingClientRect();
              if (r.width < 80 || r.width > 640 || r.height < 40) continue;
              // 指纹门槛：只有"长得像菜单"的浮层才可被重定位。
              // 武装窗口期内出现的无关弹层（toast、对话框、其他插件气泡）
              // 绝不能被拽到左下角。
              const role = (el.getAttribute && el.getAttribute('role')) || '';
              if (role === 'status' || role === 'alert' || role === 'tooltip') continue;
              if (el.classList && Array.prototype.some.call(el.classList, c => String(c).startsWith('dsh-'))) continue;
              const menuLike = role === 'menu' || role === 'listbox' || role === 'dialog'
                || /menu|popover|dropdown|surface|floating|account/i.test(String(el.className || ''))
                || !!(el.querySelector && el.querySelector('[role="menuitem"], [role="menu"], [role="listbox"], [class*="menu"], [class*="Menu"]'));
              if (!menuLike) continue;
              if (el.querySelector && el.querySelector('.dsh-rail-menu')) continue;
              if (railRepositionAccountMenuSurface(el)) {
                // 短暂盯防：原生定位若在滚动/重排时回跳，立即校正回来
                const reapply = setInterval(() => {
                  if (!el.isConnected) { clearInterval(reapply); return; }
                  const rr = el.getBoundingClientRect();
                  if (Math.abs(rr.left - ACCOUNT_MENU_ANCHOR_LEFT_PX) > 2 || Math.abs((window.innerHeight - ACCOUNT_MENU_ANCHOR_BOTTOM_PX - rr.height) - rr.top) > 2) {
                    railRepositionAccountMenuSurface(el);
                  }
                }, ACCOUNT_MENU_WATCH_INTERVAL_MS);
                setTimeout(() => clearInterval(reapply), ACCOUNT_MENU_WATCH_WINDOW_MS);
                mo.disconnect();
                return;
              }
            }
          }
        }
      });
      mo.observe(document.body, { childList: true });
      setTimeout(() => mo.disconnect(), ACCOUNT_MENU_ARM_WINDOW_MS);
    }

    function railOpenNativeAccountMenu() {
      // 优先触发原生 S5 账号按钮（原生菜单：设置/联系我们/退出登录，头像由原生渲染）
      const trigger = document.querySelector('[class*="_settingsArea"] button[aria-haspopup="menu"]')
        || document.querySelector('[class*="_footArea"] button[aria-haspopup="menu"]');
      if (trigger) {
        const rect = trigger.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          try {
            trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
          } catch (e) {}
          try {
            trigger.click();
          } catch (e) {}
          // 原生菜单可能弹到左上（高弹窗定位特性），弹出后校正到视频位置
          railArmAccountMenuReposition();
          return true;
        }
      }
      return false;
    }

    function railHandleAction(btn) {
      const action = btn.dataset.railAction;
      if (action === 'home') {
        closeRailMenu();
        closePopover();
        railGoHome();
        return;
      }
      if (action === 'schedules') {
        closeRailMenu();
        closePopover();
        railSelectPanel('schedules', ['任务', 'schedule', '定时']);
        return;
      }
      if (action === 'plugins') {
        closeRailMenu();
        closePopover();
        railSelectPanel('plugins', ['插件']);
        return;
      }
      if (action === 'usage') {
        closeRailMenu();
        closePopover();
        closeExecPopover();
        railOpenUsage();
        return;
      }
      if (action === 'more') {
        openRailMenu(btn, {
          place: 'beside',
          items: [
            { icon: RAIL_SETTINGS_SVG_HTML, label: '设置', hint: 'Ctrl+,', onClick: railOpenSettings },
            { icon: RAIL_DIAL_SVG_HTML, label: '用量统计', onClick: railOpenUsage },
            { icon: RAIL_KEYBOARD_SVG_HTML, label: '快捷键速查', hint: 'Ctrl+/', onClick: railOpenShortcuts },
            { icon: RAIL_RELOAD_SVG_HTML, label: '重新加载界面', onClick: () => location.reload() }
          ]
        });
        return;
      }
      if (action === 'account') {
        closeRailMenu();
        closePopover();
        closeExecPopover();
        // 首选：触发原生 S5 账号按钮（原生菜单弹出在侧栏底部上方）
        if (railOpenNativeAccountMenu()) return;
        // 回退：原生按钮不可见（如侧栏收起）时用自制账号菜单
        const versionEl = document.querySelector('[class*="_buildVersion"]');
        const version = versionEl ? (versionEl.textContent || '').trim() : '';
        const menu = openRailMenu(btn, {
          place: 'bottom',
          head: true,
          sub: version || '本地工作台',
          items: [
            { icon: RAIL_DIAL_SVG_HTML, label: '剩余用量', hint: '', chevron: true, onClick: railOpenUsage },
            { icon: RAIL_SETTINGS_SVG_HTML, label: '设置', hint: 'Ctrl+,', onClick: railOpenSettings },
            {
              icon: RAIL_HELP_SVG_HTML,
              label: '帮助',
              children: [
                { icon: RAIL_KEYBOARD_SVG_HTML, label: '快捷键速查', hint: 'Ctrl+/', onClick: railOpenShortcuts },
                { icon: RAIL_DIAL_SVG_HTML, label: '用量统计', onClick: railOpenUsage }
              ]
            }
          ]
        });
        if (menu) {
          // 异步填充真实用量：头部副标题与剩余用量行右侧显示余额
          railFetchUsageSummary().then(usage => {
            if (!usage || !usage.available || !menu.isConnected) return;
            const money = (v) => `¥${Number(v).toFixed(2)}`;
            if (typeof usage.balance === 'number') {
              const subEl = menu.querySelector('.dsh-rail-menu-sub');
              if (subEl) subEl.textContent = `余额 ${money(usage.balance)}`;
              const rowItem = menu.querySelector('.dsh-rail-menu-item[data-rail-menu-index="0"]');
              if (rowItem) {
                let hint = rowItem.querySelector('.dsh-rail-menu-hint:not(.dsh-rail-menu-chevron)');
                if (!hint) {
                  hint = document.createElement('span');
                  hint.className = 'dsh-rail-menu-hint';
                  rowItem.insertBefore(hint, rowItem.querySelector('.dsh-rail-menu-chevron'));
                }
                hint.textContent = money(usage.balance);
              }
            }
          });
        }
      }
    }

    function syncRailActive() {
      if (!railNode) return;
      let activePanel = null;
      let layoutResolved = false;
      const layout = getRailLayoutFace();
      try {
        const snap = layout && layout.panelInfo && typeof layout.panelInfo.getSnapshot === 'function'
          ? layout.panelInfo.getSnapshot()
          : null;
        if (layout && snap) {
          layoutResolved = true;
          activePanel = snap.activePanelId;
        }
      } catch (e) {}
      if (!layoutResolved) {
        // DOM 兜底：原生侧栏面板行以 aria-current="page" 标记当前激活面板
        try {
          const currentRow = document.querySelector('[class*="_panelRow"][aria-current="page"]');
          if (currentRow) {
            const label = (currentRow.getAttribute('aria-label') || '') + ' ' + (currentRow.textContent || '');
            if (/任务|schedule/i.test(label)) activePanel = 'schedules';
            else if (/插件|plugin/i.test(label)) activePanel = 'plugins';
            else {
              const allRows = Array.from(document.querySelectorAll('[class*="_panelRow"]'));
              const idx = allRows.indexOf(currentRow);
              activePanel = idx === 0 ? 'plugins' : idx === 1 ? 'schedules' : null;
            }
          }
        } catch (e) {}
      }
      railNode.querySelectorAll('[data-rail-action]').forEach(btn => {
        const id = btn.dataset.railAction;
        // 用量统计：仪表盘弹窗（原生 iframe 或兜底弹层）打开期间视为选中
        let usageOpen = false;
        try {
          usageOpen = !!document.querySelector('.dsh-ui-usage-overlay, iframe[src*="token-usage-stats"]');
        } catch (e) {}
        const isActive = (id === 'home' && activePanel === null)
          || (id === 'plugins' && activePanel === 'plugins')
          || (id === 'schedules' && activePanel === 'schedules')
          || (id === 'usage' && (activePanel === 'usage' || usageOpen));
        btn.classList.toggle('active', isActive);
        // 双态图标：选中切换为实心变体（仅在状态变化时替换，避免每帧重排）
        const pair = RAIL_TWO_STATE_ICONS[id];
        if (pair) {
          const want = isActive ? 'active' : 'normal';
          if (btn.dataset.iconState !== want) {
            btn.dataset.iconState = want;
            btn.innerHTML = isActive ? pair.active : pair.normal;
          }
        }
      });
    }

    function ensureRail() {
      if (typeof document === 'undefined' || !document.body) return;
      let rail = document.getElementById(RAIL_ID);
      if (!rail) {
        rail = document.createElement('div');
        rail.id = RAIL_ID;        rail.innerHTML = `
          <div class="dsh-rail-dragzone" aria-hidden="true"></div>
          <nav class="dsh-rail-nav" aria-label="固定导航">
            <button type="button" class="dsh-rail-btn dsh-rail-btn-custom" data-rail-action="home" data-tip="首页" aria-label="首页"></button>
            <button type="button" class="dsh-rail-btn dsh-rail-btn-custom" data-rail-action="schedules" data-tip="自动化任务" aria-label="自动化任务"></button>
            <button type="button" class="dsh-rail-btn dsh-rail-btn-custom" data-rail-action="plugins" data-tip="插件" aria-label="插件"></button>
            <button type="button" class="dsh-rail-btn dsh-rail-btn-custom" data-rail-action="usage" data-tip="用量统计" aria-label="用量统计"></button>
            <button type="button" class="dsh-rail-btn" data-rail-action="more" data-tip="更多" aria-label="更多">${RAIL_MORE_SVG_HTML}</button>
          </nav>
          <div class="dsh-rail-spacer"></div>
          <button type="button" class="dsh-rail-btn dsh-rail-avatar-btn" data-rail-action="account" aria-label="账号"></button>
        `;
        // 双态图标先渲染未选中态
        Object.entries(RAIL_TWO_STATE_ICONS).forEach(([id, pair]) => {
          const btn = rail.querySelector(`[data-rail-action="${id}"]`);
          if (btn) {
            btn.dataset.iconState = 'normal';
            btn.innerHTML = pair.normal;
          }
        });
        rail.addEventListener('click', (e) => {
          const btn = e.target && e.target.closest ? e.target.closest('[data-rail-action]') : null;
          if (!btn || !rail.contains(btn)) return;
          e.stopPropagation();
          railHandleAction(btn);
        });
        document.body.appendChild(rail);
      }
      railNode = rail;
      // aria-current 属性观察器：layout 服务不可用时，激活态靠原生面板行的
      // aria-current 变化即时同步（不依赖 rAF 扫描，避免后台帧节流延迟）
      if (!railAttrObserver && typeof MutationObserver !== 'undefined') {
        railAttrObserver = new MutationObserver(() => {
          syncRailActive();
        });
        railAttrObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ['aria-current'],
          subtree: true
        });
      }
      const avatarBtn = rail.querySelector('.dsh-rail-avatar-btn');
      if (avatarBtn) {
        const nextAvatar = railAvatarHtml();
        if (avatarBtn.dataset.railAvatar !== nextAvatar) {
          avatarBtn.dataset.railAvatar = nextAvatar;
          avatarBtn.innerHTML = nextAvatar;
          // 镜像的原生头像 URL 偶发加载失败（会话级 blob/鉴权地址），失败后
          // img 渲染为透明块、头像"消失"——立即换成圆形人像兜底图标。
          // dataset 已记录本次 HTML，扫描对比不会再触发重渲染，无循环风险。
          const imgEl = avatarBtn.querySelector('img.dsh-rail-avatar-img');
          if (imgEl) {
            imgEl.addEventListener('error', () => {
              avatarBtn.innerHTML = `<span class="dsh-rail-avatar-fallback">${RAIL_USER_SVG_HTML}</span>`;
            }, { once: true });
          }
        }
        maybeDumpAvatarDiagnostics();
      }
      syncRailActive();
      // 首页悬浮抽屉：先挂载（隐藏态），hover 进入首页按钮时按需展开
      ensureHomeDrawer();
    }

    function teardownRail() {
      closeRailMenu();
      if (railPanelUnsubscribe) {
        try { railPanelUnsubscribe(); } catch (e) {}
        railPanelUnsubscribe = null;
      }
      if (railAttrObserver) {
        try { railAttrObserver.disconnect(); } catch (e) {}
        railAttrObserver = null;
      }
      if (railUsageNode) {
        railUsageNode.remove();
        railUsageNode = null;
      }
      teardownHomeDrawer();
      const rail = document.getElementById(RAIL_ID);
      if (rail) rail.remove();
      railNode = null;
    }

    /* ======================================================================
       14b. 固定栏首页「悬浮卡片抽屉」——原生侧栏托管模式 (Native Hosting, v1.1.25)

       不再自绘抽屉：hover 首页按钮时把「宿主宽态侧栏」整体套进悬浮卡片壳。
       品牌行 / 新会话胶囊 / 工作区三入口 / 工作区文件夹 / 会话列表 / 底部设置
       全部原生渲染（数据、交互、快捷键零复刻，宿主升级自动跟随）。
       本插件只负责四件事：
       ① 生命周期：hover/键盘唤起 → layout.toggleSidebar 展开；移出热区收回；
       ② 卡片壳几何（CSS .dsh-native-host）：left 6 / top 标题栏+6 /
          bottom 14 / width 268 / radius 14 / 边框 / 投影；
       ③ 防推挤：托管期间把 frame 的 grid-template-columns 用 !important 钉在
          唤起前记住的「收起态值」，聊天区纹丝不动；
       ④ 开合 180ms 缓出动画（开=入场；收=先淡出壳再瞬时收回，不闪跳）。
       ====================================================================== */
    const HOME_DRAWER_TRIGGER_SEL = '#dsh-ui-rail [data-rail-action="home"]';
    /* 开合动画时长（ms）：开=入场动画；收=淡出壳 → 到时再 toggleSidebar 瞬时收回 */
    const NATIVE_HOST_ANIM_MS = 180;
    /* 托管类：由 JS 打在宿主侧栏列（[class*="_sidebarCol"]）上，CSS 见第 14 节 */
    const NATIVE_HOST_CLASS = 'dsh-native-host';
    const NATIVE_HOST_CLOSING_CLASS = 'dsh-native-host-closing';
    /* 全局托管模式类：打在 <html> 上，用于压制 grid 模板动画 / 隐藏拖拽手柄 */
    const NATIVE_HOST_MODE_CLASS = 'dsh-native-host-mode';
    const NATIVE_SIDEBAR_COL_SEL = '[class*="_sidebarCol"]';
    const NATIVE_FRAME_SEL = '[class*="_frame"]';
    /* 指针位移门禁阈值：小于该位移视为抖动/虚假事件，不当作「触摸」 */
    const HOME_DRAWER_MOVE_TOLERANCE_PX = 3;

    /* v1.1.25 起抽屉改为原生托管模式：品牌行 / 图标 / 会话列表全部原生渲染，
       自绘 SVG 常量（含用户提供的一体化 logo；源文件仍在 D:/桌面/logo.svg）
       随之退役，此处不再保留副本。 */

    /* 抽屉运行时状态：定时器 / 事件句柄 / 托管元素引用 */
    let homeDrawerOpen = false;
    let homeDrawerHideTimer = null;
    let homeDrawerEnterHandler = null;
    let homeDrawerLeaveHandler = null;
    let homeDrawerFocusHandler = null;
    let homeDrawerMoveHandler = null;
    let homeDrawerPointerOutHandler = null;
    let homeDrawerFocusOutHandler = null;
    let nativeHostCol = null;            // 托管中的宿主侧栏列元素（null = 未托管）
    let nativeHostPinnedTemplate = null; // 唤起前 frame 的 grid-template-columns（收起态值）
    let nativeHostCommitting = false;    // 收尾中（防重入）
    /* 指针「真实移动」门禁：页面重载/宿主重挂载按钮时，指针恰好停在按钮上会触发
       一次虚假 mouseenter（React 重挂载同理），导致「还没触摸就展开」。只有
       观察到指针真的动过（超过 HOME_DRAWER_MOVE_TOLERANCE_PX）才允许展开。 */
    let homePointerMoved = false;
    let homePointerPos = null;

    function isSidebarCollapsed() {
      try {
        const frame = document.querySelector(NATIVE_FRAME_SEL);
        if (frame && frame.hasAttribute('data-sidebar-collapsed')) return true;
        return document.documentElement.hasAttribute('data-sidebar-collapsed');
      } catch (e) {
        return false;
      }
    }

    /* --- 原生托管辅助 --- */

    function getLayoutFace() {
      try {
        if (!dshCtx) return null;
        if (typeof dshCtx.get === 'function') {
          const svc = dshCtx.get('layout');
          if (svc) return svc;
        }
        return dshCtx.layout || null;
      } catch (e) { return null; }
    }

    /* 展开/收起原生侧栏。优先 layout.toggleSidebar；兜底点宿主侧栏开关按钮。 */
    function toggleSidebarSafe() {
      try {
        const layout = getLayoutFace();
        if (layout && typeof layout.toggleSidebar === 'function') { layout.toggleSidebar(); return true; }
      } catch (e) {}
      try {
        const btn = document.querySelector('[class*="_toggle"]');
        if (btn) { btn.click(); return true; }
      } catch (e) {}
      return false;
    }

    function findNativeFrame() {
      try { return document.querySelector(NATIVE_FRAME_SEL); } catch (e) { return null; }
    }

    /* 宿主侧栏列 = 卡片壳的挂载点。class 哈希随构建变化，用稳定后缀选择器。 */
    function findNativeSidebarCol() {
      try { return document.querySelector(NATIVE_SIDEBAR_COL_SEL); } catch (e) { return null; }
    }

    /* 防推挤核心：把 frame 的 grid-template-columns 钉在「唤起前记住的收起态值」。
       宿主展开侧栏时会把模板改成宽态（侧栏列变宽、聊天区右移）——托管期间钉住，
       聊天区纹丝不动；卡片壳用 absolute 悬浮在上方。
       同时同步 CSS 变量 --dsh-pinned-grid-template-columns，通过样式表 !important 规则
       彻底压制 React 重新渲染带来的行内样式覆盖。 */
    function pinFrameTemplate(frame) {
      try {
        if (!frame) return;
        if (nativeHostPinnedTemplate == null) {
          nativeHostPinnedTemplate = (frame.style && frame.style.gridTemplateColumns)
            || (typeof window !== 'undefined' && window.getComputedStyle
              ? window.getComputedStyle(frame).gridTemplateColumns : '') || '';
        }
        if (nativeHostPinnedTemplate) {
          try {
            document.documentElement.style.setProperty('--dsh-pinned-grid-template-columns', nativeHostPinnedTemplate);
          } catch (e) {}
          if (frame.style && frame.style.setProperty) {
            frame.style.setProperty('grid-template-columns', nativeHostPinnedTemplate, 'important');
          }
        }
      } catch (e) {}
    }

    function unpinFrameTemplate(frame) {
      try {
        document.documentElement.style.removeProperty('--dsh-pinned-grid-template-columns');
        if (frame && frame.style && frame.style.removeProperty) {
          frame.style.removeProperty('grid-template-columns');
        }
      } catch (e) {}
      nativeHostPinnedTemplate = null;
    }

    /* 展开完成后给侧栏列挂上卡片壳（幂等；属性观察器与即时尝试双路触发） */
    function attachNativeHost() {
      try {
        const col = findNativeSidebarCol();
        if (!col) return false;
        if (nativeHostCol !== col) {
          col.classList.add(NATIVE_HOST_CLASS);
          nativeHostCol = col;
        }
        return true;
      } catch (e) { return false; }
    }

    function detachNativeHostClasses() {
      try {
        if (nativeHostCol) {
          nativeHostCol.classList.remove(NATIVE_HOST_CLASS);
          nativeHostCol.classList.remove(NATIVE_HOST_CLOSING_CLASS);
          nativeHostCol = null;
        }
      } catch (e) {}
      try { document.documentElement.classList.remove(NATIVE_HOST_MODE_CLASS); } catch (e) {}
    }

    /* 侧栏收起与否直接决定抽屉能否显示：宿主仅切换 data-sidebar-collapsed 属性、
       不产生 childList 变动，因此额外挂属性观察器：
       - 属性移除（展开完成）且在唤起中 → 挂卡片壳并补钉网格模板；
       - 属性出现（被收起）且在唤起中 → 外力（用户点了原生开关）收尾，不再 toggle。 */
    let homeDrawerAttrObserver = null;
    const homeDrawerAttrTargets = new Set();
    function ensureHomeDrawerAttrObserver() {
      if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
      try {
        if (!homeDrawerAttrObserver) {
          homeDrawerAttrObserver = new MutationObserver(() => {
            const collapsed = isSidebarCollapsed();
            if (!collapsed && homeDrawerOpen) {
              attachNativeHost();
              pinFrameTemplate(findNativeFrame());
            } else if (collapsed && homeDrawerOpen) {
              homeDrawerCommitHide();
            }
            railUpdateNavButtons();
          });
        }
        const candidates = [document.documentElement, findNativeFrame()];
        candidates.forEach((target) => {
          if (!target || homeDrawerAttrTargets.has(target)) return;
          homeDrawerAttrTargets.add(target);
          homeDrawerAttrObserver.observe(target, {
            attributes: true,
            attributeFilter: ['data-sidebar-collapsed']
          });
        });
      } catch (e) {
        dbg('home drawer attr observer failed', e);
      }
    }

    /* 唤起：仅侧栏收起态可行。先取消在途收起 → 打全局托管模式类 → 钉住 frame
       模板（防推挤，须在 toggleSidebar 之前）→ 即刻挂载卡片壳并展开原生侧栏。
       0ms 后及属性观察器双重补位，确保跨帧重渲染下壳样式不脱落、网格防推挤不失效。 */
    function homeDrawerShow() {
      if (!isSidebarCollapsed()) {
        // 侧栏已展开分两种情形：
        // ① 托管淡出进行中（我们自己展开的、模板仍钉着）——视为回移复活，
        //    取消收起即可，不得误判为「用户手动展开」而执行收尾；
        // ② 用户自己手动展开——彻底拒绝托管，顺手清掉可能残留的托管态。
        if (homeDrawerOpen && nativeHostPinnedTemplate != null) {
          homeDrawerCancelHide();
          return;
        }
        if (homeDrawerOpen || nativeHostCol) homeDrawerCommitHide();
        return;
      }
      homeDrawerCancelHide();
      homeDrawerOpen = true;
      nativeHostCommitting = false;
      try {
        const homeBtn = document.querySelector(HOME_DRAWER_TRIGGER_SEL);
        if (homeBtn) homeBtn.classList.add('dsh-suppress-tip');
      } catch (e) {}
      try { document.documentElement.classList.add(NATIVE_HOST_MODE_CLASS); } catch (e) {}
      pinFrameTemplate(findNativeFrame());
      attachNativeHost();
      toggleSidebarSafe();
      setTimeout(() => {
        try {
          if (homeDrawerOpen) {
            attachNativeHost();
            pinFrameTemplate(findNativeFrame());
          }
        } catch (e) {}
        // v1.1.37 诊断：抽屉打开时落盘工作区搜索入口快照（.dsh-ui-debug.json）
        try { ensureWorkspaceSearch(); dumpAvatarDiagnostics(); } catch (e) {}
      }, 0);
      // v1.1.40：展开动画结束后再落一次快照——0ms 那次往往赶在宿主侧栏完成布局
      // 之前，几何全是 0，无法用来核实图标组的实际左右偏移（v1.1.41 核实右端）。
      setTimeout(() => {
        try {
          if (homeDrawerOpen) { ensureWorkspaceSearch(); dumpAvatarDiagnostics(); }
        } catch (e) {}
      }, NATIVE_HOST_ANIM_MS + 80);
    }

    /* 收尾（真正收起）：摘壳 → 侧栏仍展开则收回 → 解除模板钉扎。
       只在「我们唤起过」（钉过模板）时才 toggle，绝不碰用户自己展开的侧栏。 */
    function homeDrawerCommitHide() {
      if (nativeHostCommitting) return;
      nativeHostCommitting = true;
      try {
        homeDrawerOpen = false;
        if (homeDrawerHideTimer) {
          clearTimeout(homeDrawerHideTimer);
          homeDrawerHideTimer = null;
        }
        try {
          const homeBtn = document.querySelector(HOME_DRAWER_TRIGGER_SEL);
          if (homeBtn) homeBtn.classList.remove('dsh-suppress-tip');
        } catch (e) {}
        detachNativeHostClasses();
        if (nativeHostPinnedTemplate != null && !isSidebarCollapsed()) toggleSidebarSafe();
        unpinFrameTemplate(findNativeFrame());
      } finally {
        nativeHostCommitting = false;
      }
    }

    /* 收起分两拍：先给壳加淡出类（180ms，与入场同曲线），动画结束再 commit——
       避免「壳先落回停靠位、聊天区被推一下」的闪跳。无壳（尚未挂载成功）时直接收尾。 */
    function homeDrawerHide() {
      if (!homeDrawerOpen || nativeHostCommitting) return;
      // v1.1.35：淡出进行中不重启定时器——连续移出不得无限拉长淡出窗，
      // 收尾固定在「首次移出后 180ms」完成，之后只能靠触碰图标再唤起。
      if (homeDrawerHideTimer) return;
      const col = nativeHostCol || findNativeSidebarCol();
      if (!col) { homeDrawerCommitHide(); return; }
      col.classList.add(NATIVE_HOST_CLOSING_CLASS);
      homeDrawerHideTimer = setTimeout(() => {
        homeDrawerHideTimer = null;
        homeDrawerCommitHide();
      }, NATIVE_HOST_ANIM_MS);
    }

    function homeDrawerCancelHide() {
      if (homeDrawerHideTimer) {
        clearTimeout(homeDrawerHideTimer);
        homeDrawerHideTimer = null;
      }
      if (nativeHostCol) nativeHostCol.classList.remove(NATIVE_HOST_CLOSING_CLASS);
      try {
        const homeBtn = document.querySelector(HOME_DRAWER_TRIGGER_SEL);
        if (homeBtn) homeBtn.classList.add('dsh-suppress-tip');
      } catch (e) {}
    }

    function homeDrawerScheduleHide() {
      homeDrawerHide();
    }

    /* v1.1.35 复活门禁：收起一旦开始（淡出定时器在跑），仅房屋图标本体可复活；
       卡片体 / 过渡走廊回移不再把正在收起的卡片拉回来（用户实测：没碰图标
       卡片就滑出）。未在收起时命中热区本就维持开启，cancel 是无害空操作。 */
    function homeDrawerReviveIfAllowed(ev) {
      if (!homeDrawerHideTimer || homeDrawerPointerOverTrigger(ev)) homeDrawerCancelHide();
    }

    /* mouseleave 的收起判定（去抖）：
       「离开某个元素」≠「离开悬停热区」——只有当离开的目标明确在托管卡片内、
       且当前坐标脱离合法热区时才触发收起；真正的离开由 pointermove 逐帧复核兜底。 */
    function homeDrawerLeaveMaybeHide(ev) {
      if (homeDrawerHotzoneHit(ev)) { homeDrawerReviveIfAllowed(ev); return; }
      const related = ev && ev.relatedTarget;
      if (related && related.closest) {
        try {
          if (related.closest('.' + NATIVE_HOST_CLASS)) {
            homeDrawerReviveIfAllowed(ev);
            return;
          }
        } catch (e) {}
      }
      homeDrawerHide();
    }

    /* 「精准悬停热区」（v1.1.27 修正卡片压栏几何）：
       ① 房屋图标本体：光标真实落在房屋几何轮廓之内；
       ② 托管卡片「可见」本体（仅抽屉展开时有效）：光标在卡片可见矩形之内；
       ③ 图标 → 卡片 过渡通道（仅抽屉展开时有效）：图标右缘 → 卡片可见左缘的走廊。
       严禁将房屋图标周围留白、固定栏其他功能按钮或页面其他区域纳入热区！
       关键修正：卡片壳 left:6px，其左段（6px .. 固定栏右缘 64px）压在固定栏下方，
       旧逻辑直接用 colR.left 起算热区，会把整条固定栏右半与图标周围留白全部吞进
       热区——表现为「光标只是靠近图标右侧白色区域、还没碰到图标，卡片就滑出」。
       现以固定栏右缘为卡片可见左缘锚点，走廊几何也随之前移，两个方向都成立。 */
    function homeDrawerHotzoneHit(ev) {
      if (!ev || typeof ev.clientX !== 'number' || typeof ev.clientY !== 'number') return false;
      // 门禁：光标若明确落在固定栏其他功能按钮上（自动化任务、插件、用量、更多、账号等），绝非首页抽屉热区
      if (ev.target && ev.target.closest) {
        const railBtn = ev.target.closest('#dsh-ui-rail [data-rail-action]');
        if (railBtn && railBtn.getAttribute && railBtn.getAttribute('data-rail-action') !== 'home') {
          return false;
        }
      }
      const x = ev.clientX, y = ev.clientY;
      try {
        const overTrigger = homeDrawerPointerOverTrigger(ev);
        // ① 房屋图标本体：光标真实落在房屋几何轮廓之内（精准图形轮廓，绝非 40x40 留白）
        if (overTrigger) return true;

        // ② 仅在抽屉处于打开状态时，托管卡片体与过渡走廊才参与热区
        if (homeDrawerOpen) {
          const col = nativeHostCol || findNativeSidebarCol();
          const colR = col && col.getBoundingClientRect && col.getBoundingClientRect();
          if (colR && colR.width > 0 && colR.height > 0) {
            // 卡片「可见左缘」：max(卡片壳几何左缘, 固定栏右缘)。固定栏不可测
            // （width 0，如测试桩）时退回卡片壳几何左缘保持旧行为。
            let visibleLeft = colR.left;
            try {
              const rail = document.getElementById('dsh-ui-rail');
              const railR = rail && rail.getBoundingClientRect && rail.getBoundingClientRect();
              if (railR && railR.width > 0) visibleLeft = Math.max(visibleLeft, railR.right);
            } catch (e) {}

            // 2a. 托管卡片可见本体（用户浏览/操作会话列表）：右侧与底部提供 8px
            // 手势容差；左缘严密贴可见左缘（2px 容差吸收跨界事件的坐标取整），
            // 压在固定栏下方的不可见卡片段绝不参与热区。
            if (x >= visibleLeft - 2 && x <= colR.right + 8 && y >= colR.top && y <= colR.bottom + 8) {
              return true;
            }

            // 2b. 图标 → 卡片 过渡通道（仅限从图标右侧向右进入卡片）：
            // 水平 = min/max(图标右缘, 卡片可见左缘) ± 边界容差——以可见左缘为锚，
            // 无论卡片在图标右侧（旧 left:72）还是压栏（left:6）都不会反转；
            // 垂直 = 图标垂直范围为主，向上让 8px、向下覆盖到卡片顶缘（+8px），
            // 保证斜向进入卡片左上角不断链。图标左侧/下方留白不在通道内。
            const trigger = document.querySelector(HOME_DRAWER_TRIGGER_SEL);
            const svg = trigger && trigger.querySelector('svg');
            const svgR = svg && svg.getBoundingClientRect && svg.getBoundingClientRect();
            if (svgR && svgR.width > 0 && svgR.height > 0) {
              const corridorLeft = Math.min(svgR.right, visibleLeft) - 2;
              const corridorRight = Math.max(svgR.right, visibleLeft) + 8;
              const corridorTop = Math.min(svgR.top, colR.top) - 8;
              const corridorBottom = Math.max(svgR.bottom, colR.top) + 8;
              if (x >= corridorLeft && x <= corridorRight && y >= corridorTop && y <= corridorBottom) {
                return true;
              }
            }
          }
        }
      } catch (e) {}
      return false;
    }

    /* 精准几何：判定坐标 (x, y) 是否真实落在首页房屋图标物理轮廓（屋顶三角斜坡与主体墙面）之内。
       房屋真实视觉尺寸：22x22；屋顶尖 (Cx, yTop)，屋檐两端 (Lx, Ey) ~ (Rx, Ey)，墙体 (WxL ~ WxR, Ey ~ By)。
       在按钮留白处、屋顶上方透明三角拐角处、墙体外侧完全返回 false，绝不提前抢跑。 */
    function isPointInHouseIcon(x, y, svgR) {
      if (!svgR || svgR.width <= 0 || svgR.height <= 0) return false;
      const l = svgR.left, t = svgR.top, w = svgR.width, h = svgR.height;
      const cx = l + w * 0.5;
      const yTop = t + h * 0.04;
      const ey = t + h * 0.38;
      const by = t + h * 0.93;
      const wxl = l + w * 0.17;
      const wxr = l + w * 0.83;
      const rx = l + w * 0.95;

      // 1. 垂直范围核验：屋顶尖端上方 或 房屋地基下方：不在图标内
      if (y < yTop || y > by) return false;

      // 2. 屋顶三角区域判定 (yTop <= y <= ey)：两侧屋檐斜坡内才算命中
      if (y <= ey) {
        const prog = (y - yTop) / (ey - yTop);
        const halfW = prog * (rx - cx);
        return Math.abs(x - cx) <= halfW;
      }

      // 3. 墙壁主体区域判定 (ey < y <= by)：墙壁左右两侧留白处不唤起
      return x >= wxl && x <= wxr;
    }

    function homeDrawerPointerOverTrigger(ev) {
      if (!ev) return false;
      try {
        const btn = document.querySelector(HOME_DRAWER_TRIGGER_SEL);
        if (!btn) return false;

        const target = ev.target;
        // 严格目标源门禁：事件目标必须真实在首页按钮之内（严格排除页面其他元素、其他固定栏图标、以及 document/body）
        const targetInBtn = !!(target && (target === btn || (btn.contains && btn.contains(target)) || (target.closest && target.closest(HOME_DRAWER_TRIGGER_SEL))));
        if (!targetInBtn) return false;

        const svg = btn.querySelector('svg');

        // ① 鼠标坐标精准图形轮廓判定：光标必须物理落入房屋几何轮廓之内
        if (typeof ev.clientX === 'number' && typeof ev.clientY === 'number') {
          const svgR = svg && svg.getBoundingClientRect && svg.getBoundingClientRect();
          if (svgR && svgR.width > 0 && svgR.height > 0) {
            return isPointInHouseIcon(ev.clientX, ev.clientY, svgR);
          }
          return false;
        }

        // ② 键盘可达性兜底（focusin 事件无 clientX 坐标）
        if (typeof ev.clientX !== 'number') {
          return true;
        }
      } catch (e) {}
      return false;
    }

    function homeDrawerPointerOverHost(ev) {
      if (!ev) return false;
      try {
        const target = ev.target;
        if (target && target.closest && target.closest('.' + NATIVE_HOST_CLASS)) return true;
        if (target && target.matches && target.matches('.' + NATIVE_HOST_CLASS)) return true;
      } catch (e) {}
      return false;
    }

    /* 指针是否落在「唤起区」上：
       ① 优先命中首页图标核心区域（通过 homeDrawerPointerOverTrigger 精准几何判定）；
       ② 抽屉已打开时，光标落在托管卡片内也视为合法有效；
       ③ 严禁使用外层 40x40 透明按钮矩形在留白处提前开合。 */
    function homeDrawerCheckOpen(ev) {
      if (homeDrawerPointerOverTrigger(ev)) return true;
      if (homeDrawerOpen && homeDrawerPointerOverHost(ev)) return true;
      return false;
    }

    /* 宿主侧栏是懒渲染/重挂载的：固定栏与 #dsh-ui-rail 可能晚于插件加载才出现，
       且切换侧栏只改 data-sidebar-collapsed 属性（不产生 childList 变动）。这里用
       一个有界自愈定时器在启动后 20 秒内每次 1 秒重试补挂观察器与抽屉节点，
       覆盖「宿主渲染晚于插件」的窗口，超时后自动停止（零常驻开销）。 */
    let homeDrawerSelfHealTimer = null;
    let homeDrawerSelfHealDeadline = 0;
    function ensureHomeDrawerSelfHeal() {
      if (homeDrawerSelfHealTimer) return;
      if (!homeDrawerSelfHealDeadline) homeDrawerSelfHealDeadline = Date.now() + 20000;
      if (Date.now() > homeDrawerSelfHealDeadline) return;
      homeDrawerSelfHealTimer = setInterval(() => {
        try {
          ensureHomeDrawerAttrObserver();
          ensureHomeDrawerDocObserver();
          ensureHomeDrawer();
        } catch (e) {}
        if (Date.now() > homeDrawerSelfHealDeadline) {
          clearInterval(homeDrawerSelfHealTimer);
          homeDrawerSelfHealTimer = null;
        }
      }, 1000);
    }

    /* 托管模式不再自绘任何抽屉 DOM：这里只负责绑定 hover/键盘生命周期监听、
       挂属性/文档观察器与有界自愈。卡片壳与内容全部由宿主宽态侧栏提供。 */
    function ensureHomeDrawer() {
      if (typeof document === 'undefined' || !document.body) return;
      if (!homeDrawerEnterHandler) {
        /* 行为契约：
           ① 展开——指针「真实移动」到首页按钮上（mouseenter 命中按钮，或 pointermove
              期间按钮矩形被命中）立即展开；重载/重挂载带来的虚假 mouseenter 不展开。
           ② 收起——移出「按钮 ∪ 抽屉」热区即刻收起（零缓冲）：pointermove 逐帧复核
              位置作为主判定，mouseleave 只做去抖补位（边界坐标不算离开），即使
              mouseleave 丢失也能收尾；指针离开窗口（pointerleave/mouseleave 且
              relatedTarget 为空）同样立即收起。 */
        homeDrawerMoveHandler = (e) => {
          const x = typeof e.clientX === 'number' ? e.clientX : null;
          const y = typeof e.clientY === 'number' ? e.clientY : null;
          if (x !== null && y !== null) {
            const prev = homePointerPos;
            if (!prev || Math.abs(x - prev.x) + Math.abs(y - prev.y) > HOME_DRAWER_MOVE_TOLERANCE_PX) {
              homePointerMoved = true;
            }
            homePointerPos = { x, y };
          }
          if (!homePointerMoved) return;
          if (!homeDrawerOpen) {
            // 抽屉未打开态：严格只在光标真实物理触碰到房屋图标时才唤起，周围留白与其他区域完全不唤起
            if (homeDrawerCheckOpen(e)) homeDrawerShow();
          } else {
            const hit = homeDrawerHotzoneHit(e);
            if (hit) {
              // v1.1.35：收起进行中仅房屋图标本体可复活（卡片体/走廊回移不拉回）
              homeDrawerReviveIfAllowed(e);
            } else {
              // 离开热区（移入周围留白、其他功能按钮或外部区域）：立刻排期收起
              homeDrawerScheduleHide();
            }
          }
        };
        homeDrawerEnterHandler = (e) => {
          if (!homePointerMoved) return;
          const btn = document.querySelector(HOME_DRAWER_TRIGGER_SEL);
          if (!btn) return;
          const target = e && e.target;
          if (target && target !== btn && (!btn.contains || !btn.contains(target)) && (!target.closest || !target.closest(HOME_DRAWER_TRIGGER_SEL))) {
            return;
          }
          if (homeDrawerPointerOverTrigger(e)) homeDrawerShow();
        };
        homeDrawerLeaveHandler = (e) => {
          const related = e && e.relatedTarget;
          const leftWindow = !related || related === document.documentElement
            || (related.nodeType === 9) /* Document */;
          if (leftWindow) { homeDrawerHide(); return; }
          homeDrawerLeaveMaybeHide(e);
        };
        homeDrawerPointerOutHandler = (e) => {
          const related = e && e.relatedTarget;
          if (!related || related === document.documentElement) homeDrawerHide();
        };
        homeDrawerFocusHandler = (e) => {
          const t = e.target;
          if (t && t.matches && t.matches(HOME_DRAWER_TRIGGER_SEL) && isSidebarCollapsed()) homeDrawerShow();
        };
        homeDrawerFocusOutHandler = (e) => {
          // 键盘可达性：焦点离开「首页按钮 ∪ 抽屉」时收起（悬停路径不依赖它）
          const next = e && e.relatedTarget;
          if (!next) { homeDrawerHide(); return; }
          try {
            if (next.closest && (next.closest(HOME_DRAWER_TRIGGER_SEL) || next.closest('.' + NATIVE_HOST_CLASS))) return;
          } catch (err) {}
          homeDrawerHide();
        };
        document.addEventListener('mouseenter', homeDrawerEnterHandler, true);
        document.addEventListener('mouseover', homeDrawerEnterHandler, true);
        document.addEventListener('pointermove', homeDrawerMoveHandler, true);
        document.addEventListener('mousemove', homeDrawerMoveHandler, true);
        document.addEventListener('mouseleave', homeDrawerLeaveHandler, true);
        document.addEventListener('pointerleave', homeDrawerPointerOutHandler, true);
        document.addEventListener('focusin', homeDrawerFocusHandler, true);
        document.addEventListener('focusout', homeDrawerFocusOutHandler, true);
      }
      // 终止条件兜底：抽屉已关闭但残留钉扎模板 → 立即清理收尾。
      // 托管激活中（homeDrawerOpen 为 true）绝不触碰。
      if (!homeDrawerOpen && nativeHostPinnedTemplate != null) homeDrawerCommitHide();
      ensureHomeDrawerAttrObserver();
      ensureHomeDrawerDocObserver();
      ensureHomeDrawerSelfHeal();
    }

    /* 抽屉只在「侧栏收起」时挂载，但宿主侧栏是懒渲染的（收起态此前根本没有侧栏
       DOM）——面板行、固定栏按钮都可能晚于插件加载才出现，而属性观察器只能监听
       已存在的元素。因此用 document 级观察器补挂：任何插入到文档中的节点都会触发
       一次检查，命中即挂上观察器并自解绑；期间若被 disconnect 会在下次调用时重挂。 */
    let homeDrawerDocObserver = null;
    let homeDrawerDocObserverTarget = null;
    function inDocumentTree(node) {
      let p = node;
      while (p) {
        if (p === document.documentElement) return true;
        if (p.tagName === 'HTML') return true;
        p = p.parentNode;
      }
      return false;
    }
    function ensureHomeDrawerDocObserver() {
      if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
      try {
        const target = inDocumentTree(document.body) ? document.body
          : (inDocumentTree(document.documentElement) ? document.documentElement : null);
        if (!target) return;
        const observingTarget = homeDrawerDocObserver && homeDrawerDocObserverTarget === target;
        if (observingTarget) return;
        if (homeDrawerDocObserver) {
          try { homeDrawerDocObserver.disconnect(); } catch (e) {}
          homeDrawerDocObserver = null;
          homeDrawerDocObserverTarget = null;
        }
        const mo = new MutationObserver(() => {
          try {
            if (!isSidebarCollapsed()) return;
            if (!inDocumentTree(document.body)) return;
            ensureHomeDrawer();
            try { mo.disconnect(); } catch (e) {}
            homeDrawerDocObserver = null;
            homeDrawerDocObserverTarget = null;
          } catch (e) {}
        });
        mo.observe(target, { childList: true, subtree: true });
        homeDrawerDocObserver = mo;
        homeDrawerDocObserverTarget = target;
      } catch (e) {
        homeDrawerDocObserver = null;
        homeDrawerDocObserverTarget = null;
        dbg('home drawer doc observer failed', e);
      }
    }

    function teardownHomeDrawer() {
      homeDrawerCancelHide();
      if (homeDrawerSelfHealTimer) {
        clearInterval(homeDrawerSelfHealTimer);
        homeDrawerSelfHealTimer = null;
      }
      homeDrawerSelfHealDeadline = 0;
      if (homeDrawerAttrObserver) {
        try { homeDrawerAttrObserver.disconnect(); } catch (e) {}
        homeDrawerAttrObserver = null;
      }
      homeDrawerAttrTargets.clear();
      if (homeDrawerDocObserver) {
        try { homeDrawerDocObserver.disconnect(); } catch (e) {}
        homeDrawerDocObserver = null;
        homeDrawerDocObserverTarget = null;
      }
      if (homeDrawerEnterHandler) {
        document.removeEventListener('mouseenter', homeDrawerEnterHandler, true);
        document.removeEventListener('mouseover', homeDrawerEnterHandler, true);
        homeDrawerEnterHandler = null;
      }
      if (homeDrawerLeaveHandler) {
        document.removeEventListener('mouseleave', homeDrawerLeaveHandler, true);
        homeDrawerLeaveHandler = null;
      }
      if (homeDrawerMoveHandler) {
        document.removeEventListener('pointermove', homeDrawerMoveHandler, true);
        document.removeEventListener('mousemove', homeDrawerMoveHandler, true);
        homeDrawerMoveHandler = null;
      }
      if (homeDrawerPointerOutHandler) {
        document.removeEventListener('pointerleave', homeDrawerPointerOutHandler, true);
        homeDrawerPointerOutHandler = null;
      }
      if (homeDrawerFocusHandler) {
        document.removeEventListener('focusin', homeDrawerFocusHandler, true);
        homeDrawerFocusHandler = null;
      }
      if (homeDrawerFocusOutHandler) {
        document.removeEventListener('focusout', homeDrawerFocusOutHandler, true);
        homeDrawerFocusOutHandler = null;
      }
      // 插件卸载/热重载：若正处于托管中，先恢复宿主侧栏原状（摘壳 + 收回 +
      // 解除模板钉扎），避免留下「展开着的漂浮侧栏」。
      homeDrawerOpen = false;
      nativeHostCommitting = false;
      detachNativeHostClasses();
      try {
        if (nativeHostPinnedTemplate != null && !isSidebarCollapsed()) toggleSidebarSafe();
      } catch (e) {}
      unpinFrameTemplate(findNativeFrame());
      homePointerMoved = false;
      homePointerPos = null;
    }


    /* ======================================================================
       15. 右上角 ← → 历史导航（返回 Ctrl+[ / 前进 Ctrl+]）
       记录 面板(activePanelId) + 会话(mainView 会话) 两级视图历史，
       与原生 uiWorkspace.openSession / layout.selectPanel 对接。
       ====================================================================== */
    const NAVBTNS_ID = 'dsh-ui-navbtns';

    const RAIL_ARROW_BACK_SVG_HTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M19 12H5"/>
        <path d="M11 18l-6-6 6-6"/>
      </svg>
    `;

    const RAIL_ARROW_FORWARD_SVG_HTML = `
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M5 12h14"/>
        <path d="M13 6l6 6-6 6"/>
      </svg>
    `;

    const RAIL_PANEL_LEFT_SVG_HTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M13.5 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z"/>
        <path d="M5.5 1.5V14.5"/>
      </svg>
    `;

    /* v1.1.34 常驻 ⊕ 新建会话图标：与宿主 IconNewChatOutlineRegular 1:1（16x16
       viewBox、stroke-width 1，三条 path 原样取自 dsh-client-ui-primitives 的
       NewChatOutlineArtwork，形状与宿主浮动钮完全一致） */
    const RAIL_PLUS_SVG_HTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M2.37091 11.2501C1.58745 9.89288 1.32067 8.29835 1.61969 6.76006C1.91872 5.22177 2.76342 3.8433 3.99826 2.87846C5.2331 1.91362 6.77494 1.42737 8.33988 1.50925C9.90482 1.59113 11.3875 2.23562 12.5149 3.32406C13.6425 4.41269 14.3387 5.87206 14.4754 7.4334C14.612 8.99474 14.18 10.5529 13.2587 11.8209C12.3375 13.0888 10.9891 13.9813 9.46194 14.3337C8.18691 14.628 6.85895 14.5294 5.64989 14.0605C5.1712 13.8748 4.76962 13.4932 4.26534 13.3967C3.67413 13.2835 2.95257 13.5598 2.03794 14.3337" stroke="currentColor"/>
        <path d="M8 5V11" stroke="currentColor"/>
        <path d="M5 8H11" stroke="currentColor"/>
      </svg>
    `;

    const railHistory = { stack: [], index: -1, suppress: false };
    let navBtnsNode = null;
    let navKeydownHandler = null;

    function railCurrentViewState() {
      let panelId = null;
      let sessionId = null;
      try {
        const layout = getRailLayoutFace();
        const snap = layout && layout.panelInfo && typeof layout.panelInfo.getSnapshot === 'function'
          ? layout.panelInfo.getSnapshot()
          : null;
        if (snap) panelId = snap.activePanelId;
      } catch (e) {}
      try {
        const sessions = dshCtx && typeof dshCtx.get === 'function' ? dshCtx.get('sessions') : null;
        const snap = sessions && sessions.list && typeof sessions.list.getSnapshot === 'function'
          ? sessions.list.getSnapshot()
          : null;
        if (snap && snap.byId) {
          const main = Object.values(snap.byId).find(s => ((s.retainedBy || {}).mainView || 0) > 0);
          if (main) sessionId = main.id;
        }
      } catch (e) {}
      return { panelId, sessionId };
    }

    function railSyncHistory() {
      if (railHistory.suppress) return;
      const state = railCurrentViewState();
      const key = JSON.stringify(state);
      const current = railHistory.stack[railHistory.index];
      if (current && JSON.stringify(current) === key) return;
      railHistory.stack = railHistory.stack.slice(0, railHistory.index + 1);
      railHistory.stack.push(state);
      if (railHistory.stack.length > HISTORY_MAX_ENTRIES) {
        railHistory.stack.shift();
      } else {
        railHistory.index++;
      }
      railUpdateNavButtons();
    }

    function railUpdateNavButtons() {
      if (!navBtnsNode) return;
      const back = navBtnsNode.querySelector('[data-nav-action="back"]');
      const forward = navBtnsNode.querySelector('[data-nav-action="forward"]');
      if (back) back.disabled = railHistory.index <= 0;
      if (forward) forward.disabled = railHistory.index >= railHistory.stack.length - 1;
      const toggle = navBtnsNode.querySelector('[data-nav-action="toggle"]');
      if (toggle) {
        const collapsed = isSidebarCollapsed();
        const tip = collapsed ? '打开侧边栏 Ctrl+B' : '收起侧边栏 Ctrl+B';
        toggle.setAttribute('data-tip', tip);
        toggle.setAttribute('aria-label', tip);
      }
    }

    function railApplyHistoryState(entry) {
      railHistory.suppress = true;
      try {
        const layout = getRailLayoutFace();
        if (layout && typeof layout.selectPanel === 'function') {
          layout.selectPanel(entry.panelId || null);
        }
      } catch (e) {}
      try {
        const ws = getRailWorkspaceFace();
        if (ws && typeof ws.openSession === 'function' && entry.sessionId) {
          if (entry.sessionId !== railCurrentViewState().sessionId) {
            ws.openSession(entry.sessionId);
          }
        }
      } catch (e) {}
      railUpdateNavButtons();
      // 稳定检测替代旧固定 400ms 抑制窗：快照连续两次一致（且不早于最短
      // 窗口）即解除抑制；到达上限强制解除。快速导航不被吞、慢速导航不早泄漏。
      let lastKey = null;
      let elapsed = 0;
      const tick = () => {
        if (!railHistory.suppress) return; // 已被新操作/dispose 接管
        elapsed += HISTORY_SUPPRESS_STEP_MS;
        let key = '';
        try { key = JSON.stringify(railCurrentViewState()); } catch (e) {}
        const settled = lastKey !== null && key === lastKey && elapsed >= HISTORY_SUPPRESS_MIN_MS;
        if (settled || elapsed >= HISTORY_SUPPRESS_CAP_MS) {
          railHistory.suppress = false;
          railSyncHistory();
          return;
        }
        lastKey = key;
        setTimeout(tick, HISTORY_SUPPRESS_STEP_MS);
      };
      setTimeout(tick, HISTORY_SUPPRESS_STEP_MS);
    }

    function railGoBack() {
      if (railHistory.index <= 0) return;
      railHistory.index--;
      railApplyHistoryState(railHistory.stack[railHistory.index]);
    }

    function railGoForward() {
      if (railHistory.index >= railHistory.stack.length - 1) return;
      railHistory.index++;
      railApplyHistoryState(railHistory.stack[railHistory.index]);
    }

    function ensureNavButtons() {
      if (typeof document === 'undefined' || !document.body) return;
      if (!navBtnsNode || !navBtnsNode.isConnected) {
        const existing = document.getElementById(NAVBTNS_ID);
        navBtnsNode = existing || null;
        if (!navBtnsNode) {
          navBtnsNode = document.createElement('div');
          navBtnsNode.id = NAVBTNS_ID;
          navBtnsNode.innerHTML = `
            <button type="button" class="dsh-navbtn" data-nav-action="back" data-tip="返回 Ctrl+[" aria-label="返回">${RAIL_ARROW_BACK_SVG_HTML}</button>
            <button type="button" class="dsh-navbtn" data-nav-action="forward" data-tip="前进 Ctrl+]" aria-label="前进">${RAIL_ARROW_FORWARD_SVG_HTML}</button>
            <button type="button" class="dsh-navbtn dsh-navbtn-toggle" data-nav-action="toggle" data-tip="打开侧边栏 Ctrl+B" aria-label="打开侧边栏">${RAIL_PANEL_LEFT_SVG_HTML}</button>
            <button type="button" class="dsh-navbtn dsh-navbtn-plus" data-nav-action="new" data-tip="新建会话" aria-label="新建会话">${RAIL_PLUS_SVG_HTML}</button>
          `;
          navBtnsNode.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('[data-nav-action]') : null;
            if (!btn || btn.disabled) return;
            e.stopPropagation();
            if (btn.dataset.navAction === 'back') railGoBack();
            else if (btn.dataset.navAction === 'forward') railGoForward();
            else if (btn.dataset.navAction === 'new') {
              // 常驻 ⊕ 新建会话：与固定栏首页同路径（uiWorkspace.startSession 原生优先回退）
              railGoHome();
            }
            else if (btn.dataset.navAction === 'toggle') {
              if (homeDrawerOpen) {
                // 托管悬浮卡片展示期间点击侧栏开关：转为常驻展开态
                homeDrawerOpen = false;
                if (homeDrawerHideTimer) { clearTimeout(homeDrawerHideTimer); homeDrawerHideTimer = null; }
                detachNativeHostClasses();
                unpinFrameTemplate(findNativeFrame());
              } else {
                toggleSidebarSafe();
              }
              railUpdateNavButtons();
            }
          });
          document.body.appendChild(navBtnsNode);
        }
      }
      if (!navKeydownHandler) {
        navKeydownHandler = (e) => {
          if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
          // 输入焦点内不接管：把 Ctrl+[ / Ctrl+] 留给编辑器/宿主自身的快捷键
          const t = e.target;
          if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
          if (e.code === 'BracketLeft') {
            e.preventDefault();
            e.stopPropagation();
            railGoBack();
          } else if (e.code === 'BracketRight') {
            e.preventDefault();
            e.stopPropagation();
            railGoForward();
          }
        };
        document.addEventListener('keydown', navKeydownHandler, true);
      }
      railSyncHistory();
      railUpdateNavButtons();
    }

    function teardownNavButtons() {
      if (navKeydownHandler) {
        document.removeEventListener('keydown', navKeydownHandler, true);
        navKeydownHandler = null;
      }
      const node = document.getElementById(NAVBTNS_ID);
      if (node) node.remove();
      navBtnsNode = null;
      railHistory.stack = [];
      railHistory.index = -1;
      railHistory.suppress = false;
    }

    let syncRafId = null;
    function throttledSyncSendButton() {
      if (syncRafId) return;
      syncRafId = requestAnimationFrame(() => {
        syncRafId = null;
        syncSendButtonState();
      });
    }

    function syncSendButtonState() {
      const cards = document.querySelectorAll('.RlGAzG_card');
      cards.forEach(card => {
        const editor = card.querySelector('.RlGAzG_input, [data-composer-input], textarea, [contenteditable="true"]');
        const sendBtn = card.querySelector('.RlGAzG_primary, button[aria-label="发送"], button[aria-label="Send"]');
        if (!sendBtn) return;
        if (editor) {
          // textContent 优先：不触发强制布局（innerText 每次都 reflow）。
          // 占位符是独立节点（.RlGAzG_placeholder），不污染 textContent。
          const text = (editor.textContent || '').trim();
          const hasContent = text.length > 0;
          const current = sendBtn.getAttribute('data-has-content') === 'true';
          if (hasContent !== current) {
            if (hasContent) {
              sendBtn.setAttribute('data-has-content', 'true');
            } else {
              sendBtn.removeAttribute('data-has-content');
            }
          }
        }
      });
    }

    // ------------------------------------------------------------------
    // 宿主锚点注册表（v1.1.26）：皮肤依赖的全部宿主 DOM 锚点集中在一处。
    //  - sel  : 该锚点在运行代码中实际使用的（或更稳健的等价）选择器。
    //           修改代码内选择器时必须同步本表——保证自检探测的就是运行所用。
    //  - tier : required  = 任何视图都应命中，缺失即皮肤大概率整体失效（warn）；
    //           expected  = Hero（新建会话）态应命中，缺失即对应增强不生效（info）；
    //           context   = 仅特定交互路径使用，缺失只记录不告警。
    // 自检入口：启动后 3s 自动跑一次（见 apply 内 healthCheckTimerId）；
    // 控制台可随时 window.__dshUiHealth.check() 重跑，anchors 字段可查全表。
    // ------------------------------------------------------------------
    const HOST_ANCHORS = {
      appFrame:            { sel: '.BynINW_frame, [class*="_frame"]', tier: 'required', note: '应用框架：侧栏状态属性与网格钉扎挂载点' },
      sidebarPanelList:    { sel: '._2H3hWW_panelList, [class*="_panelList"]', tier: 'required', note: '侧栏面板列表：固定栏激活态同步' },
      composerRoot:        { sel: '.RlGAzG_root, [class*="_composer"]', tier: 'required', note: '输入卡根节点：欢迎区发现与底部状态栏' },
      composerCard:        { sel: '.RlGAzG_card, [data-composer-card]', tier: 'expected', note: '输入卡容器：宽度锁定 / 发送按钮三态' },
      composerInput:       { sel: '.RlGAzG_input, [data-composer-input]', tier: 'context', note: '输入编辑器：技能指令插入' },
      composerSend:        { sel: '.RlGAzG_primary, button[aria-label="发送"], button[aria-label="Send"]', tier: 'expected', note: '发送按钮：空态/有内容态同步' },
      composerPlaceholder: { sel: '.RlGAzG_placeholder', tier: 'context', note: '输入卡占位符节点' },
      composerHero:        { sel: '.Dc7zOa_composerHero, [class*="composerHero"]', tier: 'expected', note: '欢迎区容器：E2 宽度锁定' },
      heroWorkspaceRow:    { sel: '.Dc7zOa_heroWorkspaceRow, [class*="heroWorkspaceRow"]', tier: 'expected', note: '工作区行：底部状态栏挂载点' },
      heroHeadline:        { sel: '.Hqq-bq_root, [data-phase="hero"], [data-content-phase="hero"]', tier: 'expected', note: '欢迎区标题：Hero 态判定' },
      workspaceBtn:        { sel: '.Hqq-bq_workspace, button[class*="workspace"]', tier: 'expected', note: '工作区芯片：图标替换与文案' },
      workspaceLabel:      { sel: '.Hqq-bq_workspaceLabel, [class*="workspaceLabel"]', tier: 'context', note: '工作区文案（选择项目）' },
      workspaceFolderIcon: { sel: '.Hqq-bq_folder, [class*="folder"]', tier: 'context', note: '工作区文件夹图标替换' },
      presetSeat:          { sel: '._oGoKq_seat, [class*="seat"]', tier: 'expected', note: '模式芯片：图标替换' },
      presetItem:          { sel: '._oGoKq_item', tier: 'context', note: '模式菜单项：菜单图标增强' },
      menuList:            { sel: '._3tUStW_list, [role="menu"]', tier: 'context', note: '原生菜单样式基座' },
      panelRow:            { sel: '[class*="_panelRow"]', tier: 'expected', note: '侧栏面板行：激活态 DOM 兜底' },
      sidebarCol:          { sel: '[class*="_sidebarCol"]', tier: 'context', note: '宿主侧栏列：抽屉卡片壳挂载点' },
      centerCol:           { sel: '.BynINW_centerCol, [class*="_centerCol"]', tier: 'context', note: '中栏：托管模式圆角压制' },
      sidebarHandle:       { sel: '[class*="_handle"]', tier: 'context', note: '侧栏拖拽手柄：托管期隐藏' },
      settingsArea:        { sel: '[class*="_settingsArea"]', tier: 'expected', note: '侧栏底部设置区：头像镜像 / 账号菜单' },
      footArea:            { sel: '[class*="_footArea"]', tier: 'context', note: '收起态账号触发器容器' },
      sidebarToggle:       { sel: '[class*="_toggle"]', tier: 'context', note: '侧栏开关按钮：toggleSidebar 回退' },
      newSessionBtn:       { sel: '[class*="_newSession"]', tier: 'context', note: '原生新会话按钮：回退点击' },
      usageRoot:           { sel: '[aria-label="打开用量统计面板"], [class*="UcfOsa_root"]', tier: 'context', note: '原生用量按钮：回退点击' },
      buildVersion:        { sel: '[class*="_buildVersion"]', tier: 'context', note: '构建版本号：账号菜单副标题' },
      navCell:             { sel: '[class*="_navCell"], [class*="wCInkW_navCell"]', tier: 'context', note: '设置弹窗导航（插件面板跳转）' },
    };

    // 选择器健康自检（B7 → v1.1.26 全量化）：皮肤深度绑定宿主构建哈希类名，
    // 宿主升级可能导致锚点漂移。自检由上方 HOST_ANCHORS 注册表驱动，覆盖全部
    // 锚点并按 tier 分级报告；结果写入 window.__dshUiHealth（保留旧
    // missingRequired/missingOptional 字段名以兼容既有排查脚本），check() 供
    // 控制台随时重跑。不再使用一次性 selectorHealthDone 门禁——定时调用方
    // 只在启动时触发一次，手动 check() 需要可重复执行。
    function runSelectorHealthCheck() {
      if (typeof document === 'undefined') return null;
      const missing = { required: [], expected: [], context: [] };
      for (const [key, anchor] of Object.entries(HOST_ANCHORS)) {
        let hit = false;
        try { hit = !!document.querySelector(anchor.sel); } catch (e) {}
        if (!hit) missing[anchor.tier].push(key);
      }
      const report = {
        missingRequired: missing.required,
        missingExpected: missing.expected,
        missingContext: missing.context,
        missingOptional: missing.expected, // 兼容 v1.1.25 及之前的字段名
        at: new Date().toISOString(),
      };
      try {
        window.__dshUiHealth = { ...report, check: runSelectorHealthCheck, anchors: HOST_ANCHORS };
      } catch (e) {}
      if (missing.required.length) {
        console.warn('[dsh-ui] 选择器自检：关键锚点未命中（宿主升级可能导致皮肤失效）:', missing.required.join(', '), report);
      } else if (missing.expected.length || missing.context.length) {
        console.info('[dsh-ui] 选择器自检通过（未命中的 expected/context 锚点与当前视图相关，属预期）:', {
          missingExpected: missing.expected,
          missingContext: missing.context,
        });
      } else {
        console.log('[dsh-ui] 选择器自检全部命中');
      }
      return report;
    }

    function scanAndEnhance() {
      ensureStyles();
      ensureRail();
      ensureNavButtons();
      syncSendButtonState();
      // v1.1.37：工作区行搜索入口补位（放最前，免疫后续语句异常）
      ensureWorkspaceSearch();

      // —— 侧栏收起宽度锁定（E2）：与 ChatGPT 桌面版行为对齐——收起侧栏时
      //    内容保持展开态宽度、只重新居中；再展开恢复原宽。
      //    (a) 欢迎区：锁定 .Dc7zOa_composerHero 容器（--dsh-hero-lock-w）；
      //    (b) 会话模式：锁定"消息线程 + 输入卡片"的最低公共祖先列
      //        （运行时发现并打标记类 dsh-conv-lock-target，--dsh-conv-lock-w）。
      //    CSS 按 data-sidebar-collapsed 属性即时收放，不依赖扫描触发。
      //    只在宽度变化时写 localStorage，避免每次扫描产生存储抖动。
      try {
        const frameEl = document.querySelector(NATIVE_FRAME_SEL) || document.querySelector('.BynINW_frame');
        const sidebarCollapsed = !!(frameEl && frameEl.hasAttribute('data-sidebar-collapsed'));
        const inConversation = !!document.querySelector('[data-message-id]');
        const lockRoot = document.documentElement;

        // 清理此前可能被异常压缩/动画过渡期间记录的过窄宽度缓存（健康卡片通常在 600px 以上）
        try {
          const storedHero = parseInt(localStorage.getItem('dsh_hero_lock_w') || '', 10);
          if (storedHero > 0 && storedHero < 600) localStorage.removeItem('dsh_hero_lock_w');
          const currentHeroVal = parseInt(lockRoot.style.getPropertyValue('--dsh-hero-lock-w') || '', 10);
          if (currentHeroVal > 0 && currentHeroVal < 600) lockRoot.style.removeProperty('--dsh-hero-lock-w');

          const storedConv = parseInt(localStorage.getItem('dsh_conv_lock_w') || '', 10);
          if (storedConv > 0 && storedConv < 600) localStorage.removeItem('dsh_conv_lock_w');
          const currentConvVal = parseInt(lockRoot.style.getPropertyValue('--dsh-conv-lock-w') || '', 10);
          if (currentConvVal > 0 && currentConvVal < 600) lockRoot.style.removeProperty('--dsh-conv-lock-w');
        } catch (e) {}

        const isMeasuringAllowed = !sidebarCollapsed && !homeDrawerOpen && !isHostModeActive();

        // (a) 欢迎区（仅在非会话态记录，避免会话里复用同类容器时污染变量）
        if (!inConversation) {
          const heroLockEl = document.querySelector('.Dc7zOa_composerHero, [class*="composerHero"]')
            || document.querySelector('.RlGAzG_card, [data-composer-card]');
          if (heroLockEl && heroLockEl.isConnected) {
            if (isMeasuringAllowed) {
              const w = Math.round(heroLockEl.getBoundingClientRect().width);
              if (w >= 600 && lockRoot.style.getPropertyValue('--dsh-hero-lock-w') !== w + 'px') {
                lockRoot.style.setProperty('--dsh-hero-lock-w', w + 'px');
                try { localStorage.setItem('dsh_hero_lock_w', String(w)); } catch (e) {}
              }
            } else if (!lockRoot.style.getPropertyValue('--dsh-hero-lock-w')) {
              // 冷启动即收起态：先用上次会话记录的宽度校准（仅接受健康有效值）
              const stored = parseInt(localStorage.getItem('dsh_hero_lock_w') || '', 10);
              if (stored >= 600) lockRoot.style.setProperty('--dsh-hero-lock-w', stored + 'px');
            }
          }
        }

        // (b) 会话模式：输入卡片与消息的最低公共祖先（LCA），打标记类交由 CSS 收放
        let convLca = null;
        if (inConversation) {
          const convCard = document.querySelector('.RlGAzG_card, [data-composer-card]');
          const convMsg = document.querySelector('[data-message-id]');
          if (convCard && convMsg) {
            const chain = new Set();
            let a = convCard.parentElement;
            while (a && a !== document.body) { chain.add(a); a = a.parentElement; }
            let b = convMsg.parentElement;
            while (b && b !== document.body) {
              if (chain.has(b)) { convLca = b; break; }
              b = b.parentElement;
            }
          }
        }
        // 标记迁移：发现新目标时迁移标记；瞬时未发现（流式渲染中段等）保留旧标记
        if (convLca && convLockTarget !== convLca) {
          if (convLockTarget) convLockTarget.classList.remove('dsh-conv-lock-target');
          convLca.classList.add('dsh-conv-lock-target');
          convLockTarget = convLca;
        }
        if (convLockTarget && convLockTarget.isConnected) {
          if (isMeasuringAllowed) {
            const w = Math.round(convLockTarget.getBoundingClientRect().width);
            if (w >= 600 && lockRoot.style.getPropertyValue('--dsh-conv-lock-w') !== w + 'px') {
              lockRoot.style.setProperty('--dsh-conv-lock-w', w + 'px');
              try { localStorage.setItem('dsh_conv_lock_w', String(w)); } catch (e) {}
            }
          } else if (!lockRoot.style.getPropertyValue('--dsh-conv-lock-w')) {
            const stored = parseInt(localStorage.getItem('dsh_conv_lock_w') || '', 10);
            if (stored >= 600) lockRoot.style.setProperty('--dsh-conv-lock-w', stored + 'px');
          }
        }
      } catch (e) { dbg('sidebar width lock failed', e); }

      // 0. Check whether we are in Hero mode (创建新对话) or Conversation mode (正在对话)
      const wsRow = document.querySelector('.Dc7zOa_heroWorkspaceRow, [class*="heroWorkspaceRow"]');
      const composerHero = document.querySelector('.Dc7zOa_composerHero, [class*="composerHero"]');
      // Existence-only probes, one query each. hasHeroMarker covers both the headline and
      // the phase marker; its truthiness equals the previous three separate queries OR'd.
      // hasChatMessages intentionally keys on the host's own message marker ONLY: a
      // [class*="bubble"] heuristic here made the hero state flip whenever ANY third-party
      // widget (whale mascot bubbles, skins, tooltips) showed a bubble-classed element,
      // removing and re-adding the bottom bar — visible as page-wide jitter on new chats.
      const hasHeroMarker = !!document.querySelector('.Hqq-bq_root, [data-phase="hero"], [data-content-phase="hero"]');
      const hasChatMessages = !!document.querySelector('[data-message-id]');

      const isHeroState = !hasChatMessages && !!(wsRow || composerHero || hasHeroMarker);

      if (!isHeroState) {
        // Active conversation mode: remove lingering bottom bar and close popovers
        document.querySelectorAll('.dsh-ag-bottom-bar').forEach(b => b.remove());
        closePopover();
      } else {
        // Hero mode (创建新对话): attach bottom bar to hero container
        let heroContainer = wsRow ? wsRow.parentElement : composerHero;
        if (!heroContainer) {
          const inputCard = document.querySelector('.RlGAzG_root');
          if (inputCard && inputCard.parentElement) {
            heroContainer = inputCard.parentElement;
          }
        }
        if (heroContainer) {
          attachBottomBar(heroContainer);
        }
      }

      // Ensure NO orphan skill or plugin chip ever exists outside the bottom bar
      document.querySelectorAll('.dsh-ag-skill-chip, .dsh-ag-plugin-chip').forEach(chip => {
        if (!chip.closest('.dsh-ag-bottom-bar')) {
          chip.remove();
        }
      });

      // 2. Enhance top-left workspace row (工作区选择 + 标准模式 仅这两个按钮)
      const rows = document.querySelectorAll('.Dc7zOa_heroWorkspaceRow, [class*="heroWorkspaceRow"]');
      rows.forEach(row => {
        // Strip any accidental stray chips from workspace row
        row.querySelectorAll('.dsh-ag-skill-chip, .dsh-ag-plugin-chip').forEach(c => c.remove());

        sanitizeWorkspaceLabel(row);
        replaceWorkspaceFolderIcon(row);
        replaceModeIcon(row);
      });

      // 图标替换限定在会话区域内（旧版每次扫描都对 document 全量跑
      // [class*=] 子串选择器，长会话大 DOM 下成本高）；区域缺失时回退
      // document 保持原行为。
      const iconScanScope = (wsRow && wsRow.closest('[data-conversation-region]'))
        || (composerHero && composerHero.closest('[data-conversation-region]'))
        || document;
      replaceAllWorkspaceIcons(iconScanScope);
      replaceAllModeIcons(iconScanScope);

      if (document.querySelector('._3tUStW_list, [role="menu"]')) {
        enhancePresetMenuItems();
      }
    }

    // --- Leading-edge rAF scan scheduler ---
    // Fires on the NEXT animation frame after a DOM mutation (~16ms response time)
    // Observer disconnect/reconnect during scan prevents self-triggered mutation loops.
    // Trailing safety timer (80ms) catches late mutations during the disconnect window.
    let scanRafId = null;
    let trailingScanTimer = null;
    let mutationObserver = null;
    let healthCheckTimerId = null;
    const TRAILING_SCAN_MS = 80;

    function scheduleScan() {
      // 后台标签页不扫描（后台 rAF 本来就被节流，显式跳过省一次定时器
      // 噪音与无效 DOM 遍历）；回到前台时由 visibilitychange 补扫。
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!scanRafId) {
        scanRafId = requestAnimationFrame(() => {
          scanRafId = null;
          executeScan();
        });
      }
      if (trailingScanTimer) clearTimeout(trailingScanTimer);
      trailingScanTimer = setTimeout(() => {
        trailingScanTimer = null;
        if (!scanRafId) {
          scanRafId = requestAnimationFrame(() => {
            scanRafId = null;
            executeScan();
          });
        }
      }, TRAILING_SCAN_MS);
    }

    function executeScan() {
      if (mutationObserver) mutationObserver.disconnect();
      try {
        scanAndEnhance();
      } catch (e) {}
      if (mutationObserver) {
        mutationObserver.observe(document.body, { childList: true, subtree: true });
      }
    }

    function scheduleImmediateScan() {
      if (scanRafId) return;
      scanRafId = requestAnimationFrame(() => {
        scanRafId = null;
        executeScan();
      });
    }

    return {
      inject: ['slots', 'layout', 'uiWorkspace'],
      apply(ctx) {
        dshCtx = ctx;
        ensureStyles();

        // 订阅全局面板切换，实时同步固定栏激活态
        try {
          const layout = dshCtx && (dshCtx.layout || (typeof dshCtx.get === 'function' ? dshCtx.get('layout') : null));
          if (layout && layout.panelInfo && typeof layout.panelInfo.subscribe === 'function') {
            const unsubRailPanel = layout.panelInfo.subscribe(() => syncRailActive());
            if (typeof unsubRailPanel === 'function') railPanelUnsubscribe = unsubRailPanel;
          }
        } catch (e) { dbg('panelInfo.subscribe failed', e); }

        // 注册「用量统计」独立主面板（中央整页，与插件/定时任务面板同机制）
        try {
          if (ctx.slots && typeof ctx.slots.inject === 'function') {
            ctx.slots.inject('main', () => ctx.slots.register({
              name: 'main',
              key: 'usage',
              inject: () => ({})
            }, RailUsagePanelPage));
          }
        } catch (e) { dbg('slots.inject(usage) failed', e); }

        // Warm live skills and plugins catalog
        fetchLiveSkills().catch(() => {});
        fetchLivePlugins().catch(() => {});

        // Attach dynamic reactive input listeners for send button (throttled)
        const inputHandler = throttledSyncSendButton;
        const onVisibilityChange = () => {
          if (typeof document !== 'undefined' && !document.hidden) scheduleImmediateScan();
        };
        if (typeof document !== 'undefined') {
          document.addEventListener('input', inputHandler, true);
          document.addEventListener('compositionend', inputHandler, true);
          document.addEventListener('keyup', inputHandler, true);
          document.addEventListener('paste', inputHandler, true);
          document.addEventListener('visibilitychange', onVisibilityChange);
        }

        // Run initial scan immediately
        scheduleImmediateScan();
        // 选择器健康自检：启动 3s 后执行一次（等首帧渲染完成）
        healthCheckTimerId = setTimeout(runSelectorHealthCheck, 3000);
        // 头像诊断窗口：启动后 90 秒内随扫描每 5 秒落盘一次真实 DOM/样式
        avatarDumpDeadline = Date.now() + AVATAR_DUMP_WINDOW_MS;
        setTimeout(dumpAvatarDiagnostics, 4000);
        // 后台帧节流时 rAF 可能延迟，先直接挂载固定栏与导航按钮（body 未就绪时内部会跳过）
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            ensureStyles();
            ensureRail();
            ensureNavButtons();
          }, { once: true });
        } else {
          ensureRail();
          ensureNavButtons();
        }

        // Observe DOM for workspace row updates (e.g. navigation, new sessions)
        if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
          mutationObserver = new MutationObserver(() => {
            scheduleScan();
          });
          mutationObserver.observe(document.body, { childList: true, subtree: true });

          ctx.on?.('dispose', () => {
            if (trailingScanTimer) { clearTimeout(trailingScanTimer); trailingScanTimer = null; }
            if (healthCheckTimerId) { clearTimeout(healthCheckTimerId); healthCheckTimerId = null; }
            if (scanRafId) { cancelAnimationFrame(scanRafId); scanRafId = null; }
            if (syncRafId) { cancelAnimationFrame(syncRafId); syncRafId = null; }
            if (enhancePresetRafId) { cancelAnimationFrame(enhancePresetRafId); enhancePresetRafId = null; }
            if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
            closePopover();
            closeExecPopover();
            teardownRail();
            teardownNavButtons();
            document.removeEventListener('input', inputHandler, true);
            document.removeEventListener('compositionend', inputHandler, true);
            document.removeEventListener('keyup', inputHandler, true);
            document.removeEventListener('paste', inputHandler, true);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            const el = document.getElementById(STYLE_TAG_ID);
            if (el) el.remove();
          });
        }
      }
    };
  }
});
