const INDIA_GST_LABEL = "Apply GST for India";
const BRANDING_SAVE_ENDPOINT = "/api/method/frappe.client.set_value";
const BRANDING_ENDPOINT = "/api/method/lms.lms.api.get_branding";
const LMS_ONBOARDING_KEY_PREFIX = "isOnboardingStepsCompletedlearning";
const BRANDING_CACHE_VERSION = "4";

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

function findBrandingImageUrl(fieldLabel) {
	for (const element of document.querySelectorAll("div")) {
		const hasMatchingText = Array.from(element.childNodes).some(
			(node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim() === fieldLabel
		);
		if (!hasMatchingText) continue;

		let fieldContainer = element.parentElement;
		for (let level = 0; fieldContainer && level < 5; level += 1) {
			const image = fieldContainer.querySelector("img");
			if (image?.getAttribute("src")) {
				return image.getAttribute("src");
			}
			fieldContainer = fieldContainer.parentElement;
		}
	}
	return null;
}

function repairBrandingSaveRequest(resource, options = {}) {
	const url = typeof resource === "string" ? resource : resource?.url;
	if (!url?.endsWith(BRANDING_SAVE_ENDPOINT) || !options.body) {
		return options;
	}

	let body;
	try {
		body = JSON.parse(options.body);
	} catch {
		return options;
	}

	const fields = body?.fieldname;
	if (
		body?.doctype !== "Website Settings" ||
		body?.name !== "Website Settings" ||
		!fields ||
		!("banner_image" in fields || "favicon" in fields)
	) {
		return options;
	}

	const bannerImage = findBrandingImageUrl("Logo");
	const favicon = findBrandingImageUrl("Favicon");

	if (bannerImage) {
		fields.banner_image = bannerImage;
		fields.app_logo = bannerImage;
	}
	if (favicon) fields.favicon = favicon;

	return { ...options, body: JSON.stringify(body) };
}

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
	const response = originalFetch(resource, repairBrandingSaveRequest(resource, options));
	if (getRequestPath(resource) === BRANDING_ENDPOINT) {
		response.then(captureBrandingResponse).catch(() => {});
	}
	return response;
};

function repairBrandingImages() {
	if (brandingLogoUrl) {
		const sidebarLogo = document.querySelector(
			".bg-surface-menu-bar .p-2 button img.w-8.h-8.rounded"
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
	for (const label of document.querySelectorAll("label")) {
		if (label.textContent.trim() !== INDIA_GST_LABEL) continue;

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

function hideFrappeHelpUi() {
	for (const modal of document.querySelectorAll('[data-testid="onboarding-help-modal"]')) {
		modal.remove();
	}

	for (const icon of document.querySelectorAll("svg.lucide-circle-help")) {
		if (icon.closest(".bg-surface-menu-bar")) icon.hidden = true;
	}
}

let updateScheduled = false;
const observer = new MutationObserver(() => {
	if (updateScheduled) return;
	updateScheduled = true;
	queueMicrotask(() => {
		hideIndiaGstControl();
		hideFrappeHelpUi();
		repairBrandingImages();
		updateScheduled = false;
	});
});

const headObserver = new MutationObserver(() => repairBrandingImages());

function initializeDomCustomizations() {
	hideIndiaGstControl();
	hideFrappeHelpUi();
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
