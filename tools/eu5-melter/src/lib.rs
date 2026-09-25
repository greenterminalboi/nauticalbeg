//! EU5 save melter compiled to WASM for NauticalBeg's parser Worker.
//!
//! Turns any non-plain-text EU5 save (binary and/or zip-compressed, header
//! kinds 1-5) into the plaintext form the existing text parser reads. See
//! specs/015-save-format-support/contracts/melter-wasm.md for the JS-facing
//! contract; every error string starts with a machine-readable prefix
//! (`damaged:` / `unrecognized:` / `cancelled:`) that `melt.ts` maps to an
//! `ErrorKind`.

pub mod tokens;
#[cfg(feature = "encoder")]
pub mod encode;

use eu5save::{
    Eu5File, Eu5Melt, Eu5TextMelt, FailedResolveStrategy, JominiFileKind, MeltOptions, SaveContentKind,
    SaveHeaderKind, SaveMetadataKind, SaveResolver,
};
use std::collections::HashMap;
use std::io::Write;
use tokens::FlatTokens;
use wasm_bindgen::prelude::*;

/// Upper bound on melted output. A real 84MB save melts to ~654MB; anything
/// beyond this is treated as a damaged/crafted file (zip-bomb guard,
/// security constitution) rather than allowed to exhaust memory.
pub const MAX_OUTPUT_BYTES: u64 = 3 * 1024 * 1024 * 1024;
/// Same guard applied up front to the zip's declared gamestate size.
pub const MAX_GAMESTATE_BYTES: u64 = 2 * 1024 * 1024 * 1024;

const CHUNK_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug)]
pub enum MeltError {
    Damaged(String),
    Unrecognized(String),
    Cancelled,
}

impl std::fmt::Display for MeltError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MeltError::Damaged(m) => write!(f, "damaged: {m}"),
            MeltError::Unrecognized(m) => write!(f, "unrecognized: {m}"),
            MeltError::Cancelled => write!(f, "cancelled: melt aborted by caller"),
        }
    }
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Stats {
    pub unknown_tokens: u32,
    pub unknown_lookups: u32,
}

fn open(save: &[u8]) -> Result<Eu5File<std::io::Cursor<&[u8]>>, MeltError> {
    let file = Eu5File::from_slice(save).map_err(|e| MeltError::Damaged(e.to_string()))?;
    if let SaveHeaderKind::Other(kind) = file.header().kind() {
        return Err(MeltError::Unrecognized(format!("save header kind {kind:02x}")));
    }
    let declares_zip = matches!(
        file.header().kind(),
        SaveHeaderKind::UnifiedText | SaveHeaderKind::UnifiedBinary | SaveHeaderKind::SplitText | SaveHeaderKind::SplitBinary
    );
    match file.kind() {
        JominiFileKind::Zip(zip) => {
            if zip.gamestate_uncompressed_hint() > MAX_GAMESTATE_BYTES {
                return Err(MeltError::Damaged("decompressed size cap exceeded".into()));
            }
        }
        // jomini falls back to "uncompressed" when it can't locate a zip,
        // so a truncated/corrupt compressed save would otherwise melt
        // "successfully" into garbage (found via the damaged-truncated
        // fixture). The header says a zip must be there — trust it.
        _ if declares_zip => {
            return Err(MeltError::Damaged("header declares a compressed save but no zip archive was found".into()));
        }
        _ => {}
    }
    Ok(file)
}

fn options() -> MeltOptions {
    MeltOptions::new().on_failed_resolve(FailedResolveStrategy::Stringify)
}

/// Pure-Rust core of `melt`, shared by the WASM export, native tests, and
/// the fixture generator's self-check. `sink` receives output in chunks and
/// returns `false` to cancel.
pub fn melt_to(
    save: &[u8],
    tokens: &FlatTokens,
    sink: &mut dyn FnMut(&[u8]) -> bool,
) -> Result<Stats, MeltError> {
    let file = open(save)?;
    let mut writer = ChunkWriter::new(sink);
    let result = melt_into(&file, tokens, &mut writer);
    let flushed = writer.flush();
    if writer.cancelled {
        return Err(MeltError::Cancelled);
    }
    if writer.over_cap {
        return Err(MeltError::Damaged("decompressed size cap exceeded".into()));
    }
    let stats = result?;
    flushed.map_err(|e| MeltError::Damaged(e.to_string()))?;
    Ok(stats)
}

