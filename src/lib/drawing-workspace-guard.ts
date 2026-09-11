/** Browser workspace lifetime, not server cancellation or an authorization boundary. */
export function createDrawingWorkspaceGuard() {
  let revision = 0;
  const active = new Set<AbortController>();
  return {
    invalidate() { revision += 1; for (const controller of active) controller.abort(); active.clear(); },
    lease() {
      const generation = revision, controller = new AbortController();
      active.add(controller);
      return { signal: controller.signal,
        isCurrent: () => generation === revision && !controller.signal.aborted,
        release: () => { active.delete(controller); },
        cancel: () => { controller.abort(); active.delete(controller); } };
    },
  };
}
