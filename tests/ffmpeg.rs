use std::fs;
use tempfile::tempdir;

#[tokio::test]
async fn ffmpeg_thumbnail_metadata_and_cache_invalidation() {
    glade::media::check_tools()
        .await
        .expect("Tests require ffmpeg and ffprobe on PATH");
    let temp = tempdir().unwrap();
    let cache = temp.path().join("cache");
    fs::create_dir(&cache).unwrap();
    let image = temp.path().join("sample.png");
    let generate = |size: &'static str| {
        let image = image.clone();
        async move {
            let output = tokio::process::Command::new("ffmpeg")
                .args([
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    &format!("color=c=green:s={size}"),
                    "-frames:v",
                    "1",
                    "-threads",
                    "1",
                    "-y",
                ])
                .arg(image)
                .output()
                .await
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    };
    generate("960x640").await;
    let thumbnail = glade::media::thumbnail(&image, &cache).await.unwrap();
    assert!(fs::read(&thumbnail).unwrap().starts_with(&[0xff, 0xd8]));
    let modified = fs::metadata(&thumbnail).unwrap().modified().unwrap();
    assert_eq!(
        glade::media::thumbnail(&image, &cache).await.unwrap(),
        thumbnail
    );
    assert_eq!(
        fs::metadata(&thumbnail).unwrap().modified().unwrap(),
        modified
    );
    let dimensions = glade::media::metadata(&image, &cache).await.unwrap();
    assert_eq!(dimensions["width"], 960);
    assert_eq!(dimensions["height"], 640);
    assert_eq!(
        glade::media::metadata(&image, &cache).await.unwrap(),
        dimensions
    );
    generate("800x400").await;
    assert_ne!(
        glade::media::thumbnail(&image, &cache).await.unwrap(),
        thumbnail
    );
    assert_eq!(
        glade::media::metadata(&image, &cache).await.unwrap()["width"],
        800
    );
}

#[tokio::test]
async fn video_metadata_includes_playback_details() {
    let dir = tempdir().unwrap();
    let cache = dir.path().join("cache");
    fs::create_dir(&cache).unwrap();
    let path = dir.path().join("video.mp4");
    let output = tokio::process::Command::new("ffmpeg")
        .args([
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=160x90:rate=24",
            "-t",
            "1",
            "-c:v",
            "mpeg4",
        ])
        .arg(&path)
        .output()
        .await
        .unwrap();
    assert!(output.status.success());
    let details = glade::media::metadata(&path, &cache).await.unwrap();
    assert_eq!(details["codec"], "mpeg4");
    assert_eq!(details["frameRate"], 24.0);
    assert!(details["durationSeconds"].as_f64().unwrap() > 0.0);
    assert!(details["bitrate"].as_f64().unwrap() > 0.0);
    assert_eq!(
        glade::media::metadata(&path, &cache).await.unwrap(),
        details
    );
}