fn damaged(e: impl std::fmt::Display) -> MeltError {
    MeltError::Damaged(e.to_string())
}

fn melt_into(
    file: &Eu5File<std::io::Cursor<&[u8]>>,
    tokens: &FlatTokens,
    writer: &mut ChunkWriter<'_>,
) -> Result<Stats, MeltError> {
    // Zipped *text* saves (kinds 02/04) just need unzipping. Handled here
    // rather than through eu5save's melt because that path always demands
    // a `string_lookup` zip entry, which a text save has no need for
    // (found generating the kind-02 fixture).
    if let JominiFileKind::Zip(zip) = file.kind() {
        if let SaveContentKind::Text(mut body) = zip.gamestate_verified().map_err(damaged)? {
            let mut header = file.header().clone();
            header.set_kind(SaveHeaderKind::Text);
            header.write(&mut *writer).map_err(damaged)?;
            std::io::copy(&mut body, &mut *writer).map_err(damaged)?;
            return Ok(Stats::default());
        }
    }
    let resolver = SaveResolver::from_file(file, tokens).map_err(damaged)?;
    let mut file_ref = file;
    let doc = Eu5Melt::melt(&mut file_ref, options(), &resolver, &mut *writer).map_err(damaged)?;
    Ok(Stats {
        unknown_tokens: doc.unknown_tokens().len() as u32,
        unknown_lookups: doc.unknown_lookups().len() as u32,
    })
}

/// Melts only the metadata section (cheap), so the caller can read
/// `metadata.version` and pick version-specific token overrides before the
/// full melt (research R6).
pub fn melt_metadata_to_vec(save: &[u8], tokens: &FlatTokens) -> Result<Vec<u8>, MeltError> {
    let file = open(save)?;
    let mut out = Vec::new();
    match file.meta().map_err(damaged)? {
        SaveMetadataKind::Text(mut meta) => {
            meta.melt(&mut out).map_err(damaged)?;
        }
        mut meta @ SaveMetadataKind::Binary(_) => {
            let resolver = SaveResolver::from_file(&file, tokens).map_err(damaged)?;
            meta.melt(options(), &resolver, &mut out).map_err(damaged)?;
        }
    }
    Ok(out)
}

/// Buffers melt output into fixed-size chunks handed to `sink`, so the
/// full ~650MB result never has to exist inside WASM linear memory
/// (research R8).
struct ChunkWriter<'a> {
    sink: &'a mut dyn FnMut(&[u8]) -> bool,
    buf: Vec<u8>,
    total: u64,
    cancelled: bool,
    over_cap: bool,
}

impl<'a> ChunkWriter<'a> {
    fn new(sink: &'a mut dyn FnMut(&[u8]) -> bool) -> Self {
        ChunkWriter { sink, buf: Vec::with_capacity(CHUNK_BYTES), total: 0, cancelled: false, over_cap: false }
    }

    fn emit(&mut self) -> std::io::Result<()> {
        if self.buf.is_empty() {
            return Ok(());
        }
        if !(self.sink)(&self.buf) {
            self.cancelled = true;
            return Err(std::io::Error::other("cancelled"));
        }
        self.buf.clear();
        Ok(())
    }
}

impl Write for ChunkWriter<'_> {
    fn write(&mut self, data: &[u8]) -> std::io::Result<usize> {
        if self.cancelled || self.over_cap {
            return Err(std::io::Error::other("stopped"));
        }
        self.total += data.len() as u64;
        if self.total > MAX_OUTPUT_BYTES {
            self.over_cap = true;
            return Err(std::io::Error::other("size cap"));
        }
        self.buf.extend_from_slice(data);
        if self.buf.len() >= CHUNK_BYTES {
            self.emit()?;
        }
        Ok(data.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        if self.cancelled || self.over_cap {
            return Ok(());
        }
        self.emit()
    }
}

// ---------------------------------------------------------------------------
// WASM exports (contracts/melter-wasm.md)
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub struct Resolver {
    tokens: FlatTokens,
}

#[wasm_bindgen]
pub struct MeltStats {
    stats: Stats,
}

#[wasm_bindgen]
impl MeltStats {
    #[wasm_bindgen(getter)]
    pub fn unknown_tokens(&self) -> u32 {
        self.stats.unknown_tokens
    }

