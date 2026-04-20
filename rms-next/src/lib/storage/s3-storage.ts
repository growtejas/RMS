/**
 * S3-compatible object storage (AWS S3 or MinIO). Enable with STORAGE_DRIVER=s3
 * and set S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
 */
import type { Readable } from "node:stream";

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`${name} is required for S3 storage`);
  }
  return v;
}

export async function s3PutBuffer(key: string, body: Buffer, contentType?: string) {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const client = new S3Client({
    region: required("S3_REGION"),
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: required("S3_BUCKET"),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

export async function s3PutStream(
  key: string,
  stream: Readable,
  contentLength: number,
  contentType?: string,
) {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const client = new S3Client({
    region: required("S3_REGION"),
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: required("S3_BUCKET"),
      Key: key,
      Body: stream,
      ContentLength: contentLength,
      ContentType: contentType,
    }),
  );
  return key;
}
