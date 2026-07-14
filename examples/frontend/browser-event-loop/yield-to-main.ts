interface SchedulerWithYield {
  yield?: () => Promise<void>;
}

function getScheduler(): SchedulerWithYield | undefined {
  return (globalThis as typeof globalThis & { scheduler?: SchedulerWithYield }).scheduler;
}

export async function yieldToMain(): Promise<void> {
  const scheduler = getScheduler();
  if (scheduler?.yield) {
    await scheduler.yield();
    return;
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
