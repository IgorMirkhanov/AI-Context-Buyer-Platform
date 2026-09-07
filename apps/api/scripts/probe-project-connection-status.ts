import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ProjectsService } from '../src/projects/projects.service';
import { PrismaService } from '../src/prisma/prisma.service';

const projectId = process.argv[2] ?? '98abacc8-8c51-4881-aa24-5c6b66907847';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService);
    const projects = app.get(ProjectsService);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { organizationId: true, name: true },
    });
    if (!project) throw new Error('project not found');
    const result = await projects.getForOrganization(
      project.organizationId,
      projectId,
    );
    console.log(
      JSON.stringify(
        {
          project: project.name,
          connection: result.connection,
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
