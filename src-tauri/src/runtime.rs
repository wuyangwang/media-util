pub fn cpu_cores() -> usize {
    std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(4)
}

pub fn worker_threads_reserve_one_core() -> usize {
    cpu_cores().saturating_sub(1).max(1)
}

pub fn ffmpeg_filter_threads() -> usize {
    (worker_threads_reserve_one_core() / 2).max(1)
}

pub fn recommended_queue_concurrency() -> usize {
    (cpu_cores() / 2).clamp(2, 6)
}
