/** Tests build/manipulate fixture content as strings (readable
 * `.replace()`/`.slice()` calls); the actual parser functions take raw
 * bytes (see save-reader.ts's doc comment for why). Encode right before
 * calling them. */
export function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
