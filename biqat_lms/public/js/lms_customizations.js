const INDIA_GST_LABEL = "Apply GST for India";
const BRANDING_ENDPOINT = "/api/method/lms.lms.api.get_branding";
const LMS_ONBOARDING_KEY_PREFIX = "isOnboardingStepsCompletedlearning";
const BRANDING_CACHE_VERSION = "8";
const UI_STYLE_ID = "biqat-lms-ui-overrides";

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

let updateScheduled = false;
const observer = new MutationObserver(() => {
	if (updateScheduled) return;
	updateScheduled = true;
	queueMicrotask(() => {
		hideIndiaGstControl();
		hideUpstreamFrappeUi();
		repairBrandingImages();
		updateScheduled = false;
	});
});

const headObserver = new MutationObserver(() => repairBrandingImages());

function initializeDomCustomizations() {
	hideIndiaGstControl();
	hideUpstreamFrappeUi();
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
