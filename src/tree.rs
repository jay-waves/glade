use crate::{ApiResult, AppError, Options, media, resolve_within};
use axum::http::StatusCode;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    path::Path,
    time::UNIX_EPOCH,
};
use walkdir::WalkDir;

#[derive(Serialize)]
pub struct Directory {
    name: String,
    path: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    name: String,
    path: String,
    kind: &'static str,
    modified: u128,
    size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    live_video: Option<String>,
}
#[derive(Serialize)]
pub struct Listing {
    directories: Vec<Directory>,
    media: Vec<Media>,
    warnings: Vec<String>,
}

fn pair_key(path: &str) -> (String, String) {
    let path = Path::new(path);
    (
        path.parent()
            .unwrap_or(Path::new(""))
            .to_string_lossy()
            .into(),
        path.file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase(),
    )
}

pub(crate) fn listing(root: &Path, options: &Options) -> ApiResult<Listing> {
    let base = resolve_within(root, &options.path)?;
    if !base.is_dir() {
        return Err(AppError::new(StatusCode::BAD_REQUEST, "Not a directory"));
    }
    let mut listing = Listing {
        directories: vec![],
        media: vec![],
        warnings: vec![],
    };
    let walker = WalkDir::new(&base)
        .min_depth(1)
        .max_depth(if options.recursive == 1 {
            usize::MAX
        } else {
            1
        })
        .follow_links(false)
        .sort_by_file_name()
        .into_iter()
        .filter_entry(|entry| {
            entry.depth() == 0
                || options.hidden == 1
                || !entry.file_name().to_string_lossy().starts_with('.')
        });
    for entry in walker {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                listing.warnings.push(error.to_string());
                continue;
            }
        };
        if entry.file_type().is_symlink() {
            continue;
        }
        let Some(name) = entry.file_name().to_str() else {
            listing
                .warnings
                .push("Skipped a filename that is not UTF-8".into());
            continue;
        };
        let relative = entry
            .path()
            .strip_prefix(root)
            .expect("walk remains under root")
            .to_string_lossy()
            .replace('\\', "/");
        if entry.file_type().is_dir() && entry.depth() == 1 {
            listing.directories.push(Directory {
                name: name.into(),
                path: relative,
            });
        } else if entry.file_type().is_file() {
            let Some(kind) = media::kind(entry.path()) else {
                continue;
            };
            match entry.metadata() {
                Ok(info) => listing.media.push(Media {
                    name: name.into(),
                    path: relative,
                    kind,
                    size: info.len(),
                    modified: info
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map_or(0, |t| t.as_millis()),
                    live_video: None,
                }),
                Err(error) => listing.warnings.push(error.to_string()),
            }
        }
    }
    let photos: HashMap<_, _> = listing
        .media
        .iter()
        .enumerate()
        .filter(|(_, item)| {
            matches!(
                media::extension(Path::new(&item.path)).as_str(),
                "jpg" | "jpeg" | "heic" | "heif"
            )
        })
        .map(|(index, item)| (pair_key(&item.path), index))
        .collect();
    let mut paired = HashSet::new();
    for index in 0..listing.media.len() {
        if media::extension(Path::new(&listing.media[index].path)) != "mov" {
            continue;
        }
        if let Some(&photo) = photos.get(&pair_key(&listing.media[index].path))
            && listing.media[photo].live_video.is_none()
        {
            listing.media[photo].live_video = Some(listing.media[index].path.clone());
            paired.insert(index);
        }
    }
    listing.media = listing
        .media
        .into_iter()
        .enumerate()
        .filter(|(i, _)| !paired.contains(i))
        .map(|(_, item)| item)
        .collect();
    Ok(listing)
}
