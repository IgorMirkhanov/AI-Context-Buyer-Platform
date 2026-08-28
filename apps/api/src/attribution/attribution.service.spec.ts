import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AttributionProvider } from '@prisma/client';
import { AttributionService } from './attribution.service';
import { PrismaService } from '../prisma/prisma.service';
import { AttributionRouter } from '../connectors/attribution-router';
import {
  decryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';

const TEST_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('AttributionService connect', () => {
  const prisma = {
    project: { findFirst: jest.fn() },
    attributionCredential: { upsert: jest.fn() },
  };

  it('encrypts the CRM token and inbound secret', async () => {
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
    });
    prisma.attributionCredential.upsert.mockResolvedValue({});
    const module = await Test.createTestingModule({
      providers: [
        AttributionService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'TOKEN_ENCRYPTION_KEY') return TEST_KEY;
              if (key === 'API_PORT') return '3001';
              return undefined;
            },
          },
        },
        { provide: AttributionRouter, useValue: { forProvider: jest.fn() } },
      ],
    }).compile();
    const service = module.get(AttributionService);
    const result = await service.connect('org-a', 'p1', {
      provider: 'bitrix24' as AttributionProvider,
      token: 'https://portal.bitrix24.ru/rest/1/plain-token',
    });
    const upsert = prisma.attributionCredential.upsert.mock.calls[0][0];
    const stored = upsert.create.tokenEncrypted as string;
    expect(stored).not.toContain('plain-token');
    const key = parseTokenEncryptionKey(TEST_KEY);
    expect(decryptSecret(stored, key)).toContain('plain-token');
    expect(result.inboundSecret).toBeTruthy();
    expect(result.inboundUrl).toContain('/attribution/inbound/p1');
  });
});
