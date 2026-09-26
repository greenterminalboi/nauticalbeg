/// <reference lib="webworker" />
// Brotli-compresses a snapshot container off the main thread (017, research
// R3). On the real 85MB multiplayer save, 181MB of tables becomes 12.5MB
// (gzip, the only browser built-in, reaches ~51MB). Streams in chunks so
// progress can be reported (constitution V).
import brotliPromise from "brotli-wasm";

export type CompressRequest = { type: "compress"; input: Uint8Array } | { type: "cancel" };
export type CompressResponse =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; output: Uint8Array }
  | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
// brotli-wasm is a Rust port and compresses less than native Brotli at the same
// level: on the real 181MB export, q5-q8 give ~20MB and q9 gives 12.5MB in
// ~11s (017 research R3, measured). q9 halves storage for a few more seconds.
const QUALITY = 9;
const INPUT_CHUNK = 4 * 1024 * 1024;
const OUTPUT_CHUNK = 1024 * 1024;
let cancelled = false;

async function compress(input: Uint8Array): Promise<void> {
  const brotli = await brotliPromise;
  const stream = new brotli.CompressStream(QUALITY);
  const out: Uint8Array[] = [];
  let outBytes = 0;
  let lastPost = 0;
  try {
    let offset = 0;
    while (offset < input.length) {
      if (cancelled) return;
      const chunk = input.subarray(offset, Math.min(offset + INPUT_CHUNK, input.length));
      let chunkOffset = 0;
      // Feed this chunk until the encoder has consumed all of it.
      do {
        const result = stream.compress(chunk.subarray(chunkOffset), OUTPUT_CHUNK);
        chunkOffset += result.input_offset;
        out.push(result.buf.slice());
        outBytes += result.buf.length;
        result.free();
      } while (chunkOffset < chunk.length);
      offset += chunk.length;
      const now = Date.now();
      if (now - lastPost >= 250) {
        lastPost = now;
        ctx.postMessage({ type: "progress", done: offset, total: input.length } satisfies CompressResponse);
      }
      // Yield so a cancel message can be received between chunks.
      await new Promise((r) => setTimeout(r, 0));
    }
    // Finish: call with no input until the encoder reports success.
    for (;;) {
      const result = stream.compress(undefined, OUTPUT_CHUNK);
      out.push(result.buf.slice());
      outBytes += result.buf.length;
      const code = result.code;
      result.free();
      if (code === brotli.BrotliStreamResultCode.ResultSuccess) break;
    }
  } finally {
    stream.free();
  }
  const output = new Uint8Array(outBytes);
  let at = 0;
  for (const part of out) {
    output.set(part, at);
    at += part.length;
  }
  ctx.postMessage({ type: "progress", done: input.length, total: input.length } satisfies CompressResponse);
  ctx.postMessage({ type: "done", output } satisfies CompressResponse, [output.buffer]);
}

ctx.onmessage = (event: MessageEvent<CompressRequest>) => {
  const msg = event.data;
  if (msg.type === "cancel") {
    cancelled = true;
    return;
  }
  cancelled = false;
  compress(msg.input).catch((err: unknown) => {
    ctx.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "Compression failed.",
    } satisfies CompressResponse);
  });
};
