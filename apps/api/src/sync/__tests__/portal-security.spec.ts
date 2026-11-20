import { createHmac } from 'node:crypto';
import { prisma } from '../../../../portal/src/lib/db';
import { getPatientResults } from '../../../../portal/src/lib/results';
import { verifySyncSignature } from '../../../../portal/src/lib/sync-signature';

type SignedBody =
  { success: true; value: unknown } | { success: false; response: Response };

const { readSignedBody } = require('../../../../portal/src/lib/sync-http') as {
  readSignedBody: (request: Request) => Promise<SignedBody>;
};

jest.mock('../../../../portal/src/lib/db', () => ({
  prisma: {
    portalResult: { findMany: jest.fn() },
  },
}));
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), init),
  },
}));

const syncSecret = 'portal-sync-test-secret-0123456789-abcdef';
const patientRef = '9a8b7c6d-5e4f-4321-9876-123456789012';

describe('Portal security boundaries', () => {
  beforeEach(() => {
    process.env.SYNC_SECRET = syncSecret;
    jest.mocked(prisma.portalResult.findMany).mockReset();
  });

  it('accepts a current signature for the exact body', () => {
    const body = '{"items":[]}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', syncSecret)
      .update(`${timestamp}.${body}`, 'utf8')
      .digest('hex');

    expect(verifySyncSignature(timestamp, signature, body)).toBe(true);
    const invalidSignature = `${signature[0] === '0' ? '1' : '0'}${signature.slice(1)}`;
    expect(verifySyncSignature(timestamp, invalidSignature, body)).toBe(false);
  });

  it('rejects expired sync signatures', () => {
    const body = '{"items":[]}';
    const timestamp = String(Math.floor(Date.now() / 1000) - 301);
    const signature = createHmac('sha256', syncSecret)
      .update(`${timestamp}.${body}`, 'utf8')
      .digest('hex');

    expect(verifySyncSignature(timestamp, signature, body)).toBe(false);
  });

  it.each([
    ['invalid', Math.floor(Date.now() / 1000), '0'.repeat(64)],
    ['expired', Math.floor(Date.now() / 1000) - 301, undefined],
  ])(
    'rejects an %s signature at the sync request boundary',
    async (_label, time, signature) => {
      const body = '{"items":[]}';
      const timestamp = String(time);
      const validSignature = createHmac('sha256', syncSecret)
        .update(`${timestamp}.${body}`, 'utf8')
        .digest('hex');
      const request = new Request(
        'https://portal.example.test/api/sync/results',
        {
          method: 'POST',
          headers: {
            'X-Timestamp': timestamp,
            'X-Signature': signature ?? validSignature,
          },
          body,
        },
      );

      const result = await readSignedBody(request);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.response.status).toBe(401);
    },
  );

  it('scopes result queries to the signed-in patient', async () => {
    await getPatientResults(patientRef);

    expect(prisma.portalResult.findMany).toHaveBeenCalledWith({
      where: { patientRef, orderRef: undefined },
      orderBy: undefined,
    });
  });
});
