pub mod media;
mod tree;

use axum::{
    Json, Router,
    body::Body,
    extract::{Query, Request, State},
    http::{HeaderValue, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use rust_embed::RustEmbed;
use serde::Deserialize;
use serde_json::json;
use std::{
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use tokio::sync::Semaphore;
use tower::ServiceExt;
use tower_http::services::ServeFile;

#[derive(RustEmbed)]
#[folder = "web/"]
struct Assets;

pub struct AppState {
    root: PathBuf,
    cache: PathBuf,
    port: u16,
    jobs: Semaphore,
}

impl AppState {
    pub fn new(root: PathBuf, cache: PathBuf, port: u16) -> Self {
        Self {
            root,
            cache,
            port,
            jobs: Semaphore::new(3),
        }
    }
}

#[derive(Debug)]
pub struct AppError(StatusCode, String);
impl AppError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self(status, message.into())
    }
}
impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        let status = match error.kind() {
            std::io::ErrorKind::NotFound => StatusCode::NOT_FOUND,
            std::io::ErrorKind::PermissionDenied => StatusCode::FORBIDDEN,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        Self(status, error.to_string())
    }
}
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}
type ApiResult<T> = Result<T, AppError>;

#[derive(Default, Deserialize)]
struct Options {
    #[serde(default)]
    path: String,
    #[serde(default)]
    recursive: u8,
    #[serde(default)]
    hidden: u8,
}

pub fn resolve_within(root: &Path, relative: &str) -> ApiResult<PathBuf> {
    let path = Path::new(relative);
    // Reject Windows stream/device syntax even when tested on another platform.
    if relative.contains(['\0', '\\', ':'])
        || path
            .components()
            .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
    {
        return Err(AppError::new(
            StatusCode::FORBIDDEN,
            "Path is outside this gallery",
        ));
    }
    let resolved = dunce::canonicalize(root.join(path))?;
    if !resolved.starts_with(root) {
        return Err(AppError::new(
            StatusCode::FORBIDDEN,
            "Path is outside this gallery",
        ));
    }
    Ok(resolved)
}

fn media_file(root: &Path, relative: &str) -> ApiResult<PathBuf> {
    let file = resolve_within(root, relative)?;
    if !file.is_file() {
        return Err(AppError::new(StatusCode::NOT_FOUND, "File not found"));
    }
    if media::kind(&file).is_none() {
        return Err(AppError::new(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "Unsupported media type",
        ));
    }
    Ok(file)
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/config", get(config))
        .route("/api/list", get(list))
        .route("/api/metadata", get(metadata))
        .route("/media", get(original))
        .route("/thumbnail", get(thumbnail))
        .fallback(get(asset))
        .layer(middleware::from_fn_with_state(state.clone(), guard))
        .with_state(state)
}

async fn guard(State(state): State<Arc<AppState>>, req: Request, next: Next) -> Response {
    let headers = req.headers();
    let host = headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let valid_host =
        host == format!("127.0.0.1:{}", state.port) || host == format!("localhost:{}", state.port);
    let valid_origin = headers
        .get(header::ORIGIN)
        .is_none_or(|origin| origin == format!("http://{host}").as_str());
    if !valid_host
        || !valid_origin
        || headers
            .get("sec-fetch-site")
            .is_some_and(|v| v == "cross-site")
    {
        return AppError::new(StatusCode::FORBIDDEN, "Invalid host or origin").into_response();
    }
    let mut response = next.run(req).await;
    let headers = response.headers_mut();
    headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    headers.insert("referrer-policy", HeaderValue::from_static("no-referrer"));
    headers.insert("content-security-policy", HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"));
    headers
        .entry(header::CACHE_CONTROL)
        .or_insert(HeaderValue::from_static("no-cache"));
    response
}

async fn config(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    Json(
        json!({ "name": state.root.file_name().unwrap_or(state.root.as_os_str()).to_string_lossy(), "root": state.root, "ffmpeg": true, "ffprobe": true }),
    )
}

async fn list(
    State(state): State<Arc<AppState>>,
    Query(options): Query<Options>,
) -> ApiResult<Json<tree::Listing>> {
    tokio::task::spawn_blocking(move || tree::listing(&state.root, &options))
        .await
        .map_err(|e| AppError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .map(Json)
}

async fn metadata(
    State(state): State<Arc<AppState>>,
    Query(options): Query<Options>,
) -> ApiResult<Json<serde_json::Value>> {
    let file = media_file(&state.root, &options.path)?;
    let _permit = state
        .jobs
        .acquire()
        .await
        .expect("job semaphore stays open");
    media::metadata(&file, &state.cache).await.map(Json)
}

async fn serve(file: PathBuf, req: Request) -> Response {
    // ServeFile owns Range/HEAD/conditional requests and streaming backpressure.
    match ServeFile::new(file).oneshot(req).await {
        Ok(response) => response.map(Body::new),
        Err(error) => match error {},
    }
}

async fn original(
    State(state): State<Arc<AppState>>,
    Query(options): Query<Options>,
    req: Request,
) -> ApiResult<Response> {
    Ok(serve(media_file(&state.root, &options.path)?, req).await)
}

async fn thumbnail(
    State(state): State<Arc<AppState>>,
    Query(options): Query<Options>,
    req: Request,
) -> ApiResult<Response> {
    let file = media_file(&state.root, &options.path)?;
    let permit = state
        .jobs
        .acquire()
        .await
        .expect("job semaphore stays open");
    let thumbnail = media::thumbnail(&file, &state.cache).await?;
    drop(permit);
    Ok(serve(thumbnail, req).await)
}

async fn asset(req: Request) -> Response {
    let name = req.uri().path().trim_start_matches('/');
    let name = if name.is_empty() { "index.html" } else { name };
    match Assets::get(name) {
        Some(file) => {
            let mime = mime_guess::from_path(name).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref())], file.data).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
