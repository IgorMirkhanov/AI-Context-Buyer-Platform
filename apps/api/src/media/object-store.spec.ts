import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalObjectStore, namespacedKey } from './object-store';

describe('LocalObjectStore isolation', () => {
  let root: string;
  let store: LocalObjectStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'media-store-'));
    store = new LocalObjectStore(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores and reads bytes only under the given projectId', async () => {
    const body = Buffer.from('png-bytes');
    const { key } = await store.put('project-a', 'hero.png', body, 'image/png');
    expect(key).toBe(namespacedKey('project-a', 'hero.png'));
    expect(key.startsWith('projects/project-a/')).toBe(true);

    const own = await store.get('project-a', key);
    expect(own?.body.equals(body)).toBe(true);
    expect(own?.contentType).toBe('image/png');

    const leaked = await store.get('project-b', key);
    expect(leaked).toBeNull();
  });

  it('rejects path traversal in keys and filenames', async () => {
    const { key } = await store.put(
      'project-a',
      '../../secret.png',
      Buffer.from('x'),
      'image/png',
    );
    expect(key).toBe('projects/project-a/secret.png');
    expect(await store.get('project-a', 'projects/project-a/../../secret.png')).toBeNull();
    expect(
      await store.get('project-a', 'projects/project-b/secret.png'),
    ).toBeNull();
  });
});
