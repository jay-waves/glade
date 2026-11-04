use crate::{ApiResult, AppError};
use anyhow::{Context, Result};
use axum::http::StatusCode;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tempfile::TempPath;
use tokio::process::Command;

pub fn extension(path: &Path) -> String {
    path.extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase()
}
pub fn kind(path: &Path) -> Option<&'static str> {
    match extension(path).as_str() {
        "jpg" | "jpeg" | "jfif" | "png" | "gif" | "webp" | "avif" | "bmp" | "ico" | "svg"
        | "apng" | "heic" | "heif" | "tif" | "tiff" | "jxl" => Some("image"),
        "mp4" | "m4v" | "mov" | "webm" | "ogv" | "mkv" | "avi" | "mpg" | "mpeg" | "mts"
        | "m2ts" | "flv" | "wmv" | "3gp" => Some("video"),
        _ => None,
    }
}

fn command(name: &str) -> Command {
    let mut command = Command::new(name);
    command.kill_on_drop(true).stdin(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW: avoid flashing consoles per preview.
    command
}

pub async fn check_tools() -> Result<()> {
    for name in ["ffmpeg", "ffprobe"] {
        let output = tokio::time::timeout(Duration::from_secs(5), command(name).arg("-version").output())
            .await.with_context(|| format!("{name} did not respond"))?
            .with_context(|| format!("{name} is required. Install FFmpeg (including ffprobe) and add its bin directory to PATH."))?;
        anyhow::ensure!(
            output.status.success(),
            "{name} -version failed. Check your FFmpeg installation."
        );
    }
    Ok(())
}

async fn run(command: &mut Command) -> ApiResult<Vec<u8>> {
    let output = tokio::time::timeout(Duration::from_secs(30), command.output())
        .await
        .map_err(|_| AppError::new(StatusCode::GATEWAY_TIMEOUT, "FFmpeg/FFprobe timed out"))??;
    if !output.status.success() {
        let detail: String = String::from_utf8_lossy(&output.stderr)
            .chars()
            .take(800)
            .collect();
        return Err(AppError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            format!("Media preview unavailable: {detail}"),
        ));
    }
    Ok(output.stdout)
}

async fn cache_path(file: &Path, cache: &Path, extension: &str) -> ApiResult<PathBuf> {
    let info = tokio::fs::metadata(file).await?;
    let mut hash = Sha256::new();
    hash.update(b"glade-preview-v1");
    hash.update(file.as_os_str().as_encoded_bytes());
    hash.update(info.len().to_le_bytes());
    hash.update(
        info.modified()?
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_le_bytes(),
    );
    let key: String = hash
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    Ok(cache.join(format!("{key}.{extension}")))
}

fn temporary(cache: &Path, suffix: &str) -> ApiResult<TempPath> {
    Ok(tempfile::Builder::new()
        .prefix("glade-")
        .suffix(suffix)
        .tempfile_in(cache)?
        .into_temp_path())
}
fn publish(temporary: TempPath, target: &Path) -> ApiResult<()> {
    match temporary.persist_noclobber(target) {
        Ok(()) => Ok(()),
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(error) => Err(error.error.into()),
    }
}

pub async fn thumbnail(file: &Path, cache: &Path) -> ApiResult<PathBuf> {
    let target = cache_path(file, cache, "jpg").await?;
    if target.is_file() {
        return Ok(target);
    }
    let temporary = temporary(cache, ".jpg")?;
    run(command("ffmpeg")
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-threads",
            "1",
            "-i",
        ])
        .arg(file)
        .args([
            "-map",
            "0:v:0",
            "-frames:v",
            "1",
            "-vf",
            "scale=640:640:force_original_aspect_ratio=decrease",
            "-filter_threads",
            "1",
            "-threads",
            "1",
            "-q:v",
            "4",
            "-y",
        ])
        .arg(&temporary))
    .await?;
    publish(temporary, &target)?;
    Ok(target)
}

pub async fn metadata(file: &Path, cache: &Path) -> ApiResult<Value> {
    let target = cache_path(file, cache, "json").await?;
    if let Ok(bytes) = tokio::fs::read(&target).await {
        if let Ok(value) = serde_json::from_slice(&bytes) {
            return Ok(value);
        }
        let _ = tokio::fs::remove_file(&target).await;
    }
    // Some browser-supported formats cannot be probed by every FFmpeg build.
    // Preserve browsing and fall back to file modification time in that case.
    let bytes = match run(command("ffprobe").args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_tags=creation_time:stream_side_data=rotation:format_tags=creation_time,DateTimeOriginal", "-of", "json"]).arg(file)).await {
        Ok(bytes) => bytes,
        Err(_) => return Ok(json!({})),
    };
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|e| AppError::new(StatusCode::BAD_GATEWAY, e.to_string()))?;
    let stream = &value["streams"][0];
    let rotated = stream["side_data_list"].as_array().is_some_and(|items| {
        items
            .iter()
            .any(|item| item["rotation"].as_i64().unwrap_or(0).unsigned_abs() % 180 == 90)
    });
    let captured = [
        &value["format"]["tags"]["DateTimeOriginal"],
        &value["format"]["tags"]["creation_time"],
        &stream["tags"]["creation_time"],
    ]
    .into_iter()
    .find(|value| value.is_string());
    let result = json!({ "width": stream[if rotated {"height"} else {"width"}], "height": stream[if rotated {"width"} else {"height"}], "capturedAt": captured });
    let temporary = temporary(cache, ".json")?;
    tokio::fs::write(
        &temporary,
        serde_json::to_vec(&result).expect("JSON value serializes"),
    )
    .await?;
    publish(temporary, &target)?;
    Ok(result)
}

pub fn clean_cache(cache: &Path) {
    let Ok(entries) = std::fs::read_dir(cache) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let Some((key, ext)) = name.rsplit_once('.') else {
            continue;
        };
        if key.len() != 64
            || !key.bytes().all(|b| b.is_ascii_hexdigit())
            || !matches!(ext, "jpg" | "json")
        {
            continue;
        }
        if entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|time| SystemTime::now().duration_since(time).ok())
            .is_some_and(|age| age > Duration::from_secs(7 * 86400))
        {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}
