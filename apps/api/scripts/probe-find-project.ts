import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(__dirname, '../../../.env') });

async function main() {
  const prisma = new PrismaClient();
  try {
    const byId = await prisma.project.findMany({
      where: {
        OR: [
          { id: 'd32c36bd-5fce-40a8-8a4a-cac783607548' },
          { name: { contains: 'Medical', mode: 'insensitive' } },
          { name: { contains: 'cancel', mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true },
      take: 20,
    });
    const recent = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, name: true, createdAt: true },
    });
    console.log(JSON.stringify({ byId, recent }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
