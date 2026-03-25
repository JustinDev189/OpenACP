import { checkAndPromptUpdate } from '../version.js'
import { printHelp } from './help.js'

export async function cmdDefault(command: string | undefined): Promise<void> {
  const forceForeground = command === '--foreground'

  // Reject unknown commands
  if (command && !command.startsWith('-')) {
    const { suggestMatch } = await import('../suggest.js')
    const topLevelCommands = [
      'start', 'stop', 'status', 'logs', 'config', 'reset', 'update',
      'install', 'uninstall', 'plugins', 'api', 'adopt', 'integrate', 'doctor', 'agents', 'onboard',
    ]
    const suggestion = suggestMatch(command, topLevelCommands)
    console.error(`Unknown command: ${command}`)
    if (suggestion) console.error(`Did you mean: ${suggestion}?`)
    printHelp()
    process.exit(1)
  }

  await checkAndPromptUpdate()

  const { ConfigManager } = await import('../../core/config/config.js')
  const cm = new ConfigManager()

  // If no config, run setup first
  if (!(await cm.exists())) {
    const { runSetup } = await import('../../core/setup/index.js')
    const shouldStart = await runSetup(cm)
    if (!shouldStart) process.exit(0)
  }

  await cm.load()
  const config = cm.get()

  if (!forceForeground && config.runMode === 'daemon') {
    const { startDaemon, getPidPath } = await import('../daemon.js')
    const result = startDaemon(getPidPath(), config.logging.logDir)
    if ('error' in result) {
      console.error(result.error)
      process.exit(1)
    }
    console.log(`OpenACP daemon started (PID ${result.pid})`)
    return
  }

  const { markRunning } = await import('../daemon.js')
  markRunning()
  const { startServer } = await import('../../main.js')
  await startServer()
}
