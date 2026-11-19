import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const frontDeskHash = await bcrypt.hash('Staff@123456', 10);
  const frontDesk = await prisma.staffUser.upsert({
    where: { username: 'frontdesk' },
    update: {},
    create: {
      name: 'Front Desk Officer',
      username: 'frontdesk',
      passwordHash: frontDeskHash,
      role: StaffRole.FRONT_DESK,
      active: true,
    },
  });
  console.log(`Front desk user ensured: ${frontDesk.username}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
