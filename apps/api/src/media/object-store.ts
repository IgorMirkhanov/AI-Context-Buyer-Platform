import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { dirname, resolve, sep } from "path";

export type StoredObject = {
  key: string;
  body: Buffer;
  contentType: string;
};

export interface ObjectStore {
  put(
    projectId: string,
    filename: string,
    body: Buffer,
    contentType: string,
  ): Promise<{ key: string }>;
  get(projectId: string, key: string): Promise<StoredObject | null>;
  delete(projectId: string, key: string): Promise<void>;
}

export class LocalObjectStore implements ObjectStore {
  constructor(private readonly root: string) {}

  async put(
    projectId: string,
    filename: string,
    body: Buffer,
    contentType: string,
  ): Promise<{ key: string }> {
    requireProject(projectId);
    const key = namespacedKey(projectId, filename);
    const full = this.resolveKey(projectId, key);
    if (!full) {
      throw new Error("invalid storage key");
    }
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
    await writeFile(`${full}.meta`, contentType, "utf8");
    return { key };
  }

  async get(projectId: string, key: string): Promise<StoredObject | null> {
    requireProject(projectId);
    const full = this.resolveKey(projectId, key);
    if (!full) return null;
    try {
      const body = await readFile(full);
      const contentType = await readFile(`${full}.meta`, "utf8").catch(
        () => "application/octet-stream",
      );
      return { key, body, contentType: contentType.trim() };
    } catch {
      return null;
    }
  }

  async delete(projectId: string, key: string): Promise<void> {
    requireProject(projectId);
    const full = this.resolveKey(projectId, key);
    if (!full) return;
    await rm(full, { force: true });
    await rm(`${full}.meta`, { force: true });
  }

  private resolveKey(projectId: string, key: string): string | null {
    if (!isKeyForProject(projectId, key)) return null;
    const full = resolve(this.root, ...key.split("/"));
    const rootFull = resolve(this.root, "projects", projectId);
    if (!isInside(rootFull, full)) return null;
    return full;
  }
}

export function namespacedKey(projectId: string, filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "asset";
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_") || "asset";
  return `projects/${projectId}/${safe}`;
}

export function isKeyForProject(projectId: string, key: string): boolean {
  if (!projectId || key.includes("..")) return false;
  return key.startsWith(`projects/${projectId}/`);
}

function isInside(root: string, target: string): boolean {
  const a = resolve(root);
  const b = resolve(target);
  return b === a || b.startsWith(a + sep);
}

function requireProject(projectId: string): void {
  if (!projectId) {
    throw new Error("projectId is required");
  }
}
