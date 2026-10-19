/**
 * build.mjs — 把 client-app.js（模块逻辑）与 styles.css（皮肤样式）合成为 client.js。
 *
 * 为什么需要本脚本：宿主 client-modules 的组合路由以「每个包一个 bundle 文件」
 * 的方式经 /plugins/??<pkg>/client.js&rev=<rev> 以 <script> 注入页面（单文件契约，
 * 无 ESM、无包内子路径 require）。因此运行时产物必须保持单文件；本工程改为
 * 源码层拆分、构建期合成 —— CSS 不再与 JS 混在一个手写模板串里，同时运行时
 * 契约零变更。
 *
 * 约定：
 * - client-app.js 中必须恰好出现一行占位符：const CSS = "__DSH_UI_STYLES__";
 * - styles.css 为原始 CSS 文本（不做任何预处理），构建时按下述规则转义进模板字面量；
 * - 输出确定性：相同输入必产出字节相同的 client.js（便于 diff 与产物校验）；
 * - 产物经 vm.Script 编译检查语法（只编译不执行）。
 *
 * 用法：node build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_PATH = path.join(here, 'client-app.js');
const CSS_PATH = path.join(here, 'styles.css');
const OUT_PATH = path.join(here, 'client.js');

const PLACEHOLDER = 'const CSS = "__DSH_UI_STYLES__";';

const BANNER = `/*!
 * @local/dsh-ui client bundle —— 构建产物，请勿直接编辑本文件。
 * 源文件：client-app.js（模块逻辑）+ styles.css（皮肤样式）。
 * 修改后运行 \`node build.mjs\` 重新生成；宿主按文件 mtime/size 计算组合路由 rev。
 */
`;

function main() {
  const app = fs.readFileSync(APP_PATH, 'utf8');
  const css = fs.readFileSync(CSS_PATH, 'utf8');

  const occurrences = app.split(PLACEHOLDER).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `build: placeholder must appear exactly once in client-app.js (found ${occurrences}): ${PLACEHOLDER}`
    );
  }

  // CSS 内嵌为模板字面量所需的全部转义（与手写模板串等价）。
  const escaped = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

  const body = app.replace(PLACEHOLDER, 'const CSS = `' + escaped + '`;');
  const out = BANNER + body;

  // 只编译不执行：语法错误在构建期暴露，而不是等宿主加载时才报。
  try {
    new vm.Script(out, { filename: 'client.js' });
  } catch (e) {
    throw new Error('build: generated client.js failed to parse: ' + e.message);
  }

  fs.writeFileSync(OUT_PATH, out, 'utf8');
  process.stdout.write(
    `build: client.js written (${out.length} bytes; styles.css ${css.length} bytes; client-app.js ${app.length} bytes)\n`
  );
}

main();
