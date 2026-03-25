export async function cmdOnboard(): Promise<void> {
  const { ConfigManager } = await import('../../core/config/config.js')
  const cm = new ConfigManager()

  if (await cm.exists()) {
    const { runReconfigure } = await import('../../core/setup/index.js')
    await runReconfigure(cm)
  } else {
    const { runSetup } = await import('../../core/setup/index.js')
    await runSetup(cm, { skipRunMode: true })
  }
}
