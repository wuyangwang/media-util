import { load, Store } from "@tauri-apps/plugin-store";
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const STORE_PATH = "settings.json";
let _store: Store | null = null;

async function getStore() {
	if (!_store) {
		_store = await load(STORE_PATH);
	}
	return _store;
}

/**
 * 这是一个通用的 Tauri Store Hook，用于替代 Zustand 的持久化功能。
 */
export function useStoreValue<T>(key: string, defaultValue: T) {
	const [value, setValue] = useState<T>(defaultValue);
	const [isLoaded, setIsLoaded] = useState(false);

	// 初始化加载
	useEffect(() => {
		let unmounted = false;
		getStore().then(async (store) => {
			const saved = await store.get<T>(key);
			if (!unmounted && saved !== undefined && saved !== null) {
				setValue(saved);
			}
			if (!unmounted) setIsLoaded(true);
		});
		return () => {
			unmounted = true;
		};
	}, [key]);

	// 更新值并同步到磁盘
	const updateValue = useCallback(
		async (newValue: T | ((prev: T) => T)) => {
			const store = await getStore();
			const finalValue =
				typeof newValue === "function"
					? (newValue as (prev: T) => T)(value)
					: newValue;

			setValue(finalValue);
			await store.set(key, finalValue);
			await store.save();

			// 如果是并发数设置，还需要同步通知 Rust 后端
			if (key === "concurrency") {
				try {
					await invoke("update_concurrency", { limit: finalValue });
				} catch (e) {
					console.error("Failed to update concurrency in Rust:", e);
				}
			}
		},
		[key, value],
	);

	return [value, updateValue, isLoaded] as const;
}

/**
 * 专门用于管理应用全局设置的 Hook
 */
export function useAppSettings() {
	const [concurrency, setConcurrency, isLoaded] = useStoreValue<number>(
		"concurrency",
		2,
	);
	const [theme, setTheme] = useStoreValue<string>("theme", "system");

	return {
		concurrency,
		setConcurrency,
		theme,
		setTheme,
		isLoaded,
	};
}
