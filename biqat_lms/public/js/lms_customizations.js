const INDIA_GST_LABEL = "Apply GST for India";
const BRANDING_SAVE_ENDPOINT = "/api/method/frappe.client.set_value";

function findBrandingImageUrl(fieldLabel) {
	for (const element of document.querySelectorAll("div")) {
		const hasMatchingText = Array.from(element.childNodes).some(
			(node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim() === fieldLabel,
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

const originalFetch = window.fetch.bind(window);
window.fetch = (resource, options) =>
	originalFetch(resource, repairBrandingSaveRequest(resource, options));

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

let updateScheduled = false;
const observer = new MutationObserver(() => {
	if (updateScheduled) return;
	updateScheduled = true;
	queueMicrotask(() => {
		hideIndiaGstControl();
		updateScheduled = false;
	});
});

hideIndiaGstControl();
observer.observe(document.body, { childList: true, subtree: true });
