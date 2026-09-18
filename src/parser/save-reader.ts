// Reads a File's full contents as raw bytes, incrementally via
// File.slice(), so progress can be reported during the read (FR-008)
// rather than blocking on a single `file.arrayBuffer()` call with no
// feedback for a 500-600MB save.
//
// Returns a Uint8Array rather than a decoded string deliberately: jomini
// (see version-adapters/1.3.11.ts) accepts raw bytes directly, and V8 has
// a hard string-length ceiling (~536M UTF-16 code units in this Node
// version) well below a real save's size — confirmed by hitting it
// directly while testing against a 653MB real save. A Uint8Array has no
// such ceiling in practice, so reading bytes and handing them to jomini
// as-is (rather than decoding to one big JS string first) is what
// actually lets a save of this size work at all, not just an
// optimization.
//
// (File.stream() would also work in real browsers, but isn't implemented
// by jsdom's File polyfill used in tests — slice() is universally
// supported and avoids that gap entirely.)
export interface ReadProgress {
  bytesRead: number;
  totalBytes: number;
}

const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

/**
 * Reads `file` into a single pre-allocated `Uint8Array` (sized to
 * `file.size` up front, so no reallocation/copying as chunks arrive),
 * calling `onProgress` after each chunk. `signal`, if provided and
 * already aborted (or aborted mid-read), stops the read and rejects —
 * used by the worker to implement FR-010's "cancel an in-progress parse"
 * behavior. `chunkSize` defaults to 8MB in production; tests override it
 * to a tiny value to exercise multi-chunk assembly.
 */
export async function readFileAsBytes(
  file: File,
  onProgress?: (progress: ReadProgress) => void,
  signal?: AbortSignal,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<Uint8Array> {
  const totalBytes = file.size;
  const result = new Uint8Array(totalBytes);
  let bytesRead = 0;

  while (bytesRead < totalBytes) {
    if (signal?.aborted) {
      throw new DOMException("Read aborted", "AbortError");
    }
    const end = Math.min(bytesRead + chunkSize, totalBytes);
    const chunk = await file.slice(bytesRead, end).arrayBuffer();
    result.set(new Uint8Array(chunk), bytesRead);
    bytesRead = end;
    onProgress?.({ bytesRead, totalBytes });
  }

  return result;
}
