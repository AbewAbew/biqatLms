const INDIA_GST_LABEL = "Apply GST for India";
const BRANDING_ENDPOINT = "/api/method/lms.lms.api.get_branding";
const LMS_ONBOARDING_KEY_PREFIX = "isOnboardingStepsCompletedlearning";
const BRANDING_CACHE_VERSION = "10";
const UI_STYLE_ID = "biqat-lms-ui-overrides";
const SIDEBAR_LANGUAGE_SELECTOR_ID = "biqat-sidebar-language-selector";
const SIDEBAR_LANGUAGE_STORAGE_KEY = "biqatLmsSidebarLanguage";
const SIDEBAR_SOURCE_LABEL_ATTRIBUTE = "data-biqat-sidebar-source-label";
const SIDEBAR_TRANSLATIONS = Object.freeze({
	Home: "መነሻ",
	Search: "ፍለጋ",
	Notifications: "ማሳወቂያዎች",
	Courses: "ኮርሶች",
	Programs: "ፕሮግራሞች",
	Batches: "ቡድኖች",
	Certifications: "የምስክር ወረቀቶች",
	Jobs: "ሥራዎች",
	Statistics: "ስታቲስቲክስ",
	"Contact Us": "ያግኙን",
	Quizzes: "ፈተናዎች",
	Assignments: "የቤት ሥራዎች",
	"Programming Exercises": "የፕሮግራም ልምምዶች",
	More: "ተጨማሪ",
});

let sidebarLanguage = getStoredSidebarLanguage();

let brandingLogoUrl = null;
let brandingFaviconUrl = null;

function disableFrappeOnboarding() {
	const cookies = new URLSearchParams(document.cookie.split("; ").join("&"));
	const user = cookies.get("user_id");
	if (user && user !== "Guest") {
		localStorage.setItem(`${LMS_ONBOARDING_KEY_PREFIX}${user}`, "true");
	}
}

disableFrappeOnboarding();

function installUiStyles() {
	if (document.getElementById(UI_STYLE_ID)) return;

	const style = document.createElement("style");
	style.id = UI_STYLE_ID;
	style.textContent = `
		.bg-surface-sidebar .m-2.flex.flex-col.gap-1
			> .flex.items-center.mt-4
			> .flex.items-center.flex-1.gap-3,
		.bg-surface-sidebar .lucide-circle-help,
		.bg-surface-sidebar .lucide-phone,
		.bg-surface-sidebar .lucide-zap {
			display: none !important;
		}

		#${SIDEBAR_LANGUAGE_SELECTOR_ID} {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 0.125rem;
			margin: 0 0.5rem 0.25rem;
			padding: 0.125rem;
			border: 1px solid var(--outline-gray-1, #e5e7eb);
			border-radius: 0.5rem;
			background: var(--surface-gray-2, #f3f4f6);
		}

		#${SIDEBAR_LANGUAGE_SELECTOR_ID} button {
			min-width: 0;
			padding: 0.25rem 0.375rem;
			border-radius: 0.375rem;
			color: var(--ink-gray-6, #4b5563);
			font-size: 0.75rem;
			line-height: 1rem;
			text-align: center;
		}

		#${SIDEBAR_LANGUAGE_SELECTOR_ID} button:hover {
			background: var(--surface-gray-3, #e5e7eb);
		}

		#${SIDEBAR_LANGUAGE_SELECTOR_ID} button[aria-pressed="true"] {
			background: var(--surface-base, #ffffff);
			box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
			color: var(--ink-gray-9, #111827);
			font-weight: 600;
		}

		.bg-surface-sidebar.w-14 #${SIDEBAR_LANGUAGE_SELECTOR_ID} {
			grid-template-columns: 1fr;
			margin-inline: 0.375rem;
		}

		.bg-surface-sidebar.w-14 #${SIDEBAR_LANGUAGE_SELECTOR_ID} button {
			font-size: 0;
			padding-inline: 0.125rem;
		}

		.bg-surface-sidebar.w-14 #${SIDEBAR_LANGUAGE_SELECTOR_ID} button::after {
			content: attr(data-short-label);
			font-size: 0.6875rem;
		}
	`;
	document.head.appendChild(style);
}

installUiStyles();

