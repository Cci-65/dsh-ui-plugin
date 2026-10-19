import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Constants (env overrides exist mainly for tests and multi-instance debugging)
// ---------------------------------------------------------------------------
const PORT = Number(process.env.DSH_UI_BRIDGE_PORT) || 19389;
const DSH_MARKET_URL = process.env.DSH_UI_MARKET_URL || 'http://127.0.0.1:19387';
const MAX_BODY_BYTES = 64 * 1024; // reject oversized request bodies (local DoS guard)
const UNITS_PER_YUAN = 1e8;       // whale ledger: 1e8 units == 1 CNY
const PLUGIN_ID_RE = /^[@A-Za-z0-9/_.-]+$/; // whitelist for any id entering config writes

const HOME = os.homedir();
const PROFILE_DIR = process.env.DSH_UI_PROFILE_DIR || path.join(HOME, '.dsh', 'profiles', 'desktop');
const PLUGIN_STORE_DIR = process.env.DSH_UI_PLUGIN_STORE || path.join(HOME, '.dsh', 'plugin');
const PATCH_PATH = path.join(PROFILE_DIR, 'cordis.patch.yml');
const PACKAGE_PATH = path.join(PROFILE_DIR, 'package.json');
const STATE_PATH = path.join(PROFILE_DIR, '.dsh-market', 'state.json');
const DEBUG_DUMP_PATH = path.join(PROFILE_DIR, '.dsh-ui-debug.json');
const PLUGIN_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
    return pkg.version || '0.0.0';
  } catch (e) {
    return '0.0.0';
  }
})();

// Origins we trust to call the write endpoints: the DSH web UI is served from
// 127.0.0.1 itself, so only loopback origins (any port) are allowed. Requests
// without an Origin header (curl, local node, the market peer) are local by
// definition and pass; browsers always attach Origin to cross-origin calls,
// which is exactly the CSRF vector this blocks.
const LOOPBACK_ORIGIN_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

function isOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser local caller
  return LOOPBACK_ORIGIN_RE.test(origin);
}

function isHostAllowed(req) {
  // DNS-rebinding guard: a rebound browser request carries the attacker's
  // Host header, so only accept requests actually addressed to loopback.
  const host = req.headers.host || '';
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && LOOPBACK_ORIGIN_RE.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

// Reads a request body with a hard size cap; resolves null when the body
// exceeded the cap (the socket is destroyed in that case).
function readBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    let text = '';
    let overflow = false;
    req.on('data', (chunk) => {
      if (overflow) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        overflow = true;
        resolve(null);
        req.destroy();
        return;
      }
      text += chunk;
    });
    req.on('end', () => { if (!overflow) resolve(text); });
    req.on('error', () => { if (!overflow) { overflow = true; resolve(null); } });
  });
}

// Inbox / system bundles that must never appear in plugin list
const INBOX_BUNDLES = new Set([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-headless',
  '@local/dsh-ui',
  'dsh-ui',
]);

