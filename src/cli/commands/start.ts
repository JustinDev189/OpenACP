import { checkAndPromptUpdate } from '../version.js'
import { wantsHelp } from './helpers.js'

export async function cmdStart(args: string[] = []): Promise<void> {
  if (wantsHelp(args)) {
    console.log(`
\x1b[1mopenacp start\x1b[0m — Start OpenACP as a background daemon

\x1b[1mUsage:\x1b[0m
  openacp start

Starts the server as a background process (daemon mode).
Requires an existing config — run 'openacp' first to set up.

\x1b[1mSee also:\x1b[0m
  openacp stop       Stop the daemon
  openacp status     Check if daemon is running
  openacp logs       Tail daemon log file
`)
    return
  }
  await checkAndPromptUpdate()
  const { startDaemon, getPidPath } = await import('../daemon.js')
  const { ConfigManager } = await import('../../core/config/config.js')
  const cm = new ConfigManager()
  if (await cm.exists()) {
    await cm.load()
    const config = cm.get()
    const result = startDaemon(getPidPath(), config.logging.logDir)
    if ('error' in result) {
      console.error(result.error)
      process.exit(1)
    }
    console.log(`OpenACP daemon started (PID ${result.pid})`)
  } else {
    console.error('No config found. Run "openacp" first to set up.')
    process.exit(1)
  }
}
