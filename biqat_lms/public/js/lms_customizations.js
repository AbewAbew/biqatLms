const INDIA_GST_LABEL = "Apply GST for India";
const COURSE_CREATOR_LABEL = "Course creator";
const MANAGED_INSTRUCTOR_LABEL = "Instructor";
const BRANDING_ENDPOINT = "/api/method/lms.lms.api.get_branding";
const LMS_ONBOARDING_KEY_PREFIX = "isOnboardingStepsCompletedlearning";
const BRANDING_CACHE_VERSION = "10";
const UI_STYLE_ID = "biqat-lms-ui-overrides";
const SIDEBAR_LANGUAGE_SELECTOR_ID = "biqat-sidebar-language-selector";
const SIDEBAR_LANGUAGE_STORAGE_KEY = "biqatLmsSidebarLanguage";
const SIDEBAR_SOURCE_LABEL_ATTRIBUTE = "data-biqat-sidebar-source-label";
const INSTRUCTOR_MANAGER_ID = "biqat-instructor-manager";
const USERS_INSTRUCTOR_SECTION_ID = "biqat-users-instructor-profiles";
const COURSE_PUBLIC_INSTRUCTOR_CLASS = "biqat-course-public-instructors";
const API_BASE = "/api/method/biqat_lms.api";
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
let pendingCourseProfiles = [];
let pendingBatchProfiles = [];

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

		.biqat-button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0.375rem;
			min-height: 1.75rem;
			padding: 0.25rem 0.625rem;
			border: 1px solid var(--outline-gray-2, #d1d5db);
			border-radius: 0.5rem;
			background: var(--surface-base, #ffffff);
			color: var(--ink-gray-8, #1f2937);
			font-size: 0.875rem;
			font-weight: 500;
			line-height: 1.25rem;
			transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
		}

		.biqat-button:hover:not(:disabled) {
			border-color: var(--outline-gray-3, #9ca3af);
			background: var(--surface-gray-2, #f3f4f6);
		}

		.biqat-button:active:not(:disabled) {
			background: var(--surface-gray-4, #d1d5db);
		}

		.biqat-button:disabled {
			cursor: not-allowed;
			border-color: var(--outline-gray-2, #d1d5db);
			background: var(--surface-gray-2, #f3f4f6);
			color: var(--ink-gray-4, #9ca3af);
		}

		.biqat-button-solid {
			border-color: var(--surface-gray-10, #171717);
			background: var(--surface-gray-10, #171717);
			color: var(--ink-base, #ffffff);
		}

		.biqat-button-solid:hover:not(:disabled) {
			border-color: var(--surface-gray-9, #262626);
			background: var(--surface-gray-9, #262626);
		}

		.biqat-button-solid:active:not(:disabled) {
			border-color: var(--surface-gray-8, #404040);
			background: var(--surface-gray-8, #404040);
		}

		#${USERS_INSTRUCTOR_SECTION_ID} {
			margin-bottom: 1rem;
			padding: 1rem;
			border: 1px solid var(--outline-gray-2, #e5e7eb);
			border-radius: 0.75rem;
			background: var(--surface-base, #ffffff);
			color: var(--ink-gray-9, #111827);
		}

		#${USERS_INSTRUCTOR_SECTION_ID} h3,
		.biqat-modal h2 {
			color: var(--ink-gray-9, #111827);
		}

		.biqat-profile-row {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			padding: 0.625rem 0;
			border-right: 0;
			border-bottom: 0;
			border-left: 0;
			border-top: 1px solid var(--outline-gray-1, #f3f4f6);
			background: transparent;
			color: var(--ink-gray-9, #111827);
			font: inherit;
		}

		.biqat-profile-avatar {
			width: 2rem;
			height: 2rem;
			flex: 0 0 auto;
			border-radius: 999px;
			object-fit: cover;
			background: var(--surface-gray-2, #f3f4f6);
		}

		.biqat-modal-backdrop {
			position: fixed;
			inset: 0;
			z-index: 10000;
			display: grid;
			place-items: center;
			padding: 1rem;
			background: rgb(0 0 0 / 0.45);
		}

		.biqat-modal {
			width: min(46rem, 100%);
			max-height: min(50rem, calc(100vh - 2rem));
			overflow: auto;
			border-radius: 0.875rem;
			border: 1px solid var(--outline-gray-2, #d1d5db);
			background: var(--surface-base, #ffffff);
			box-shadow: 0 20px 60px rgb(0 0 0 / 0.24);
			color: var(--ink-gray-9, #111827);
		}

		.biqat-modal-header, .biqat-modal-footer {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
			padding: 1rem 1.25rem;
			border-bottom: 1px solid var(--outline-gray-1, #e5e7eb);
		}

		.biqat-modal-footer { justify-content: flex-end; border-top: 1px solid var(--outline-gray-1, #e5e7eb); border-bottom: 0; }
		.biqat-modal-body { padding: 1.25rem; }
		.biqat-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
		.biqat-form-field { display: flex; flex-direction: column; gap: 0.375rem; min-width: 0; }
		.biqat-form-field-wide { grid-column: 1 / -1; }
		.biqat-form-field label { font-size: 0.8125rem; font-weight: 500; color: var(--ink-gray-7, #374151); }
		.biqat-form-field input, .biqat-form-field textarea {
			width: 100%;
			padding: 0.5rem 0.625rem;
			border: 1px solid var(--outline-gray-2, #d1d5db);
			border-radius: 0.5rem;
			background: var(--surface-gray-2, #f9fafb);
			color: var(--ink-gray-9, #111827);
		}

		.biqat-form-field input::placeholder,
		.biqat-form-field textarea::placeholder {
			color: var(--ink-gray-4, #9ca3af);
		}

		.biqat-form-field input:focus,
		.biqat-form-field textarea:focus {
			border-color: var(--outline-gray-4, #6b7280);
			outline: none;
		}

		.biqat-course-public-instructors { position: relative; }
		.biqat-picker-summary {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem;
			width: 100%;
			min-height: 1.75rem;
			padding: 0.25rem 0.5rem;
			border: 1px solid var(--outline-gray-2, #d1d5db);
			border-radius: 0.375rem;
			background: var(--surface-base, #fff);
			color: var(--ink-gray-8, #1f2937);
			font-size: 0.875rem;
			text-align: left;
			outline: none;
		}
		.biqat-picker-summary:hover { border-color: var(--outline-gray-3, #9ca3af); box-shadow: 0 1px 2px rgb(0 0 0 / 0.06); }
		.biqat-picker-summary[data-state="open"] { border-color: var(--outline-gray-4, #6b7280); box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
		.biqat-picker-summary-main { display: flex; align-items: center; gap: 0.5rem; min-width: 0; flex: 1; }
		.biqat-picker-summary-text { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.biqat-picker-trigger-avatar { width: 1.25rem; height: 1.25rem; border-radius: 999px; object-fit: cover; background: var(--surface-gray-2, #f3f4f6); }

		.biqat-picker-options {
			position: absolute;
			z-index: 50;
			top: calc(100% + 0.25rem);
			left: 0;
			right: 0;
			overflow: hidden;
			padding: 0;
			border: 1px solid var(--outline-gray-2, #d1d5db);
			border-radius: 0.5rem;
			background: var(--surface-elevation-2, #fff);
			box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
		}

		.biqat-picker-search { display: flex; align-items: center; gap: 0.5rem; padding: 0 0.75rem; border-bottom: 1px solid var(--outline-gray-1, #e5e7eb); }
		.biqat-picker-search input { min-width: 0; flex: 1; padding: 0.5rem 0; border: 0; background: transparent; color: var(--ink-gray-8, #1f2937); font-size: 0.875rem; outline: none; }
		.biqat-picker-search input::placeholder { color: var(--ink-gray-4, #9ca3af); }
		.biqat-picker-list { display: flex; max-height: 15rem; flex-direction: column; overflow: auto; padding: 0.25rem; }
		.biqat-picker-option { display: flex; min-height: 1.75rem; align-items: center; gap: 0.5rem; padding: 0.25rem 0.5rem; border-radius: 0.25rem; color: var(--ink-gray-9, #111827); cursor: pointer; }
		.biqat-picker-option:hover { background: var(--surface-gray-2, #f3f4f6); }
		.biqat-picker-option[data-selected="true"] { background: var(--surface-gray-2, #f3f4f6); }
		.biqat-picker-option-avatar { width: 1.25rem; height: 1.25rem; }
		.biqat-picker-option-label { display: flex; min-width: 0; flex: 1; align-items: center; justify-content: space-between; gap: 0.5rem; font-size: 0.875rem; }
		.biqat-picker-option-label > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.biqat-picker-empty { padding: 0.5rem; color: var(--ink-gray-5, #6b7280); font-size: 0.875rem; }
		.biqat-picker-footer { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.375rem 0.5rem; border-top: 1px solid var(--outline-gray-1, #e5e7eb); }
		.biqat-picker-footer button { display: inline-flex; min-height: 1.75rem; align-items: center; gap: 0.375rem; padding: 0.25rem 0.5rem; border-radius: 0.375rem; color: var(--ink-gray-7, #374151); font-size: 0.8125rem; }
		.biqat-picker-footer button:hover { background: var(--surface-gray-2, #f3f4f6); }
		.biqat-muted { color: var(--ink-gray-5, #6b7280); font-size: 0.8125rem; }

		@media (max-width: 640px) { .biqat-form-grid { grid-template-columns: 1fr; } }
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
	return captureNewInstructorProfiles(resource, options, response);
};

async function apiCall(method, args = {}) {
	const headers = {
		Accept: "application/json",
		"Content-Type": "application/json; charset=utf-8",
		"X-Frappe-Site-Name": window.location.hostname,
	};
	if (window.csrf_token && window.csrf_token !== "{{ csrf_token }}") {
		headers["X-Frappe-CSRF-Token"] = window.csrf_token;
	}
	const response = await originalFetch(`${API_BASE}.${method}`, {
		method: "POST",
		headers,
		body: JSON.stringify(args),
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok || payload.exc) {
		throw new Error(
			payload._error_message || payload.message || `Request failed (${response.status})`
		);
	}
	return payload.message;
}

async function captureNewInstructorProfiles(resource, options, responsePromise) {
	if (getRequestPath(resource) !== "/api/method/frappe.client.insert") return responsePromise;

	let body;
	try {
		body = JSON.parse(options?.body || "{}");
		if (typeof body.doc === "string") body.doc = JSON.parse(body.doc);
	} catch {
		return responsePromise;
	}
	const doctype = body?.doc?.doctype;
	const isCourse = doctype === "LMS Course";
	const isBatch = doctype === "LMS Batch";
	if (!isCourse && !isBatch) return responsePromise;
	const pendingProfiles = isCourse ? pendingCourseProfiles : pendingBatchProfiles;
	if (!pendingProfiles.length) return responsePromise;

	const response = await responsePromise;
	if (!response.ok) return response;
	const payload = await response
		.clone()
		.json()
		.catch(() => null);
	const documentName = payload?.message?.name || payload?.docs?.[0]?.name;
	if (!documentName) return response;

	const selected = [...pendingProfiles];
	try {
		await apiCall(
			isCourse ? "set_course_instructor_profiles" : "set_batch_instructor_profiles",
			{
				[isCourse ? "course" : "batch"]: documentName,
				profiles: selected,
			}
		);
		if (isCourse) pendingCourseProfiles = [];
		else pendingBatchProfiles = [];
	} catch (error) {
		console.error("Unable to save public instructors", error);
	}
	return response;
}

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

function relabelManagedInstructorCards() {
	for (const label of document.querySelectorAll(
		".uppercase.text-ink-gray-5.text-xs-semibold.tracking-wider"
	)) {
		if (label.textContent.trim() === COURSE_CREATOR_LABEL) {
			label.textContent = MANAGED_INSTRUCTOR_LABEL;
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
		if (sidebarLanguage === "en") {
			const englishLabel = amharicToEnglish[currentLabel];
			if (englishLabel) element.textContent = englishLabel;
			element.removeAttribute(SIDEBAR_SOURCE_LABEL_ATTRIBUTE);
			continue;
		}

		// Vue reuses sidebar DOM nodes when a user's visible links change. Prefer
		// the newly rendered English label over a source attribute from the old
		// node so labels never become detached from their button's actual route.
		let sourceLabel = Object.hasOwn(SIDEBAR_TRANSLATIONS, currentLabel)
			? currentLabel
			: element.getAttribute(SIDEBAR_SOURCE_LABEL_ATTRIBUTE) ||
			  amharicToEnglish[currentLabel];
		if (!sourceLabel || !SIDEBAR_TRANSLATIONS[sourceLabel]) continue;

		element.setAttribute(SIDEBAR_SOURCE_LABEL_ATTRIBUTE, sourceLabel);
		const desiredLabel = SIDEBAR_TRANSLATIONS[sourceLabel];
		if (currentLabel !== desiredLabel) element.textContent = desiredLabel;
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

function createTextElement(tag, text, className = "") {
	const element = document.createElement(tag);
	element.textContent = text;
	if (className) element.className = className;
	return element;
}

function profileSubtitle(profile) {
	return [profile.professional_title, profile.organization].filter(Boolean).join(" · ");
}

function createProfileAvatar(profile) {
	if (profile.profile_image) {
		const image = document.createElement("img");
		image.className = "biqat-profile-avatar";
		image.src = profile.profile_image;
		image.alt = "";
		return image;
	}
	const fallback = createTextElement(
		"span",
		(profile.full_name || "I").trim().charAt(0).toUpperCase(),
		"biqat-profile-avatar"
	);
	fallback.style.display = "grid";
	fallback.style.placeItems = "center";
	return fallback;
}

function closeInstructorManager() {
	document.getElementById(INSTRUCTOR_MANAGER_ID)?.remove();
}

function createInstructorManagerShell(title) {
	closeInstructorManager();
	const backdrop = document.createElement("div");
	backdrop.id = INSTRUCTOR_MANAGER_ID;
	backdrop.className = "biqat-modal-backdrop";
	backdrop.innerHTML = `
		<section class="biqat-modal" role="dialog" aria-modal="true">
			<header class="biqat-modal-header">
				<div><h2 class="text-xl font-semibold"></h2><p class="biqat-muted">Profiles shown publicly on courses; no login or editing access is created.</p></div>
				<button type="button" class="biqat-button" data-action="close" aria-label="Close">×</button>
			</header>
			<div class="biqat-modal-body"></div>
		</section>`;
	backdrop.querySelector("h2").textContent = title;
	backdrop
		.querySelector('[data-action="close"]')
		.addEventListener("click", closeInstructorManager);
	backdrop.addEventListener("click", (event) => {
		if (event.target === backdrop) closeInstructorManager();
	});
	document.body.appendChild(backdrop);
	return backdrop;
}

async function openInstructorManager() {
	const shell = createInstructorManagerShell("Instructor profiles");
	const body = shell.querySelector(".biqat-modal-body");
	body.textContent = "Loading instructor profiles…";
	try {
		const profiles = await apiCall("list_instructor_profiles");
		renderInstructorManagerList(shell, profiles || []);
	} catch (error) {
		body.textContent = error.message;
	}
}

function renderInstructorManagerList(shell, profiles) {
	const body = shell.querySelector(".biqat-modal-body");
	body.replaceChildren();
	const actions = document.createElement("div");
	actions.style.cssText =
		"display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1rem";
	actions.append(
		createTextElement(
			"p",
			`${profiles.length} managed instructor profile${profiles.length === 1 ? "" : "s"}`,
			"biqat-muted"
		)
	);
	const add = createTextElement("button", "+ New instructor", "biqat-button biqat-button-solid");
	add.type = "button";
	add.addEventListener("click", () => renderInstructorProfileForm(shell));
	actions.append(add);
	body.append(actions);

	if (!profiles.length) {
		body.append(
			createTextElement("p", "No instructor profiles yet. Add the first teacher here.")
		);
		return;
	}

	for (const profile of profiles) {
		const row = document.createElement("div");
		row.className = "biqat-profile-row";
		if (!profile.enabled) row.style.opacity = "0.55";
		row.append(createProfileAvatar(profile));
		const details = document.createElement("div");
		details.style.cssText = "min-width:0;flex:1";
		details.append(
			createTextElement("div", profile.full_name, "text-sm font-medium"),
			createTextElement(
				"div",
				profileSubtitle(profile) || profile.contact_email || "Instructor",
				"biqat-muted"
			)
		);
		row.append(details);

		const status = createTextElement(
			"button",
			profile.enabled ? "Disable" : "Enable",
			"biqat-button"
		);
		status.type = "button";
		status.addEventListener("click", async () => {
			status.disabled = true;
			try {
				await apiCall("set_instructor_profile_status", {
					profile: profile.name,
					enabled: profile.enabled ? 0 : 1,
				});
				await openInstructorManager();
				refreshUsersInstructorSection();
			} catch (error) {
				alert(error.message);
				status.disabled = false;
			}
		});

		const edit = createTextElement("button", "Edit", "biqat-button");
		edit.type = "button";
		edit.addEventListener("click", () => renderInstructorProfileForm(shell, profile));
		row.append(status, edit);
		body.append(row);
	}
}

function createFormField(label, name, options = {}) {
	const wrapper = document.createElement("div");
	wrapper.className = `biqat-form-field${options.wide ? " biqat-form-field-wide" : ""}`;
	const fieldLabel = createTextElement("label", label);
	fieldLabel.htmlFor = `biqat-profile-${name}`;
	const field = document.createElement(options.textarea ? "textarea" : "input");
	field.id = `biqat-profile-${name}`;
	field.name = name;
	field.value = options.value || "";
	if (options.textarea) field.rows = options.rows || 6;
	if (options.type) field.type = options.type;
	if (options.required) field.required = true;
	wrapper.append(fieldLabel, field);
	if (options.help) wrapper.append(createTextElement("small", options.help, "biqat-muted"));
	return wrapper;
}

async function uploadInstructorImage(file, profileName) {
	if (!file) return null;
	const body = new FormData();
	body.append("file", file);
	body.append("is_private", "0");
	body.append("doctype", "Biqat Instructor Profile");
	body.append("docname", profileName);
	const headers = { "X-Frappe-Site-Name": window.location.hostname };
	if (window.csrf_token && window.csrf_token !== "{{ csrf_token }}") {
		headers["X-Frappe-CSRF-Token"] = window.csrf_token;
	}
	const response = await originalFetch("/api/method/upload_file", {
		method: "POST",
		headers,
		body,
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok || !payload.message?.file_url) throw new Error("Image upload failed.");
	return payload.message.file_url;
}

function renderInstructorProfileForm(shell, profile = {}) {
	const title = shell.querySelector("h2");
	title.textContent = profile.name ? "Edit instructor" : "New instructor";
	const body = shell.querySelector(".biqat-modal-body");
	body.replaceChildren();
	const form = document.createElement("form");
	const grid = document.createElement("div");
	grid.className = "biqat-form-grid";
	grid.append(
		createFormField("Full name", "full_name", { value: profile.full_name, required: true }),
		createFormField("Professional title", "professional_title", {
			value: profile.professional_title,
		}),
		createFormField("Organization", "organization", { value: profile.organization }),
		createFormField("Contact email (private)", "contact_email", {
			value: profile.contact_email,
			type: "email",
		}),
		createFormField("LinkedIn URL", "linkedin", {
			value: profile.linkedin,
			type: "url",
			wide: true,
		}),
		createFormField("Profile photo URL", "profile_image", { value: profile.profile_image }),
		createFormField("Upload profile photo", "profile_image_file", { type: "file" }),
		createFormField("Cover image URL", "cover_image", { value: profile.cover_image }),
		createFormField("Upload cover image", "cover_image_file", { type: "file" }),
		createFormField("Biography", "biography", {
			value: profile.biography,
			textarea: true,
			wide: true,
			help: "Plain text or simple HTML is supported.",
		})
	);
	form.append(grid);
	const footer = document.createElement("div");
	footer.className = "biqat-modal-footer";
	const cancel = createTextElement("button", "Cancel", "biqat-button");
	cancel.type = "button";
	cancel.addEventListener("click", () => openInstructorManager());
	const save = createTextElement("button", "Save instructor", "biqat-button biqat-button-solid");
	save.type = "submit";
	footer.append(cancel, save);
	form.append(footer);

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		save.disabled = true;
		save.textContent = "Saving…";
		const data = Object.fromEntries(new FormData(form).entries());
		delete data.profile_image_file;
		delete data.cover_image_file;
		if (profile.name) data.name = profile.name;
		try {
			let saved = await apiCall("save_instructor_profile", { profile: data });
			const photoFile = form.elements.profile_image_file.files?.[0];
			const coverFile = form.elements.cover_image_file.files?.[0];
			if (photoFile || coverFile) {
				if (photoFile)
					data.profile_image = await uploadInstructorImage(photoFile, saved.name);
				if (coverFile)
					data.cover_image = await uploadInstructorImage(coverFile, saved.name);
				data.name = saved.name;
				saved = await apiCall("save_instructor_profile", { profile: data });
			}
			await openInstructorManager();
			refreshUsersInstructorSection();
			refreshCourseInstructorPickers();
		} catch (error) {
			alert(error.message);
			save.disabled = false;
			save.textContent = "Save instructor";
		}
	});
	body.append(form);
}

function findUsersPanel() {
	for (const title of document.querySelectorAll("h2")) {
		if (title.textContent.trim() !== "Users") continue;
		const panel = title.closest(".flex.h-full.min-h-0.flex-col");
		if (panel) return panel;
	}
	return null;
}

async function ensureUsersInstructorSection() {
	if (document.getElementById(USERS_INSTRUCTOR_SECTION_ID)) return;
	const panel = findUsersPanel();
	const content = panel?.querySelector(":scope > div.flex.min-h-0.flex-1.flex-col");
	if (!content) return;

	const section = document.createElement("section");
	section.id = USERS_INSTRUCTOR_SECTION_ID;
	section.textContent = "Loading instructor profiles…";
	content.prepend(section);
	try {
		const profiles = await apiCall("list_instructor_profiles");
		if (!section.isConnected) return;
		section.replaceChildren();
		const header = document.createElement("div");
		header.style.cssText =
			"display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:.5rem";
		const heading = document.createElement("div");
		heading.append(
			createTextElement("h3", "Instructor profiles", "text-base font-semibold"),
			createTextElement(
				"p",
				"Teacher bios and public course attribution without login access.",
				"biqat-muted"
			)
		);
		const manage = createTextElement("button", "Manage instructors", "biqat-button");
		manage.type = "button";
		manage.addEventListener("click", openInstructorManager);
		header.append(heading, manage);
		section.append(header);

		for (const profile of (profiles || []).slice(0, 5)) {
			const row = document.createElement("button");
			row.type = "button";
			row.className = "biqat-profile-row";
			row.style.cssText += "width:100%;text-align:left";
			if (!profile.enabled) row.style.opacity = "0.55";
			row.append(createProfileAvatar(profile));
			const details = document.createElement("span");
			details.style.cssText = "min-width:0;flex:1";
			details.append(
				createTextElement("span", profile.full_name, "text-sm font-medium"),
				document.createElement("br"),
				createTextElement("span", profileSubtitle(profile) || "Instructor", "biqat-muted")
			);
			row.append(details, createTextElement("span", "Instructor", "biqat-muted"));
			row.addEventListener("click", () => {
				const shell = createInstructorManagerShell("Edit instructor");
				renderInstructorProfileForm(shell, profile);
			});
			section.append(row);
		}
		if (!profiles?.length)
			section.append(createTextElement("p", "No instructor profiles yet.", "biqat-muted"));
	} catch (error) {
		section.textContent = error.message;
	}
}

function refreshUsersInstructorSection() {
	document.getElementById(USERS_INSTRUCTOR_SECTION_ID)?.remove();
	ensureUsersInstructorSection();
}

function currentCourseName() {
	const match = window.location.pathname.match(/^\/lms\/courses\/([^/]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

function currentBatchName() {
	const match = window.location.pathname.match(/^\/lms\/batches\/([^/]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

function getLabelText(label) {
	return (label.textContent || "")
		.replace(/\s*\*\s*(?:\(required\))?\s*$/i, "")
		.replace(/\s+/g, " ")
		.trim();
}

function refreshCourseInstructorPickers() {
	for (const picker of document.querySelectorAll(`.${COURSE_PUBLIC_INSTRUCTOR_CLASS}`)) {
		const editorField = picker.previousElementSibling;
		if (editorField) delete editorField.dataset.biqatInstructorField;
		picker.remove();
	}
	ensureCourseInstructorPickers();
}

async function ensureCourseInstructorPickers() {
	const isCoursePage = /^\/lms\/courses(?:\/|$)/.test(window.location.pathname);
	const isBatchPage = /^\/lms\/batches(?:\/|$)/.test(window.location.pathname);
	if (!isCoursePage && !isBatchPage) return;
	const resourceType = isBatchPage ? "batch" : "course";
	const resourceName = isBatchPage ? currentBatchName() : currentCourseName();

	for (const label of document.querySelectorAll("label")) {
		const labelText = getLabelText(label);
		if (!["Instructors", "Course editors", "Batch managers"].includes(labelText)) continue;
		const editorField = label.parentElement;
		if (!editorField || editorField.dataset.biqatInstructorField === "1") continue;
		const picker = document.createElement("div");
		picker.className = `space-y-1.5 ${COURSE_PUBLIC_INSTRUCTOR_CLASS}`;
		const instructorLabel = createTextElement(
			"label",
			"Instructor ",
			"block text-xs text-ink-gray-5"
		);
		const required = createTextElement("span", "*", "text-ink-red-6 select-none");
		required.setAttribute("aria-hidden", "true");
		instructorLabel.append(required);
		picker.append(
			instructorLabel,
			createTextElement("p", "Loading instructor profiles…", "biqat-muted")
		);
		editorField.dataset.biqatInstructorField = "1";
		editorField.insertAdjacentElement("afterend", picker);
		editorField.hidden = true;
		try {
			const args = resourceName ? { [resourceType]: resourceName } : {};
			const profiles = await apiCall("list_instructor_profiles", args);
			if (picker.isConnected)
				renderManagedInstructorPicker(picker, profiles || [], resourceType, resourceName);
		} catch (error) {
			picker.querySelector("p").textContent = error.message;
		}
	}
}

function renderManagedInstructorPicker(picker, profiles, resourceType, resourceName) {
	const pendingProfiles =
		resourceType === "batch" ? pendingBatchProfiles : pendingCourseProfiles;
	const selected = new Set(
		profiles
			.filter(
				(profile) =>
					profile.selected || (!resourceName && pendingProfiles.includes(profile.name))
			)
			.map((profile) => profile.name)
	);
	if (!resourceName && !pendingProfiles.length) {
		if (resourceType === "batch") pendingBatchProfiles = [];
		else pendingCourseProfiles = [];
	}
	const description = picker.querySelector("p");

	if (!profiles.some((profile) => profile.enabled)) {
		description.textContent = "No instructor profiles are available.";
		const create = createTextElement("button", "+ Create instructor profile", "biqat-button");
		create.type = "button";
		create.addEventListener("click", openInstructorManager);
		picker.append(create);
		return;
	}
	description.remove();

	const summary = document.createElement("button");
	summary.className = "biqat-picker-summary";
	summary.type = "button";
	summary.dataset.state = "closed";
	summary.setAttribute("aria-expanded", "false");
	const summaryMain = document.createElement("span");
	summaryMain.className = "biqat-picker-summary-main";
	const summaryIcon = document.createElement("span");
	summaryIcon.className = "lucide-users size-4 shrink-0 text-ink-gray-5";
	const summaryText = createTextElement(
		"span",
		"Select instructor",
		"biqat-picker-summary-text text-ink-gray-4"
	);
	const chevron = document.createElement("span");
	chevron.className = "lucide-chevron-down size-4 shrink-0 text-ink-gray-4";
	summaryMain.append(summaryIcon, summaryText);
	summary.append(summaryMain, chevron);

	const options = document.createElement("div");
	options.className = "biqat-picker-options";
	options.hidden = true;
	const searchContainer = document.createElement("div");
	searchContainer.className = "biqat-picker-search";
	const searchInput = document.createElement("input");
	searchInput.type = "text";
	searchInput.placeholder = "Select instructor";
	searchInput.autocomplete = "off";
	searchContainer.append(searchInput);
	const optionList = document.createElement("div");
	optionList.className = "biqat-picker-list";
	const emptyState = createTextElement("div", "No results", "biqat-picker-empty");
	emptyState.hidden = true;
	optionList.append(emptyState);
	options.append(searchContainer, optionList);
	const optionInputs = new Map();

	const persistSelection = async () => {
		if (!resourceName) {
			if (resourceType === "batch") pendingBatchProfiles = [...selected];
			else pendingCourseProfiles = [...selected];
			return;
		}
		try {
			await apiCall(
				resourceType === "batch"
					? "set_batch_instructor_profiles"
					: "set_course_instructor_profiles",
				{
					[resourceType]: resourceName,
					profiles: [...selected],
				}
			);
		} catch (error) {
			alert(error.message);
		}
	};

	const updateSummary = () => {
		const selectedProfiles = profiles.filter((profile) => selected.has(profile.name));
		summaryText.textContent = selectedProfiles.length
			? selectedProfiles.map((profile) => profile.full_name).join(", ")
			: "Select instructor";
		summaryText.classList.toggle("text-ink-gray-4", !selectedProfiles.length);
		summaryIcon.className = selectedProfiles.length
			? "biqat-picker-trigger-avatar"
			: "lucide-users size-4 shrink-0 text-ink-gray-5";
		if (selectedProfiles.length) {
			const first = selectedProfiles[0];
			if (first.profile_image) {
				summaryIcon.style.backgroundImage = `url(${JSON.stringify(
					first.profile_image
				).slice(1, -1)})`;
				summaryIcon.style.backgroundSize = "cover";
				summaryIcon.textContent = "";
			} else {
				summaryIcon.style.backgroundImage = "";
				summaryIcon.style.display = "grid";
				summaryIcon.style.placeItems = "center";
				summaryIcon.style.fontSize = "0.6875rem";
				summaryIcon.textContent = (first.full_name || "I").charAt(0).toUpperCase();
			}
		} else {
			summaryIcon.removeAttribute("style");
			summaryIcon.textContent = "";
		}
		for (const [profileName, entry] of optionInputs) {
			entry.checkbox.checked = selected.has(profileName);
			entry.option.dataset.selected = selected.has(profileName) ? "true" : "false";
		}
		if (!resourceName) {
			if (resourceType === "batch") pendingBatchProfiles = [...selected];
			else pendingCourseProfiles = [...selected];
		}
	};

	for (const profile of profiles.filter((item) => item.enabled)) {
		const option = document.createElement("label");
		option.className = "biqat-picker-option";
		option.dataset.search = [
			profile.full_name,
			profile.contact_email,
			profile.professional_title,
			profile.organization,
		]
			.filter(Boolean)
			.join(" ")
			.toLowerCase();
		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.checked = selected.has(profile.name);
		checkbox.addEventListener("change", () => {
			if (checkbox.checked) selected.add(profile.name);
			else selected.delete(profile.name);
			updateSummary();
			persistSelection();
		});
		const details = document.createElement("span");
		details.className = "biqat-picker-option-label";
		details.append(
			createTextElement("span", profile.full_name),
			createTextElement(
				"span",
				profile.contact_email || profileSubtitle(profile) || "Instructor",
				"text-xs text-ink-gray-5"
			)
		);
		const avatar = createProfileAvatar(profile);
		avatar.classList.add("biqat-picker-option-avatar");
		option.append(checkbox, avatar, details);
		optionList.append(option);
		optionInputs.set(profile.name, { checkbox, option });
	}

	searchInput.addEventListener("input", () => {
		const query = searchInput.value.trim().toLowerCase();
		let visible = 0;
		for (const { option } of optionInputs.values()) {
			option.hidden = Boolean(query && !option.dataset.search.includes(query));
			if (!option.hidden) visible += 1;
		}
		emptyState.hidden = visible > 0;
	});

	const footer = document.createElement("div");
	footer.className = "biqat-picker-footer";
	const clear = createTextElement("button", "Clear");
	clear.type = "button";
	clear.addEventListener("click", () => {
		selected.clear();
		updateSummary();
		persistSelection();
	});
	const create = createTextElement("button", "Create New");
	create.type = "button";
	const plus = document.createElement("span");
	plus.className = "lucide-plus size-4";
	create.prepend(plus);
	create.addEventListener("click", () => {
		options.hidden = true;
		openInstructorManager();
	});
	footer.append(clear, create);
	options.append(footer);

	summary.addEventListener("click", () => {
		options.hidden = !options.hidden;
		summary.dataset.state = options.hidden ? "closed" : "open";
		summary.setAttribute("aria-expanded", options.hidden ? "false" : "true");
		chevron.style.transform = options.hidden ? "" : "rotate(180deg)";
		options.style.top = `${summary.offsetTop + summary.offsetHeight + 4}px`;
		if (!options.hidden) requestAnimationFrame(() => searchInput.focus());
	});
	const closeOnOutside = (event) => {
		if (!picker.isConnected) {
			document.removeEventListener("pointerdown", closeOnOutside, true);
			return;
		}
		if (picker.contains(event.target)) return;
		options.hidden = true;
		summary.dataset.state = "closed";
		summary.setAttribute("aria-expanded", "false");
		chevron.style.transform = "";
	};
	// Capture the event before dialogs and Frappe controls stop propagation.
	document.addEventListener("pointerdown", closeOnOutside, true);
	picker.append(summary, options);
	updateSummary();
}

let updateScheduled = false;
const observer = new MutationObserver(() => {
	if (updateScheduled) return;
	updateScheduled = true;
	queueMicrotask(() => {
		hideIndiaGstControl();
		hideUpstreamFrappeUi();
		relabelManagedInstructorCards();
		applySidebarLanguage();
		repairBrandingImages();
		ensureUsersInstructorSection();
		ensureCourseInstructorPickers();
		updateScheduled = false;
	});
});

const headObserver = new MutationObserver(() => repairBrandingImages());

function initializeDomCustomizations() {
	hideIndiaGstControl();
	hideUpstreamFrappeUi();
	relabelManagedInstructorCards();
	applySidebarLanguage();
	repairBrandingImages();
	ensureUsersInstructorSection();
	ensureCourseInstructorPickers();
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
