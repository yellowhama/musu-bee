//! WebRTC Remote View & Screen Sharing
//! 
//! Exposes a WebRTC signaling endpoint to allow the musu-bee web UI
//! to establish a peer-to-peer video stream of the node's screen.

use axum::extract::{State, Json};
use axum::response::IntoResponse;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use webrtc::api::APIBuilder;
use webrtc::api::media_engine::{MediaEngine, MIME_TYPE_H264};
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::interceptor::registry::Registry;
use webrtc::rtp_transceiver::rtp_codec::RTCRtpCodecCapability;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::track::track_local::track_local_static_sample::TrackLocalStaticSample;
use webrtc::track::track_local::TrackLocal;
use webrtc::media::Sample;
use tokio::process::Command;
use std::process::Stdio;
use tokio::io::AsyncReadExt;
use std::time::Duration;

use crate::bridge::AppState;

#[derive(Deserialize)]
pub struct SdpOffer {
    pub sdp: String,
}

#[derive(Serialize)]
pub struct SdpAnswer {
    pub sdp: String,
}

/// Handles incoming WebRTC SDP offers and returns an SDP answer.
pub async fn handle_offer(
    State(_state): State<AppState>,
    Json(offer): Json<SdpOffer>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    
    // 1. Setup WebRTC API
    let mut m = MediaEngine::default();
    m.register_default_codecs().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    let mut registry = Registry::new();
    registry = register_default_interceptors(registry, &mut m).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let api = APIBuilder::new()
        .with_media_engine(m)
        .with_interceptor_registry(registry)
        .build();

    let config = RTCConfiguration {
        ice_servers: vec![],
        ..Default::default()
    };

    let peer_connection = Arc::new(api.new_peer_connection(config).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create PC: {}", e))
    })?);

    // Register KVM data channel listener
    peer_connection.on_data_channel(Box::new(move |d: Arc<webrtc::data_channel::RTCDataChannel>| {
        let d_label = d.label().to_owned();
        Box::pin(async move {
            if d_label == "kvm_control" {
                tracing::info!("KVM Control channel opened!");
                d.on_message(Box::new(move |msg: webrtc::data_channel::data_channel_message::DataChannelMessage| {
                    crate::io::kvm::handle_kvm_message(&msg.data);
                    Box::pin(async {})
                }));
            }
        })
    }));

    // 2. Set up Video Track for H.264 stream
    let video_track = Arc::new(TrackLocalStaticSample::new(
        RTCRtpCodecCapability {
            mime_type: MIME_TYPE_H264.to_owned(),
            ..Default::default()
        },
        "video".to_owned(),
        "webrtc-rs".to_owned(),
    ));

    let rtp_sender = peer_connection
        .add_track(Arc::clone(&video_track) as Arc<dyn TrackLocal + Send + Sync>)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to add track: {}", e)))?;

    // Read incoming RTCP packets (Required for WebRTC internals like NACK)
    tokio::spawn(async move {
        let mut rtcp_buf = vec![0u8; 1500];
        while let Ok((_, _)) = rtp_sender.read(&mut rtcp_buf).await {}
        tracing::debug!("RTCP reader loop exited");
    });

    let track_clone = video_track.clone();

    // Launch FFmpeg and feed H.264 to TrackLocal
    tokio::spawn(async move {
        tracing::info!("Starting FFmpeg screen capture...");

        let os = std::env::consts::OS;
        let (input_format, input_device) = match os {
            "windows" => ("gdigrab", "desktop"),
            "macos" => ("avfoundation", "1"), // Usually 1 is screen on mac, but requires permissions
            "linux" => ("x11grab", ":0.0"), // Assuming X11 for now
            _ => ("gdigrab", "desktop"), // Fallback
        };
        
        let mut child = match Command::new("ffmpeg")
            .args(&[
                "-f", input_format,
                "-framerate", "30",
                "-i", input_device,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-tune", "zerolatency",
                // Output raw Annex B H.264
                "-f", "h264",
                "pipe:1"
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::null()) // Mute ffmpeg stderr logs
            .spawn() 
        {
            Ok(c) => c,
            Err(e) => {
                tracing::error!("Failed to spawn ffmpeg (is it installed?): {}", e);
                return;
            }
        };

        let mut stdout = child.stdout.take().expect("Failed to get stdout");
        let mut buf = vec![0u8; 65535];
        let mut h264_stream = Vec::new();

        loop {
            match stdout.read(&mut buf).await {
                Ok(0) => {
                    tracing::warn!("FFmpeg stdout closed");
                    break;
                }
                Ok(n) => {
                    h264_stream.extend_from_slice(&buf[..n]);
                    
                    // NAL unit splitter
                    while let Some(idx) = find_nal_unit_start(&h264_stream) {
                        if let Some(next_idx) = find_nal_unit_start(&h264_stream[idx + 4 ..]) {
                            let nal_unit = h264_stream.drain(.. idx + 4 + next_idx).collect::<Vec<u8>>();
                            if let Err(e) = track_clone.write_sample(&Sample {
                                data: bytes::Bytes::from(nal_unit),
                                duration: Duration::from_millis(33),
                                ..Default::default()
                            }).await {
                                tracing::warn!("Failed to write sample, connection might be closed: {}", e);
                                let _ = child.kill().await;
                                return;
                            }
                        } else {
                            // Wait for more data to find the end of this NAL unit
                            break;
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to read ffmpeg stdout: {}", e);
                    break;
                }
            }
        }
        let _ = child.kill().await;
        tracing::info!("FFmpeg screen capture loop exited");
    });

    // 3. Set remote description
    let desc = RTCSessionDescription::offer(offer.sdp).map_err(|e| {
        (StatusCode::BAD_REQUEST, format!("Invalid SDP: {}", e))
    })?;
    
    peer_connection.set_remote_description(desc).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to set remote desc: {}", e))
    })?;

    // 4. Create answer
    let answer = peer_connection.create_answer(None).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to create answer: {}", e))
    })?;

    peer_connection.set_local_description(answer.clone()).await.map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to set local desc: {}", e))
    })?;

    let local_desc = peer_connection.local_description().await.ok_or_else(|| {
        (StatusCode::INTERNAL_SERVER_ERROR, "Local desc missing".to_string())
    })?;

    Ok((StatusCode::OK, Json(SdpAnswer { sdp: local_desc.sdp })))
}

fn find_nal_unit_start(data: &[u8]) -> Option<usize> {
    data.windows(4).position(|w| w == &[0, 0, 0, 1])
}
