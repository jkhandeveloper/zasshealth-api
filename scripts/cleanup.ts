import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
// Run daily from a scheduler. Never logs phone numbers, OTPs or clinical records.
async function main() {
  const db = new PrismaClient();
  try {
    await db.requestLimit.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await db.otpChallenge.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 86400000) } },
    });
  } finally {
    await db.$disconnect();
  }
}
void main();
