import { useEffect, useMemo, useState } from "react";
import { formatDuration } from "@/lib/utils";

interface UseTaskTimerProps {
	isActive: boolean;
	startTime?: number;
	finalDuration?: string;
}

export function useTaskTimer({
	isActive,
	startTime,
	finalDuration,
}: UseTaskTimerProps) {
	const [currentTime, setCurrentTime] = useState(Date.now());

	useEffect(() => {
		let interval: number | undefined;
		if (isActive && startTime) {
			interval = window.setInterval(() => {
				setCurrentTime(Date.now());
			}, 1000);
		} else {
			setCurrentTime(Date.now());
		}
		return () => clearInterval(interval);
	}, [isActive, startTime]);

	const displayDuration = useMemo(() => {
		// 如果已经有最终耗时（已完成），优先返回
		if (finalDuration) return finalDuration;

		// 如果正在处理中且有开始时间，计算实时耗时
		if (isActive && startTime) {
			const seconds = Math.floor((currentTime - startTime) / 1000);
			return formatDuration(seconds);
		}

		return null;
	}, [finalDuration, startTime, isActive, currentTime]);

	return displayDuration;
}
