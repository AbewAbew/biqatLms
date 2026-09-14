(() => {
	"use strict";
	// Shared by the public website and LMS, before either UI is painted.
	// Apply this rollout once to returning browsers as well: upstream previously
	// persisted its light default without distinguishing it from a user choice.
	const rolloutKey = "biqatDarkDefaultApplied";
	let theme = "dark";
	try {
		if (localStorage.getItem(rolloutKey) === "1") {
			const saved = localStorage.getItem("theme");
			if (saved === "light" || saved === "dark") theme = saved;
		}
		localStorage.setItem("theme", theme);
		localStorage.setItem(rolloutKey, "1");
	} catch {
		// Public authentication pages also render dark when storage is blocked.
	}
	document.documentElement.setAttribute("data-theme", theme);
	const style = document.createElement("style");
	style.textContent =
		'html[data-theme="dark"] { color-scheme: dark; } html[data-theme="light"] { color-scheme: light; }';
	document.head.append(style);
})();
