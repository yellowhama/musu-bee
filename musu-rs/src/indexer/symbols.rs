//! V24-R4 wiki/494 §3 `symbols.rs` — language-specific symbol extraction.
//!
//! Ported byte-for-byte from Python `musu-indexer/src/musu_indexer/core.py:44-69`
//! per plan §4 C6 ("Builder may NOT 'improve' them without explicit Critic
//! finding"). C-R4-8 LOW resolution: iterate per-line, no `(?m)` flag — each
//! pattern is anchored at `^` and applied to a single line at a time, matching
//! Python's `pattern.search(line)` semantics.
//!
//! Languages covered: .rs / .ts / .tsx / .py / .go + .md section headers.
//! Everything else returns an empty symbol list (file content still indexed
//! into FTS5, just without symbol rows).
//!
//! Regex compilation cost: `regex::Regex` is allocated lazily via `OnceLock`
//! so each pattern is compiled at most once per process even when called from
//! many rayon worker threads in parallel.

use std::sync::OnceLock;

use regex::Regex;

// ─────────────────────── Regex tables (Python parity) ───────────────────────
//
// Each entry: `(pattern_factory, kind_label)`. Kind labels match Python
// strings byte-for-byte so the FTS5 `code_symbols`-style rows look identical
// to historical data.

type PatternFactory = fn() -> &'static Regex;

#[allow(clippy::type_complexity)]
fn rs_patterns() -> &'static [(PatternFactory, &'static str)] {
    // (?:pub(?:\(.*\))?\s+)? — optional pub(crate)/pub(super)/etc visibility
    static FN_: OnceLock<Regex> = OnceLock::new();
    static STRUCT_: OnceLock<Regex> = OnceLock::new();
    static ENUM_: OnceLock<Regex> = OnceLock::new();
    static IMPL_: OnceLock<Regex> = OnceLock::new();
    fn rs_fn() -> &'static Regex {
        FN_.get_or_init(|| {
            Regex::new(r"^\s*(?:pub(?:\(.*\))?\s+)?fn\s+([a-zA-Z_]\w*)").expect("rs_fn regex")
        })
    }
    fn rs_struct() -> &'static Regex {
        STRUCT_.get_or_init(|| {
            Regex::new(r"^\s*(?:pub(?:\(.*\))?\s+)?struct\s+([a-zA-Z_]\w*)").expect("rs_struct")
        })
    }
    fn rs_enum() -> &'static Regex {
        ENUM_.get_or_init(|| {
            Regex::new(r"^\s*(?:pub(?:\(.*\))?\s+)?enum\s+([a-zA-Z_]\w*)").expect("rs_enum")
        })
    }
    fn rs_impl() -> &'static Regex {
        IMPL_.get_or_init(|| Regex::new(r"^\s*impl(?:\s+.*)?\s+([a-zA-Z_]\w*)").expect("rs_impl"))
    }
    &[
        (rs_fn, "function"),
        (rs_struct, "struct"),
        (rs_enum, "enum"),
        (rs_impl, "impl"),
    ]
}

#[allow(clippy::type_complexity)]
fn ts_patterns() -> &'static [(PatternFactory, &'static str)] {
    static FN_: OnceLock<Regex> = OnceLock::new();
    static CLASS_: OnceLock<Regex> = OnceLock::new();
    static IFACE_: OnceLock<Regex> = OnceLock::new();
    fn ts_fn() -> &'static Regex {
        FN_.get_or_init(|| {
            Regex::new(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_]\w*)")
                .expect("ts_fn regex")
        })
    }
    fn ts_class() -> &'static Regex {
        CLASS_.get_or_init(|| {
            Regex::new(r"^\s*(?:export\s+)?class\s+([a-zA-Z_]\w*)").expect("ts_class")
        })
    }
    fn ts_iface() -> &'static Regex {
        IFACE_.get_or_init(|| {
            Regex::new(r"^\s*(?:export\s+)?interface\s+([a-zA-Z_]\w*)").expect("ts_iface")
        })
    }
    &[
        (ts_fn, "function"),
        (ts_class, "class"),
        (ts_iface, "interface"),
    ]
}

#[allow(clippy::type_complexity)]
fn py_patterns() -> &'static [(PatternFactory, &'static str)] {
    static FN_: OnceLock<Regex> = OnceLock::new();
    static CLASS_: OnceLock<Regex> = OnceLock::new();
    fn py_fn() -> &'static Regex {
        FN_.get_or_init(|| Regex::new(r"^\s*def\s+([a-zA-Z_]\w*)").expect("py_fn"))
    }
    fn py_class() -> &'static Regex {
        CLASS_.get_or_init(|| Regex::new(r"^\s*class\s+([a-zA-Z_]\w*)").expect("py_class"))
    }
    &[(py_fn, "function"), (py_class, "class")]
}

#[allow(clippy::type_complexity)]
fn go_patterns() -> &'static [(PatternFactory, &'static str)] {
    static FN_: OnceLock<Regex> = OnceLock::new();
    static STRUCT_: OnceLock<Regex> = OnceLock::new();
    static IFACE_: OnceLock<Regex> = OnceLock::new();
    fn go_fn() -> &'static Regex {
        FN_.get_or_init(|| {
            Regex::new(r"^\s*func\s+(?:\([^\)]+\)\s+)?([a-zA-Z_]\w*)").expect("go_fn")
        })
    }
    fn go_struct() -> &'static Regex {
        STRUCT_
            .get_or_init(|| Regex::new(r"^\s*type\s+([a-zA-Z_]\w*)\s+struct").expect("go_struct"))
    }
    fn go_iface() -> &'static Regex {
        IFACE_
            .get_or_init(|| Regex::new(r"^\s*type\s+([a-zA-Z_]\w*)\s+interface").expect("go_iface"))
    }
    &[
        (go_fn, "function"),
        (go_struct, "struct"),
        (go_iface, "interface"),
    ]
}

