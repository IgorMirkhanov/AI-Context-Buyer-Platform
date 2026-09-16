import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../../.env') });

const projectId = process.argv[2] ?? 'd32c36bd-5fce-40a8-8a4a-cac783607548';

async function main() {
  const prisma = new PrismaClient();
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, websiteUrl: true, primaryPlatform: true },
    });
    const brief = await prisma.projectBrief.findFirst({
      where: { projectId },
      orderBy: { version: 'desc' },
    });
    const payload = brief?.payloadJson as {
      project?: { geo?: string[]; website_url?: string };
      marketing?: { usp?: string[]; product_description?: string };
    } | null;
    const tasks = await prisma.agentTask.findMany({
      where: { projectId },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: {
        agentType: true,
        status: true,
        error: true,
        startedAt: true,
      },
    });
    console.log(
      JSON.stringify(
        {
          project,
          geo: payload?.project?.geo,
          usp: payload?.marketing?.usp,
          product: payload?.marketing?.product_description,
          tasks,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
