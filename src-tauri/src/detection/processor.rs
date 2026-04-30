use crate::detection::engine::InferenceEngine;
use crate::detection::yolo::{Detection, YoloDetector, COCO_CLASSES};
use crate::runtime;
use ndarray::ArrayView;
use ort::value::Value;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[derive(Clone, Serialize)]
pub struct DetectionProgress {
    pub id: String,
    pub progress: f64,
    pub status: String,
    pub result_path: Option<String>,
}

pub struct DetectionProcessor {
    app: AppHandle,
}

impl DetectionProcessor {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    fn write_class_stats_csv(
        &self,
        output_dir: &Path,
        stats: &HashMap<usize, (u64, u64, f32)>,
    ) -> Result<String, String> {
        let csv_path = output_dir.join("detection_stats.csv");
        let mut file = std::fs::File::create(&csv_path).map_err(|e| e.to_string())?;
        writeln!(
            file,
            "class_id,class_name,detections,frame_hits,avg_confidence"
        )
        .map_err(|e| e.to_string())?;

        let mut entries: Vec<_> = stats.iter().collect();
        entries.sort_by_key(|(class_id, _)| **class_id);
        for (class_id, (detections, frame_hits, score_sum)) in entries {
            let avg_conf = if *detections > 0 {
                *score_sum as f64 / *detections as f64
            } else {
                0.0
            };
            let class_name = COCO_CLASSES.get(*class_id).copied().unwrap_or("unknown");
            writeln!(
                file,
                "{},{},{},{},{:.4}",
                class_id, class_name, detections, frame_hits, avg_conf
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(csv_path.to_string_lossy().to_string())
    }

    fn run_detection_on_image(
        engine: &mut InferenceEngine,
        detector: &YoloDetector,
        frame_path: &Path,
        font_data: &[u8],
        score_threshold: f32,
        iou_threshold: f32,
    ) -> Result<Vec<Detection>, String> {
        let mut img = image::open(frame_path).map_err(|e| e.to_string())?;
        let (original_width, original_height) = (img.width(), img.height());
        let (input_tensor, scale_x, _) = detector.preprocess(&img);

        let shape: Vec<i64> = input_tensor.shape().iter().map(|&x| x as i64).collect();
        let data: Box<[f32]> = input_tensor.into_raw_vec().into_boxed_slice();
        let input_value = Value::from_array((shape, data)).map_err(|e| e.to_string())?;

        let outputs = engine
            .session
            .run([input_value.into()])
            .map_err(|e| e.to_string())?;

        let (shape, data) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| e.to_string())?;

        let shape_vec: Vec<usize> = shape.iter().map(|&x| x as usize).collect();
        let output_view = ArrayView::from_shape(shape_vec, data).map_err(|e| e.to_string())?;

        let detections = detector.postprocess(
            output_view.into_dyn(),
            scale_x,
            original_width,
            original_height,
            score_threshold,
            iou_threshold,
        );

        detector.draw_detections(&mut img, &detections, font_data);
        img.save(frame_path).map_err(|e| e.to_string())?;

        Ok(detections)
    }

    fn update_stats_for_frame(
        stats: &mut HashMap<usize, (u64, u64, f32)>,
        detections: &[Detection],
    ) {
        let mut frame_classes = HashSet::new();
        for det in detections {
            let entry = stats.entry(det.class_id).or_insert((0, 0, 0.0));
            entry.0 += 1;
            entry.2 += det.score;
            frame_classes.insert(det.class_id);
        }
        for class_id in frame_classes {
            let entry = stats.entry(class_id).or_insert((0, 0, 0.0));
            entry.1 += 1;
        }
    }

    pub async fn process_image(
        &self,
        _id: String,
        input_path: String,
        output_dir: String,
        model_path: String,
        font_data: Vec<u8>,
        score_threshold: f32,
        iou_threshold: f32,
    ) -> Result<String, String> {
        let input_path_buf = PathBuf::from(&input_path);
        let output_dir_buf = PathBuf::from(&output_dir);

        let output_path = tauri::async_runtime::spawn_blocking(move || {
            let mut engine = InferenceEngine::new(&model_path)?;
            let detector = YoloDetector::new(640, 640);

            let file_name = input_path_buf
                .file_name()
                .ok_or("Invalid input path")?
                .to_owned();
            let output_path = output_dir_buf.join(file_name);
            std::fs::copy(&input_path_buf, &output_path).map_err(|e| e.to_string())?;

            let detections = Self::run_detection_on_image(
                &mut engine,
                &detector,
                &output_path,
                &font_data,
                score_threshold,
                iou_threshold,
            )?;

            let mut stats = HashMap::new();
            Self::update_stats_for_frame(&mut stats, &detections);

            Ok::<(PathBuf, HashMap<usize, (u64, u64, f32)>), String>((output_path, stats))
        })
        .await
        .map_err(|e| e.to_string())??;

        let _ = self.write_class_stats_csv(Path::new(&output_dir), &output_path.1)?;
        Ok(output_path.0.to_string_lossy().to_string())
    }

    pub async fn process_video(
        &self,
        id: String,
        input_path: String,
        output_dir: String,
        model_path: String,
        font_data: Vec<u8>,
        sample_every: u32,
        score_threshold: f32,
        iou_threshold: f32,
        cancel_token: Arc<AtomicBool>,
    ) -> Result<(), String> {
        let task_start = Instant::now();
        let output_dir_path = Path::new(&output_dir);
        if !output_dir_path.exists() {
            std::fs::create_dir_all(output_dir_path).map_err(|e| e.to_string())?;
        }

        let ffmpeg_args = vec![
            "-threads".to_string(),
            runtime::worker_threads_reserve_one_core().to_string(),
            "-filter_threads".to_string(),
            runtime::ffmpeg_filter_threads().to_string(),
            "-i".to_string(),
            input_path.clone(),
            "-vf".to_string(),
            format!("select='not(mod(n,{sample_every}))',setpts=N/FRAME_RATE/TB"),
            "-vsync".to_string(),
            "vfr".to_string(),
            "-q:v".to_string(),
            "2".to_string(),
            output_dir_path
                .join("frame_%04d.jpg")
                .to_string_lossy()
                .to_string(),
        ];

        let child = self
            .app
            .shell()
            .sidecar("ffmpeg")
            .map_err(|e| e.to_string())?
            .args(ffmpeg_args)
            .spawn()
            .map_err(|e| e.to_string())?;

        let (mut rx, _child_proc) = child;
        let worker_count = runtime::detection_worker_count(usize::MAX);
        let ort_threads_per_worker =
            (runtime::worker_threads_reserve_one_core() / worker_count).max(1);
        let (result_tx, result_rx) =
            mpsc::channel::<Result<(usize, PathBuf, Vec<Detection>), String>>();
        let mut worker_senders = Vec::with_capacity(worker_count);
        let mut worker_handles: Vec<JoinHandle<Result<(), String>>> =
            Vec::with_capacity(worker_count);

        for _ in 0..worker_count {
            let (task_tx, task_rx) = mpsc::channel::<Option<(usize, PathBuf)>>();
            worker_senders.push(task_tx);

            let model_path = model_path.clone();
            let font_data = font_data.clone();
            let result_tx = result_tx.clone();
            let cancel_token = cancel_token.clone();
            worker_handles.push(std::thread::spawn(move || -> Result<(), String> {
                let mut engine =
                    InferenceEngine::new_with_threads(&model_path, ort_threads_per_worker)?;
                let detector = YoloDetector::new(640, 640);
                while let Ok(task) = task_rx.recv() {
                    let Some((idx, frame_path)) = task else {
                        break;
                    };
                    if cancel_token.load(Ordering::Relaxed) {
                        break;
                    }
                    let detections = Self::run_detection_on_image(
                        &mut engine,
                        &detector,
                        &frame_path,
                        &font_data,
                        score_threshold,
                        iou_threshold,
                    )?;
                    if result_tx.send(Ok((idx, frame_path, detections))).is_err() {
                        break;
                    }
                }
                Ok(())
            }));
        }
        drop(result_tx);

        let mut extraction_done = false;
        let mut seen: HashSet<PathBuf> = HashSet::new();
        let mut pending: HashMap<usize, (PathBuf, Vec<Detection>)> = HashMap::new();
        let mut stats: HashMap<usize, (u64, u64, f32)> = HashMap::new();
        let mut next_frame_index = 0usize;
        let mut dispatched = 0usize;
        let mut processed = 0usize;
        let mut rr = 0usize;

        log::info!(
            "detection start id={} workers={} ort_threads_per_worker={}",
            id,
            worker_count,
            ort_threads_per_worker
        );

        while !extraction_done || processed < dispatched {
            if cancel_token.load(Ordering::Relaxed) {
                break;
            }

            tokio::select! {
                event = rx.recv(), if !extraction_done => {
                    if let Some(CommandEvent::Terminated(_)) = event {
                        extraction_done = true;
                    }
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(120)) => {
                    let mut new_frames: Vec<PathBuf> = std::fs::read_dir(output_dir_path)
                        .map_err(|e| e.to_string())?
                        .filter_map(|e| e.ok())
                        .map(|e| e.path())
                        .filter(|p| p.extension().is_some_and(|ext| ext == "jpg"))
                        .filter(|p| !seen.contains(p))
                        .collect();
                    new_frames.sort();

                    for frame_path in new_frames {
                        seen.insert(frame_path.clone());
                        let idx = next_frame_index;
                        next_frame_index += 1;
                        let sender = &worker_senders[rr % worker_count];
                        rr += 1;
                        sender
                            .send(Some((idx, frame_path)))
                            .map_err(|_| "Failed to dispatch detection frame task".to_string())?;
                        dispatched += 1;
                    }
                }
            }

            while let Ok(result) = result_rx.try_recv() {
                let (idx, frame_path, detections) = result?;
                pending.insert(idx, (frame_path, detections));
            }

            while let Some((frame_path, detections)) = pending.remove(&processed) {
                Self::update_stats_for_frame(&mut stats, &detections);
                processed += 1;
                let denominator = if extraction_done {
                    dispatched.max(1)
                } else {
                    (dispatched + worker_count).max(1)
                };
                let progress = if extraction_done {
                    processed as f64 / denominator as f64 * 100.0
                } else {
                    (processed as f64 / denominator as f64 * 90.0).min(90.0)
                };
                let status = if extraction_done {
                    format!("Processing frame {}/{}", processed, dispatched)
                } else {
                    format!("Processing frame {} (streaming)", processed)
                };
                let _ = self.app.emit(
                    "detection-progress",
                    DetectionProgress {
                        id: id.clone(),
                        progress,
                        status,
                        result_path: Some(frame_path.to_string_lossy().to_string()),
                    },
                );
            }
        }

        for sender in &worker_senders {
            let _ = sender.send(None);
        }
        for handle in worker_handles {
            handle
                .join()
                .map_err(|_| "Detection worker panicked".to_string())??;
        }

        if cancel_token.load(Ordering::Relaxed) {
            let _ = self.app.emit(
                "detection-progress",
                DetectionProgress {
                    id: id.clone(),
                    progress: 0.0,
                    status: "Cancelled".to_string(),
                    result_path: None,
                },
            );
            return Ok(());
        }

        if dispatched == 0 {
            return Err("No frames extracted for detection".to_string());
        }

        let _ = self.write_class_stats_csv(output_dir_path, &stats)?;
        log::info!(
            "detection completed id={} frames={} workers={} elapsed_ms={}",
            id,
            dispatched,
            worker_count,
            task_start.elapsed().as_millis()
        );

        let _ = self.app.emit(
            "detection-progress",
            DetectionProgress {
                id: id.clone(),
                progress: 100.0,
                status: "Completed".to_string(),
                result_path: Some(output_dir.to_string()),
            },
        );

        Ok(())
    }
}
