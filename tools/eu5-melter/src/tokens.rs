//! Reader for pdx.tools' EU5 "flat" token table (`public/tokens/eu5.flat`).
//!
//! Clean-room implementation from the file's observed layout (research R3);
//! pdx-tools' own `FlatResolver` is AGPL and deliberately not used.
//!
//! ```text
//! u16le entryCount + 1   (23701)
//! u16le breakpoint       (9999)
//! repeat: u8 len, len bytes UTF-8   (len = 0 => no token)
//! ```
//!
//! ID rule: `id <= breakpoint -> entries[id]`, `id > breakpoint -> entries[id - 1]`.
//! A plain `entries[id]` looks nearly right but silently shifts every
//! high-range key by one slot (found by diffing against `rakaly melt`).

use jomini::binary::TokenResolver;
use std::collections::HashMap;

#[derive(Debug)]
pub struct FlatTokens {
    entries: Vec<Option<String>>,
    breakpoint: usize,
    overrides: HashMap<u16, String>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct TokenTableError(pub String);

impl std::fmt::Display for TokenTableError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "invalid token table: {}", self.0)
    }
}

impl FlatTokens {
    pub fn parse(data: &[u8]) -> Result<Self, TokenTableError> {
        if data.len() < 4 {
            return Err(TokenTableError("header shorter than 4 bytes".into()));
        }
        let breakpoint = u16::from_le_bytes([data[2], data[3]]) as usize;
        let mut entries = Vec::new();
        let mut i = 4;
        while i < data.len() {
            let len = data[i] as usize;
            i += 1;
            let end = i + len;
            if end > data.len() {
                return Err(TokenTableError(format!(
                    "entry {} runs past end of table",
                    entries.len()
                )));
            }
            let name = std::str::from_utf8(&data[i..end])
                .map_err(|_| TokenTableError(format!("entry {} is not UTF-8", entries.len())))?;
            entries.push((!name.is_empty()).then(|| name.to_string()));
            i = end;
        }
        Ok(FlatTokens {
            entries,
            breakpoint,
            overrides: HashMap::new(),
        })
    }

    /// Per-game-version corrections applied on top of the table (research R4).
    pub fn with_overrides(mut self, overrides: HashMap<u16, String>) -> Self {
        self.overrides = overrides;
        self
    }

    fn table_lookup(&self, token: u16) -> Option<&str> {
        let id = token as usize;
        let index = match id.cmp(&self.breakpoint) {
            std::cmp::Ordering::Less => id,
            std::cmp::Ordering::Equal => return None,
            std::cmp::Ordering::Greater => id - 1,
        };
        self.entries.get(index).and_then(|x| x.as_deref())
    }

    /// Reverse map name -> token id, overrides included. Used by the
    /// fixture encoder only.
    #[cfg(any(test, feature = "encoder"))]
    pub fn reverse(&self) -> HashMap<String, u16> {
        let mut out = HashMap::new();
        for id in 0..=u16::MAX {
            if let Some(name) = self.resolve(id) {
                out.entry(name.to_string()).or_insert(id);
            }
        }
        out
    }
}

impl TokenResolver for FlatTokens {
    fn resolve(&self, token: u16) -> Option<&str> {
        if let Some(name) = self.overrides.get(&token) {
            return Some(name.as_str());
        }
        self.table_lookup(token)
    }

    fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table() -> FlatTokens {
        let data = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/../../public/tokens/eu5.flat"))
            .expect("public/tokens/eu5.flat");
        FlatTokens::parse(&data).unwrap()
    }

    #[test]
    fn resolves_low_range_ids_directly() {
        let t = table();
        assert_eq!(t.resolve(1717), Some("date"));
        assert_eq!(t.resolve(2526), Some("metadata"));
        assert_eq!(t.resolve(238), Some("version"));
    }

    #[test]
    fn resolves_high_range_ids_with_breakpoint_gap() {
        let t = table();
        // The R3 bug: naive entries[id] gives "shown_in_loading_screen" here.
        assert_eq!(t.resolve(15285), Some("player_country_name"));
        assert_eq!(t.resolve(13431), Some("code_version_info"));
        assert_eq!(t.resolve(9999), None);
    }

    #[test]
    fn strength_override_for_1_3_11() {
        let t = table();
        assert_eq!(t.resolve(0x28de), Some("unused_strength"));
        let t = t.with_overrides(HashMap::from([(0x28de, "strength".to_string())]));
        assert_eq!(t.resolve(0x28de), Some("strength"));
    }

    #[test]
    fn rejects_malformed_tables() {
        assert!(FlatTokens::parse(&[0x95, 0x5c, 0x0f]).is_err());
        assert!(FlatTokens::parse(&[0x95, 0x5c, 0x0f, 0x27, 5, b'a', b'b']).is_err());
    }
}
