/* eslint-disable no-console */
//
// One-time backfill: link every existing competitor to a persistent
// Athlete row. Idempotent — re-running it is a no-op for already-linked
// rows. Match key is non-empty email; otherwise creates a fresh athlete.
//
// Usage: npm run backfill:athletes
//

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const orphans = await prisma.competitor.findMany({
    where: { athleteId: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      dateOfBirth: true,
      gender: true,
    },
  });

  console.log(`Found ${orphans.length} competitors without an athlete link.`);

  let linked = 0;
  let created = 0;
  let skipped = 0;

  for (const c of orphans) {
    const email = c.email && c.email.trim().length > 0 ? c.email.trim() : null;

    try {
      const existing = email
        ? await prisma.athlete.findUnique({ where: { email } })
        : null;

      const athlete = existing
        ? existing
        : await prisma.athlete.create({
            data: {
              firstName: c.firstName,
              lastName: c.lastName,
              dateOfBirth: c.dateOfBirth,
              gender: c.gender,
              email,
            },
          });

      await prisma.competitor.update({
        where: { id: c.id },
        data: { athleteId: athlete.id },
      });

      if (existing) linked++;
      else created++;
    } catch (e) {
      console.warn(`  ! skipped ${c.firstName} ${c.lastName} (${c.id}):`, (e as Error).message);
      skipped++;
    }
  }

  console.log('');
  console.log(`Backfill complete:`);
  console.log(`  Linked to existing athlete: ${linked}`);
  console.log(`  Created new athlete:        ${created}`);
  console.log(`  Skipped (errors):           ${skipped}`);
  console.log(`  Total processed:            ${orphans.length}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
