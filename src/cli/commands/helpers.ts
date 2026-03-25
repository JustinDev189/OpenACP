export function wantsHelp(args: string[]): boolean {
  return args.includes('--help') || args.includes('-h')
}

export function buildNestedUpdateFromPath(dotPath: string, value: unknown): Record<string, unknown> {
  const parts = dotPath.split('.')
  const result: Record<string, unknown> = {}
  let target = result
  for (let i = 0; i < parts.length - 1; i++) {
    target[parts[i]] = {}
    target = target[parts[i]] as Record<string, unknown>
  }
  target[parts[parts.length - 1]] = value
  return result
}