// Explicitly purged / uninstalled plugins whitelist protection
const UNINSTALLED_IDS = new Set([
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

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidPluginId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 200 && PLUGIN_ID_RE.test(id);
}

function readPatchRowStates() {
  const states = {};
  if (!fs.existsSync(PATCH_PATH)) return states;
  try {
    const text = fs.readFileSync(PATCH_PATH, 'utf8');
    const lines = text.split(/\r?\n/);
    let currentRowId = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const idMatch = /^[ \t]*- id:[ \t]*['"]?([A-Za-z0-9_.-]+)['"]?/.exec(line);
      if (idMatch) {
        currentRowId = idMatch[1];
        if (states[currentRowId] === undefined) {
          states[currentRowId] = false;
        }
        continue;
      }
      if (currentRowId) {
        const disMatch = /^[ \t]+disabled:[ \t]*(true|false)/.exec(line);
        if (disMatch) {
          states[currentRowId] = disMatch[1] === 'true';
        }
        if (/^[ \t]*- id:/.test(line)) {
          currentRowId = null;
        }
      }
    }
  } catch (e) {
    console.error('Error reading cordis.patch.yml:', e);
  }
  return states;
}

function updatePatchRow(rowId, disabled) {
  if (!isValidPluginId(rowId)) {
    throw new Error(`Invalid plugin row id: ${JSON.stringify(String(rowId).slice(0, 80))}`);
  }
  let text = '';
  try {
    text = fs.readFileSync(PATCH_PATH, 'utf8');
  } catch (e) {
    text = '[]\n';
  }

  const lines = text.split(/\r?\n/);
  let found = false;
  let targetIndex = -1;
  let disabledLineIndex = -1;

  const idLineRe = new RegExp(`^[ \\t]*- id:[ \\t]*['"]?${escapeRegExp(rowId)}['"]?[ \\t]*$`);
  for (let i = 0; i < lines.length; i++) {
    if (idLineRe.test(lines[i])) {
      targetIndex = i;
      found = true;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^[ \t]*- /m.test(lines[j])) break;
        if (/^[ \t]+disabled:[ \t]*(true|false)/.test(lines[j])) {
          disabledLineIndex = j;
          break;
        }
      }
      break;
    }
  }

  if (found) {
    if (disabledLineIndex !== -1) {
      lines[disabledLineIndex] = `  disabled: ${disabled ? 'true' : 'false'}`;
    } else {
      lines.splice(targetIndex + 1, 0, `  disabled: ${disabled ? 'true' : 'false'}`);
    }
  } else {
    // Append at bottom
    if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
      lines.push('');
    }
    lines.push(`- id: ${rowId}`);
    lines.push(`  disabled: ${disabled ? 'true' : 'false'}`);
  }

  const newText = lines.join('\n');
  fs.writeFileSync(PATCH_PATH, newText, 'utf8');
  return true;
}

// Icon SVGs come from arbitrary local plugin packages. An SVG carrying an
// event handler (onload=...) or an active-content tag executes when the web
// client injects it via innerHTML, so anything suspicious falls back to the
// neutral default icon.
const SVG_ACTIVE_CONTENT_RE = /<\s*(script|iframe|object|embed|foreignObject|link|meta)\b|\son[a-zA-Z]+\s*=|javascript\s*:|data\s*:\s*text\/html/i;

function sanitizeIconSvg(rawSvg) {
  if (typeof rawSvg !== 'string') return '';
  const trimmed = rawSvg.trim();
  if (!trimmed.startsWith('<svg') || trimmed.length > 64 * 1024) return '';
  if (SVG_ACTIVE_CONTENT_RE.test(trimmed)) return '';
  return trimmed;
}

