/**
 * One-off: run semantic agent for a project via Nest application context.
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/trigger-semantic.ts <projectId>
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SemanticService } from '../src/semantic/semantic.service';

config({ path: resolve(__dirname, '../../../.env') });

const projectId = process.argv[2];
if (!projectId) {
  console.error('Usage: trigger-semantic.ts <projectId>');
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
      select: {
        id: true,
        organizationId: true,
        name: true,
        websiteUrl: true,
      },
    });
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const brief = await prisma.projectBrief.findFirst({
      where: { projectId: project.id },
      orderBy: { version: 'desc' },
      select: { payloadJson: true },
    });
    const briefGeo = (
      brief?.payloadJson as { project?: { geo?: string[] } } | null
    )?.project?.geo;
    const semantic = app.get(SemanticService);
    const result = await semantic.run(project.organizationId, project.id);
    const clusters = await prisma.semanticCluster.count({
      where: { projectId: project.id },
    });
    const keywords = await prisma.semanticKeyword.count({
      where: { projectId: project.id },
    });
    console.log(
      JSON.stringify(
        {
          project: project.name,
          projectId: project.id,
          geo: briefGeo,
          clusters,
          keywords,
          resultSummary: result
            ? {
                clusterCount: Array.isArray(
                  (result as { clusters?: unknown }).clusters,
                )
                  ? (result as { clusters: unknown[] }).clusters.length
                  : undefined,
              }
            : null,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
