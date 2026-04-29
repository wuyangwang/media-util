use crate::detection::engine::InferenceEngine;
use crate::detection::yolo::YoloDetector;
use ndarray::ArrayView;
use ort::value::Value;
use serde::Serialize;
use std::path::Path;
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

    pub async fn process_image(
        &self,
        _id: String,
        input_path: String,
        output_dir: String,
        model_path: String,
        font_data: Vec<u8>,
    ) -> Result<String, String> {
        let mut engine = InferenceEngine::new(&model_path)?;
        let detector = YoloDetector::new(640, 640);

        let mut img = image::open(&input_path).map_err(|e| e.to_string())?;
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

        let detections =
            detector.postprocess(output_view.into_dyn(), scale_x, original_width, original_height, 0.25, 0.45);

        detector.draw_detections(&mut img, &detections, &font_data);

        let file_name = Path::new(&input_path)
            .file_name()
            .ok_or("Invalid input path")?;
        let output_path = Path::new(&output_dir).join(file_name);
        img.save(&output_path).map_err(|e| e.to_string())?;

        Ok(output_path.to_string_lossy().to_string())
    }

    pub async fn process_video(
        &self,
        id: String,
        input_path: String,
        output_dir: String,
        model_path: String,
        font_data: Vec<u8>,
    ) -> Result<(), String> {
        let output_dir_path = Path::new(&output_dir);
        if !output_dir_path.exists() {
            std::fs::create_dir_all(output_dir_path).map_err(|e| e.to_string())?;
        }

        let child = self
            .app
            .shell()
            .sidecar("ffmpeg")
            .map_err(|e| e.to_string())?
            .args([
                "-i",
                &input_path,
                "-vf",
                "select='not(mod(n,5))',setpts=N/FRAME_RATE/TB",
                "-vsync",
                "vfr",
                "-q:v",
                "2",
                &output_dir_path
                    .join("frame_%04d.jpg")
                    .to_string_lossy()
                    .to_string(),
            ])
            .spawn()
            .map_err(|e| e.to_string())?;

        let (mut rx, _child_proc) = child;

        while let Some(event) = rx.recv().await {
            if let CommandEvent::Terminated(_) = event {
                break;
            }
        }

        let mut frames: Vec<_> = std::fs::read_dir(output_dir_path)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.extension().map_or(false, |ext| ext == "jpg"))
            .collect();
        
        frames.sort();

        let total_frames = frames.len();
        let mut engine = InferenceEngine::new(&model_path)?;
        let detector = YoloDetector::new(640, 640);

        for (i, frame_path) in frames.into_iter().enumerate() {
            let mut img = image::open(&frame_path).map_err(|e| e.to_string())?;
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
                
            let detections =
                detector.postprocess(output_view.into_dyn(), scale_x, original_width, original_height, 0.25, 0.45);

            detector.draw_detections(&mut img, &detections, &font_data);
            img.save(&frame_path).map_err(|e| e.to_string())?;

            let progress = (i + 1) as f64 / total_frames as f64 * 100.0;
            let _ = self.app.emit(
                "detection-progress",
                DetectionProgress {
                    id: id.clone(),
                    progress,
                    status: format!("Processing frame {}/{}", i + 1, total_frames),
                    result_path: Some(frame_path.to_string_lossy().to_string()),
                },
            );
        }

        let _ = self.app.emit(
            "detection-progress",
            DetectionProgress {
                id: id.clone(),
                progress: 100.0,
                status: "Completed".to_string(),
                result_path: None,
            },
        );

        Ok(())
    }
}
