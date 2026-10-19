/**
 * DSH-UI 首页悬浮抽屉 —— 无头仿真测试（node:test）
 *
 * v1.1.25 起抽屉改为「原生侧栏托管模式」：不再自绘 DOM，hover 首页按钮时
 * toggleSidebar 展开宿主宽态侧栏，并把 [class*="_sidebarCol"] 套进悬浮卡片壳。
 * 本测试验证托管生命周期与防推挤契约：
 *   · 只有侧栏收起态才可能唤起；虚假 mouseenter 不唤起
 *   · 唤起 = toggleSidebar + html 托管模式类 + grid-template-columns 钉扎（important）
 *   · 宿主展开完成（属性移除）后：侧栏列挂上 dsh-native-host 卡片壳
 *   · 移出热区 = 先淡出（closing 类）→ 180ms 后真正收回（二次 toggle + 解钉）
 *   · 淡出途中回移取消；外力（用户原生收起）立即收尾且不重复 toggle
 *   · 不再自绘任何抽屉 DOM（品牌/胶囊/分组全部原生渲染）
 *
 * 运行： node --test tests/bridge.test.mjs tests/home-drawer.test.mjs
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const clientSrc = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');

/** 每次 loadClient 重建的 MutationObserver 实例表（供测试手动触发属性变更） */
const envObservers = [];

// ---------------------------------------------------------------------------
// 极简 DOM 仿真
// ---------------------------------------------------------------------------
class FakeClassList {
  constructor(el) { this.el = el; }
  _set() { return new Set(String(this.el.className || '').split(/\s+/).filter(Boolean)); }
  add(...names) { const s = this._set(); names.forEach(n => s.add(n)); this.el.className = [...s].join(' '); }
  remove(...names) { const s = this._set(); names.forEach(n => s.delete(n)); this.el.className = [...s].join(' '); }
  contains(n) { return this._set().has(n); }
  toggle(n, force) {
    const want = force === undefined ? !this.contains(n) : !!force;
    if (want) this.add(n); else this.remove(n);
    return want;
  }
}

/** 选择器匹配：支持逗号分组、后代/子代组合（"A B" / "A > B"），
 *  以及 #id / .class / tag / [attr] / [attr="v"] / [attr*="v"] */
function matchesSelector(el, selector) {
  return String(selector).split(',').some((part) => matchesSequence(el, part.trim()));
}

function matchesSequence(el, selector) {
  const segs = selector.split('>');
  if (segs.length === 1) {
    const tokens = selector.trim().split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) return matchesSimple(el, tokens[0] || '');
    if (!matchesSimple(el, tokens[tokens.length - 1])) return false;
    let node = el.parentNode;
    for (let i = tokens.length - 2; i >= 0; i--) {
      let found = false;
      while (node) {
        if (matchesSimple(node, tokens[i])) { found = true; node = node.parentNode; break; }
        node = node.parentNode;
      }
      if (!found) return false;
    }
    return true;
  }
  const last = segs[segs.length - 1].trim();
  if (!matchesSimple(el, last)) return false;
  let node = el.parentNode;
  for (let i = segs.length - 2; i >= 0; i--) {
    const sel = segs[i].trim();
    let found = false;
    while (node) {
      if (matchesSimple(node, sel)) { found = true; node = node.parentNode; break; }
      node = node.parentNode;
    }
    if (!found) return false;
  }
  return true;
}

