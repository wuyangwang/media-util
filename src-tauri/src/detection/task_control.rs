use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

fn registry() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn register(id: &str) -> Arc<AtomicBool> {
    let token = Arc::new(AtomicBool::new(false));
    if let Ok(mut map) = registry().lock() {
        map.insert(id.to_string(), token.clone());
    }
    token
}

pub fn cancel(id: &str) -> bool {
    if let Ok(map) = registry().lock() {
        if let Some(token) = map.get(id) {
            token.store(true, Ordering::Relaxed);
            return true;
        }
    }
    false
}

pub fn clear(id: &str) {
    if let Ok(mut map) = registry().lock() {
        map.remove(id);
    }
}
