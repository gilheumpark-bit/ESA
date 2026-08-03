export function comparisonStatusForReceipts(receipts) {
  const snapshotHashes = [...new Set(receipts
    .map((receipt) => receipt?.workspaceSnapshot?.changeHash)
    .filter(Boolean))];
  return {
    valid: snapshotHashes.length <= 1,
    reason: snapshotHashes.length <= 1 ? null : 'MIXED_WORKSPACE_SNAPSHOTS',
    snapshotHashes,
  };
}