    #[wasm_bindgen(getter)]
    pub fn unknown_lookups(&self) -> u32 {
        self.stats.unknown_lookups
    }
}

fn js_err(e: MeltError) -> JsError {
    JsError::new(&e.to_string())
}

/// `override_ids[i]` is renamed to `override_names[i]`.
#[wasm_bindgen]
pub fn create_resolver(table: &[u8], override_ids: &[u32], override_names: Vec<String>) -> Result<Resolver, JsError> {
    let tokens = FlatTokens::parse(table).map_err(|e| JsError::new(&e.to_string()))?;
    let overrides: HashMap<u16, String> = override_ids
        .iter()
        .zip(override_names)
        .map(|(id, name)| (*id as u16, name))
        .collect();
    Ok(Resolver { tokens: tokens.with_overrides(overrides) })
}

#[wasm_bindgen]
pub fn melt_metadata(save: &[u8], resolver: &Resolver) -> Result<Vec<u8>, JsError> {
    melt_metadata_to_vec(save, &resolver.tokens).map_err(js_err)
}

/// Estimated melted size in bytes, for pre-sizing the JS output buffer.
#[wasm_bindgen]
pub fn estimate_output_size(save: &[u8]) -> f64 {
    let Ok(file) = Eu5File::from_slice(save) else { return save.len() as f64 * 8.0 };
    match file.kind() {
        JominiFileKind::Zip(zip) => zip.gamestate_uncompressed_hint() as f64 * 2.2,
        _ => save.len() as f64 * 8.0,
    }
}

/// Full melt; `write(chunk)` receives views only valid during the call and
/// returns `false` to cancel.
#[wasm_bindgen]
pub fn melt(save: &[u8], resolver: &Resolver, write: &js_sys::Function) -> Result<MeltStats, JsError> {
    let mut sink = |chunk: &[u8]| -> bool {
        // SAFETY-free: `view` borrows WASM memory only for this call; JS copies it out.
        let view = unsafe { js_sys::Uint8Array::view(chunk) };
        match write.call1(&JsValue::NULL, &view) {
            Ok(v) => v.as_bool().unwrap_or(true),
            Err(_) => false,
        }
    };
    melt_to(save, &resolver.tokens, &mut sink).map(|stats| MeltStats { stats }).map_err(js_err)
}

#[cfg(test)]
mod tests {
    use super::*;
    use jomini::binary::TokenResolver;

    /// Lookup-only resolver, mirroring upstream melt.rs tests.
    struct LookupOnly(&'static [&'static str]);
    impl TokenResolver for LookupOnly {
        fn resolve(&self, _token: u16) -> Option<&str> {
            None
        }
        fn lookup(&self, index: u32) -> Option<&str> {
            self.0.get(index as usize).copied()
        }
    }

    fn lookup_u8(i: u8) -> [u8; 3] {
        let id = jomini::binary::LexemeId::LOOKUP_U8.0.to_le_bytes();
        [id[0], id[1], i]
    }

    fn melt_body(body: &[u8], resolver: &LookupOnly) -> String {
        // Uncompressed binary (kind 01) with empty metadata.
        let header = format!("SAV0201{}{:08x}\n", "00000000", 0);
        let mut save = header.into_bytes();
        save.extend_from_slice(body);
        let file = Eu5File::from_slice(&save[..]).unwrap();
        let mut out = Vec::new();
        (&file).melt(options(), resolver, &mut out).unwrap();
        String::from_utf8(out).unwrap()
    }

    #[test]
    fn quotes_lookup_values_containing_spaces() {
        let resolver = LookupOnly(&["Custom_Name", "Lil Israel", "box", "Right"]);
        let eq = jomini::binary::LexemeId::EQUAL.0.to_le_bytes();
        let mut body = Vec::new();
        body.extend_from_slice(&lookup_u8(0));
        body.extend_from_slice(&eq);
        body.extend_from_slice(&lookup_u8(1));
        body.extend_from_slice(&lookup_u8(2));
        body.extend_from_slice(&eq);
        body.extend_from_slice(&lookup_u8(3));
        let text = melt_body(&body, &resolver);
        assert!(text.contains("Custom_Name=\"Lil Israel\""), "{text}");
        assert!(text.contains("box=Right"), "{text}");
    }
}
