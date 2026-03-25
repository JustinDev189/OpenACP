import * as clack from "@clack/prompts";
import { expandHome } from "../config.js";
import { guardCancel, ok, warn, dim, step } from "./helpers.js";

export async function setupRunMode(opts?: {
  existing?: { runMode: string; autoStart: boolean };
  stepNum?: number;
  totalSteps?: number;
}): Promise<{ runMode: 'foreground' | 'daemon'; autoStart: boolean }> {
  const { existing, stepNum, totalSteps } = opts ?? {};
  if (stepNum != null && totalSteps != null) {
    console.log(step(stepNum, totalSteps, 'Run Mode'));
  }

  // Don't show daemon option on Windows
  if (process.platform === 'win32') {
    console.log(dim('  (Daemon mode not available on Windows)'));
    return { runMode: 'foreground', autoStart: false };
  }

  const initialValue = (existing?.runMode === 'daemon' ? 'daemon' : 'foreground') as 'foreground' | 'daemon';

  const mode = guardCancel(
    await clack.select({
      message: 'How would you like to run OpenACP?',
      options: [
        {
          label: 'Background (daemon)',
          value: 'daemon' as const,
          hint: 'Runs silently, auto-starts on boot. Manage with: openacp status | stop | logs',
        },
        {
          label: 'Foreground (terminal)',
          value: 'foreground' as const,
          hint: 'Runs in current terminal session. Start with: openacp',
        },
      ],
      initialValue,
    }),
  );

  if (mode === 'daemon') {
    const { installAutoStart, isAutoStartSupported } = await import('../autostart.js');
    const autoStart = isAutoStartSupported();
    if (autoStart) {
      const result = installAutoStart(expandHome('~/.openacp/logs'));
      if (result.success) {
        console.log(ok('Auto-start on boot enabled'));
      } else {
        console.log(warn(`Auto-start failed: ${result.error}`));
      }
    }
    return { runMode: 'daemon', autoStart };
  }

  return { runMode: 'foreground', autoStart: false };
}
