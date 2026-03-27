import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import * as os from 'node:os'
import * as path from 'node:path'

const execAsync = promisify(exec)

/**
 * Install an npm package to the plugins directory and return the loaded module.
 * Tries to import first; if not installed, runs npm install asynchronously.
 */
export async function installNpmPlugin(packageName: string, pluginsDir?: string): Promise<any> {
  // Try import first — already installed
  try {
    return await import(packageName)
  } catch {
    // Not installed, proceed with install
  }

  const dir = pluginsDir ?? path.join(os.homedir(), '.openacp', 'plugins')

  await execAsync(`npm install ${packageName} --prefix "${dir}" --save`, {
    timeout: 60000,
  })

  return await import(packageName)
}
