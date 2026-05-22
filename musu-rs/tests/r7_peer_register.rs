//! V26-W7 musu peer register integration tests (wiki/510 §9).

use std::path::{Path, PathBuf};
use tempfile::TempDir;
use musu_rs::peer::capability::Capability;
use musu_rs::peer::manifest::{NodeManifest, ServiceState};

/// Locate the freshly-built musu binary.
fn current_test_binary() -> Option<PathBuf> {
    option_env!("CARGO_BIN_EXE_musu")
        .map(PathBuf::from)
        .or_else(|| {
            let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
            let candidate = manifest
                .join("target")
                .join("debug")
                .join(if cfg!(windows) { "musu.exe" } else { "musu" });
            if candidate.is_file() {
                Some(candidate)
            } else {
                None
            }
        })
}

/// Helper to parse node.toml.
fn read_node_manifest(path: &Path) -> NodeManifest {
    let text = std::fs::read_to_string(path).expect("read node.toml");
    toml::from_str(&text).expect("parse node.toml")
}

#[tokio::test]
async fn peer_register_writes_node_manifest_with_ollama_kind() {
    let tmp = TempDir::new().unwrap();
    let musu_home = tmp.path().join(".musu");
    let exe = current_test_binary().expect("locate built musu binary");

    // 1. Dry run
    let output = std::process::Command::new(&exe)
        .args([
            "peer",
            "register",
            "--type",
            "ollama",
            "--start",
            "ollama serve",
            "--name",
            "test-ollama",
            "--musu-home",
        ])
        .arg(&musu_home)
        .arg("--dry-run")
        .output()
        .expect("spawn musu peer register --dry-run");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("kind = \"ollama\""));
    assert!(stderr.contains("name = \"test-ollama\""));

    let manifest_path = musu_home.join("node.toml");
    assert!(!manifest_path.exists(), "dry run should not write file");

    // 2. Real run (will warning probe failure, but succeed writing)
    let output2 = std::process::Command::new(&exe)
        .args([
            "peer",
            "register",
            "--type",
            "ollama",
            "--start",
            "ollama serve",
            "--name",
            "test-ollama",
            "--musu-home",
        ])
        .arg(&musu_home)
        .output()
        .expect("spawn musu peer register");

    assert!(output2.status.success());
    assert!(manifest_path.exists(), "real run should write file");

    let manifest = read_node_manifest(&manifest_path);
    assert_eq!(manifest.name, "test-ollama");
    assert_eq!(manifest.kind, "ollama");
    assert_eq!(manifest.start, "ollama serve");
    assert_eq!(manifest.capability.len(), 1);
    match &manifest.capability[0] {
        Capability::Ollama { models, .. } => {
            assert!(models.is_empty());
        }
        _ => panic!("expected Ollama capability"),
    }
}

#[tokio::test]
async fn peer_register_dry_run_does_not_call_bridge() {
    let tmp = TempDir::new().unwrap();
    let musu_home = tmp.path().join(".musu");
    let exe = current_test_binary().expect("locate built musu binary");

    let output = std::process::Command::new(&exe)
        .args([
            "peer",
            "register",
            "--type",
            "script",
            "--start",
            "echo hi",
            "--musu-home",
        ])
        .arg(&musu_home)
        .args([
            "--dry-run",
            "--registry-url",
            "https://invalid.test.example.com/api/v1/nodes/register",
        ])
        .output()
        .expect("spawn musu peer register");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    let manifest_path = musu_home.join("node.toml");
    assert!(!manifest_path.exists());
    // Since it was dry-run, there should be no error trying to connect to the invalid registry URL
    assert!(!stderr.contains("failed to send registration"));
}

#[tokio::test]
async fn peer_register_script_kind_skips_autodetect() {
    let tmp = TempDir::new().unwrap();
    let musu_home = tmp.path().join(".musu");
    let exe = current_test_binary().expect("locate built musu binary");

    let output = std::process::Command::new(&exe)
        .args([
            "peer",
            "register",
            "--type",
            "script",
            "--start",
            "my-worker --port 9999",
            "--name",
            "custom-worker",
            "--musu-home",
        ])
        .arg(&musu_home)
        .args([
            "--ollama-url",
            "http://invalid.test.example.com:11434",
        ])
        .output()
        .expect("spawn musu peer register");

    assert!(output.status.success());
    let manifest_path = musu_home.join("node.toml");
    assert!(manifest_path.exists());

    let manifest = read_node_manifest(&manifest_path);
    assert_eq!(manifest.name, "custom-worker");
    assert_eq!(manifest.capability.len(), 1);
    match &manifest.capability[0] {
        Capability::Script { cmd } => {
            assert_eq!(cmd, "my-worker --port 9999");
        }
        _ => panic!("expected Script capability"),
    }
}

#[tokio::test]
async fn peer_register_unknown_type_returns_clear_error() {
    let tmp = TempDir::new().unwrap();
    let musu_home = tmp.path().join(".musu");
    let exe = current_test_binary().expect("locate built musu binary");

    let output = std::process::Command::new(&exe)
        .args([
            "peer",
            "register",
            "--type",
            "bogus",
            "--start",
            "x",
            "--musu-home",
        ])
        .arg(&musu_home)
        .output()
        .expect("spawn musu peer register with bogus type");

    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    // Verify clap error lists possible values
    assert!(stderr.contains("ollama") || stderr.contains("comfyui") || stderr.contains("script"));
}

