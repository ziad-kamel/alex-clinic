import { PrismaClient, StaffRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial data...');

  // 1. Staff accounts (Admin, Front Desk, Lab)
  const adminPasswordHash = await bcrypt.hash('Admin@123456', 10);
  const admin = await prisma.staffUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      name: 'System Admin',
      username: 'admin',
      passwordHash: adminPasswordHash,
      role: StaffRole.ADMIN,
      active: true,
    },
  });
  console.log(`Admin user ensured: ${admin.username} (${admin.id})`);

  const frontdeskPasswordHash = await bcrypt.hash('Staff@123456', 10);
  const frontdesk = await prisma.staffUser.upsert({
    where: { username: 'frontdesk' },
    update: {},
    create: {
      name: 'Front Desk Officer',
      username: 'frontdesk',
      passwordHash: frontdeskPasswordHash,
      role: StaffRole.FRONT_DESK,
      active: true,
    },
  });
  console.log(`Front desk user ensured: ${frontdesk.username} (${frontdesk.id})`);

  const labPasswordHash = await bcrypt.hash('Lab@123456', 10);
  const lab = await prisma.staffUser.upsert({
    where: { username: 'lab' },
    update: {
      passwordHash: labPasswordHash,
      role: StaffRole.LAB,
      active: true,
    },
    create: {
      name: 'Lab Specialist',
      username: 'lab',
      passwordHash: labPasswordHash,
      role: StaffRole.LAB,
      active: true,
    },
  });
  console.log(`Lab user ensured: ${lab.username} (${lab.id})`);

  const doctorPasswordHash = await bcrypt.hash('Doctor@123456', 10);
  const doctorUser = await prisma.staffUser.upsert({
    where: { username: 'doctor' },
    update: {
      passwordHash: doctorPasswordHash,
      role: StaffRole.DOCTOR,
      active: true,
    },
    create: {
      id: 'd0000000-0000-0000-0000-000000000001',
      name: 'Dr. Ahmed Mostafa',
      username: 'doctor',
      passwordHash: doctorPasswordHash,
      role: StaffRole.DOCTOR,
      active: true,
    },
  });
  console.log(`Doctor user ensured: ${doctorUser.username} (${doctorUser.id})`);

  // 2. Specializations
  const generalMed = await prisma.specialization.upsert({
    where: { name: 'General Medicine' },
    update: { nameAr: 'طب عام' },
    create: { name: 'General Medicine', nameAr: 'طب عام' },
  });

  const pediatrics = await prisma.specialization.upsert({
    where: { name: 'Pediatrics' },
    update: { nameAr: 'طب الأطفال' },
    create: { name: 'Pediatrics', nameAr: 'طب الأطفال' },
  });

  const internalMed = await prisma.specialization.upsert({
    where: { name: 'Internal Medicine' },
    update: { nameAr: 'باطنة' },
    create: { name: 'Internal Medicine', nameAr: 'باطنة' },
  });

  // 3. Doctors with schedules
  const doctor1 = await prisma.doctor.upsert({
    where: { id: 'd0000000-0000-0000-0000-000000000001' },
    update: {
      name: 'Dr. Ahmed Mostafa',
      nameAr: 'د. أحمد مصطفى',
      specializationId: internalMed.id,
      active: true,
    },
    create: {
      id: 'd0000000-0000-0000-0000-000000000001',
      name: 'Dr. Ahmed Mostafa',
      nameAr: 'د. أحمد مصطفى',
      specializationId: internalMed.id,
      active: true,
    },
  });

  // Schedules (Sunday=0 to Thursday=4)
  for (let weekday = 0; weekday <= 4; weekday++) {
    const existing = await prisma.doctorSchedule.findFirst({
      where: { doctorId: doctor1.id, weekday },
    });
    if (!existing) {
      await prisma.doctorSchedule.create({
        data: {
          doctorId: doctor1.id,
          weekday,
          startTime: '09:00',
          endTime: '14:00',
          maxPatients: 25,
        },
      });
    }
  }

  // 4. Lab Tests Catalog (CBC, Glucose, Creatinine, Lipid Panel)
  const testCatalog = [
    {
      code: 'CBC',
      name: 'Complete Blood Count',
      nameAr: 'صورة دم كاملة',
      unit: '',
      referenceRange: 'See sub-components',
    },
    {
      code: 'FBS',
      name: 'Fasting Blood Sugar',
      nameAr: 'سكر صائم',
      unit: 'mg/dL',
      referenceRange: '70 - 99',
    },
    {
      code: 'CREAT',
      name: 'Serum Creatinine',
      nameAr: 'كرياتينين بالدم',
      unit: 'mg/dL',
      referenceRange: '0.7 - 1.3',
    },
    {
      code: 'LIPID',
      name: 'Lipid Profile',
      nameAr: 'دهون كاملة',
      unit: 'mg/dL',
      referenceRange: '< 200 Total Cholesterol',
    },
  ];

  for (const test of testCatalog) {
    await prisma.labTest.upsert({
      where: { code: test.code },
      update: {
        name: test.name,
        nameAr: test.nameAr,
        unit: test.unit,
        referenceRange: test.referenceRange,
        active: true,
      },
      create: {
        code: test.code,
        name: test.name,
        nameAr: test.nameAr,
        unit: test.unit,
        referenceRange: test.referenceRange,
        active: true,
      },
    });
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
