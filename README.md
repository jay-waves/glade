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

The interface follows the reduced lib.ts gallery layout: a resizable folder tree, centered content panel, compact sticky toolbar, Mona Sans typography, and automatic light/dark themes. On narrow screens the tree opens as a dismissible drawer. Git, document rendering, search, and bookmark panels are omitted.

Browse images and videos, include subdirectories, sort and resize cards, preview videos, and open a full-size viewer. Use the toolbar’s size buttons and sort menu; the three-dot menu contains layout, thumbnail size, subdirectory, autoplay, and hidden-file settings. Folder tree width and desktop visibility are remembered. Matching JPEG / HEIC / HEIF and MOV files in the same folder are grouped as Live Photos. Symbolic links are excluded. Refresh the tree to pick up file changes.

Thumbnails and metadata are cached in `%LOCALAPPDATA%\glade\cache` on Windows, `$XDG_CACHE_HOME/glade/cache` (or `~/.cache/glade/cache`) on Linux, and `~/Library/Caches/glade/cache` on macOS. Cached files older than seven days are removed at startup. Browser preferences are stored in localStorage; use a fixed port to preserve them across restarts.

## Build and test

Install Node.js 22+, Rust and, on Windows, the MSVC C++ build tools. The build and default tests do not require FFmpeg.

```sh
npm ci
npm run build
cargo build --release --locked
cargo test --release --locked
cargo clippy --release --locked --all-targets -- -D warnings
```

The FFmpeg integration test checks real thumbnail generation, metadata and cache invalidation. Run it separately with FFmpeg and FFprobe on your PATH:

```sh
cargo test --release --locked --features ffmpeg-tests --test ffmpeg
```

The Windows binary is `target/release/glade.exe`. No Node.js or external frontend assets are required at runtime. Optional frontend checks require Node.js:

```sh
npm run check
npm test
```

GitHub Actions builds and runs the default tests on Windows without FFmpeg, using a Rust dependency cache. Documentation-only changes skip the build; tag pushes always build and create a GitHub Release with `glade.exe` and generated release notes. The FFmpeg integration test is not run in CI. Tags pushed before the workflow was added are not published automatically.

Frontend files are embedded in the binary, so changes under `web/` require rebuilding and linking glade, though unchanged Rust dependencies can be reused from the cache.

## License

MIT. The interface styling, playback queue, and masonry layout strategy are adapted from lib.ts; glade builds and runs independently. Mona Sans is embedded under the SIL Open Font License (see `web/fonts/OFL.txt`).

## Frontend

The English-only frontend uses React, Primer, Octicons and Tailwind. PathBar, FileToolbar, theme styles, gallery layout and zoom modules are migrated from lib.ts. The ribbon is omitted. Glade's media adapter handles its own Rust API and playback queue. Run `npm run build` before Cargo commands; Vite writes `dist/`, which Rust embeds in the executable. Windows CI performs both builds. Node.js is needed only at build time.
