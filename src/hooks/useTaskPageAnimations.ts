import type { RefObject } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

export function useTaskPageAnimations(
	containerRef: RefObject<HTMLElement | null>,
	taskCount: number,
) {
	useGSAP(
		() => {
			gsap.from(".header-animate > *", {
				y: -20,
				opacity: 0,
				stagger: 0.1,
				duration: 0.5,
				ease: "power2.out",
			});
		},
		{ scope: containerRef },
	);

	useGSAP(
		() => {
			if (taskCount > 0) {
				gsap.from(".task-item-animate:last-child", {
					x: 20,
					opacity: 0,
					duration: 0.4,
					ease: "power2.out",
				});
			}
		},
		{ dependencies: [taskCount], scope: containerRef },
	);
}
