/**
 * Reconciliation builds rebuild images that are missing from Docker Hub. The reconciler
 * dispatches them with `reconciliation: true`, and the docker workflows pass that flag back
 * in their build reports. Reports without the flag come from the regular build queue.
 */
export const isReconciliationReport = (body: { reconciliation?: unknown } | undefined): boolean =>
  body?.reconciliation === true || body?.reconciliation === 'true';
