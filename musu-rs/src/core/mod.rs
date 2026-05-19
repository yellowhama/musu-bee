#[allow(dead_code)] // Called via `Cmd::Indexer/Writer/Control` dispatch (R2+ replaces stub).
pub async fn run() -> anyhow::Result<()> {
    anyhow::bail!("R2 not yet implemented (V24-R0 workspace bootstrap only)")
}
