use musu_port_core::{run_server, MusuPortConfig};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "musu_portd=info,musu_port_core=info".into()),
        )
        .init();

    let config = match MusuPortConfig::from_env() {
        Ok(config) => config,
        Err(err) => {
            tracing::error!(error = %err, "failed to load musu-port config");
            std::process::exit(1);
        }
    };
    if let Err(err) = run_server(config).await {
        tracing::error!(error = %err, "musu-port server exited");
        std::process::exit(1);
    }
}
