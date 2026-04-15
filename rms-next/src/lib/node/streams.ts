import { Readable } from "node:stream";
import { ReadableStream as WebReadableStream } from "node:stream/web";

/**
 * Convert a Web ReadableStream (from `File.stream()`) to a Node Readable.
 * Safe in Next.js Node runtime.
 */
export function webToNodeReadable(
  stream: ReadableStream<Uint8Array>,
): Readable {
  // `Readable.fromWeb` exists in modern Node.
  return Readable.fromWeb(stream as unknown as WebReadableStream);
}

