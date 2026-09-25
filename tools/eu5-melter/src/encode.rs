//! Test-only Clausewitz text -> EU5 binary encoder (feature `encoder`).
//!
//! Exists solely to generate small committed fixtures in every save format
//! from `tests/fixtures/rus-1628-minimal.eu5` (research R7): real binary
//! saves are 84MB+ of other players' data and can't be committed, and
//! hand-writing EU5's binary number encodings isn't reproducible.
//!
//! Output mirrors the shape observed in the real `SAV0203` save: the zip's
//! `gamestate` holds the whole document (metadata block first), the same
//! metadata block is duplicated uncompressed right after the header, and
//! keys/bare strings missing from the token table go through the save's
//! own `string_lookup` table. Lexeme IDs are jomini's
//! (`jomini/src/binary/lexer.rs`).

use crate::tokens::FlatTokens;
use jomini::binary::LexemeId;
use std::collections::HashMap;
use std::io::Write;

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Open,
    Close,
    Equal,
    Quoted(String),
    Bare(String),
}

fn tokenize(text: &str) -> Vec<Tok> {
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b' ' | b'\t' | b'\r' | b'\n' => i += 1,
            b'{' => {
                out.push(Tok::Open);
                i += 1;
            }
            b'}' => {
                out.push(Tok::Close);
                i += 1;
            }
            b'=' => {
                out.push(Tok::Equal);
                i += 1;
            }
            b'"' => {
                let mut s = Vec::new();
                i += 1;
                while i < bytes.len() && bytes[i] != b'"' {
                    if bytes[i] == b'\\' && i + 1 < bytes.len() {
                        i += 1;
                    }
                    s.push(bytes[i]);
                    i += 1;
                }
                i += 1; // closing quote
                out.push(Tok::Quoted(String::from_utf8(s).expect("utf-8 fixture")));
            }
            _ => {
                let start = i;
                while i < bytes.len() && !matches!(bytes[i], b' ' | b'\t' | b'\r' | b'\n' | b'{' | b'}' | b'=' | b'"') {
                    i += 1;
                }
                out.push(Tok::Bare(text[start..i].to_string()));
            }
        }
    }
    out
}

/// Whether bare strings/unknown keys become `string_lookup` references (the
/// zip formats, like real saves) or inline QUOTED/UNQUOTED strings (plain
/// uncompressed binary, which has no lookup table).
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum StringMode {
    Lookup,
    Inline,
}

pub struct Encoder {
    names: HashMap<String, u16>,
    mode: StringMode,
    lookup: Vec<String>,
    lookup_index: HashMap<String, u32>,
}

impl Encoder {
    pub fn new(tokens: &FlatTokens, mode: StringMode) -> Self {
        Encoder { names: tokens.reverse(), mode, lookup: Vec::new(), lookup_index: HashMap::new() }
    }

    fn id(out: &mut Vec<u8>, id: LexemeId) {
        out.extend_from_slice(&id.0.to_le_bytes());
    }

    fn inline_string(out: &mut Vec<u8>, id: LexemeId, s: &str) {
        Self::id(out, id);
        out.extend_from_slice(&(s.len() as u16).to_le_bytes());
        out.extend_from_slice(s.as_bytes());
    }

    fn lookup_ref(&mut self, out: &mut Vec<u8>, s: &str) {
        let next = self.lookup.len() as u32;
        let index = *self.lookup_index.entry(s.to_string()).or_insert_with(|| {
            self.lookup.push(s.to_string());
            next
        });
        if index <= u8::MAX as u32 {
            Self::id(out, LexemeId::LOOKUP_U8);
            out.push(index as u8);
        } else if index <= u16::MAX as u32 {
            Self::id(out, LexemeId::LOOKUP_U16);
            out.extend_from_slice(&(index as u16).to_le_bytes());
        } else {
            Self::id(out, LexemeId::LOOKUP_U24);
            out.extend_from_slice(&index.to_le_bytes()[..3]);
        }
    }