function getRequestPath(resource) {
	const url = typeof resource === "string" ? resource : resource?.url;
	if (!url) return null;

	try {
		return new URL(url, window.location.origin).pathname;
	} catch {
		return null;
	}
}

function getBrandingImageUrl(value) {
	if (typeof value === "string") return value;
	return value?.file_url || null;
}

function cacheBustBrandingUrl(value) {
	if (!value || value.startsWith("data:") || value.startsWith("blob:")) return value;

	try {
		const url = new URL(value, window.location.origin);
		url.searchParams.set("biqat_branding", BRANDING_CACHE_VERSION);
		return url.origin === window.location.origin
			? `${url.pathname}${url.search}${url.hash}`
			: url.toString();
	} catch {
		return value;
	}
}

function captureBrandingResponse(response) {
	if (!response.ok) return;

	response
		.clone()
		.json()
		.then((payload) => {
			const branding = payload?.message;
			brandingLogoUrl = getBrandingImageUrl(branding?.banner_image);
			brandingFaviconUrl = getBrandingImageUrl(branding?.favicon) || brandingLogoUrl;
			repairBrandingImages();
		})
		.catch(() => {});
}

const originalFetch = window.fetch.bind(window);
window.fetch = (resource, options) => {
	const response = originalFetch(resource, options);
	if (getRequestPath(resource) === BRANDING_ENDPOINT) {
		response.then(captureBrandingResponse).catch(() => {});
	}
	return response;
};

function repairBrandingImages() {
	if (brandingLogoUrl) {
		const sidebarLogo = document.querySelector(
			".bg-surface-sidebar .p-2 button img.w-8.h-8.rounded"
		);
		if (sidebarLogo?.getAttribute("src") !== brandingLogoUrl) {
			sidebarLogo.setAttribute("src", brandingLogoUrl);
		}
	}

	if (!brandingFaviconUrl) return;
	const faviconUrl = cacheBustBrandingUrl(brandingFaviconUrl);
	for (const link of document.querySelectorAll('link[rel~="icon"]')) {
		if (link.getAttribute("href") !== faviconUrl) {
			link.setAttribute("href", faviconUrl);
		}
	}
}

function hideIndiaGstControl() {
	for (const row of document.querySelectorAll(".flex.items-center.justify-between.gap-4.py-3")) {
		if (row.textContent.includes(INDIA_GST_LABEL)) {
			row.style.setProperty("display", "none", "important");
		}
	}

	for (const label of document.querySelectorAll("label, div")) {
		if (label.textContent.trim() !== INDIA_GST_LABEL) continue;
		if (
			!Array.from(label.childNodes).some(
				(node) =>
					node.nodeType === Node.TEXT_NODE && node.textContent.trim() === INDIA_GST_LABEL
			)
		) {
			continue;
		}

		let switchContainer = label.parentElement;
		while (
			switchContainer &&
			switchContainer !== document.body &&
			!switchContainer.querySelector('[role="switch"]')
		) {
			switchContainer = switchContainer.parentElement;
		}

		if (!switchContainer || switchContainer === document.body) continue;

		const fieldContainer = switchContainer.parentElement;
		if (fieldContainer?.childElementCount === 1) {
			fieldContainer.hidden = true;
		} else {
			switchContainer.hidden = true;
		}
	}
}

function hideUpstreamFrappeUi() {
	for (const modal of document.querySelectorAll('[data-testid="onboarding-help-modal"]')) {
		modal.remove();
	}

	for (const controls of document.querySelectorAll(
		".bg-surface-sidebar .m-2.flex.flex-col.gap-1 > .flex.items-center.mt-4 > .flex.items-center.flex-1.gap-3"
	)) {
		controls.style.setProperty("display", "none", "important");
	}

	for (const icon of document.querySelectorAll(
		".lucide-circle-help, .lucide-phone, .lucide-zap"
	)) {
		if (icon.closest(".bg-surface-sidebar")) {
			icon.style.setProperty("display", "none", "important");
		}
	}
}

function getStoredSidebarLanguage() {
	try {
		return localStorage.getItem(SIDEBAR_LANGUAGE_STORAGE_KEY) === "en" ? "en" : "am";
	} catch {
		return "am";
	}
}

