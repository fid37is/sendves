import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/lib/env.server";

/** Received mail larger than this is ignored: no reply needs more, and it keeps one message from exhausting memory. */
export const MAX_RAW_BYTES = 12 * 1024 * 1024;

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    const { region, accessKeyId, secretAccessKey } = serverEnv.aws;
    if (!region) throw new Error("AWS_REGION is not set.");
    client = new S3Client({ region, ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}) });
  }
  return client;
}

/**
 * Reads a received message SES stored in S3. Only the configured bucket is ever read: the bucket name in a
 * notification is data, and must not decide where Sendves reads from.
 */
export async function readStoredMessage(bucket: string, key: string): Promise<Buffer | null> {
  if (!serverEnv.inbound.s3Bucket || bucket !== serverEnv.inbound.s3Bucket) return null;
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) return null;
  if (typeof res.ContentLength === "number" && res.ContentLength > MAX_RAW_BYTES) return null;
  const bytes = await res.Body.transformToByteArray();
  return bytes.length > MAX_RAW_BYTES ? null : Buffer.from(bytes);
}
