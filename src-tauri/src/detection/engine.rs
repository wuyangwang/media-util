use crate::runtime;
use ort::{
    ep,
    session::{builder::GraphOptimizationLevel, Session},
};
use std::path::Path;

pub struct InferenceEngine {
    pub session: Session,
}

impl InferenceEngine {
    pub fn new<P: AsRef<Path>>(model_path: P) -> Result<Self, String> {
        Self::new_with_threads(model_path, runtime::worker_threads_reserve_one_core())
    }

    pub fn new_with_threads<P: AsRef<Path>>(
        model_path: P,
        intra_threads: usize,
    ) -> Result<Self, String> {
        let mut builder = Session::builder().map_err(|e| e.to_string())?;
        builder = builder
            .with_optimization_level(GraphOptimizationLevel::Level3)
            .map_err(|e| e.to_string())?
            .with_intra_threads(intra_threads)
            .map_err(|e| e.to_string())?;

        #[cfg(target_os = "windows")]
        {
            builder = builder
                .with_execution_providers([ep::DirectML::default().build()])
                .map_err(|e| e.to_string())?;
        }

        #[cfg(not(target_os = "windows"))]
        {
            builder = builder
                .with_execution_providers([ep::CPU::default().build()])
                .map_err(|e| e.to_string())?;
        }

        let session = builder
            .commit_from_file(model_path)
            .map_err(|e| e.to_string())?;

        Ok(Self { session })
    }
}
