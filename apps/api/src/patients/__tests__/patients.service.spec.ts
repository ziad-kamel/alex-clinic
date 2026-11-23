import { PatientsService } from '../patients.service';

describe('PatientsService patient identity reuse', () => {
  let service: PatientsService;
  let prisma: any;
  let tx: any;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn(),
      patient: {
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'new-patient' }),
      },
    };
    prisma = {
      $transaction: jest.fn(async (callback: (transaction: any) => unknown) => callback(tx)),
    };
    service = new PatientsService(prisma);
  });

  it('returns an existing patient with the same normalized name and phone', async () => {
    tx.patient.findMany.mockResolvedValue([{ id: 'existing-patient', name: 'أحمد محمد' }]);
    tx.patient.findUniqueOrThrow.mockResolvedValue({ id: 'existing-patient' });

    const patient = await service.create({
      name: 'احمد محمد',
      phone: '+20 10 1234 5678',
    } as any);

    expect(tx.patient.findMany).toHaveBeenCalledWith({
      where: { phoneNormalized: '01012345678' },
      select: { id: true, name: true },
    });
    expect(tx.patient.create).not.toHaveBeenCalled();
    expect(patient).toEqual({ id: 'existing-patient' });
  });

  it('keeps a different patient with a shared phone separate', async () => {
    tx.patient.findMany.mockResolvedValue([{ id: 'family-member', name: 'Another Person' }]);

    await service.create({ name: 'New Person', phone: '01012345678' } as any);

    expect(tx.patient.create).toHaveBeenCalledWith({
      data: {
        name: 'New Person',
        phone: '01012345678',
        phoneNormalized: '01012345678',
        extraPhone: null,
      },
    });
  });
});