// 动态扫描 DSH 本地实际安装的真实插件
function scanInstalledPlugins() {
  if (!fs.existsSync(PACKAGE_PATH)) return [];
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
  } catch (e) {
    return [];
  }

  const deps = pkg.dependencies || {};
  const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  const candidateNames = new Set([...Object.keys(deps), ...bundles]);

  const patchStates = readPatchRowStates();

  let marketDisabled = new Set();
  if (fs.existsSync(STATE_PATH)) {
    try {
      const st = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
      if (Array.isArray(st.disabled)) marketDisabled = new Set(st.disabled);
    } catch (e) {}
  }

  const plugins = [];

  for (const name of candidateNames) {
    if (INBOX_BUNDLES.has(name)) continue;
    if (UNINSTALLED_IDS.has(name)) continue;
    if (name.startsWith('@deepseek-ai/') && !deps[name]) continue;

    // Resolve plugin directory on disk. deps[name] is usually a version or
    // "link:" string, but a malformed package.json must not crash the scan.
    const depValue = typeof deps[name] === 'string' ? deps[name] : '';
    let pluginDir = null;
    if (depValue.startsWith('link:')) {
      const linkPath = depValue.slice(5);
      if (fs.existsSync(linkPath)) pluginDir = linkPath;
    }
    if (!pluginDir) {
      const nmPath = path.join(PROFILE_DIR, 'node_modules', name);
      if (fs.existsSync(nmPath)) pluginDir = nmPath;
    }
    if (!pluginDir) {
      const localName = name.replace(/^@local\//, '');
      const storePath = path.join(PLUGIN_STORE_DIR, localName);
      if (fs.existsSync(storePath)) pluginDir = storePath;
    }

    if (!pluginDir || !fs.existsSync(pluginDir)) continue;

    const manifestPath = path.join(pluginDir, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;

    let manifest = {};
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      continue;
    }

    let displayName = manifest.displayName || manifest.name || name;
    let description = manifest.description || '';

    // Check locale for friendly Chinese title and description
    for (const loc of ['zh.json', 'zh-CN.json', 'en.json']) {
      const locPath = path.join(pluginDir, 'locale', loc);
      if (fs.existsSync(locPath)) {
        try {
          const lData = JSON.parse(fs.readFileSync(locPath, 'utf8'));
          if (lData.meta && lData.meta.title) displayName = lData.meta.title;
          if (lData.meta && lData.meta.description) description = lData.meta.description;
          break;
        } catch (e) {}
      }
    }

    // Determine rowId for cordis patch
    let rowId = name.replace(/^@[^/]+\//, '');
    const cPatch = path.join(pluginDir, 'cordis.patch.yml');
    if (fs.existsSync(cPatch)) {
      try {
        const patchContent = fs.readFileSync(cPatch, 'utf8');
        const m = /- id:[ \t]*['"]?([A-Za-z0-9_.-]+)['"]?/.exec(patchContent);
        if (m) rowId = m[1];
      } catch (e) {}
    }

    // Icon (sanitized; anything with active content falls back to default)
    let iconSvg = '';
    const iconSvgPath = path.join(pluginDir, 'icon.svg');
    if (fs.existsSync(iconSvgPath)) {
      try {
        const safeSvg = sanitizeIconSvg(fs.readFileSync(iconSvgPath, 'utf8'));
        if (safeSvg) {
          iconSvg = /width=/.test(safeSvg)
            ? safeSvg
            : safeSvg.replace('<svg', '<svg width="18" height="18"');
        }
      } catch (e) {}
    }

    // Check if explicitly disabled in patch layer or market state
    let isExplicitlyDisabled = false;
    if (patchStates[rowId] === true || patchStates[name] === true) {
      isExplicitlyDisabled = true;
    } else if (marketDisabled.has(name) || marketDisabled.has(rowId)) {
      isExplicitlyDisabled = true;
    }

    plugins.push({
      id: name,
      rowId,
      name: displayName,
      desc: description,
      version: manifest.version || '1.0.0',
      icon: iconSvg || `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2F6FED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
      enabled: !isExplicitlyDisabled,
      searchText: displayName + ' ' + (description || '') + ' ' + rowId + ' ' + name,
    });
  }

  return plugins;
}

function getPluginList() {
  return scanInstalledPlugins();
}

// ---------------------------------------------------------------------------
// Usage summary (剩余用量) for the fixed icon rail account menu.
// Reads the two local usage ledgers; never touches credentials.
//   .dshw-usage.json      — whale balance ledger (lastBalance, events[])
//   .dsh-usage-stats.json — token usage stats (byDay cost/tokens)
// Note: day keys are computed in LOCAL time to match the ledgers' own day
// bucketing (both are written by the local host process in local time).
// ---------------------------------------------------------------------------
const USAGE_WHALE_PATH = path.join(HOME, '.dsh', '.dshw-usage.json');
const USAGE_STATS_PATH = path.join(HOME, '.dsh', '.dsh-usage-stats.json');

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function localDayKey() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

function getUsageSummary() {
  const dayKey = localDayKey();
  const whale = readJsonSafe(USAGE_WHALE_PATH);
  const stats = readJsonSafe(USAGE_STATS_PATH);

  // 余额：优先 whale 台账的 lastBalance，回退从 accounting 活动账本推算
  let balance = null;
  let currency = 'CNY';
  if (whale) {
    if (typeof whale.lastBalance === 'number') {
      balance = whale.lastBalance;
    } else if (whale.accounting && whale.accounting.books && whale.accounting.active) {
      const book = whale.accounting.books[whale.accounting.active];
      if (book && book.currency) currency = book.currency;
      if (book && book.days) {
        const days = Object.values(book.days);
        const last = days[days.length - 1];
        if (last && typeof last.lastUnits === 'number') balance = last.lastUnits / UNITS_PER_YUAN;
      }
    }
  }

  // 今日消耗：优先 whale events（含 tokens），回退 token-usage-stats 的 byDay
  let todayCost = null;
  let todayTokens = null;
  if (whale && Array.isArray(whale.events)) {
    let cost = 0;
    let tokens = 0;
    let any = false;
    for (const ev of whale.events) {
      if (ev && ev.day === dayKey) {
        any = true;
        cost += ev.cost || 0;
        tokens += ev.tokens || 0;
      }
    }
    if (any) {
      todayCost = cost;
      todayTokens = tokens;
    }
  }
  if (todayCost === null && stats && stats.byDay && stats.byDay[dayKey]) {
    const day = stats.byDay[dayKey];
    todayCost = day.cost || 0;
    todayTokens = (day.input || 0) + (day.output || 0);
  }

  if (balance === null && todayCost === null) {
    return { ok: true, available: false, date: dayKey };
  }
  return {
    ok: true,
    available: true,
    date: dayKey,
    balance,
    currency,
    todayCost,
    todayTokens
  };
}

async function handleToggle(pluginId, enabled) {
  if (!isValidPluginId(pluginId)) {
    return { ok: false, id: String(pluginId), rowId: null, enabled, restart: false, refresh: false, reason: 'invalid plugin id', via: 'rejected' };
  }
  const plugins = scanInstalledPlugins();
  const plugin = plugins.find(p => p.id === pluginId || p.rowId === pluginId) || {
    id: pluginId,
    rowId: pluginId.replace(/^@[^/]+\//, '')
  };

  const rowId = plugin.rowId || pluginId;
  if (!isValidPluginId(rowId)) {
    return { ok: false, id: pluginId, rowId: null, enabled, restart: false, refresh: false, reason: 'invalid row id', via: 'rejected' };
  }

  // 1. Market endpoint: the authoritative multi-layer toggle (live
  //    mount/unmount, state.json, dsh.profile.bundles stack, patch rows).
  //    Forward its restart/refresh verdict so the panel can explain a
  //    plugin that cannot hot-unload instead of looking broken.
  let market = null;
  try {
    const res = await fetch(`${DSH_MARKET_URL}/dsh-market/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': DSH_MARKET_URL
      },
      body: JSON.stringify({ name: plugin.id || pluginId, enabled })
    });
    if (res.status !== 404) {
      const data = await res.json().catch(() => null);
      if (data && data.ok) {
        market = { ok: true, restart: Boolean(data.restart), refresh: Boolean(data.refresh), reason: null };
      } else if (data && (data.error || data.reason)) {
        // Definite refusal (peer gate, host error) — do not paper over it.
        market = { ok: false, restart: false, refresh: false, reason: String(data.error || data.reason) };
      }
    }
  } catch (err) {
    // Market endpoint unreachable — fall through to the direct patch write.
  }

  // 2. Direct patch-row write only when the market could not act (disabled
  //    or unreachable). When it succeeded it already wrote every row it
  //    owns — rewriting ours here would only fight its dialect.
  let via = 'market';
  if (!market) {
    via = 'patch';
    try {
      updatePatchRow(rowId, !enabled);
    } catch (err) {
      return { ok: false, id: plugin.id || pluginId, rowId, enabled, restart: false, refresh: false, reason: String(err && err.message || err), via };
    }
  }

  return {
    ok: market ? market.ok : true,
    id: plugin.id || pluginId,
    rowId,
    enabled,
    restart: market ? market.restart : false,
    refresh: market ? market.refresh : false,
    reason: market ? market.reason : null,
    via
  };
}

// HTTP Server
function createBridgeServer() {
  return http.createServer(async (req, res) => {
    // Loopback guards: Host check defeats DNS rebinding, Origin check defeats
    // drive-by CSRF from arbitrary web pages.
    if (!isHostAllowed(req)) {
      sendJson(res, 403, { ok: false, error: 'forbidden host' });
      return;
    }
    if (!isOriginAllowed(req)) {
      sendJson(res, 403, { ok: false, error: 'forbidden origin' });
      return;
    }
    applyCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/api/version') {
      sendJson(res, 200, { ok: true, name: '@local/dsh-ui', version: PLUGIN_VERSION });
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/api/status' || url.pathname === '/api/plugins')) {
      try {
        const plugins = getPluginList();
        sendJson(res, 200, { ok: true, plugins });
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/usage') {
      try {
        const summary = getUsageSummary();
        sendJson(res, 200, summary);
      } catch (err) {
        sendJson(res, 500, { ok: false, error: err.message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/toggle') {
      const bodyText = await readBody(req);
      if (bodyText === null) {
        // Socket already destroyed on overflow; guard the write.
        try { sendJson(res, 413, { ok: false, error: 'body too large' }); } catch (e) {}
        return;
      }
      try {
        const body = JSON.parse(bodyText);
        const { id, enabled } = body;
        const result = await handleToggle(id, Boolean(enabled));
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 400, { ok: false, error: err.message });
      }
      return;
    }

    // Diagnostics dump: client.js posts UI inspection payloads here; the body
    // is stored verbatim to a fixed path for offline analysis. Loopback-only
    // (guards above), fixed destination (no path traversal), 64KB body cap.
    if (req.method === 'POST' && url.pathname === '/api/debug') {
      const bodyText = await readBody(req);
      if (bodyText === null) {
        try { sendJson(res, 413, { ok: false, error: 'body too large' }); } catch (e) {}
        return;
      }
      try {
        const payload = JSON.stringify(JSON.parse(bodyText), null, 2);
        fs.writeFileSync(DEBUG_DUMP_PATH, payload, 'utf8');
        sendJson(res, 200, { ok: true, written: DEBUG_DUMP_PATH });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: err.message });
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  });
}

// Starts the bridge unless another instance already owns the port.
// Returns the listening server, or null when the port was taken.
export function startBridge() {
  const server = createBridgeServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[DSH-UI Bridge] Port ${PORT} already in use; bridge is already running.`);
    } else {
      console.error('[DSH-UI Bridge] Server error:', err);
    }
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[DSH-UI Bridge] Running at http://127.0.0.1:${PORT} (v${PLUGIN_VERSION})`);
  });
  return server;
}

// Exported for unit tests and for the host entry (index.js) which owns the
// dispose lifecycle. Importing this module no longer starts the server.
export {
  readPatchRowStates,
  updatePatchRow,
  isValidPluginId,
  sanitizeIconSvg,
  scanInstalledPlugins,
  getUsageSummary,
  handleToggle,
};

// Standalone mode: `node bridge.mjs` (used by install.py to warm the service
// before the host loads the plugin). When imported by index.js, the host
// calls startBridge() itself and registers dispose handling.
const invokedAsMain = (() => {
  try {
    return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch (e) {
    return false;
  }
})();

if (invokedAsMain) {
  startBridge();
}
