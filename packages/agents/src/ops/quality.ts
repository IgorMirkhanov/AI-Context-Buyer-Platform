export function agentAcceptance(input: {
  total: number;
  edited: number;
}): {
  total: number;
  edited: number;
  acceptedShare: number | null;
} {
  if (input.total <= 0) {
    return { total: 0, edited: 0, acceptedShare: null };
  }
  const edited = Math.min(Math.max(0, input.edited), input.total);
  return {
    total: input.total,
    edited,
    acceptedShare:
      Math.round((1 - edited / input.total) * 1000) / 1000,
  };
}

/** Unique clusters that had any manually edited creative. */
export function clusterEditAcceptance(
  items: Array<{ clusterId: string; edited: boolean }>,
): {
  total: number;
  edited: number;
  acceptedShare: number | null;
} {
  const clusterIds = new Set(
    items.map((item) => item.clusterId).filter(Boolean),
  );
  const editedIds = new Set(
    items
      .filter((item) => item.edited && item.clusterId)
      .map((item) => item.clusterId),
  );
  return agentAcceptance({
    total: clusterIds.size,
    edited: editedIds.size,
  });
}
