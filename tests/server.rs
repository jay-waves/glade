use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use glade::{AppState, router};
use serde_json::Value;
use std::{fs, sync::Arc};
use tempfile::tempdir;
use tower::ServiceExt;

async fn request(app: &Router, uri: &str, headers: &[(&str, &str)]) -> axum::response::Response {
    let mut request = Request::builder()
        .uri(uri)
        .header("host", "127.0.0.1:49192");
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    app.clone()
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap()
}
async fn json(app: &Router, uri: &str) -> Value {
    let response = request(app, uri, &[]).await;
    assert_eq!(response.status(), StatusCode::OK);
    serde_json::from_slice(&to_bytes(response.into_body(), usize::MAX).await.unwrap()).unwrap()
}

#[tokio::test]
async fn directory_listing_streaming_and_embedded_assets() {
    let temp = tempdir().unwrap();
    let root = temp.path().join("photos");
    fs::create_dir_all(root.join("nested")).unwrap();
    for (name, content) in [
        ("Photo.JPG", "0123456789"),
        ("Photo.mov", "video"),
        (".hidden.png", "hidden"),
        ("nested/child.webp", "image"),
        ("notes.txt", "private"),
    ] {
        fs::write(root.join(name), content).unwrap();
    }
    fs::write(temp.path().join("secret.jpg"), "secret").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(temp.path().join("secret.jpg"), root.join("escape.jpg")).unwrap();
    let root = dunce::canonicalize(root).unwrap();
    let app = router(Arc::new(AppState::new(
        root,
        temp.path().join("cache"),
        49192,
    )));
    let list = json(&app, "/api/list").await;
    assert_eq!(list["directories"][0]["path"], "nested");
    assert_eq!(list["media"].as_array().unwrap().len(), 1);
    assert_eq!(list["media"][0]["liveVideo"], "Photo.mov");
    assert_eq!(
        json(&app, "/api/list?recursive=1&hidden=1").await["media"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    let response = request(&app, "/media?path=Photo.JPG", &[("range", "bytes=3-6")]).await;
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(response.headers()["content-range"], "bytes 3-6/10");
    assert_eq!(to_bytes(response.into_body(), 10).await.unwrap(), "3456");
    let response = request(&app, "/media?path=Photo.JPG", &[("range", "bytes=-3")]).await;
    assert_eq!(to_bytes(response.into_body(), 10).await.unwrap(), "789");
    assert_eq!(
        request(&app, "/media?path=Photo.JPG", &[("range", "bytes=20-")])
            .await
            .status(),
        StatusCode::RANGE_NOT_SATISFIABLE
    );
    let head = Request::builder()
        .method("HEAD")
        .uri("/media?path=Photo.JPG")
        .header("host", "127.0.0.1:49192")
        .body(Body::empty())
        .unwrap();
    let response = app.clone().oneshot(head).await.unwrap();
    assert_eq!(response.headers()["content-length"], "10");
    assert!(to_bytes(response.into_body(), 10).await.unwrap().is_empty());
    assert_eq!(
        request(&app, "/media?path=notes.txt", &[]).await.status(),
        StatusCode::UNSUPPORTED_MEDIA_TYPE
    );
    for path in [
        "..%2Fsecret.jpg",
        "%2Fetc%2Fpasswd",
        "C:%5Csecret.jpg",
        "Photo.JPG:secret",
    ] {
        assert_eq!(
            request(&app, &format!("/media?path={path}"), &[])
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
    }
    #[cfg(unix)]
    assert_eq!(
        request(&app, "/media?path=escape.jpg", &[]).await.status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        request(&app, "/api/list", &[("origin", "https://example.com")])
            .await
            .status(),
        StatusCode::FORBIDDEN
    );
    let bad_host = Request::builder()
        .uri("/api/list")
        .header("host", "example.com")
        .body(Body::empty())
        .unwrap();
    assert_eq!(
        app.clone().oneshot(bad_host).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
    let response = request(&app, "/", &[]).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert!(
        response.headers()["content-security-policy"]
            .to_str()
            .unwrap()
            .contains("frame-ancestors 'none'")
    );
    assert!(
        String::from_utf8(
            to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap()
                .to_vec()
        )
        .unwrap()
        .contains("媒体画廊")
    );
    for asset in [
        "/app.mjs",
        "/icons.mjs",
        "/style.css",
        "/layout.mjs",
        "/playback.mjs",
        "/fonts/MonaSansVF.woff2",
        "/fonts/OFL.txt",
    ] {
        let response = request(&app, asset, &[]).await;
        assert_eq!(response.status(), StatusCode::OK);
        if asset.ends_with("mjs") {
            assert!(
                response.headers()["content-type"]
                    .to_str()
                    .unwrap()
                    .contains("javascript")
            );
        }
    }
}

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
