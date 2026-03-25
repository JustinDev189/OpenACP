export async function cmdVersion(): Promise<void> {
  const { getCurrentVersion } = await import("../version.js")
  console.log(`openacp v${getCurrentVersion()}`)
}
