/**
 * Core built-in plugins that provide fundamental services.
 * These are booted by LifecycleManager before adapters start.
 *
 * Adapter plugins (telegram, discord, slack) and infrastructure plugins
 * (tunnel, api-server) are NOT included here — they are managed separately.
 */
import securityPlugin from './security/index.js'
import fileServicePlugin from './file-service/index.js'
import contextPlugin from './context/index.js'
import usagePlugin from './usage/index.js'
import speechPlugin from './speech/index.js'
import notificationsPlugin from './notifications/index.js'

export const corePlugins = [
  securityPlugin,
  fileServicePlugin,
  contextPlugin,
  usagePlugin,
  speechPlugin,
  notificationsPlugin,
]