    fn string(&mut self, out: &mut Vec<u8>, s: &str) {
        match self.mode {
            StringMode::Lookup => self.lookup_ref(out, s),
            StringMode::Inline => Self::inline_string(out, LexemeId::UNQUOTED, s),
        }
    }

    fn integer(out: &mut Vec<u8>, s: &str) -> bool {
        let Ok(v) = s.parse::<i128>() else { return false };
        // Small magnitudes as I32: well clear of the melter's I32
        // date heuristic, which only fires for values encoding year > -100.
        if v.abs() < 10_000_000 {
            Self::id(out, LexemeId::I32);
            out.extend_from_slice(&(v as i32).to_le_bytes());
        } else if (0..=u32::MAX as i128).contains(&v) {
            Self::id(out, LexemeId::U32);
            out.extend_from_slice(&(v as u32).to_le_bytes());
        } else if (i64::MIN as i128..=i64::MAX as i128).contains(&v) {
            Self::id(out, LexemeId::I64);
            out.extend_from_slice(&(v as i64).to_le_bytes());
        } else if (0..=u64::MAX as i128).contains(&v) {
            Self::id(out, LexemeId::U64);
            out.extend_from_slice(&(v as u64).to_le_bytes());
        } else {
            return false;
        }
        true
    }

    /// EU5 compact fixed-point: value * 100000 as a 0-7 byte magnitude,
    /// lexeme `FIXED5_ZERO + bytes (+7 if negative)`.
    fn fixed5(out: &mut Vec<u8>, s: &str) -> bool {
        let Some((_, frac)) = s.split_once('.') else { return false };
        if frac.len() > 5 || !frac.bytes().all(|b| b.is_ascii_digit()) {
            return false;
        }
        let Ok(v) = s.parse::<f64>() else { return false };
        let scaled = (v * 100_000.0).round();
        let magnitude = scaled.abs() as u64;
        if magnitude >= 1 << 56 {
            return false;
        }
        let bytes = (64 - magnitude.leading_zeros()).div_ceil(8) as u16;
        let negative = scaled < 0.0 && magnitude != 0;
        Self::id(out, LexemeId::new(LexemeId::FIXED5_ZERO.0 + bytes + if negative { 7 } else { 0 }));
        out.extend_from_slice(&magnitude.to_le_bytes()[..bytes as usize]);
        true
    }

    fn is_date(s: &str) -> bool {
        let parts: Vec<_> = s.trim_start_matches('-').split('.').collect();
        parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
    }

    fn key(&mut self, out: &mut Vec<u8>, s: &str) {
        if let Some(id) = self.names.get(s) {
            out.extend_from_slice(&id.to_le_bytes());
        } else if s.bytes().all(|b| b.is_ascii_digit()) && Self::integer(out, s) {
        } else {
            self.string(out, s);
        }
    }

    fn value(&mut self, out: &mut Vec<u8>, s: &str) {
        match s {
            "yes" | "no" => {
                Self::id(out, LexemeId::BOOL);
                out.push((s == "yes") as u8);
            }
            // Dates stay textual (UNQUOTED) so they melt back verbatim no
            // matter which key they sit under.
            _ if Self::is_date(s) => Self::inline_string(out, LexemeId::UNQUOTED, s),
            _ if Self::integer(out, s) => {}
            _ if Self::fixed5(out, s) => {}
            _ => self.string(out, s),
        }
    }

