# glade

A local media gallery for your folders.

传入一个目录，打开本地媒体瀑布墙。左侧是简单目录树；不导入、不修改媒体文件。

**Rust 单二进制应用**：HTML、CSS、JavaScript 全部编译进程序，运行时无需 Node.js、npm、前端资源目录或联网下载。使用系统浏览器展示页面。

## 运行

**必需依赖：`ffmpeg` 和 `ffprobe`，均须加入 PATH。** 启动时检查两者，缺少任一工具会给出错误并退出。FFmpeg 不打包进 glade，也不会由 glade 自动下载；因此 glade 自身只分发一个 exe，FFmpeg 是单独安装的运行环境依赖。

```powershell
ffmpeg -version
ffprobe -version
.\glade.exe "D:\Photos"
```

自动打开浏览器，终端显示地址。默认仅监听 `127.0.0.1`，自动选择空闲端口，按 Ctrl+C 停止。不传目录时使用当前工作目录。

```powershell
.\glade.exe "D:\Photos" --port 49192 --no-open
.\glade.exe "D:\Photos" --cache-dir "D:\Cache\glade"
.\glade.exe --help
```

Linux / macOS 使用相同参数，例如 `glade ~/Pictures`。

## 单文件构建

在安装 Rust MSVC 工具链及 Visual Studio C++ Build Tools 的 Windows 上：

```powershell
cargo build --release --locked
.\target\release\glade.exe "D:\Photos"
```

分发时只需复制 `target/release/glade.exe`。前端改动后重新构建即可，无需 npm build。Windows MSVC 构建配置启用了静态 CRT；不携带 glade 自己的资源文件或运行库 DLL。系统浏览器、FFmpeg / FFprobe 仍需在运行机器上可用。

`.github/workflows/build.yml` 提供 Windows 构建、测试和 exe artifact 上传，可手动触发或推送后运行；不会自动发布 Release。

Linux 本地开发：

```sh
cargo run --release -- /path/to/photos
```

## 缓存

默认使用系统提供的当前用户缓存位置：

| 平台 | 默认目录 |
| --- | --- |
| Windows | `%LOCALAPPDATA%\glade\cache` |
| Linux | `$XDG_CACHE_HOME/glade/cache`，未设置时为 `~/.cache/glade/cache` |
| macOS | `~/Library/Caches/glade/cache` |

仅缓存生成的 JPEG 缩略图和 FFprobe 元数据；前端资源直接从 exe 内存提供，不解压到磁盘。缓存键包含源文件路径、大小、修改时间和转换版本，源文件变化后重新生成。临时文件由 `tempfile` 管理，完成后发布；启动时清理生成超过七天的缓存。可以删除整个缓存目录，随后按需重建。

`--cache-dir` 可覆盖默认路径。布局、筛选偏好仍存在浏览器 localStorage 中；固定 `--port` 能在后续启动时复用同一浏览器站点的设置。

## 功能与格式

- 目录树、面包屑、前进/后退、手动刷新。
- 瀑布流 / 等高行切换、卡片缩放，保留原始比例，不裁剪。
- 图片和视频混排，支持包含子目录、显示隐藏文件、名称及时间排序。
- 同目录同名 JPEG / HEIC / HEIF + MOV 合并为 Live Photo。
- 视频悬停预览、可选自动播放，限制同时播放数量。
- 点击进入大图或视频播放器；方向键切换媒体、Esc 关闭。视频控件聚焦时保留播放器键盘行为。
- 分批加载、图片懒加载、视频拖动进度。

图片解码、缩略图和视频封面统一交给 FFmpeg；媒体尺寸和可用拍摄时间统一交给 FFprobe。没有另写图片解码或 EXIF 解析。拍摄时间取决于 FFprobe 可读取的元数据，缺失时使用修改时间。

实际支持的格式由 FFmpeg 构建和浏览器决定。视频原文件由浏览器播放，目前不转码。浏览器不支持的图片格式（如部分 HEIC）尝试显示转换后的 640px 预览，原文件可单独打开。GIF / APNG 直接显示以保留动画。

目录树忽略符号链接，服务限制访问到指定的根目录。文件变化后点击刷新重新读取。

## 实现选择

| 库 | 接管的功能 |
| --- | --- |
| `axum` / `tower-http::ServeFile` | 路由、请求解析、Range / HEAD / 条件请求、文件流传输 |
| `rust-embed` | 编译期内嵌整个前端目录 |
| `clap` | 命令行参数、帮助和错误提示 |
| `dirs` | 获取各系统标准用户缓存目录 |
| `walkdir` | 目录遍历 |
| `tempfile` | 临时文件生命周期与缓存发布 |
| `open` | 打开默认浏览器 |

前端保持无框架，没有运行时第三方下载。Rust 迁移重点是移除 Node 部署依赖，把通用行为交给库；并不意味着 Rust 源码行数一定比原 JavaScript 更少。

## 验证

```sh
cargo test --release --locked
cargo clippy --release --locked --all-targets -- -D warnings
```

测试需要 FFmpeg / FFprobe，覆盖内嵌资源、目录过滤、Live Photo 配对、路径范围限制、视频 Range / HEAD、真实缩略图生成和缓存失效。

可选使用 Node.js 检查前端（仅开发时需要）：

```sh
npm run check
npm test
```

项目独立于原 `lib.ts`。播放队列复用其 gallery 实现，瀑布布局沿用最短列策略，保留原 MIT 许可证。原项目不参与构建或运行。
