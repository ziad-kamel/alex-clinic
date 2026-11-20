import { NextResponse } from 'next/server';
import { verifySyncSignature } from './sync-signature';

const MAX_SYNC_BODY_BYTES = 1_048_576;

export type SignedBody =
  | { success: true; value: unknown }
  | { success: false; response: NextResponse };

export async function readSignedBody(request: Request): Promise<SignedBody> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_SYNC_BODY_BYTES) {
    return {
      success: false,
      response: NextResponse.json(
        { message: 'Request body is too large' },
        { status: 413 },
      ),
    };
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_SYNC_BODY_BYTES) {
        await reader.cancel();
        return {
          success: false,
          response: NextResponse.json(
            { message: 'Request body is too large' },
            { status: 413 },
          ),
        };
      }
      chunks.push(value);
    }
  }

  const bodyBytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let rawBody: string;
  try {
    rawBody = new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes);
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { message: 'Invalid UTF-8 body' },
        { status: 400 },
      ),
    };
  }

  if (
    !verifySyncSignature(
      request.headers.get('x-timestamp'),
      request.headers.get('x-signature'),
      rawBody,
    )
  ) {
    return {
      success: false,
      response: NextResponse.json(
        { message: 'Invalid signature' },
        { status: 401 },
      ),
    };
  }

  try {
    return { success: true, value: JSON.parse(rawBody) as unknown };
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { message: 'Invalid JSON body' },
        { status: 400 },
      ),
    };
  }
}
