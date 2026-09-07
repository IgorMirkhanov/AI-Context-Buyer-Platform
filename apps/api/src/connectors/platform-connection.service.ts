import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdPlatform } from '@prisma/client';
import type { ConnectionVerificationResult } from '@context-buyer/connectors';
import { ConnectorRouter } from './connector-router';
import {
  decryptSecret,
  parseTokenEncryptionKey,
} from '../security/token-encryption';

export const DEFAULT_CONNECTION_VERIFY_THROTTLE_MS = 15 * 60 * 1000;

type StoredCredential = {
  accessTokenEncrypted: string;
  externalAccountId: string | null;
};

export function shouldVerifyConnection(
  apiVerifiedAt: Date | null,
  now: Date,
  throttleMs: number,
): boolean {
  if (!apiVerifiedAt) {
    return true;
  }
  return now.getTime() - apiVerifiedAt.getTime() >= throttleMs;
}

export function verificationCheckFields(
  result: ConnectionVerificationResult,
  checkedAt: Date,
): { apiVerifiedAt: Date; apiVerificationError: string | null } {
  return {
    apiVerifiedAt: checkedAt,
    apiVerificationError: result.ok ? null : result.reason,
  };
}

@Injectable()
export class PlatformConnectionService {
  constructor(
    private readonly config: ConfigService,
    private readonly connectors: ConnectorRouter,
  ) {}

  throttleMs(): number {
    const raw = this.config.get<string>('CONNECTION_VERIFY_THROTTLE_MS');
    const parsed = raw != null ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_CONNECTION_VERIFY_THROTTLE_MS;
  }

  buildAuth(credential: StoredCredential, projectId: string) {
    return {
      accessToken: decryptSecret(
        credential.accessTokenEncrypted,
        parseTokenEncryptionKey(
          this.config.get<string>('TOKEN_ENCRYPTION_KEY'),
        ),
      ),
      clientLogin: credential.externalAccountId ?? undefined,
      projectId,
    };
  }

  verifyProjectConnection(
    projectId: string,
    platform: AdPlatform,
    credential: StoredCredential,
  ): Promise<ConnectionVerificationResult> {
    const connector = this.connectors.forPlatform(platform);
    return connector.verifyConnection(projectId, this.buildAuth(credential, projectId));
  }
}

export function resolveConnectionStatus(credential: {
  apiVerificationError: string | null;
} | null): 'connected' | 'not_connected' | 'needs_reconnect' {
  if (!credential) {
    return 'not_connected';
  }
  if (credential.apiVerificationError) {
    return 'needs_reconnect';
  }
  return 'connected';
}
