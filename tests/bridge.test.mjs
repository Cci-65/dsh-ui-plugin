// Unit tests for the dsh-ui bridge pure logic (node:test).
// Run with:  node --test tests/
// The bridge resolves all profile paths from env at import time, so tests
// point DSH_UI_PROFILE_DIR / DSH_UI_PLUGIN_STORE at a temp fixture first
// and never touch the real user profile.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ui-bridge-test-'));
const profileDir = path.join(tmpRoot, 'profile');
const pluginStore = path.join(tmpRoot, 'plugin-store');
fs.mkdirSync(profileDir, { recursive: true });
fs.mkdirSync(pluginStore, { recursive: true });

process.env.DSH_UI_PROFILE_DIR = profileDir;
process.env.DSH_UI_PLUGIN_STORE = pluginStore;

let bridge;
before(async () => {
  bridge = await import('../bridge.mjs');
});

// ---------------------------------------------------------------------------
test('isValidPluginId accepts normal ids and rejects injection', () => {
  assert.equal(bridge.isValidPluginId('dsh-ui'), true);
  assert.equal(bridge.isValidPluginId('@local/dsh-ui'), true);
  assert.equal(bridge.isValidPluginId('token-usage-stats'), true);
  assert.equal(bridge.isValidPluginId('foo.bar_baz'), true);
  // YAML injection attempts
  assert.equal(bridge.isValidPluginId('foo\n- id: evil'), false);
  assert.equal(bridge.isValidPluginId('foo\n  disabled: false'), false);
  assert.equal(bridge.isValidPluginId('foo: bar'), false);
  // regex metacharacters / quotes
  assert.equal(bridge.isValidPluginId('a+b'), false);
  assert.equal(bridge.isValidPluginId("a'b"), false);
  assert.equal(bridge.isValidPluginId('a"b'), false);
  assert.equal(bridge.isValidPluginId('a(b)'), false);
  assert.equal(bridge.isValidPluginId(''), false);
  assert.equal(bridge.isValidPluginId(null), false);
  assert.equal(bridge.isValidPluginId(undefined), false);
});

// ---------------------------------------------------------------------------
test('sanitizeIconSvg keeps plain svgs and strips active content', () => {
  const good = '<svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 2L2 7"/></svg>';
  assert.equal(bridge.sanitizeIconSvg(good), good);

  assert.equal(bridge.sanitizeIconSvg('<svg onload="alert(1)"><path d="M0 0"/></svg>'), '');
  assert.equal(bridge.sanitizeIconSvg('<svg><script>alert(1)</script></svg>'), '');
  assert.equal(bridge.sanitizeIconSvg('<svg><foreignObject><body>x</body></foreignObject></svg>'), '');
  assert.equal(bridge.sanitizeIconSvg('<svg><a href="javascript:alert(1)"/></svg>'), '');
  assert.equal(bridge.sanitizeIconSvg('not an svg'), '');
  assert.equal(bridge.sanitizeIconSvg(''), '');
  assert.equal(bridge.sanitizeIconSvg(null), '');
});

// ---------------------------------------------------------------------------
test('readPatchRowStates parses disabled flags per row', () => {
  const patchPath = path.join(profileDir, 'cordis.patch.yml');
  fs.writeFileSync(patchPath, [
    '- id: dsh-ui',
    '  name: "@local/dsh-ui"',
    '  disabled: false',
    '  config: {}',
    '',
    '- id: token-usage-stats',
    '  disabled: true',
    '',
    '- id: no-flag-row',
    '  config: {}',
    '',
  ].join('\n'), 'utf8');

  const states = bridge.readPatchRowStates();
  assert.equal(states['dsh-ui'], false);
  assert.equal(states['token-usage-stats'], true);
  assert.equal(states['no-flag-row'], false); // missing disabled => enabled
});

