import { listPlugins } from '../../core/plugin-manager.js'
import { wantsHelp } from './helpers.js'

export async function cmdPlugins(args: string[] = []): Promise<void> {
  if (wantsHelp(args)) {
    console.log(`
\x1b[1mopenacp plugins\x1b[0m — List installed plugins

\x1b[1mUsage:\x1b[0m
  openacp plugins

Shows all plugins installed in ~/.openacp/plugins/.
`)
    return
  }
  const plugins = listPlugins()
  const entries = Object.entries(plugins)
  if (entries.length === 0) {
    console.log("No plugins installed.")
  } else {
    console.log("Installed plugins:")
    for (const [name, version] of entries) {
      console.log(`  ${name}@${version}`)
    }
  }
}