    /// Encodes a whole text document (no SAV header line).
    pub fn encode(&mut self, text: &str) -> Vec<u8> {
        let toks = tokenize(text);
        let mut out = Vec::new();
        let mut i = 0;
        while i < toks.len() {
            let next_is_equal = matches!(toks.get(i + 1), Some(Tok::Equal));
            match &toks[i] {
                Tok::Open => Self::id(&mut out, LexemeId::OPEN),
                Tok::Close => Self::id(&mut out, LexemeId::CLOSE),
                Tok::Equal => Self::id(&mut out, LexemeId::EQUAL),
                Tok::Quoted(s) => Self::inline_string(&mut out, LexemeId::QUOTED, s),
                Tok::Bare(s) if s == "rgb" && matches!(toks.get(i + 1), Some(Tok::Open)) => {
                    // rgb { r g b } -> RGB OPEN U32 r U32 g U32 b CLOSE
                    Self::id(&mut out, LexemeId::RGB);
                    Self::id(&mut out, LexemeId::OPEN);
                    for j in 0..3 {
                        let Some(Tok::Bare(n)) = toks.get(i + 2 + j) else { panic!("malformed rgb literal") };
                        Self::id(&mut out, LexemeId::U32);
                        out.extend_from_slice(&n.parse::<u32>().expect("rgb component").to_le_bytes());
                    }
                    Self::id(&mut out, LexemeId::CLOSE);
                    i += 5;
                }
                Tok::Bare(s) if next_is_equal => self.key(&mut out, s),
                Tok::Bare(s) => self.value(&mut out, s),
            }
            i += 1;
        }
        out
    }

    /// `string_lookup` zip entry: 5-byte preamble (skipped by eu5save's
    /// parser; real saves start with `01` + 4 bytes) then u16-length strings.
    pub fn string_lookup(&self) -> Vec<u8> {
        let mut out = vec![0x01];
        out.extend_from_slice(&(self.lookup.len() as u32).to_le_bytes());
        for s in &self.lookup {
            out.extend_from_slice(&(s.len() as u16).to_le_bytes());
            out.extend_from_slice(s.as_bytes());
        }
        out
    }
}

/// Splits a text save (header line included) into (header, metadata block
/// `metadata={...}` + trailing newline, full body without header).
pub fn split_text_save(save: &str) -> (&str, &str, &str) {
    let (header, body) = save.split_once('\n').expect("header line");
    let mut depth = 0i32;
    let mut end = None;
    let mut in_quote = false;
    for (i, b) in body.bytes().enumerate() {
        match b {
            b'"' => in_quote = !in_quote,
            b'{' if !in_quote => depth += 1,
            b'}' if !in_quote => {
                depth -= 1;
                if depth == 0 {
                    end = Some(i + 1);
                    break;
                }
            }
            _ => {}
        }
    }
    let end = end.expect("metadata block");
    let meta_end = body[end..].find('\n').map(|n| end + n + 1).unwrap_or(end);
    (header, &body[..meta_end], body)
}

/// Header line in the real layout: `SAV` + version + kind + 8 random
/// chars + 8-hex metadata length + 8 padding chars + `\n`.
pub fn header(kind: u8, metadata_len: usize) -> String {
    format!("SAV02{kind:02x}9ce65dcc{metadata_len:08x}00000000\n")
}

pub fn zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut cursor = std::io::Cursor::new(Vec::new());
    {
        let mut w = zip::ZipWriter::new(&mut cursor);
        let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (name, data) in entries {
            w.start_file(*name, options).unwrap();
            w.write_all(data).unwrap();
        }
        w.finish().unwrap();
    }
    cursor.into_inner()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed5_encoding_matches_lexer_layout() {
        let mut out = Vec::new();
        assert!(Encoder::fixed5(&mut out, "0.4"));
        // 40000 = 0x9c40 -> FIXED5_U16
        assert_eq!(&out[..2], &LexemeId::FIXED5_U16.0.to_le_bytes());
        assert_eq!(&out[2..], &[0x40, 0x9c]);
        let mut out = Vec::new();
        assert!(Encoder::fixed5(&mut out, "-11.40825"));
        assert_eq!(&out[..2], &LexemeId::FIXED5_I24.0.to_le_bytes());
    }
}