fn md_header() -> &'static Regex {
    static MD: OnceLock<Regex> = OnceLock::new();
    MD.get_or_init(|| Regex::new(r"^(#{1,6})\s+(.*)$").expect("md_header"))
}

/// Picks the right pattern table for the given file extension (lowercase,
/// without leading dot). Returns empty slice for unknown languages.
#[allow(clippy::type_complexity)]
fn patterns_for(ext: &str) -> &'static [(PatternFactory, &'static str)] {
    match ext {
        "rs" => rs_patterns(),
        "ts" | "tsx" => ts_patterns(),
        "py" => py_patterns(),
        "go" => go_patterns(),
        _ => &[],
    }
}

/// One extracted symbol. Lightweight — we only need name + kind + line +
/// signature for FTS5 insertion (the Python `code_symbols` table is
/// out-of-scope for R4 per plan §1).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Symbol {
    pub name: String,
    pub kind: &'static str,
    pub line_start: usize,
    pub signature: String,
}

/// One markdown section header. Used to populate `search_index` rows of
/// `type='section'` matching Python's behavior.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Section {
    pub title: String,
    pub level: usize,
    pub content: String,
}

/// Iterate `content` line-by-line and emit symbols (per language patterns) +
/// sections (only when ext == "md"). Mirrors Python's `_parse_symbols_and_sections`
/// in core.py:151-187.
pub fn parse_symbols_and_sections(ext_lower: &str, content: &str) -> (Vec<Symbol>, Vec<Section>) {
    let patterns = patterns_for(ext_lower);

    let mut symbols: Vec<Symbol> = Vec::new();
    let mut sections: Vec<Section> = Vec::new();

    // Python's `content.splitlines()` strips trailing \n but keeps internal
    // empty lines. Rust's `str::lines` matches that semantics for the
    // common \n + \r\n cases.
    let lines: Vec<&str> = content.lines().collect();

    // Per-language symbol extraction (skip when patterns are empty — fast
    // path for non-source files).
    if !patterns.is_empty() {
        for (idx, line) in lines.iter().enumerate() {
            // 1-indexed line number to match Python.
            let line_no = idx + 1;
            for (factory, kind) in patterns {
                let re = factory();
                if let Some(caps) = re.captures(line) {
                    if let Some(name) = caps.get(1) {
                        symbols.push(Symbol {
                            name: name.as_str().to_string(),
                            kind,
                            line_start: line_no,
                            signature: line.trim().to_string(),
                        });
                    }
                }
            }
        }
    }

    // Markdown sections: walk lines, accumulating content under each header
    // until the next header or EOF. Identical control flow to Python's
    // core.py:170-185.
    if ext_lower == "md" {
        let re = md_header();
        let mut current: Option<Section> = None;
        for line in &lines {
            if let Some(caps) = re.captures(line) {
                if let Some(prev) = current.take() {
                    sections.push(prev);
                }
                let level = caps.get(1).map(|m| m.as_str().len()).unwrap_or(1);
                let title = caps
                    .get(2)
                    .map(|m| m.as_str().trim().to_string())
                    .unwrap_or_default();
                current = Some(Section {
                    title,
                    level,
                    content: String::new(),
                });
            } else if let Some(c) = current.as_mut() {
                c.content.push_str(line);
                c.content.push('\n');
            }
        }
        if let Some(prev) = current.take() {
            sections.push(prev);
        }
    }

    (symbols, sections)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rs_struct_and_fn_extracted() {
        let src = "pub struct Foo {\n    a: u32,\n}\n\nfn bar() -> u32 { 0 }\n";
        let (syms, sections) = parse_symbols_and_sections("rs", src);
        assert!(sections.is_empty());
        assert_eq!(syms.len(), 2);
        assert!(syms.iter().any(|s| s.name == "Foo" && s.kind == "struct"));
        assert!(syms.iter().any(|s| s.name == "bar" && s.kind == "function"));
    }

    #[test]
    fn ts_function_extracted() {
        let (syms, _) = parse_symbols_and_sections("ts", "export async function loadUser() {}\n");
        assert_eq!(syms.len(), 1);
        assert_eq!(syms[0].name, "loadUser");
        assert_eq!(syms[0].kind, "function");
    }

    #[test]
    fn py_def_and_class() {
        let (syms, _) = parse_symbols_and_sections(
            "py",
            "def helper(x):\n    return x\n\nclass Widget:\n    pass\n",
        );
        assert_eq!(syms.len(), 2);
    }

    #[test]
    fn go_struct_and_func() {
        let src = "type Cache struct {}\nfunc (c *Cache) Get(k string) string { return \"\" }\n";
        let (syms, _) = parse_symbols_and_sections("go", src);
        assert_eq!(syms.len(), 2);
    }

    #[test]
    fn md_sections() {
        let src = "# Title\n\nintro\n\n## Subhead\n\nbody\n";
        let (syms, sections) = parse_symbols_and_sections("md", src);
        assert!(syms.is_empty());
        assert_eq!(sections.len(), 2);
        assert_eq!(sections[0].title, "Title");
        assert_eq!(sections[1].title, "Subhead");
        assert_eq!(sections[1].level, 2);
    }

    #[test]
    fn unknown_extension_yields_empty() {
        let (syms, sections) = parse_symbols_and_sections("xyz", "some content");
        assert!(syms.is_empty());
        assert!(sections.is_empty());
    }
}
