#!/usr/bin/env bash
# Builds the EU5 melter WASM into src/parser/melter/generated/ (committed).
# Only needed when changing tools/eu5-melter — the app itself never needs Rust.
#
# Homebrew's rustc sits first on PATH and has no wasm32 target; rustup's
# toolchain in ~/.cargo/bin does (research R9).
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"
cd "$(dirname "$0")"

command -v cargo >/dev/null || { echo "cargo not found — install rustup (https://rustup.rs)" >&2; exit 1; }
rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown \
  || { echo "missing target: run 'rustup target add wasm32-unknown-unknown'" >&2; exit 1; }
command -v wasm-bindgen >/dev/null \
  || { echo "wasm-bindgen not found: run 'cargo install wasm-bindgen-cli --version 0.2.128'" >&2; exit 1; }

# --experimental-reset-state-function: generates __wbg_reset_state(), which
# re-instantiates the module with fresh linear memory. WASM memory never
# shrinks, so melt.ts resets after every melt to hand the input copy and
# decompression buffers back to the GC (research R8).
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target web --experimental-reset-state-function --out-dir ../../src/parser/melter/generated --out-name eu5_melter \
  target/wasm32-unknown-unknown/release/eu5_melter.wasm
ls -la ../../src/parser/melter/generated/
