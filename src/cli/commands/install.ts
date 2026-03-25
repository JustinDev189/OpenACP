import { installPlugin } from '../../core/plugin-manager.js'
import { wantsHelp } from './helpers.js'

export async function cmdInstall(args: string[]): Promise<void> {
  if (wantsHelp(args)) {
    console.log(`
\x1b[1mopenacp install\x1b[0m — Install a plugin adapter

\x1b[1mUsage:\x1b[0m
  openacp install <package>

\x1b[1mArguments:\x1b[0m
  <package>       npm package name (e.g. @openacp/adapter-discord)

Installs the plugin to ~/.openacp/plugins/.

\x1b[1mExamples:\x1b[0m
  openacp install @openacp/adapter-discord
`)
    return
  }
  const pkg = args[1]
  if (!pkg) {
    console.error("Usage: openacp install <package>")
    process.exit(1)
  }
  installPlugin(pkg)
}
