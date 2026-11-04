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
    if extension == "json" {
        hash.update(b"metadata-v2");
    }
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

fn photo_metadata(path: &Path) -> Value {
    use exif::{In, Tag, Value as ExifValue};
    let exif = std::fs::File::open(path).ok().and_then(|file| {
        exif::Reader::new()
            .continue_on_error(true)
            .read_from_container(&mut std::io::BufReader::new(file))
            .or_else(|error| error.distill_partial_result(|_| {}))
            .ok()
    });
    let mut summary = Vec::new();
    let mut captured = None;
    if let Some(exif) = exif {
        let text = |tag| {
            let ExifValue::Ascii(values) = &exif.get_field(tag, In::PRIMARY)?.value else {
                return None;
            };
            let value = String::from_utf8_lossy(values.first()?)
                .trim_matches('\0')
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            (!value.is_empty()).then(|| value.chars().take(120).collect::<String>())
        };
        let make = text(Tag::Make);
        let model = text(Tag::Model);
        if let Some(camera) = match (make, model) {
            (Some(make), Some(model))
                if !model.to_lowercase().starts_with(&make.to_lowercase()) =>
            {
                Some(format!("{make} {model}"))
            }
            (_, Some(model)) => Some(model),
            (make, None) => make,
        } {
            summary.push(camera);
        }
        for tag in [
            Tag::FocalLength,
            Tag::FNumber,
            Tag::ExposureTime,
            Tag::PhotographicSensitivity,
        ] {
            if let Some(field) = exif.get_field(tag, In::PRIMARY) {
                let value = field.display_value().with_unit(&exif).to_string();
                summary.push(if tag == Tag::PhotographicSensitivity {
                    format!("ISO {value}")
                } else {
                    value
                });
            }
        }

        if let Some(field) = exif.get_field(Tag::DateTimeOriginal, In::PRIMARY)
            && let ExifValue::Ascii(values) = &field.value
            && let Some(bytes) = values.first()
            && let Ok(mut date) = exif::DateTime::from_ascii(bytes)
        {
            if let Some(field) = exif.get_field(Tag::OffsetTimeOriginal, In::PRIMARY)
                && let ExifValue::Ascii(values) = &field.value
                && let Some(offset) = values.first()
            {
                let _ = date.parse_offset(offset);
            }
            let offset = date.offset.unwrap_or(0);
            captured = Some(format!(
                "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}{}{:02}:{:02}",
                date.year,
                date.month,
                date.day,
                date.hour,
                date.minute,
                date.second,
                if offset < 0 { "-" } else { "+" },
                offset.unsigned_abs() / 60,
                offset.unsigned_abs() % 60
            ));
        }
    }
    json!({ "exif": summary, "capturedAt": captured })
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
    let bytes = match run(command("ffprobe").args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,bit_rate,codec_name,avg_frame_rate:stream_tags=creation_time:stream_side_data=rotation:format=duration,bit_rate:format_tags=creation_time,DateTimeOriginal", "-of", "json"]).arg(file)).await {
        Ok(bytes) => bytes,
        Err(_) => b"{}".to_vec(),
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
    let mut result = json!({ "width": stream[if rotated {"height"} else {"width"}], "height": stream[if rotated {"width"} else {"height"}], "capturedAt": captured });
    if kind(file) == Some("video") {
        let number = |value: &Value| {
            value
                .as_f64()
                .or_else(|| value.as_str()?.parse::<f64>().ok())
                .filter(|n| n.is_finite() && *n > 0.0)
        };
        result["bitrate"] =
            json!(number(&stream["bit_rate"]).or_else(|| number(&value["format"]["bit_rate"])));
        result["durationSeconds"] = json!(number(&value["format"]["duration"]));
        result["codec"] = stream["codec_name"].clone();
        result["frameRate"] = json!(stream["avg_frame_rate"].as_str().and_then(|rate| {
            let (n, d) = rate.split_once('/')?;
            let rate = n.parse::<f64>().ok()? / d.parse::<f64>().ok()?;
            (rate.is_finite() && rate > 0.0).then_some(rate)
        }));
    } else {
        let path = file.to_path_buf();
        if let Ok(photo) = tokio::task::spawn_blocking(move || photo_metadata(&path)).await {
            result["exif"] = photo["exif"].clone();
            if photo["capturedAt"].is_string() {
                result["capturedAt"] = photo["capturedAt"].clone();
            }
        }
    }
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

#[cfg(test)]
mod metadata_tests {
    use super::*;

    #[test]
    fn photo_details_include_camera_exposure_and_capture_time() {
        use exif::{Field, In, Tag, Value};
        let fields = [
            (Tag::Make, Value::Ascii(vec![b"Example".to_vec()])),
            (Tag::Model, Value::Ascii(vec![b"Example Camera".to_vec()])),
            (Tag::FocalLength, Value::Rational(vec![(50, 1).into()])),
            (Tag::FNumber, Value::Rational(vec![(28, 10).into()])),
            (Tag::ExposureTime, Value::Rational(vec![(1, 125).into()])),
            (Tag::PhotographicSensitivity, Value::Short(vec![400])),
            (
                Tag::DateTimeOriginal,
                Value::Ascii(vec![b"2026:10:18 12:34:56".to_vec()]),
            ),
            (
                Tag::OffsetTimeOriginal,
                Value::Ascii(vec![b"+08:00".to_vec()]),
            ),
        ]
        .map(|(tag, value)| Field {
            tag,
            ifd_num: In::PRIMARY,
            value,
        });
        let mut writer = exif::experimental::Writer::new();
        for field in &fields {
            writer.push_field(field);
        }
        let mut bytes = std::io::Cursor::new(Vec::new());
        writer.write(&mut bytes, true).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("photo.tif");
        std::fs::write(&path, bytes.into_inner()).unwrap();
        let details = photo_metadata(&path);
        assert_eq!(
            details["exif"],
            json!(["Example Camera", "50 mm", "f/2.8", "1/125 s", "ISO 400"])
        );
        assert_eq!(details["capturedAt"], "2026-10-18T12:34:56+08:00");
        assert_eq!(
            photo_metadata(&dir.path().join("missing.jpg"))["exif"],
            json!([])
        );
    }
}
