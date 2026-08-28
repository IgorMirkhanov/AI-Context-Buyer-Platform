import { PlatformApiError } from "./types";

export type MediaKind = "image" | "video";

export type GenerateImageInput = {
  prompt: string;
  width: number;
  height: number;
};

export type GenerateVideoInput = {
  prompt: string;
  width: number;
  height: number;
  durationMs: number;
};

export type GeneratedMedia = {
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
  durationMs?: number;
  provider: string;
};

export interface MediaGenerationApi {
  generateImage(input: GenerateImageInput): Promise<GeneratedMedia>;
  generateVideo(input: GenerateVideoInput): Promise<GeneratedMedia>;
}

/** 1×1 PNG — детерминированный мок без сетевых вызовов. */
export const MOCK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export function redactMediaSecret(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***");
}

export class MediaGenerationConnector {
  constructor(private readonly api: MediaGenerationApi) {}

  async generateImage(
    projectId: string,
    input: GenerateImageInput,
  ): Promise<GeneratedMedia> {
    requireProject(projectId);
    requirePrompt(input.prompt);
    return this.api.generateImage(input);
  }

  async generateVideo(
    projectId: string,
    input: GenerateVideoInput,
  ): Promise<GeneratedMedia> {
    requireProject(projectId);
    requirePrompt(input.prompt);
    if (!input.durationMs || input.durationMs < 1000) {
      throw new Error("video durationMs must be at least 1000");
    }
    return this.api.generateVideo(input);
  }
}

export class MockMediaGenerationApi implements MediaGenerationApi {
  calls: Array<{ method: string; prompt: string }> = [];

  async generateImage(input: GenerateImageInput): Promise<GeneratedMedia> {
    this.calls.push({ method: "generateImage", prompt: input.prompt });
    return {
      bytes: MOCK_PNG,
      mimeType: "image/png",
      width: input.width,
      height: input.height,
      provider: "mock",
    };
  }

  async generateVideo(input: GenerateVideoInput): Promise<GeneratedMedia> {
    this.calls.push({ method: "generateVideo", prompt: input.prompt });
    return {
      bytes: MOCK_PNG,
      mimeType: "image/png",
      width: input.width,
      height: input.height,
      durationMs: input.durationMs,
      provider: "mock",
    };
  }
}

/**
 * Live image generation via OpenAI Images API.
 * Video stays on the mock fallback — no auto-push to ads cabinets.
 */
export class LiveOpenAiImageApi implements MediaGenerationApi {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly videoFallback: MediaGenerationApi = new MockMediaGenerationApi(),
  ) {}

  async generateImage(input: GenerateImageInput): Promise<GeneratedMedia> {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt: input.prompt,
        size: openaiSize(input.width, input.height),
        response_format: "b64_json",
        n: 1,
      }),
    });
    const rawText = await res.text();
    if (!res.ok) {
      throw new PlatformApiError(
        `Ошибка генерации изображения: ${redactMediaSecret(rawText).slice(0, 240)}`,
        "media_image",
        redactMediaSecret(rawText),
        res.status >= 500,
      );
    }
    let parsed: { data?: Array<{ b64_json?: string; url?: string }> };
    try {
      parsed = JSON.parse(rawText) as typeof parsed;
    } catch {
      throw new PlatformApiError(
        "Ошибка генерации изображения: invalid JSON",
        "media_image",
        "invalid JSON",
      );
    }
    const b64 = parsed.data?.[0]?.b64_json;
    if (b64) {
      return {
        bytes: Buffer.from(b64, "base64"),
        mimeType: "image/png",
        width: input.width,
        height: input.height,
        provider: "openai",
      };
    }
    const url = parsed.data?.[0]?.url;
    if (!url) {
      throw new PlatformApiError(
        "Ошибка генерации изображения: empty response",
        "media_image",
        "empty",
      );
    }
    const img = await fetch(url);
    if (!img.ok) {
      throw new PlatformApiError(
        "Ошибка загрузки сгенерированного изображения",
        "media_image",
        String(img.status),
      );
    }
    return {
      bytes: Buffer.from(await img.arrayBuffer()),
      mimeType: img.headers.get("content-type") || "image/png",
      width: input.width,
      height: input.height,
      provider: "openai",
    };
  }

  generateVideo(input: GenerateVideoInput): Promise<GeneratedMedia> {
    return this.videoFallback.generateVideo(input);
  }
}

export function createMediaGenerationApi(options: {
  mock: boolean;
  apiKey?: string;
  model?: string;
}): MediaGenerationApi {
  if (options.mock || !options.apiKey) {
    return new MockMediaGenerationApi();
  }
  return new LiveOpenAiImageApi(
    options.apiKey,
    options.model || "dall-e-3",
  );
}

function openaiSize(
  width: number,
  height: number,
): "1024x1024" | "1024x1792" | "1792x1024" {
  if (height > width * 1.2) return "1024x1792";
  if (width > height * 1.2) return "1792x1024";
  return "1024x1024";
}

function requireProject(projectId: string): void {
  if (!projectId) {
    throw new Error("projectId is required");
  }
}

function requirePrompt(prompt: string): void {
  if (!prompt?.trim()) {
    throw new Error("prompt is required");
  }
}
