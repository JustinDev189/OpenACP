import { wantsHelp } from './helpers.js'

export async function cmdStatus(args: string[] = []): Promise<void> {
  if (wantsHelp(args)) {
    console.log(`
\x1b[1mopenacp status\x1b[0m — Show daemon status

\x1b[1mUsage:\x1b[0m
  openacp status

Shows whether the OpenACP daemon is running and its PID.
`)
    return
  }
  const { getStatus } = await import('../daemon.js')
  const status = getStatus()
  if (status.running) {
    console.log(`OpenACP is running (PID ${status.pid})`)
  } else {
    console.log('OpenACP is not running')
  }
}
