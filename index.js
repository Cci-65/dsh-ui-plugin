/**
 * Host half of @local/dsh-ui.
 * Boots the local bridge for plugin management if not already active,
 * and shuts it down when the plugin is disposed (disabled/unloaded),
 * so port 19389 is released without a host restart.
 */

import { startBridge } from './bridge.mjs';

export const name = 'dsh-ui';

export function apply(ctx) {
  const server = startBridge();

  const close = () => {
    try {
      if (server && typeof server.close === 'function') server.close();
    } catch (e) {}
  };

  // cordis-style dispose hook; also cover the plain `dispose` method shape.
  try {
    ctx?.on?.('dispose', close);
  } catch (e) {}

  return {
    dispose: close,
  };
}
