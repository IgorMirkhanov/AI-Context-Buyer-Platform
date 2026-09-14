import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AiProviderCredentialStatus } from '@prisma/client';
import {
  AI_PROVIDER_REQUIRED_MESSAGE,
  maskApiKey,
  resolveAiApiKey,
} from '@context-buyer/agents';
import { AiProviderService } from './ai-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptSecret,
  encryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';

const TEST_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('resolveAiApiKey', () => {
  it('prefers a database key over env', () => {
    const resolved = resolveAiApiKey({
      databaseKey: 'sk-db',
      databaseStatus: 'unverified',
      envKey: 'sk-env',
    });
    expect(resolved).toEqual({ apiKey: 'sk-db', source: 'database' });
  });

  it('falls back to env when the database key is missing', () => {
    expect(
      resolveAiApiKey({ databaseKey: null, envKey: 'sk-env' }),
    ).toEqual({ apiKey: 'sk-env', source: 'env' });
  });

  it('skips an invalid database key and uses env', () => {
    expect(
      resolveAiApiKey({
        databaseKey: 'sk-bad',
        databaseStatus: 'invalid',
        envKey: 'sk-env',
      }),
    ).toEqual({ apiKey: 'sk-env', source: 'env' });
  });

  it('returns null when neither source has a key', () => {
    expect(resolveAiApiKey({ databaseKey: '  ', envKey: null })).toBeNull();
  });
});

describe('AiProviderService', () => {
  const key = parseTokenEncryptionKey(TEST_KEY);
  const prisma = {
    aiProviderCredential: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    llmCallLog: {
      aggregate: jest.fn(),
    },
  };
  const config = {
    get: jest.fn((name: string) => {
      if (name === 'TOKEN_ENCRYPTION_KEY') return TEST_KEY;
      return undefined;
    }),
  };
  let service: AiProviderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    config.get.mockImplementation((name: string) => {
      if (name === 'TOKEN_ENCRYPTION_KEY') return TEST_KEY;
      return undefined;
    });
    prisma.aiProviderCredential.findUnique.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue({ llmMonthlyCapUsd: null });
    prisma.llmCallLog.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
    const module = await Test.createTestingModule({
      providers: [
        AiProviderService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(AiProviderService);
  });

  it('round-trips an API key with AES-256-GCM', async () => {
    const apiKey = 'sk-live-openai-example-key';
    prisma.aiProviderCredential.upsert.mockImplementation(async (args: {
      create: { apiKeyEncrypted: string };
    }) => ({
      id: 'cred-1',
      apiKeyEncrypted: args.create.apiKeyEncrypted,
      status: AiProviderCredentialStatus.unverified,
    }));
    await service.upsert('org-1', 'openai', apiKey);
    const stored = prisma.aiProviderCredential.upsert.mock.calls[0][0]
      .create.apiKeyEncrypted as string;
    expect(stored).not.toContain(apiKey);
    expect(stored.split('.')).toHaveLength(3);
    expect(decryptSecret(stored, key)).toBe(apiKey);
    expect(encryptSecret(apiKey, key)).not.toBe(stored);
  });

  it('masks the key in status and never returns the plaintext', async () => {
    prisma.aiProviderCredential.findUnique.mockResolvedValue({
      apiKeyEncrypted: encryptSecret('sk-secret-value', key),
      status: AiProviderCredentialStatus.valid,
      lastVerifiedAt: new Date('2026-08-28T00:00:00.000Z'),
    });
    const status = await service.getStatus('org-1');
    expect(JSON.stringify(status)).not.toContain('sk-secret-value');
    expect(status.providers[3].keyHint).toBe(maskApiKey('sk-secret-value'));
    expect(status.ready).toBe(true);
  });

  it('throws a clear error when no key is configured', async () => {
    await expect(service.requireReady('org-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.requireReady('org-1')).rejects.toThrow(
      AI_PROVIDER_REQUIRED_MESSAGE,
    );
  });

  it('uses the env fallback when the table has no row', async () => {
    config.get.mockImplementation((name: string) => {
      if (name === 'TOKEN_ENCRYPTION_KEY') return TEST_KEY;
      if (name === 'ANTHROPIC_API_KEY') return 'sk-ant-env';
      return undefined;
    });
    const resolved = await service.requireReady('org-1');
    expect(resolved).toEqual({
      provider: 'anthropic',
      apiKey: 'sk-ant-env',
      source: 'env',
    });
  });

  it('does not treat an invalid stored key as ready without env', async () => {
    prisma.aiProviderCredential.findUnique.mockResolvedValue({
      apiKeyEncrypted: encryptSecret('sk-bad', key),
      status: AiProviderCredentialStatus.invalid,
      lastVerifiedAt: new Date(),
    });
    await expect(service.requireReady('org-1')).rejects.toThrow(
      AI_PROVIDER_REQUIRED_MESSAGE,
    );
  });

  it('verifies groq keys via OpenAI-compatible models endpoint', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '[]',
    } as Response);
    const ok = await service.verify('org-1', 'groq', 'gsk-test');
    expect(ok.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer gsk-test',
        }),
      }),
    );
    fetchSpy.mockRestore();
  });

  it('verifies gemini keys via OpenAI-compatible models endpoint', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '[]',
    } as Response);
    const ok = await service.verify('org-1', 'gemini', 'gemini-test');
    expect(ok.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/openai/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer gemini-test',
        }),
      }),
    );
    fetchSpy.mockRestore();
  });

  it('does not block when monthly LLM cap is unset', async () => {
    await expect(service.assertWithinMonthlyCap('org-1')).resolves.toBeUndefined();
  });

  it('blocks paid LLM when month spend reaches the org cap', async () => {
    prisma.organization.findUnique.mockResolvedValue({ llmMonthlyCapUsd: 10 });
    prisma.llmCallLog.aggregate.mockResolvedValue({
      _sum: { costUsd: 10.5 },
    });
    await expect(service.assertWithinMonthlyCap('org-1')).rejects.toMatchObject({
      message: 'LLM spend cap reached',
      spentUsd: 10.5,
      capUsd: 10,
    });
  });

  it('includes spend status on getStatus', async () => {
    prisma.organization.findUnique.mockResolvedValue({ llmMonthlyCapUsd: 25 });
    prisma.llmCallLog.aggregate.mockResolvedValue({
      _sum: { costUsd: 3.25 },
    });
    const status = await service.getStatus('org-1');
    expect(status.spend).toEqual({
      llmMonthlyCapUsd: 25,
      spentUsdThisMonth: 3.25,
      month: expect.stringMatching(/^\d{4}-\d{2}$/),
    });
  });
});
