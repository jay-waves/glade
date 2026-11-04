# glade

A local media gallery for your folders, with a directory tree and masonry or justified layouts. Glade runs as a single Rust executable with its web interface embedded. It does not import or modify your files.

## Requirements

- A browser
- `ffmpeg` and `ffprobe` on your PATH, for thumbnails and metadata

FFmpeg is a separate dependency and is not bundled with glade. Supported formats depend on your FFmpeg build and browser. Videos are not transcoded; unsupported images may be shown as a 640px preview.

## Usage

```powershell
.\glade.exe "D:\Photos"
.\glade.exe "D:\Photos" --port 49192 --no-open
.\glade.exe "D:\Photos" --cache-dir "D:\Cache\glade"
```

Glade opens your browser and listens only on `127.0.0.1`. Without a directory argument it uses the current directory. Press Ctrl+C to stop. Use `--help` for all options.

Browse images and videos, include subdirectories, sort and resize cards, preview videos, and open a full-size viewer. Matching JPEG / HEIC / HEIF and MOV files in the same folder are grouped as Live Photos. Symbolic links are excluded. Refresh the tree to pick up file changes.

Thumbnails and metadata are cached in `%LOCALAPPDATA%\glade\cache` on Windows, `$XDG_CACHE_HOME/glade/cache` (or `~/.cache/glade/cache`) on Linux, and `~/Library/Caches/glade/cache` on macOS. Cached files older than seven days are removed at startup. Browser preferences are stored in localStorage; use a fixed port to preserve them across restarts.

## Build and test

Install Rust and, on Windows, the MSVC C++ build tools. FFmpeg and FFprobe are required for tests.

```sh
cargo build --release --locked
cargo test --release --locked
cargo clippy --release --locked --all-targets -- -D warnings
```

The Windows binary is `target/release/glade.exe`. No Node.js or external frontend assets are required at runtime. Optional frontend checks require Node.js:

```sh
npm run check
npm test
```

GitHub Actions builds and tests Windows on pushes, pull requests and manual runs. A tag push also creates a GitHub Release with `glade.exe` and generated release notes. Tags pushed before the workflow was added are not published automatically.

## License

MIT. The playback queue and masonry layout strategy are adapted from lib.ts; glade builds and runs independently.
