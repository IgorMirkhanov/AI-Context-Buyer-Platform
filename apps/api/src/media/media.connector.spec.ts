import {
  createMediaGenerationApi,
  MediaGenerationConnector,
  MockMediaGenerationApi,
  MOCK_PNG,
  redactMediaSecret,
} from '@context-buyer/connectors';

describe('MediaGenerationConnector', () => {
  const api = new MockMediaGenerationApi();
  const connector = new MediaGenerationConnector(api);

  it('returns a mock image bound to the requested projectId', async () => {
    const image = await connector.generateImage('project-1', {
      prompt: 'Offer: Гарантия 3 года. Product shot, no text overlay.',
      width: 1024,
      height: 1024,
    });
    expect(image.provider).toBe('mock');
    expect(image.mimeType).toBe('image/png');
    expect(image.bytes.equals(MOCK_PNG)).toBe(true);
    expect(api.calls[0]).toEqual({
      method: 'generateImage',
      prompt: 'Offer: Гарантия 3 года. Product shot, no text overlay.',
    });
  });

  it('returns a mock video poster without calling ads APIs', async () => {
    const video = await connector.generateVideo('project-1', {
      prompt: '5-second clip, Offer: Гарантия 3 года',
      width: 1280,
      height: 720,
      durationMs: 5000,
    });
    expect(video.durationMs).toBe(5000);
    expect(video.provider).toBe('mock');
    expect(api.calls.some((item) => item.method === 'generateVideo')).toBe(
      true,
    );
    expect(JSON.stringify(api.calls)).not.toMatch(/yandex|google-ads/i);
  });

  it('requires projectId', async () => {
    await expect(
      connector.generateImage('', {
        prompt: 'test',
        width: 1024,
        height: 1024,
      }),
    ).rejects.toThrow(/projectId/);
  });

  it('requires a prompt', async () => {
    await expect(
      connector.generateImage('project-1', {
        prompt: '  ',
        width: 1024,
        height: 1024,
      }),
    ).rejects.toThrow(/prompt/);
  });

  it('uses mock when MEDIA_MOCK or API key is missing', () => {
    const mock = createMediaGenerationApi({ mock: true, apiKey: 'sk-secret' });
    expect(mock).toBeInstanceOf(MockMediaGenerationApi);
    const fallback = createMediaGenerationApi({ mock: false });
    expect(fallback).toBeInstanceOf(MockMediaGenerationApi);
  });

  it('redacts OpenAI keys in error text', () => {
    expect(redactMediaSecret('Bearer sk-abc123 failed')).toBe('Bearer *** failed');
    expect(redactMediaSecret('key sk-proj-abc')).not.toContain('sk-proj-abc');
  });
});
