/**
 * Force OAuth token refresh for a project's ad credential.
 * Usage: npx ts-node --transpile-only scripts/trigger-token-refresh.ts <projectId>
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TokenRefreshService } from '../src/oauth/token-refresh.service';
import { PrismaService } from '../src/prisma/prisma.service';

const projectId = process.argv[2];
if (!projectId) {
  console.error('Usage: trigger-token-refresh.ts <projectId>');
  process.exit(1);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const prisma = app.get(PrismaService);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, organizationId: true, name: true },
    });
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const refresh = app.get(TokenRefreshService);
    const result = await refresh.refreshProject(
      project.organizationId,
      project.id,
      { force: true },
    );
    console.log(JSON.stringify({ project: project.name, ...result }, null, 2));
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
