//! Generates the committed save-format fixtures from the plain text fixture
//! (research R7; run via `npm run generate:save-fixtures`):
//!
//! - `rus-1628-minimal.bin.eu5`   kind 01: uncompressed binary
//! - `rus-1628-minimal.zip.eu5`   kind 03: binary metadata + zip(gamestate, string_lookup)
//! - `rus-1628-minimal.ztext.eu5` kind 02: text metadata + zip(gamestate)
//!
//! plus the error-path fixtures used by load-save.test.ts (US4):
//!
//! - `damaged-truncated.zip.eu5`  the .zip fixture cut to 60% of its length
//! - `damaged-badzip.zip.eu5`     the .zip fixture with its central directory zeroed
//! - `unknown-kind.eu5`           the text fixture with header kind 06
//! - `unknown-tokens.bin.eu5`     the .bin fixture with one key token swapped
//!                                for an ID absent from the token table
//!
//! Then self-checks that melting each valid fixture reproduces the source
//! document token-for-token (modulo quoting), so a broken encoder fails here
//! rather than in the TS tests.

use eu5_melter::encode::{self, Encoder, StringMode};
use eu5_melter::tokens::FlatTokens;
use std::collections::HashMap;
use std::path::PathBuf;

fn main() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let fixtures = root.join("tests/fixtures");
    let source = std::fs::read_to_string(fixtures.join("rus-1628-minimal.eu5")).expect("text fixture");
    let table = std::fs::read(root.join("public/tokens/eu5.flat")).expect("token table");
    // Encode with the 1.3.11 overrides reversed, like a real 1.3.11 save:
    // the fixture's `strength` must become token 0x28de, not whatever ID
    // pdx.tools' table would otherwise give a field named `strength`.
    let overrides = HashMap::from([(0x28deu16, "strength".to_string())]);
    let tokens = FlatTokens::parse(&table).unwrap().with_overrides(overrides.clone());

    let (_, metadata_text, body_text) = encode::split_text_save(&source);

    // kind 01 — uncompressed binary, inline strings.
    let mut enc = Encoder::new(&tokens, StringMode::Inline);
    let meta_bin = enc.encode(metadata_text);
    let body_bin = enc.encode(body_text);
    let mut bin = encode::header(0x01, meta_bin.len()).into_bytes();
    bin.extend_from_slice(&body_bin);

    // kind 03 — binary metadata + zip(gamestate, string_lookup).
    let mut enc = Encoder::new(&tokens, StringMode::Lookup);
    let body_bin = enc.encode(body_text);
    let meta_bin = enc.encode(metadata_text);
    let lookup = enc.string_lookup();
    let mut zipped = encode::header(0x03, meta_bin.len()).into_bytes();
    zipped.extend_from_slice(&meta_bin);
    zipped.extend_from_slice(&encode::zip(&[("gamestate", &body_bin), ("string_lookup", &lookup)]));

    // kind 02 — text metadata + zip(text gamestate).
    let mut ztext = encode::header(0x02, metadata_text.len()).into_bytes();
    ztext.extend_from_slice(metadata_text.as_bytes());
    ztext.extend_from_slice(&encode::zip(&[("gamestate", body_text.as_bytes())]));

    // Self-check: melt each and compare token streams with the source.
    let expected = normalize(body_text);
    for (name, data) in [("bin", &bin), ("zip", &zipped), ("ztext", &ztext)] {
        let mut out = Vec::new();
        let stats = eu5_melter::melt_to(data, &tokens, &mut |c: &[u8]| {
            out.extend_from_slice(c);
            true
        })
        .unwrap_or_else(|e| panic!("{name}: melt failed: {e}"));
        assert_eq!(stats, eu5_melter::Stats::default(), "{name}: unknown tokens/lookups");
        let melted = String::from_utf8(out).unwrap();
        let (_, melted_body) = melted.split_once('\n').unwrap();
        let got = normalize(melted_body);
        if let Some(i) = (0..expected.len().max(got.len())).find(|&i| expected.get(i) != got.get(i)) {
            panic!(
                "{name}: melt differs from source at token {i}: expected {:?}, got {:?}",
                &expected[i.saturating_sub(3)..(i + 3).min(expected.len())],
                &got[i.saturating_sub(3)..(i + 3).min(got.len())]
            );
        }
        println!("{name}: {} bytes, melt round-trips ({} tokens)", data.len(), got.len());
    }

    let write = |file: &str, data: &[u8]| {
        std::fs::write(fixtures.join(file), data).unwrap();
        println!("wrote tests/fixtures/{file} ({} bytes)", data.len());
    };
    write("rus-1628-minimal.bin.eu5", &bin);
    write("rus-1628-minimal.zip.eu5", &zipped);
    write("rus-1628-minimal.ztext.eu5", &ztext);

    // --- error-path fixtures (US4) ---
    write("damaged-truncated.zip.eu5", &zipped[..zipped.len() * 6 / 10]);

    let mut badzip = zipped.clone();
    let eocd = badzip.windows(4).rposition(|w| w == b"PK\x05\x06").expect("zip EOCD");
    let cd_offset = u32::from_le_bytes(badzip[eocd + 16..eocd + 20].try_into().unwrap()) as usize;
    badzip[cd_offset..eocd].fill(0);
    write("damaged-badzip.zip.eu5", &badzip);

    let mut unknown_kind = source.clone().into_bytes();
    unknown_kind[5..7].copy_from_slice(b"06");
    write("unknown-kind.eu5", &unknown_kind);

    // Swap the first occurrence of the `multiplayer` token for an ID the
    // table has no name for, to exercise the unknown-token warning.
    let unused = (0x5c00u16..0x5c95).find(|&id| jomini::binary::TokenResolver::resolve(&tokens, id).is_none())
        .expect("an unused token id");
    let target = tokens.reverse()["multiplayer"].to_le_bytes();
    let mut unknown_tokens = bin.clone();
    let at = unknown_tokens.windows(2).position(|w| w == target).expect("multiplayer token");
    unknown_tokens[at..at + 2].copy_from_slice(&unused.to_le_bytes());
    write("unknown-tokens.bin.eu5", &unknown_tokens);
}

/// Token stream with quotes stripped, for quoting-insensitive comparison.
fn normalize(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_quote = false;
    for c in text.chars() {
        match c {
            '"' => in_quote = !in_quote,
            c if !in_quote && (c.is_whitespace() || matches!(c, '{' | '}' | '=')) => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
                if !c.is_whitespace() {
                    out.push(c.to_string());
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}
