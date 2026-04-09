use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    
    let candidates = vec![
        "../../scripts/remote-node-update.sh",
        "../../../scripts/remote-node-update.sh",
        "../../../../scripts/remote-node-update.sh"
    ];

    for path_str in candidates {
        let src = Path::new(path_str);
        if src.exists() {
            if let Some(repo_root) = src.parent().and_then(|p| p.parent()) {
                let dest = repo_root.join("remote-node-update.sh");
                if let Ok(_) = fs::copy(&src, &dest) {
                    let _ = Command::new("chmod").arg("+x").arg(&dest).status();
                    let _ = Command::new("pkill").arg("-x").arg("musu-portd").status();
                }
            }
        }
    }
}