function storeSidebarLanguage(language) {
	try {
		localStorage.setItem(SIDEBAR_LANGUAGE_STORAGE_KEY, language);
	} catch {
		// The selector still works for the current page when storage is unavailable.
	}
}

function setSidebarLanguage(language) {
	sidebarLanguage = language === "en" ? "en" : "am";
	storeSidebarLanguage(sidebarLanguage);
	applySidebarLanguage();
}

function createSidebarLanguageButton(language, label, shortLabel) {
	const button = document.createElement("button");
	button.type = "button";
	button.dataset.language = language;
	button.dataset.shortLabel = shortLabel;
	button.textContent = label;
	button.setAttribute("aria-label", language === "am" ? "አማርኛ" : "English");
	button.addEventListener("click", () => setSidebarLanguage(language));
	return button;
}

function ensureSidebarLanguageSelector(sidebar) {
	let selector = document.getElementById(SIDEBAR_LANGUAGE_SELECTOR_ID);
	if (selector) return selector;

	const scrollArea = sidebar.querySelector(":scope > .flex.flex-col.overflow-y-auto");
	const userDropdown = scrollArea?.firstElementChild;
	if (!scrollArea || !userDropdown) return null;

	selector = document.createElement("div");
	selector.id = SIDEBAR_LANGUAGE_SELECTOR_ID;
	selector.setAttribute("role", "group");
	selector.setAttribute("aria-label", "የጎን ምናሌ ቋንቋ / Sidebar language");
	selector.append(
		createSidebarLanguageButton("am", "አማርኛ", "አማ"),
		createSidebarLanguageButton("en", "English", "EN")
	);
	userDropdown.insertAdjacentElement("afterend", selector);
	return selector;
}

function translateSidebarLabels(sidebar) {
	const amharicToEnglish = Object.fromEntries(
		Object.entries(SIDEBAR_TRANSLATIONS).map(([english, amharic]) => [amharic, english])
	);

	for (const element of sidebar.querySelectorAll("span")) {
		if (element.closest(`#${SIDEBAR_LANGUAGE_SELECTOR_ID}`) || element.children.length) {
			continue;
		}

		const currentLabel = element.textContent.trim();
		let sourceLabel = element.getAttribute(SIDEBAR_SOURCE_LABEL_ATTRIBUTE);
		if (!sourceLabel) {
			sourceLabel = Object.hasOwn(SIDEBAR_TRANSLATIONS, currentLabel)
				? currentLabel
				: amharicToEnglish[currentLabel];
			if (!sourceLabel) continue;
			element.setAttribute(SIDEBAR_SOURCE_LABEL_ATTRIBUTE, sourceLabel);
		}

		const desiredLabel =
			sidebarLanguage === "am" ? SIDEBAR_TRANSLATIONS[sourceLabel] : sourceLabel;
		if (desiredLabel && currentLabel !== desiredLabel) {
			element.textContent = desiredLabel;
		}
	}
}

function applySidebarLanguage() {
	const sidebar = document.querySelector(
		".bg-surface-sidebar.flex.h-full.flex-col.justify-between"
	);
	if (!sidebar) return;

	const selector = ensureSidebarLanguageSelector(sidebar);
	for (const button of selector?.querySelectorAll("button") || []) {
		button.setAttribute(
			"aria-pressed",
			button.dataset.language === sidebarLanguage ? "true" : "false"
		);
	}
	translateSidebarLabels(sidebar);
}

let updateScheduled = false;
const observer = new MutationObserver(() => {
	if (updateScheduled) return;
	updateScheduled = true;
	queueMicrotask(() => {
		hideIndiaGstControl();
		hideUpstreamFrappeUi();
		applySidebarLanguage();
		repairBrandingImages();
		updateScheduled = false;
	});
});

const headObserver = new MutationObserver(() => repairBrandingImages());

function initializeDomCustomizations() {
	hideIndiaGstControl();
	hideUpstreamFrappeUi();
	applySidebarLanguage();
	repairBrandingImages();
	observer.observe(document.body, { childList: true, subtree: true });
	headObserver.observe(document.head, {
		attributes: true,
		attributeFilter: ["href"],
		childList: true,
		subtree: true,
	});
}

if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", initializeDomCustomizations, {
		once: true,
	});
} else {
	initializeDomCustomizations();
}