// ---------------------------------------------------------------------------
test('updatePatchRow toggles existing, inserts missing flag, appends new row', () => {
  const patchPath = path.join(profileDir, 'cordis.patch.yml');
  fs.writeFileSync(patchPath, [
    '- id: dsh-ui',
    '  name: "@local/dsh-ui"',
    '  disabled: false',
    '  config: {}',
    '',
    '- id: no-flag-row',
    '  config: {}',
    '',
  ].join('\n'), 'utf8');

  // toggle existing row
  bridge.updatePatchRow('dsh-ui', true);
  let text = fs.readFileSync(patchPath, 'utf8');
  assert.match(text, /- id: dsh-ui\n {2}name: "@local\/dsh-ui"\n {2}disabled: true/);

  // insert disabled line into a row that lacks one
  bridge.updatePatchRow('no-flag-row', true);
  text = fs.readFileSync(patchPath, 'utf8');
  assert.match(text, /- id: no-flag-row\n {2}disabled: true\n {2}config: \{\}/);

  // append a brand new row
  bridge.updatePatchRow('brand-new', false);
  text = fs.readFileSync(patchPath, 'utf8');
  assert.match(text, /- id: brand-new\n {2}disabled: false/);

  // state round-trip agrees
  const states = bridge.readPatchRowStates();
  assert.equal(states['dsh-ui'], true);
  assert.equal(states['no-flag-row'], true);
  assert.equal(states['brand-new'], false);
});

// ---------------------------------------------------------------------------
test('updatePatchRow rejects malicious row ids (no YAML/regex injection)', () => {
  const patchPath = path.join(profileDir, 'cordis.patch.yml');
  const before = fs.readFileSync(patchPath, 'utf8');
  assert.throws(() => bridge.updatePatchRow('evil\n- id: injected', true), /Invalid plugin row id/);
  assert.throws(() => bridge.updatePatchRow('evil" onload="x', true), /Invalid plugin row id/);
  assert.throws(() => bridge.updatePatchRow('a+b', true), /Invalid plugin row id/);
  const after = fs.readFileSync(patchPath, 'utf8');
  assert.equal(after, before, 'file must be untouched after rejected writes');
});

// ---------------------------------------------------------------------------
test('scanInstalledPlugins finds link: plugins and sanitizes icons', () => {
  // fixture plugin A: normal icon
  const pluginA = path.join(tmpRoot, 'plugin-a');
  fs.mkdirSync(pluginA, { recursive: true });
  fs.writeFileSync(path.join(pluginA, 'package.json'), JSON.stringify({
    name: '@local/plugin-a', version: '1.0.0', description: 'fixture A',
  }), 'utf8');
  fs.writeFileSync(path.join(pluginA, 'icon.svg'),
    '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>', 'utf8');

  // fixture plugin B: malicious icon must fall back to default
  const pluginB = path.join(tmpRoot, 'plugin-b');
  fs.mkdirSync(pluginB, { recursive: true });
  fs.writeFileSync(path.join(pluginB, 'package.json'), JSON.stringify({
    name: 'plugin-b', version: '2.0.0',
  }), 'utf8');
  fs.writeFileSync(path.join(pluginB, 'icon.svg'),
    '<svg onload="alert(1)"><path d="M1 1"/></svg>', 'utf8');

  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
    dependencies: {
      '@local/plugin-a': `link:${pluginA.replace(/\\/g, '/')}`,
      'plugin-b': `link:${pluginB.replace(/\\/g, '/')}`,
      '@local/dsh-ui': 'link:/somewhere', // inbox: must be filtered out
    },
    dsh: { profile: { bundles: ['@local/plugin-a', 'plugin-b', '@local/dsh-ui'] } },
  }), 'utf8');

  const plugins = bridge.scanInstalledPlugins();
  const ids = plugins.map(p => p.id).sort();
  assert.deepEqual(ids, ['@local/plugin-a', 'plugin-b']);

  const a = plugins.find(p => p.id === '@local/plugin-a');
  assert.equal(a.desc, 'fixture A');
  assert.match(a.icon, /^<svg/);
  assert.match(a.icon, /width="18"/, 'width/height injected when missing');

  const b = plugins.find(p => p.id === 'plugin-b');
  assert.doesNotMatch(b.icon, /onload/, 'malicious icon must be replaced by default');
});

// ---------------------------------------------------------------------------
test('handleToggle rejects invalid ids before touching anything', async () => {
  const result = await bridge.handleToggle('bad\nid', false);
  assert.equal(result.ok, false);
  assert.equal(result.via, 'rejected');
});
