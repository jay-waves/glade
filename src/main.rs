use anyhow::{Context, Result};
use clap::Parser;
use std::{path::PathBuf, sync::Arc};

/// Browse a local folder as a media gallery. Requires ffmpeg and ffprobe on PATH.
#[derive(Parser)]
#[command(version)]
struct Args {
    #[arg(default_value = ".")]
    directory: PathBuf,
    /// Listen on this port (0 chooses an available port).
    #[arg(long, default_value_t = 0)]
    port: u16,
    /// Do not automatically open the browser.
    #[arg(long)]
    no_open: bool,
    /// Override the per-user glade cache directory.
    #[arg(long)]
    cache_dir: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    let root = dunce::canonicalize(&args.directory).context("Cannot open the gallery directory")?;
    anyhow::ensure!(root.is_dir(), "Please pass a directory");
    glade::media::check_tools().await?;
    let cache = match args.cache_dir {
        Some(cache) => cache,
        None => dirs::cache_dir()
            .context("Cannot locate the user cache directory")?
            .join("glade/cache"),
    };
    std::fs::create_dir_all(&cache).context("Cannot create the cache directory")?;
    glade::media::clean_cache(&cache);
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", args.port)).await?;
    let port = listener.local_addr()?.port();
    let url = format!("http://127.0.0.1:{port}/");
    println!(
        "\n  glade\n  {}\n  {url}\n  Cache: {}\n\n  Press Ctrl+C to stop.\n",
        root.display(),
        cache.display()
    );
    let state = Arc::new(glade::AppState::new(root, cache, port));
    if !args.no_open
        && let Err(error) = open::that_detached(&url)
    {
        eprintln!("Could not open the browser: {error}\nOpen {url} manually.");
    }
    axum::serve(listener, glade::router(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
