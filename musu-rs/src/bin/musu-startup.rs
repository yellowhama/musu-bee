use anyhow::Result;
use chrono::Utc;
use serde::Serialize;

#[derive(Serialize)]
struct StartupMarker<'a> {
    version: &'static str,
    distribution: String,
    stage: &'a str,
    timestamp_utc: String,
    pid: u32,
    exe: String,
    detail: Option<String>,
}

fn write_startup_marker(home: &std::path::Path, stage: &str, detail: Option<String>) {
    let services_dir = home.join("services");
    let _ = std::fs::create_dir_all(&services_dir);
    let marker = StartupMarker {
        version: env!("CARGO_PKG_VERSION"),
        distribution: musu_rs::install::distribution::DistributionMode::current()
            .as_str()
            .to_string(),
        stage,
        timestamp_utc: Utc::now().to_rfc3339(),
        pid: std::process::id(),
        exe: std::env::current_exe()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| "<unknown>".to_string()),
        detail,
    };
    if let Ok(body) = serde_json::to_vec_pretty(&marker) {
        let _ = std::fs::write(services_dir.join("startup-marker.json"), body);
    }
}

fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .try_init();
}

#[tokio::main]
async fn main() -> Result<()> {
    init_tracing();
    if std::env::var_os("MUSU_DISTRIBUTION").is_none() {
        std::env::set_var("MUSU_DISTRIBUTION", "store-msix");
    }
    let musu_home = musu_rs::install::resolve_musu_home_from_env()?;
    let _token = musu_rs::install::token::ensure_bridge_token(&musu_home)?;
    write_startup_marker(&musu_home, "launching", None);
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        "musu-startup launching packaged bridge runtime"
    );
    match musu_rs::bridge::run().await {
        Ok(()) => {
            write_startup_marker(&musu_home, "bridge-exited-cleanly", None);
            Ok(())
        }
        Err(err) => {
            write_startup_marker(&musu_home, "bridge-run-failed", Some(format!("{err:#}")));
            Err(err)
        }
    }
}
