//! V24-R4 wiki/494 acceptance #9 + Critic C-R4-2 / C-R4-9 perf gate.
//!
//! Writes a synthetic 1000-file workspace per C-R4-9 (each file ~2 KB,
//! 1 `struct` + 3 `fn`s → ~3000 symbols density), then times one
//! `musu indexer sync` invocation against it.
//!
//! Gate (C-R4-2):
//!   * If `MUSU_R4_REF_MS` env var is set (Builder ran the Python+Go
//!     baseline measurement step first), assert wall-time ≤ 2× that
//!     reference.
//!   * Else fall back to an absolute 30 s ceiling (lenient — release
//!     builds on operator hardware usually finish well under 5 s, but
//!     CI on tiny VMs is slow; the gate is "doesn't hang forever",
//!     not "must beat Python").
//!
//! Marked `#[ignore]` so `cargo test` doesn't run it by default — perf
//! tests get noisy on shared CI runners. Run explicitly via:
//!
//! ```
//! cargo test --release --test r4_scanner_perf -- --ignored
//! ```

use std::path::Path;
use std::process::Command;
use std::time::Instant;

/// C-R4-9 fixture spec — 1000 .rs files at ~2 KB each, populated with
/// 1 struct + 3 fns so the symbol density matches realistic codebases.
fn make_synthetic_workspace(work_dir: &Path, n_files: usize) {
    std::fs::create_dir_all(work_dir).expect("mkdir work_dir");
    let template = r#"
pub struct Widget_{i} {{
    pub field_a: u32,
    pub field_b: String,
    pub field_c: Vec<u8>,
}}

pub fn make_widget_{i}() -> Widget_{i} {{
    Widget_{i} {{
        field_a: {i},
        field_b: "filler-{i}".to_string(),
        field_c: vec![{i} as u8; 32],
    }}
}}

pub fn use_widget_{i}(w: &Widget_{i}) -> u32 {{
    // padding padding padding padding padding padding
    // padding padding padding padding padding padding
    // padding padding padding padding padding padding
    // padding padding padding padding padding padding
    w.field_a + w.field_b.len() as u32
}}

pub fn fmt_widget_{i}(w: &Widget_{i}) -> String {{
    format!("widget {{}} = {{:?}}", w.field_a, w.field_c)
}}
"#;
    for i in 0..n_files {
        let path = work_dir.join(format!("file_{i:04}.rs"));
        let body = template.replace("{i}", &i.to_string());
        std::fs::write(&path, body).expect("write file");
    }
}

fn tempdir(prefix: &str) -> std::path::PathBuf {
    let mut p = std::env::temp_dir();
    p.push(format!(
        "musu-rs-{}-{}",
        prefix,
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&p).expect("mkdir tempdir");
    p
}

/// C-R4-2 + #9 perf gate. Ignored by default — explicit `--ignored` opt-in.
#[test]
#[ignore = "perf gate; run with `cargo test --release -- --ignored`"]
fn r4_scanner_perf_1000_files_within_budget() {
    let work_dir = tempdir("r4-perf");
    make_synthetic_workspace(&work_dir, 1000);

    let bin = env!("CARGO_BIN_EXE_musu");
    let start = Instant::now();
    let out = Command::new(bin)
        .arg("indexer")
        .arg("sync")
        .arg("--work-dir")
        .arg(&work_dir)
        .arg("--name")
        .arg("r4-perf")
        .env("RUST_LOG", "warn")
        .output()
        .expect("spawn musu indexer sync");
    let elapsed = start.elapsed();

    assert!(
        out.status.success(),
        "sync failed: stdout={} stderr={}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );

    let ms = elapsed.as_millis() as u64;

    // C-R4-2 gate: prefer baseline-driven 2× ceiling when available;
    // otherwise fall back to an absolute generous ceiling that catches
    // pathological regressions (the rayon scan should finish in well
    // under 5 s on operator hardware, but CI VMs can be 5-10× slower).
    if let Ok(ref_str) = std::env::var("MUSU_R4_REF_MS") {
        let ref_ms: u64 = ref_str
            .parse()
            .expect("MUSU_R4_REF_MS must be integer milliseconds");
        let ceiling = ref_ms.saturating_mul(2);
        eprintln!("R4 perf: elapsed={ms} ms; reference={ref_ms} ms; gate=2× = {ceiling} ms");
        assert!(
            ms <= ceiling,
            "perf regression: {ms} ms > 2× reference {ref_ms} ms ({ceiling} ms ceiling)"
        );
    } else {
        // Absolute fallback: 30 s. The CI-skip story is `#[ignore]` above;
        // when this gate runs it should comfortably fit.
        let ceiling_ms = 30_000u64;
        eprintln!(
            "R4 perf: elapsed={ms} ms; no MUSU_R4_REF_MS — using absolute {ceiling_ms} ms ceiling"
        );
        assert!(
            ms <= ceiling_ms,
            "perf regression: {ms} ms exceeded absolute fallback {ceiling_ms} ms ceiling"
        );
    }
}
