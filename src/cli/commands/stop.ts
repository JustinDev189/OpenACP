import { wantsHelp } from './helpers.js'

export async function cmdStop(args: string[] = []): Promise<void> {
  if (wantsHelp(args)) {
    console.log(`
\x1b[1mopenacp stop\x1b[0m — Stop the background daemon

\x1b[1mUsage:\x1b[0m
  openacp stop

Sends a stop signal to the running OpenACP daemon process.
`)
    return
  }
  const { stopDaemon } = await import('../daemon.js')
  const result = await stopDaemon()
  if (result.stopped) {
    console.log(`OpenACP daemon stopped (was PID ${result.pid})`)
  } else {
    console.error(result.error)
    process.exit(1)
  }
}