#[test]
fn peer_register_capability_serde_roundtrip() {
    // 1. Ollama roundtrip
    let ollama_manifest = NodeManifest {
        name: "test-node".to_string(),
        kind: "ollama".to_string(),
        start: "ollama serve".to_string(),
        registered_at: 123456,
        registry_url: None,
        musu_pro_node_id: None,
        capability: vec![Capability::Ollama {
            models: vec!["qwen2.5-32b".into()],
            base_url: "http://127.0.0.1:11434".into(),
        }],
        service: ServiceState {
            platform: "none".to_string(),
            unit_name: "test".to_string(),
            state: "registered".to_string(),
            registered_at: 123456,
        },
    };
    let toml_str = toml::to_string_pretty(&ollama_manifest).unwrap();
    let parsed: NodeManifest = toml::from_str(&toml_str).unwrap();
    assert_eq!(ollama_manifest, parsed);

    // 2. ComfyUI roundtrip
    let comfy_manifest = NodeManifest {
        name: "test-node".to_string(),
        kind: "comfyui".to_string(),
        start: "comfy".to_string(),
        registered_at: 123456,
        registry_url: None,
        musu_pro_node_id: None,
        capability: vec![Capability::Comfyui {
            port: 8188,
            base_url: "http://127.0.0.1:8188".into(),
        }],
        service: ServiceState {
            platform: "none".to_string(),
            unit_name: "test".to_string(),
            state: "registered".to_string(),
            registered_at: 123456,
        },
    };
    let toml_str2 = toml::to_string_pretty(&comfy_manifest).unwrap();
    let parsed2: NodeManifest = toml::from_str(&toml_str2).unwrap();
    assert_eq!(comfy_manifest, parsed2);

    // 3. Script roundtrip
    let script_manifest = NodeManifest {
        name: "test-node".to_string(),
        kind: "script".to_string(),
        start: "script.sh".to_string(),
        registered_at: 123456,
        registry_url: None,
        musu_pro_node_id: None,
        capability: vec![Capability::Script {
            cmd: "script.sh".to_string(),
        }],
        service: ServiceState {
            platform: "none".to_string(),
            unit_name: "test".to_string(),
            state: "registered".to_string(),
            registered_at: 123456,
        },
    };
    let toml_str3 = toml::to_string_pretty(&script_manifest).unwrap();
    let parsed3: NodeManifest = toml::from_str(&toml_str3).unwrap();
    assert_eq!(script_manifest, parsed3);

    // 4. Forward-compat: extra fields in capability should be ignored
    let toml_extra = r#"
name = "test-node"
kind = "ollama"
start = "ollama serve"
registered_at = 123456

[[capability]]
kind = "ollama"
base_url = "http://127.0.0.1:11434"
models = ["qwen2.5-32b"]
vram_gb = 16
unrecognized_field = "ignored"

[service]
platform = "none"
unit_name = "test"
state = "registered"
registered_at = 123456
"#;
    let parsed_extra: NodeManifest = toml::from_str(toml_extra).unwrap();
    assert_eq!(parsed_extra.name, "test-node");
    match &parsed_extra.capability[0] {
        Capability::Ollama { models, base_url } => {
            assert_eq!(models, &vec!["qwen2.5-32b".to_string()]);
            assert_eq!(base_url, "http://127.0.0.1:11434");
        }
        _ => panic!("expected Ollama capability"),
    }
}

#[tokio::test]
async fn peer_register_with_musu_home_override_does_not_touch_real_home() {
    let tmp = TempDir::new().unwrap();
    let musu_home = tmp.path().join(".musu");
    let exe = current_test_binary().expect("locate built musu binary");

    // Verify platform-specific files are written to override dir and not real home
    let output = std::process::Command::new(&exe)
        .args([
            "peer",
            "register",
            "--type",
            "ollama",
            "--start",
            "ollama serve",
            "--name",
            "overrule-test",
            "--musu-home",
        ])
        .arg(&musu_home)
        .output()
        .expect("spawn musu peer register");

    assert!(output.status.success());

    // Check that files are created under overridden directory structure
    if cfg!(target_os = "linux") {
        let path = musu_home.join(".config").join("systemd").join("user").join("musu-peer-overrule-test.service");
        assert!(path.exists(), "Expected unit file in override directory, got none");
    } else if cfg!(target_os = "macos") {
        let path = musu_home.join("Library").join("LaunchAgents").join("com.musu.peer.overrule-test.plist");
        assert!(path.exists(), "Expected plist file in override directory, got none");
    } else if cfg!(target_os = "windows") {
        let path = musu_home.join(".musu").join("scheduled_tasks").join("peer-overrule-test_task.xml");
        assert!(path.exists(), "Expected scheduled task XML in override directory, got none");

        // Verify task is NOT registered with Task Scheduler
        let query_output = std::process::Command::new("schtasks")
            .args(["/Query", "/TN", "Musu\\peer-overrule-test"])
            .output();
        if let Ok(qo) = query_output {
            assert!(!qo.status.success(), "Scheduled Task should not be registered in Windows when overridden");
        }
    }
}
