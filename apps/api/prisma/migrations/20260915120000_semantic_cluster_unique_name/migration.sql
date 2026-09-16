-- Merge duplicate cluster names left by raced semantic persists, then enforce uniqueness.

-- Re-point keywords from newer duplicates onto the oldest cluster of the same name.
UPDATE semantic_keywords AS sk
SET cluster_id = keeper.id
FROM semantic_clusters AS dup
INNER JOIN LATERAL (
  SELECT c.id
  FROM semantic_clusters AS c
  WHERE c.project_id = dup.project_id
    AND c.name = dup.name
  ORDER BY c.created_at ASC, c.id ASC
  LIMIT 1
) AS keeper ON TRUE
WHERE sk.cluster_id = dup.id
  AND dup.id <> keeper.id;

DELETE FROM semantic_clusters AS dup
USING semantic_clusters AS keeper
WHERE dup.project_id = keeper.project_id
  AND dup.name = keeper.name
  AND dup.id <> keeper.id
  AND keeper.id = (
    SELECT c.id
    FROM semantic_clusters AS c
    WHERE c.project_id = dup.project_id
      AND c.name = dup.name
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1
  );

CREATE UNIQUE INDEX "semantic_clusters_project_id_name_key"
ON "semantic_clusters"("project_id", "name");