function matchesSimple(el, sel) {
  if (!el || !sel) return false;
  const tokens = sel.match(/(^[a-zA-Z][\w-]*)|(#[\w-]+)|(\.[\w-]+)|(\[[^\]]+\])/g);
  if (!tokens) return false;
  return tokens.every((t) => {
    if (t.startsWith('#')) return el.id === t.slice(1);
    if (t.startsWith('.')) return el.classList.contains(t.slice(1));
    if (t.startsWith('[')) {
      // 属性名用显式字符类（惰性量词会被尾部 "?]" 抢字符，导致 [data-x] 只捕获 "d"）
      const m = /^\[\s*([A-Za-z_][\w-]*)\s*(?:(\*?=)\s*"?([^"\]]*)"?\s*)?\]$/.exec(t);
      if (!m) return false;
      const [, attr, op, val] = m;
      const actual = el.getAttribute(attr);
      if (op === undefined) return actual !== null;
      const a = String(actual === null ? '' : actual);
      return op === '*=' ? a.includes(val) : a === val;
    }
    return el.tagName === t.toUpperCase();
  });
}

class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.classList = new FakeClassList(this);
    this.dataset = {};
    this.style = { cssText: '', setProperty() {}, getPropertyValue: () => '', removeProperty() {} };
    this.attributes = {};
    this._html = '';
    this._listeners = new Map();
    this.nodeType = 1;
    this.isConnected = true;
    this.textContent = '';
    this.value = '';
    this.id = '';
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'id') this.id = String(v);
    if (k === 'class') this.className = String(v);
    // data-* 与 dataset 双向同步（真实 DOM 中二者本是一体）
    if (k.startsWith('data-')) {
      this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v);
    }
  }
  getAttribute(k) {
    if (k in this.attributes) return this.attributes[k];
    // 支持 dataset 侧直接写入后按属性名读取（data-group-key -> dataset.groupKey）
    if (k.startsWith('data-')) {
      const key = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (Object.prototype.hasOwnProperty.call(this.dataset, key)) return this.dataset[key];
    }
    return null;
  }
  removeAttribute(k) { delete this.attributes[k]; }
  hasAttribute(k) { return k in this.attributes; }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const arr = this._listeners.get(type);
    if (!arr) return;
    this._listeners.set(type, arr.filter(x => x !== fn));
  }
  /** 派发事件（冒泡到祖先，供委托处理器接收） */
  dispatch(type, detail = {}) {
    const evt = {
      type,
      target: this,
      stopPropagation() { evt._stopped = true; },
      preventDefault() {},
      ...detail,
    };
    let node = this;
    while (node) {
      const arr = node._listeners.get(type) || [];
      for (const fn of arr) fn({ ...evt, currentTarget: node });
      if (evt._stopped) break;
      node = node.parentNode;
    }
    return evt;
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    child.isConnected = this.isConnected;
    this.children.push(child);
    return child;
  }
  insertBefore(child, ref) {
    const i = this.children.indexOf(ref);
    if (i < 0) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.splice(i, 0, child);
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
    child.isConnected = false;
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(node) {
    if (node === this) return true;
    return this.children.some(c => c.contains(node));
  }
  closest(sel) {
    let node = this;
    while (node) {
      if (node.nodeType === 1 && matchesSelector(node, sel)) return node;
      node = node.parentNode;
    }
    return null;
  }
  matches(sel) { return matchesSelector(this, sel); }
  /** 几何：测试可显式指派 __rect（{left,top,width,height}），未指派时返回空矩形 */
  getBoundingClientRect() {
    if (this.__rect) {
      const { left, top, width, height } = this.__rect;
      return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
    }
    if (this.tagName === 'SVG' && this.parentNode && this.parentNode.__rect) {
      const pr = this.parentNode.__rect;
      const w = Number(this.getAttribute('width')) || 22;
      const h = Number(this.getAttribute('height')) || 22;
      const l = pr.left + Math.max(0, (pr.width - w) / 2);
      const t = pr.top + Math.max(0, (pr.height - h) / 2);
      return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t };
    }
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 };
  }
  get innerHTML() {
    // 模拟真实浏览器的序列化：由当前子节点树即时拼出（这样对嵌套容器
    // 内部再次赋值 innerHTML 后，父级读取也能看到新内容）
    const serialize = (el) => {
      const attrs = [];
      if (el.id) attrs.push(`id="${el.id}"`);
      if (el.className) attrs.push(`class="${el.className}"`);
      for (const [k, v] of Object.entries(el.attributes)) {
        if (k === 'id' || k === 'class') continue;
        attrs.push(`${k}="${v}"`);
      }
      for (const [k, v] of Object.entries(el.dataset)) {
        attrs.push(`data-${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}="${v}"`);
      }
      const open = `<${el.tagName.toLowerCase()}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
      if (/^(svg|iframe)$/i.test(el.tagName)) return open;
      const inner = el.children.length ? el.children.map(serialize).join('') : el.textContent;
      return `${open}${inner}</${el.tagName.toLowerCase()}>`;
    };
    return this.children.map(serialize).join('');
  }
  set innerHTML(html) {
    this.children.forEach((c) => { c.parentNode = null; c.isConnected = false; });
    this.children = [];
    this._html = String(html);
    // 依次扫描「标签」与「文本」：文本挂到当前节点（模拟浏览器的文本节点语义）
    const tokenRe = /<(\/?)(div|button|span|svg|iframe|p)\b([^>]*?)(\/?)>|([^<]+)/gi;
    const stack = [this];
    let m;
    while ((m = tokenRe.exec(this._html))) {
      const [, closing, tag, attrs, selfClose, text] = m;
      if (text !== undefined) {
        const t = text.trim();
        if (t) {
          const cur = stack[stack.length - 1];
          cur.textContent = (cur.textContent || '') + t;
        }
        continue;
      }
      if (closing) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const el = new FakeElement(tag);
      for (const am of String(attrs).matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) {
        const k = am[1], v = am[2];
        if (k === 'class') el.className = v;
        else if (k.startsWith('data-')) el.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
        else el.setAttribute(k, v);
      }
      stack[stack.length - 1].appendChild(el);
      // 自闭合写法才不入栈；<svg>/<iframe> 仍是容器，必须正确配对闭合
      if (!selfClose) stack.push(el);
    }
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      for (const c of node.children) { if (matchesSelector(c, sel)) out.push(c); walk(c); }
    };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  findById(id) {
    if (this.id === id) return this;
    for (const c of this.children) {
      const hit = c.findById(id);
      if (hit) return hit;
    }
    return null;
  }
  get firstElementChild() { return this.children[0] || null; }
}

function buildDom() {
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const documentElement = new FakeElement('html');
  const docListeners = new Map();
  const observers = [];

  /* MutationObserver 仿真：目标上的 childList 变更进入队列，由 flushMutations()
     同步触发回调。这样测试能在确定时刻模拟「DOM 变动 → 扫描循环」，避免依赖时序。
     每个 (observer, target) 只挂一个队列槽位，flush 期间产生的新变动进入下一轮。 */
  class FakeMutationObserver {
    constructor(cb) { this.cb = cb; this.targets = []; this.disconnected = false; }
    observe(target) {
      this.targets.push(target);
      if (!target._observers) target._observers = [];
      if (!target._observers.includes(this)) target._observers.push(this);
      if (!observers.includes(this)) observers.push(this);
    }
    disconnect() {
      this.targets.forEach((t) => {
        if (t._observers) t._observers = t._observers.filter(o => o !== this);
      });
      this.targets = [];
      this.disconnected = true;
    }
    takeRecords() { return []; }
  }

  const documentStub = {
    body,
    head,
    documentElement,
    readyState: 'complete',
    hidden: false,
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (_ns, tag) => new FakeElement(tag),
    getElementById: (id) => body.findById(id),
    querySelector: (sel) => body.querySelector(sel) || head.querySelector(sel)
      || (matchesSelector(documentElement, sel) ? documentElement : null),
    querySelectorAll: (sel) => [...body.querySelectorAll(sel), ...head.querySelectorAll(sel)],
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = docListeners.get(type);
      if (arr) docListeners.set(type, arr.filter(x => x !== fn));
    },
    /** 模拟真实事件流：触发 document 级监听（捕获语义） */
    emit(type, target, detail = {}) {
      const arr = docListeners.get(type) || [];
      arr.forEach(fn => fn({
        type, target, currentTarget: documentStub,
        stopPropagation() {}, preventDefault() {},
        ...detail,
      }));
    },
    listenerCount(type) { return (docListeners.get(type) || []).length; },
    observers,
  };

  // 元素插入/移除要通知观察者（MutationObserver 语义）
  if (!FakeElement.prototype.__mutationPatched) {
    FakeElement.prototype.__mutationPatched = true;
    const notify = (self, child) => {
      const records = [{ type: 'childList', target: self, addedNodes: [child] }];
      (self._observers || []).forEach((o) => {
        if (!o.__queue) o.__queue = [];
        o.__queue.push(records);
      });
    };
    const nativeAppend = FakeElement.prototype.appendChild;
    FakeElement.prototype.appendChild = function (child) {
      const out = nativeAppend.call(this, child);
      notify(this, child);
      return out;
    };
    const nativeRemove = FakeElement.prototype.removeChild;
    FakeElement.prototype.removeChild = function (child) {
      const out = nativeRemove.call(this, child);
      notify(this, child);
      return out;
    };
  }

  return { documentStub, body, head, documentElement };
}

// ---------------------------------------------------------------------------
// 宿主 ctx 桩
// ---------------------------------------------------------------------------
function buildCtx(calls) {
  const now = Date.now();
  const sessions = {
    list: {
      getSnapshot: () => ({
        ids: ['s-current', 's-old'],
        byId: {
          's-current': { id: 's-current', title: '影栖坞 · 分镜优化', updatedAt: now - 60_000, retainedBy: { mainView: 1 } },
          's-old': { id: 's-old', title: '旧会话', updatedAt: now - 3 * 3600_000, retainedBy: {} },
        },
      }),
    },
  };
  const workspaces = {
    list: {
      getSnapshot: () => ({
        phase: 'ready',
        items: [{ workspaceId: 'ws-1', title: '影栖坞', path: 'C:/proj/影栖坞', sessionIds: ['s-current'] }],
        archivedSessionIds: [],
        pinnedSessionIds: [],
      }),
    },
  };
  const uiWorkspace = {
    openSession: (id) => calls.push(['openSession', id]),
    startSession: () => calls.push(['startSession']),
  };
  const layout = {
    toggleSidebar: () => calls.push(['toggleSidebar']),
  };
  return {
    get: (name) => ({ sessions, workspaces, uiWorkspace, layout }[name] || null),
    sessions, workspaces, uiWorkspace, layout,
    on() {},
    slots: { inject() {}, register: () => ({}) },
  };
}

// ---------------------------------------------------------------------------
function loadClient() {
  const dom = buildDom();
  const calls = [];
  const modules = { react: { createElement: () => ({}) } };
  let loaded = null;
  const win = {
    __ModuleLoader__: { load: (mod) => { loaded = mod; } },
    __dshUiHealth: null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    location: { href: 'http://127.0.0.1:3080/' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    innerHeight: 900,
    innerWidth: 1400,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };
  const g = globalThis;
  const keys = ['window', 'document', 'localStorage', 'location', 'navigator', 'MutationObserver',
    'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'getComputedStyle'];
  const saved = Object.create(null);
  for (const k of keys) saved[k] = Object.getOwnPropertyDescriptor(g, k);
  const setGlobal = (k, v) => Object.defineProperty(g, k, {
    value: v, writable: true, configurable: true, enumerable: true,
  });

  setGlobal('window', win);
  setGlobal('document', dom.documentStub);
  setGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  setGlobal('location', win.location);
  setGlobal('navigator', { platform: 'Win32', userAgent: 'node-test' });
  setGlobal('getComputedStyle', win.getComputedStyle);
  // MutationObserver 仿真：记录观察目标，测试可通过 triggerSidebarAttrChange 触发
  envObservers.length = 0;
  setGlobal('MutationObserver', class {
    constructor(cb) { this.cb = cb; this.targets = []; }
    observe(target) { this.targets.push(target); envObservers.push(this); }
    disconnect() { this.targets = []; }
    takeRecords() { return []; }
  });
  setGlobal('requestAnimationFrame', (fn) => setTimeout(fn, 0));
  setGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
  setGlobal('fetch', () => Promise.reject(new Error('no network in test')));

  const run = new Function(
    'window', 'document', 'localStorage', 'location', 'navigator', 'MutationObserver',
    'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'getComputedStyle', 'require',
    clientSrc
  );
  run(win, dom.documentStub, g.localStorage, win.location, g.navigator, g.MutationObserver,
    g.requestAnimationFrame, g.cancelAnimationFrame, g.fetch, g.getComputedStyle,
    (name) => modules[name]);

  const restore = () => {
    for (const k of keys) {
      const desc = saved[k];
      if (desc === undefined) delete g[k];
      else Object.defineProperty(g, k, desc);
    }
  };
  return { module: loaded, dom, calls, win, restore, ctx: buildCtx(calls) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
let env;

before(async () => {
  env = loadClient();
  assert.ok(env.module, 'client.js 应以 __ModuleLoader__.load 注册模块');
  assert.equal(env.module.id, '@local/dsh-ui');

  const mod = env.module.factory((name) => (name === 'react' ? { createElement: () => ({}) } : {}));
  mod.apply(env.ctx);
  await sleep(20);

  // 事件与变更辅助
  env.movePointerToButton = (x = 32, y = 32) => {
    env.dom.documentStub.emit('mousemove', env.homeBtn, { clientX: x, clientY: y, relatedTarget: null });
  };
  env.movePointerToCol = (x = 200, y = 300) => {
    env.dom.documentStub.emit('mousemove', env.col, { clientX: x, clientY: y, relatedTarget: null });
  };
  env.movePointerOutside = (x = 900, y = 700) => {
    env.dom.documentStub.emit('mousemove', env.dom.body, { clientX: x, clientY: y, relatedTarget: null });
  };
  env.leaveButton = (relatedTarget = null) => {
    env.dom.documentStub.emit('mouseleave', env.homeBtn, { relatedTarget });
  };
  env.enterButton = () => {
    env.dom.documentStub.emit('mouseenter', env.homeBtn, { relatedTarget: null });
  };
  // 模拟「DOM 变动 → 扫描循环」：同步冲掉排队中的变更通知（含回调内产生的连锁变更）
  env.flushMutations = () => {
    const list = env.dom.documentStub.observers || [];
    for (let round = 0; round < 8; round++) {
      let pending = false;
      list.forEach((o) => {
        if (o.__queue && o.__queue.length) {
          const records = o.__queue.splice(0, o.__queue.length);
          pending = true;
          try { o.cb(records, o); } catch (e) {}
        }
      });
      if (!pending) break;
    }
  };

  const { body } = env.dom;
  // 首页按钮（插件在 #dsh-ui-rail 自绘；万一未挂载则补建同结构按钮）
  await sleep(40);   // 等首次扫描把固定栏挂上（scan → ensureRail）
  let rail = env.dom.documentStub.querySelector('#dsh-ui-rail');
  if (!rail) {
    rail = new FakeElement('div');
    rail.id = 'dsh-ui-rail';
    body.appendChild(rail);
  }
  let railBtn = rail.querySelector('[data-rail-action="home"]');
  if (!railBtn) {
    railBtn = new FakeElement('button');
    railBtn.className = 'dsh-rail-btn';
    railBtn.dataset.railAction = 'home';
    rail.appendChild(railBtn);
  }
  railBtn.__rect = { left: 0, top: 0, width: 64, height: 64 };
  env.homeBtn = railBtn;

  // 宿主 app frame：收起标记 + grid 模板钉扎观测
  const frame = new FakeElement('div');
  frame.setAttribute('class', 'pI_x6G_frame');
  frame.setAttribute('data-sidebar-collapsed', 'true');
  env.styleCalls = [];
  frame.style.gridTemplateColumns = '64px minmax(0, 1fr)';
  const origSet = frame.style.setProperty.bind(frame.style);
  frame.style.setProperty = (k, v, p) => { env.styleCalls.push(['set', k, v, p]); return origSet(k, v, p); };
  const origRemove = frame.style.removeProperty.bind(frame.style);
  frame.style.removeProperty = (k) => { env.styleCalls.push(['remove', k]); return origRemove(k); };
  body.appendChild(frame);
  env.frame = frame;

  // 宿主侧栏列 = 卡片壳挂载点
  const col = new FakeElement('div');
  col.setAttribute('class', 'pI_x6G_sidebarCol');
  frame.appendChild(col);
  col.__rect = { left: 70, top: 54, width: 268, height: 400 };
  env.col = col;

  env.flushMutations();
  await sleep(60);
  // 属性观察器由 ensureHomeDrawer 的自愈定时器（启动后 20s 内每秒重试）补挂到
  // frame 上；等满一个自愈周期，确保后续用例触发属性变更时观察器已就位。
  await sleep(1100);

  // 模拟宿主侧栏展开/收起（真实宿主由 toggleSidebar 驱动；测试同步改属性并
  // 触发观察器——异步 setTimeout 会造成跨用例时序竞争，同步触发是确定性的）
  env.fireAttrObservers = () => {
    envObservers
      .filter(o => o.targets.includes(env.frame))
      .forEach(o => o.cb([{ type: 'attributes', target: env.frame }]));
  };
  env.expandSidebar = () => {
    env.frame.removeAttribute('data-sidebar-collapsed');
    env.fireAttrObservers();
  };
  env.collapseSidebar = () => {
    env.frame.setAttribute('data-sidebar-collapsed', 'true');
    env.fireAttrObservers();
  };
  env.toggleCalls = () => env.calls.filter(c => c[0] === 'toggleSidebar').length;
  env.htmlHasMode = () => env.dom.documentElement.classList.contains('dsh-native-host-mode');
  env.colHosted = () => env.col.classList.contains('dsh-native-host');
  env.colClosing = () => env.col.classList.contains('dsh-native-host-closing');
});

// ---------------------------------------------------------------------------
test('托管模式：不自绘任何抽屉 DOM（内容全部由原生侧栏提供）', () => {
  assert.equal(env.dom.documentStub.getElementById('dsh-ui-home-drawer'), null, '不应再挂载自绘抽屉节点');
  assert.equal(env.dom.documentStub.querySelector('.dsh-drawer-group'), null, '不应有自绘分组');
  assert.equal(env.dom.documentStub.querySelector('.dsh-drawer-brand-logo'), null, '不应有自绘品牌行');
  assert.doesNotMatch(clientSrc, /HOME_DRAWER_LOGO_SVG|HOME_DRAWER_NEW_SVG|HOME_DRAWER_FOLDER_SVG/,
    '自绘 SVG 常量应已退役');
});

test('卡片壳几何与辅助压制契约锁进 CSS（托管模式）', () => {
  assert.match(clientSrc, /\.dsh-native-host \{[\s\S]*?left: 6px !important;/, '壳 left 6');
  assert.match(clientSrc, /top: calc\(var\(--dsh-windows-titlebar-height, 48px\) \+ 6px\) !important;/, 'top 标题栏+6');
  assert.match(clientSrc, /bottom: 14px !important;/, 'bottom 14');
  assert.match(clientSrc, /width: 268px !important;/, 'width 268');
  assert.match(clientSrc, /border-radius: 14px !important;/, 'radius 14');
  assert.match(clientSrc, /z-index: 1000 !important;/, 'z-index 1000');
  assert.match(clientSrc, /@keyframes dsh-native-host-in/, '入场动画');
  assert.match(clientSrc, /\.dsh-native-host-closing \{[\s\S]*?opacity: 0 !important;/, '淡出态');
  assert.match(clientSrc, /html\.dsh-native-host-mode \[class\*="_frame"\] \{[\s\S]*?transition: none !important;/,
    '压制 grid 模板动画');
  assert.match(clientSrc, /html\.dsh-native-host-mode \[class\*="_handle"\] \{[\s\S]*?display: none !important;/,
    '隐藏拖拽手柄');
  assert.match(clientSrc, /\[data-ds-dark-theme\] \.dsh-native-host \{/, '深色主题壳适配');
  assert.match(clientSrc, /prefers-reduced-motion: reduce/, '尊重减少动效');
  assert.match(clientSrc, /\[data-windows-titlebar\] \[class\*="_newSession"\]:not\(\[class\*="_sidebarCol"\] \*\) \{[\s\S]*?display: none !important;/,
    '隐藏规则只作用于侧栏列之外（顶部栏 ⊕）；胶囊保持宿主原生布局（v1.1.31）');
  assert.doesNotMatch(clientSrc, /html\.dsh-native-host-mode\[data-windows-titlebar\] \[class\*="_newSession"\]/,
    '不得再用 !important 豁免覆盖胶囊 display（会破坏原生居中）');
  assert.doesNotMatch(clientSrc, /\[class\*="_frame"\]:not\(\[data-sidebar-collapsed\]\) \[class\*="_sidebarCol"\] \[class\*="_newSession"\]/,
    '不得再存在 v1.1.30 的 display 覆盖规则');
  assert.match(clientSrc, /\[data-windows-titlebar\] \[class\*="_root"\]\[class\*="_collapsed"\] \[class\*="_newSession"\] \{[\s\S]*?display: none !important;/,
    '宿主收起态浮动 ⊕ 隐藏（由常驻导航 ⊕ 接管，v1.1.33）');
  assert.match(clientSrc, /data-nav-action="new" data-tip="新建会话"/,
    '常驻 ⊕ 新建会话按钮（第 4 个导航按钮，两态常驻）');
  assert.match(clientSrc, /M2\.37091 11\.2501[\s\S]*?M8 5V11[\s\S]*?M5 8H11/,
    '常驻 ⊕ 图标与宿主 IconNewChatOutlineRegular 1:1（v1.1.34）');
  assert.match(clientSrc, /--dsh-windows-menu-start: 144px !important;/,
    '菜单起点常驻 144px（两态同值防跳动）');
  assert.match(clientSrc, /M6\.58727 11\.8586[\s\S]*?M10\.2991 10\.3933L14\.7783 14\.8725/,
    '搜索图标与宿主 IconSearchOutlineRegular 1:1（v1.1.36）');
  assert.match(clientSrc, /function ensureWorkspaceSearch/,
    '工作区行搜索入口恢复（图标组最左补位，v1.1.36）');
  assert.match(clientSrc, /\.dsh-native-host \[class\*="_sectionHeader"\] \[class\*="searchSlot"\] \{[\s\S]*?visibility: visible !important;/,
    '托管卡片内搜索槽强制可见并保持 28px 占位（v1.1.39）');
  assert.match(clientSrc, /\.dsh-native-host \[class\*="_sectionHeader"\] \{[^}]*?justify-content: flex-end !important;/,
    '托管卡片区头保持主轴右对齐（图标组贴右端，v1.1.41 撤销 v1.1.40 的左对齐翻转）');
  assert.match(clientSrc, /\.dsh-native-host \[class\*="_sectionHeader"\] \[class\*="searchSlot"\] \{[^}]*?flex: none !important;[^}]*?margin-left: auto !important;/,
    '搜索槽保留 28px 占位并补回 margin-left:auto 右顶（图标组才不会被拽到标签旁，v1.1.41）');
  assert.doesNotMatch(clientSrc, /\.dsh-native-host \[class\*="_sectionHeader"\] \{[^}]*?justify-content: flex-start !important;/,
    '不得再出现 v1.1.40 的左对齐翻转（会把三图标拽到「工作区」标签旁）');
  assert.doesNotMatch(clientSrc, /\[class\*="searchSlot"\] \{[^}]*?margin-left: 0 !important;/,
    '不得再清零搜索槽的 margin-left（等于取消把图标组顶到右端的自动外边距）');
  assert.doesNotMatch(clientSrc, /\.dsh-native-host \[class\*="searchSlot"\] \{/,
    '搜索槽规则必须限定在托管区头内，不得泛化到整个卡片（v1.1.40）');
  assert.match(clientSrc, /nativeBtn\.parentNode\.insertBefore\(mine, nativeBtn\)/,
    '注入按钮原位顶替原生按钮（零间隙同序，v1.1.39）');
  assert.match(clientSrc, /function enforceWorkspaceHeaderLayout/,
    '区头右顶除 CSS 外再用内联 !important 兜底（v1.1.41，免疫其它插件样式表覆盖）');
  assert.match(clientSrc, /header\.style\.setProperty\('justify-content', 'flex-end', 'important'\)/,
    '内联声明把托管卡片区头钉在 flex-end（图标组贴右端，v1.1.41）');
  assert.match(clientSrc, /slot\.style\.setProperty\('margin-left', 'auto', 'important'\)/,
    '内联补回搜索槽 margin-left:auto（右顶机制的关键量，v1.1.41）');
  assert.match(clientSrc, /if \(!header\.closest\('\.dsh-native-host'\)\) return;/,
    '内联强制仅限托管卡片作用域，原生侧边栏不受影响（v1.1.41）');
});

test('回归：指针未真实移动时，虚假 mouseenter 不唤起托管', async () => {
  env.enterButton();
  await sleep(30);
  assert.equal(env.toggleCalls(), 0, '未触摸（无指针移动）时不得 toggleSidebar');
  assert.ok(!env.htmlHasMode(), '不应进入托管模式');
});

test('侧栏展开态：指针移动到首页按钮上也不接管（拒绝唤起）', async () => {
  env.frame.removeAttribute('data-sidebar-collapsed');
  env.movePointerToButton();
  env.enterButton();
  await sleep(20);
  assert.equal(env.toggleCalls(), 0, '侧栏展开时不得接管');
  env.frame.setAttribute('data-sidebar-collapsed', 'true');
});

test('无点击钉住：点击首页按钮不触发托管', async () => {
  env.homeBtn.dispatch('click');
  await sleep(20);
  assert.equal(env.toggleCalls(), 0);
  assert.ok(!env.htmlHasMode());
});

test('指针真实移动到首页按钮：toggleSidebar + 模式类 + 模板钉扎（important）', async () => {
  const s0 = env.styleCalls.length;
  const t0 = env.toggleCalls();
  env.movePointerToButton(30, 26);
  await sleep(20);
  assert.equal(env.toggleCalls() - t0, 1, '应调用一次原生 toggleSidebar 展开');
  assert.ok(env.htmlHasMode(), 'html 应打托管模式类');
  const set = env.styleCalls.slice(s0).find(c => c[0] === 'set' && c[1] === 'grid-template-columns');
  assert.ok(set, '应钉住 grid-template-columns');
  assert.equal(set[2], '64px minmax(0, 1fr)', '钉扎值 = 唤起前的收起态模板');
  assert.equal(set[3], 'important', '钉扎必须 important（覆盖宿主宽态模板，聊天区不推挤）');
  env.collapseSidebar();
});

test('宿主展开完成（属性移除）后：侧栏列挂上卡片壳', async () => {
  env.movePointerToButton(31, 27);
  await sleep(20);
  env.expandSidebar();
  await sleep(20);
  assert.ok(env.colHosted(), '侧栏列应获得 dsh-native-host 卡片壳');
  env.collapseSidebar();
});

test('按钮 → 间隙 → 卡片 连贯移动不闪断', async () => {
  env.movePointerToButton(32, 28);
  await sleep(20);
  env.expandSidebar();
  await sleep(20);
  env.leaveButton(env.col);
  env.movePointerToCol();
  await sleep(260);
  assert.ok(env.colHosted(), '应保持托管');
  assert.ok(!env.colClosing(), '不应处于淡出态');
  env.collapseSidebar();
});

test('移出热区：先淡出（closing 类）→ 180ms 后真正收回并解钉', async () => {
  const t0 = env.toggleCalls();
  env.movePointerToButton(33, 29);
  await sleep(20);
  env.expandSidebar();
  await sleep(20);
  assert.ok(env.colHosted(), '前置：已托管');
  env.movePointerOutside();
  assert.ok(env.colClosing(), '移出应立刻进入淡出态');
  assert.ok(env.colHosted(), '淡出阶段壳仍在');
  assert.equal(env.toggleCalls() - t0, 1, '淡出阶段不应已收回侧栏');
  await sleep(240);
  assert.ok(!env.colHosted(), '收尾后卡片壳应移除');
  assert.ok(!env.colClosing());
  assert.equal(env.toggleCalls() - t0, 2, '收尾应再次 toggleSidebar 收回');
  assert.ok(env.styleCalls.some(c => c[0] === 'remove' && c[1] === 'grid-template-columns'), '应解除模板钉扎');
  assert.ok(!env.htmlHasMode(), 'html 模式类应移除');
  env.collapseSidebar();
});

test('淡出途中移回按钮：取消收起（不收回）', async () => {
  const t0 = env.toggleCalls();
  env.movePointerToButton(34, 30);
  await sleep(20);
  env.expandSidebar();
  await sleep(20);
  env.movePointerOutside();
  assert.ok(env.colClosing(), '前置：淡出中');
  env.movePointerToButton(35, 31);
  await sleep(20);
  assert.ok(!env.colClosing(), 'closing 类应被撤销');
  assert.ok(env.colHosted(), '壳应保持');
  assert.equal(env.toggleCalls() - t0, 1, '不应收回');
  await sleep(240);
  assert.equal(env.toggleCalls() - t0, 1, '之后也不应误触发收回');
  env.collapseSidebar();
});

test('托管中被用户原生收起（属性恢复）：立即收尾且不重复 toggle', async () => {
  const t0 = env.toggleCalls();
  env.movePointerToButton(36, 32);
  await sleep(20);
  env.expandSidebar();
  await sleep(20);
  assert.ok(env.colHosted(), '前置：已托管');
  env.collapseSidebar();
  await sleep(20);
  assert.ok(!env.colHosted(), '应立即摘壳');
  assert.ok(!env.htmlHasMode(), '模式类应移除');
  assert.equal(env.toggleCalls() - t0, 1, '已收起的侧栏不应再 toggle');
});

test('指针离开窗口（无 relatedTarget）：收尾收回', async () => {
  const t0 = env.toggleCalls();
  env.movePointerToButton(37, 33);
  await sleep(20);
  env.expandSidebar();
  await sleep(20);
  assert.ok(env.colHosted(), '前置：已托管');
  env.leaveButton(null);
  await sleep(240);
  assert.ok(!env.colHosted(), '应完成收尾');
  assert.equal(env.toggleCalls() - t0, 2, '应收回侧栏');
  env.collapseSidebar();
});

test('键盘可达性：focus 首页按钮唤起托管，focusout 收尾', async () => {
  const t0 = env.toggleCalls();
  env.dom.documentStub.emit('focusin', env.homeBtn, { target: env.homeBtn });
  await sleep(20);
  assert.equal(env.toggleCalls() - t0, 1, 'focus 应唤起托管');
  env.expandSidebar();
  await sleep(20);
  assert.ok(env.colHosted(), '展开后应挂壳');
  env.dom.documentStub.emit('focusout', env.homeBtn, { target: env.homeBtn, relatedTarget: null });
  await sleep(240);
  assert.ok(!env.colHosted(), 'focusout 后应收尾');
  env.collapseSidebar();
});

test('生命周期绑定契约（pointermove/mouseenter/mouseleave/focus + 走原生 toggle）', () => {
  assert.match(clientSrc, /document\.addEventListener\('pointermove', homeDrawerMoveHandler, true\)/, 'pointermove 判定');
  assert.match(clientSrc, /document\.addEventListener\('mouseenter', homeDrawerEnterHandler, true\)/, 'mouseenter 唤起');
  assert.match(clientSrc, /document\.addEventListener\('mouseleave', homeDrawerLeaveHandler, true\)/, 'mouseleave 收尾');
  assert.match(clientSrc, /layout\.toggleSidebar\(\)/, '应走原生 layout.toggleSidebar');
  assert.doesNotMatch(clientSrc, /document\.body\.appendChild\(node\)/, '不应再向 body 注入自绘抽屉');
});

test('回归：首次触碰房屋图标唤起并收起后，后续光标经过周围留白及其他区域绝对不触发唤起', async () => {
  const t0 = env.toggleCalls();

  // 1. 首次在按钮留白处移动（x: 5, y: 5，不在 22x22 房屋图标内）：不唤起
  env.movePointerToButton(5, 5);
  await sleep(20);
  assert.equal(env.toggleCalls() - t0, 0, '首次在按钮留白处移动不得唤起');

  // 2. 首次真实物理触碰房屋图标轮廓（x: 32, y: 32）：成功唤起
  env.movePointerToButton(32, 32);
  await sleep(20);
  assert.equal(env.toggleCalls() - t0, 1, '真实触碰房屋图标应成功唤起');
  env.expandSidebar();
  await sleep(20);
  assert.ok(env.colHosted(), '展开后挂壳');

  // 3. 移出窗口完成正常收尾
  env.leaveButton(null);
  await sleep(240);
  assert.ok(!env.colHosted(), '卡片已收起摘壳');
  assert.equal(env.toggleCalls() - t0, 2, '收尾收回侧栏');
  env.collapseSidebar();
  await sleep(20);

  const t1 = env.toggleCalls();

  // 4. 后续再次滑动经过按钮周围留白（x: 5, y: 5）：绝不得再次滑出
  env.movePointerToButton(5, 5);
  await sleep(20);
  assert.equal(env.toggleCalls() - t1, 0, '后续在按钮留白处滑动绝对不得唤起');
  assert.ok(!env.colHosted(), '留白处滑动不得挂壳');

  // 5. 后续滑动经过其他区域（x: 900, y: 700）：绝不得唤起
  env.movePointerOutside(900, 700);
  await sleep(20);
  assert.equal(env.toggleCalls() - t1, 0, '后续在其他区域滑动绝对不得唤起');

  // 6. 只有再次真实触碰房屋图标轮廓本身（x: 32, y: 32）：才再次优雅滑出
  env.movePointerToButton(32, 32);
  await sleep(20);
  assert.equal(env.toggleCalls() - t1, 1, '再次真实触碰房屋图标应再次唤起');
  env.expandSidebar();
  await sleep(20);
  assert.ok(env.colHosted(), '再次挂壳');

  // 收尾
  env.leaveButton(null);
  await sleep(240);
  env.collapseSidebar();
});

test('回归（v1.1.27）：卡片壳压栏（left:6）时热区不吞固定栏与图标留白，走廊以可见左缘为锚', async () => {
  const railEl = env.dom.documentStub.getElementById('dsh-ui-rail');
  const colRect0 = env.col.__rect;
  const railRect0 = railEl.__rect;
  // 真实几何：卡片壳 left:6（左段压在 64px 固定栏下方）；图标 22x22 居中于 64px 按钮
  env.col.__rect = { left: 6, top: 54, width: 268, height: 400 };
  railEl.__rect = { left: 0, top: 0, width: 64, height: 832 };
  try {
    env.movePointerToButton(32, 32);
    await sleep(20);
    env.expandSidebar();
    await sleep(20);
    assert.ok(env.colHosted(), '前置：已托管');

    // ① 图标左侧留白（x=15，svg [21..43] 之外）：旧走廊反转会吞掉这里，现在必须冷
    env.dom.documentStub.emit('mousemove', env.homeBtn, { clientX: 15, clientY: 32, relatedTarget: null });
    assert.ok(env.colClosing(), '图标左侧留白不得维持热区（应立即排期收起）');

    // ② 淡出中回移进「图标右缘 → 卡片可见左缘」走廊（固定栏右条 x=58）：
    //    v1.1.35 起收起一旦开始，仅房屋图标本体可复活——走廊回移不拉回
    env.dom.documentStub.emit('mousemove', railEl, { clientX: 58, clientY: 32, relatedTarget: null });
    assert.ok(env.colClosing(), '收起进行中走廊回移不得复活（仅图标本体可复活，v1.1.35）');

    // ③ 压在固定栏下方的不可见卡片段（x=30, y=300）：不可见即不可命中
    env.dom.documentStub.emit('mousemove', env.col, { clientX: 30, clientY: 300, relatedTarget: null });
    assert.ok(env.colClosing(), '固定栏下方的卡片段不得算热区');

    // ④ 卡片可见区本体（x=200, y=300）：开启期是热区，但收起进行中不复活
    env.dom.documentStub.emit('mousemove', env.col, { clientX: 200, clientY: 300, relatedTarget: null });
    assert.ok(env.colClosing(), '收起进行中卡片区回移不得复活（v1.1.35）');

    // ⑤ 图标本体（x=32, y=32，墙体轮廓内）：唯一复活通道
    env.dom.documentStub.emit('mousemove', env.homeBtn, { clientX: 32, clientY: 32, relatedTarget: null });
    assert.ok(!env.colClosing(), '触碰房屋图标本体应复活');

    env.collapseSidebar();
    await sleep(20);
  } finally {
    env.col.__rect = colRect0;
    if (railRect0 === undefined) delete railEl.__rect; else railEl.__rect = railRect0;
  }
});

test('回归（v1.1.35）：淡出不重启——连续移出固定在首次移出后 180ms 收尾，仅图标可再唤起', async () => {
  const t0 = env.toggleCalls();
  env.movePointerToButton(32, 32);
  await sleep(20);
  env.expandSidebar();
  await sleep(20);
  assert.ok(env.colHosted(), '前置：已托管');

  // 首次移出：淡出开始（180ms 收尾时钟启动）
  env.movePointerOutside();
  assert.ok(env.colClosing(), '移出应立即进入淡出');

  // 淡出中持续在热区外移动：旧实现每次移动都会重启 180ms 定时器，
  // 卡片会不可见地无限挂起——随后任何热区回移都会「无端滑出」
  await sleep(100);
  env.movePointerOutside(900, 680);
  await sleep(110);
  // 距首次移出 ≈210ms（> 180ms），距最后一次移出仅 ≈110ms：必须已收尾
  assert.ok(!env.colHosted(), '连续移出也应在首次移出后 180ms 内完成收尾（不重启淡出）');
  assert.ok(!env.colClosing(), '收尾后不应残留淡出态');

  // 收尾后（宿主侧栏已收起）：普通移动不得唤起，只有触碰图标可再唤起
  env.collapseSidebar();
  await sleep(20);
  const t1 = env.toggleCalls();
  env.movePointerOutside(900, 680);
  await sleep(20);
  assert.equal(env.toggleCalls() - t1, 0, '收尾后普通移动不得唤起');
  env.movePointerToButton(32, 32);
  await sleep(20);
  assert.equal(env.toggleCalls() - t1, 1, '触碰房屋图标应再次唤起');

  // 清理
  env.collapseSidebar();
  await sleep(20);
  env.leaveButton(null);
  await sleep(240);
});
