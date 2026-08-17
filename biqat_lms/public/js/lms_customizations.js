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
const LIVE_CLASS_MANAGER_ID = "biqat-live-class-manager";
const LIVE_CLASS_MANAGER_BUTTON_ID = "biqat-live-class-manager-button";
const API_BASE = "/api/method/biqat_lms.api";
const GRADING_API_BASE = "/api/method/biqat_lms.grading";
const GRADING_PANEL_ID = "biqat-grading-panel";
const GRADING_BUTTON_ID = "biqat-grading-button";
const EXPERT_COURSES_SECTION_ID = "biqat-expert-courses";
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
	Grading: "ምዘና",
	More: "ተጨማሪ",
});

let sidebarLanguage = getStoredSidebarLanguage();

let brandingLogoUrl = null;
let brandingFaviconUrl = null;
let pendingCourseProfiles = [];
let pendingBatchProfiles = [];
// undefined = not yet resolved, null = this user cannot grade anything.
let gradingContext;

function installEthiopianTimezoneCompatibility() {
	const prototype = Intl.DateTimeFormat?.prototype;
	const originalResolvedOptions = prototype?.resolvedOptions;
	if (!originalResolvedOptions || originalResolvedOptions.biqatTimezoneCompatibility) return;

	function resolvedOptionsWithCanonicalTimezone(...args) {
		const options = originalResolvedOptions.apply(this, args);
		if (options.timeZone !== "Africa/Addis_Ababa") return options;
		return { ...options, timeZone: "Africa/Nairobi" };
	}
	resolvedOptionsWithCanonicalTimezone.biqatTimezoneCompatibility = true;
	Object.defineProperty(prototype, "resolvedOptions", {
		configurable: true,
		writable: true,
		value: resolvedOptionsWithCanonicalTimezone,
	});
}

// Frappe Learning's hard-coded list contains Africa/Nairobi (the canonical
// equivalent) but rejects the browser alias Africa/Addis_Ababa.
installEthiopianTimezoneCompatibility();

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

		.biqat-button-danger {
			border-color: var(--outline-red-2, #fecaca);
			background: var(--surface-red-1, #fef2f2);
			color: var(--ink-red-6, #dc2626);
		}

		.biqat-button-danger:hover:not(:disabled) {
			border-color: var(--outline-red-3, #fca5a5);
			background: var(--surface-red-2, #fee2e2);
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
		.biqat-live-class-row { display: flex; align-items: center; gap: 1rem; padding: 0.875rem 0; border-top: 1px solid var(--outline-gray-1, #e5e7eb); }
		.biqat-live-class-row:first-child { border-top: 0; }
		.biqat-live-class-details { min-width: 0; flex: 1; }
		.biqat-live-class-details strong { display: block; color: var(--ink-gray-9, #111827); }

		/* Only used if the sidebar markup changes shape and no nav entry can be cloned. */
		.biqat-sidebar-grading {
			display: block; width: calc(100% - 1rem); margin: 0.25rem 0.5rem;
			padding: 0.375rem 0.5rem; border-radius: 0.5rem; text-align: start;
			font-size: 0.875rem; color: var(--ink-gray-7, #374151);
			background: var(--surface-gray-2, #f3f4f6);
		}
		.biqat-sidebar-grading:hover { background: var(--surface-gray-3, #e5e7eb); }
		.biqat-grading-section {
			margin: 1.25rem 0 0.5rem; font-size: 0.8125rem; font-weight: 600;
			text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-gray-5, #6b7280);
		}
		.biqat-grading-row {
			border: 1px solid var(--outline-gray-1, #e5e7eb); border-radius: 0.5rem;
			margin-bottom: 0.5rem; overflow: hidden;
		}
		.biqat-grading-row[data-open="true"] { border-color: var(--outline-gray-3, #9ca3af); }
		.biqat-grading-summary {
			display: flex; align-items: center; gap: 1rem; width: 100%;
			padding: 0.75rem 0.875rem; text-align: start; background: none;
		}
		.biqat-grading-summary:hover { background: var(--surface-gray-1, #f9fafb); }
		.biqat-grading-row[data-open="true"] .lucide-chevron-down { transform: rotate(180deg); }
		.biqat-expert-courses { margin-top: 2rem; }
		.biqat-expert-courses-title {
			font-size: 1rem; font-weight: 600; margin-bottom: 0.75rem;
			color: var(--ink-gray-9, #111827);
		}
		.biqat-expert-course-list { display: grid; gap: 0.75rem; }
		.biqat-expert-course {
			display: flex; gap: 0.875rem; align-items: flex-start;
			border: 1px solid var(--outline-gray-1, #e5e7eb); border-radius: 0.5rem;
			padding: 0.75rem; text-decoration: none; color: inherit;
		}
		.biqat-expert-course:hover { border-color: var(--outline-gray-3, #9ca3af); }
		.biqat-expert-course img {
			width: 5rem; height: 3.5rem; object-fit: cover;
			border-radius: 0.375rem; flex-shrink: 0;
		}
		.biqat-expert-course-text { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
		.biqat-expert-course-text strong { color: var(--ink-gray-9, #111827); }
		.biqat-expert-course-intro {
			font-size: 0.8125rem; color: var(--ink-gray-6, #4b5563); margin: 0;
			display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
		}
		.biqat-expert-course-text .biqat-grading-badge { align-self: flex-start; }

		.biqat-grading-filters {
			display: flex; flex-wrap: wrap; align-items: end; gap: 0.625rem;
			padding-bottom: 0.875rem; margin-bottom: 0.5rem;
			border-bottom: 1px solid var(--outline-gray-1, #e5e7eb);
		}
		.biqat-grading-filter { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; color: var(--ink-gray-5, #6b7280); }
		.biqat-grading-filter select, .biqat-grading-search {
			border: 1px solid var(--outline-gray-2, #d1d5db); border-radius: 0.375rem;
			padding: 0.375rem 0.5rem; font: inherit; font-size: 0.875rem;
			background: var(--surface-white, #fff); color: var(--ink-gray-8, #1f2937);
		}
		.biqat-grading-search { flex: 1; min-width: 12rem; }
		.biqat-grading-count { font-size: 0.75rem; color: var(--ink-gray-5, #6b7280); margin-bottom: 0.5rem; }
		.biqat-grading-more { display: block; width: 100%; margin-top: 0.25rem; }
		.biqat-grading-row[data-saved="true"] { border-color: var(--outline-green-2, #86efac); }
		.biqat-grading-title-row { display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; min-width: 0; }
		.biqat-grading-badge {
			font-size: 0.6875rem; padding: 0.0625rem 0.375rem; border-radius: 0.25rem;
			background: var(--surface-gray-2, #f3f4f6); color: var(--ink-gray-6, #4b5563);
			white-space: nowrap;
		}
		.biqat-grading-heading { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; flex: 1; }
		.biqat-grading-title {
			color: var(--ink-gray-9, #111827); overflow: hidden;
			text-overflow: ellipsis; white-space: nowrap;
		}
		.biqat-grading-meta { font-size: 0.75rem; color: var(--ink-gray-5, #6b7280); }
		.biqat-grading-detail {
			padding: 0 0.875rem 0.875rem;
			border-top: 1px solid var(--outline-gray-1, #e5e7eb);
		}
		.biqat-grading-attachment { display: inline-block; margin-bottom: 0.75rem; font-size: 0.875rem; text-decoration: underline; }
		.biqat-grading-prompt {
			font-size: 0.8125rem; color: var(--ink-gray-6, #4b5563);
			margin: 0.75rem 0 0.5rem; max-height: 9rem; overflow-y: auto;
		}
		.biqat-grading-answer {
			background: var(--surface-gray-1, #f9fafb); border-radius: 0.375rem;
			padding: 0.625rem; font-size: 0.875rem; margin-bottom: 0.75rem;
			max-height: 12rem; overflow-y: auto;
		}
		.biqat-grading-controls { display: flex; flex-direction: column; gap: 0.5rem; }
		.biqat-grading-controls textarea, .biqat-grading-attribution select, .biqat-grading-actions select,
		.biqat-grading-actions input {
			border: 1px solid var(--outline-gray-2, #d1d5db); border-radius: 0.375rem;
			padding: 0.375rem 0.5rem; font: inherit; font-size: 0.875rem;
			background: var(--surface-white, #fff); color: var(--ink-gray-8, #1f2937);
		}
		.biqat-grading-actions { display: flex; align-items: center; gap: 0.5rem; }
		.biqat-grading-actions input[type="number"] { width: 5rem; }
		.biqat-grading-actions button { margin-inline-start: auto; }
		.biqat-grading-attribution { display: flex; flex-direction: column; gap: 0.25rem; }
		.biqat-grading-toggle {
			display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem;
			padding: 0.5rem 0.625rem; border-radius: 0.375rem;
			background: var(--surface-gray-1, #f9fafb);
		}

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

async function apiCall(method, args = {}, base = API_BASE) {
	const headers = {
		Accept: "application/json",
		"Content-Type": "application/json; charset=utf-8",
		"X-Frappe-Site-Name": window.location.hostname,
	};
	if (window.csrf_token && window.csrf_token !== "{{ csrf_token }}") {
		headers["X-Frappe-CSRF-Token"] = window.csrf_token;
	}
	const response = await originalFetch(`${base}.${method}`, {
		method: "POST",
		headers,
		body: JSON.stringify(args),
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok || payload.exc) {
		throw new Error(extractErrorMessage(payload) || `Request failed (${response.status})`);
	}
	return payload.message;
}

function extractErrorMessage(payload) {
	if (payload._error_message) return payload._error_message;
	if (payload._server_messages) {
		try {
			const serverMessages = JSON.parse(payload._server_messages).map((entry) =>
				JSON.parse(entry)
			);
			const text = serverMessages
				.map((entry) => entry.message)
				.filter(Boolean)
				.join(" ");
			if (text) return text;
		} catch {
			// fall through to other fields
		}
	}
	if (typeof payload.message === "string") return payload.message;
	return null;
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
	ensureGradingSidebarButton(sidebar);
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

function closeLiveClassManager() {
	document.getElementById(LIVE_CLASS_MANAGER_ID)?.remove();
}

function createLiveClassManagerShell() {
	closeLiveClassManager();
	const backdrop = document.createElement("div");
	backdrop.id = LIVE_CLASS_MANAGER_ID;
	backdrop.className = "biqat-modal-backdrop";
	backdrop.innerHTML = `
		<section class="biqat-modal" role="dialog" aria-modal="true" aria-labelledby="biqat-live-class-title">
			<header class="biqat-modal-header">
				<div><h2 id="biqat-live-class-title" class="text-xl font-semibold">Manage live classes</h2><p class="biqat-muted">Times are shown in the timezone saved on each class.</p></div>
				<button type="button" class="biqat-button" data-action="close" aria-label="Close">×</button>
			</header>
			<div class="biqat-modal-body">Loading live classes…</div>
		</section>`;
	backdrop
		.querySelector('[data-action="close"]')
		.addEventListener("click", closeLiveClassManager);
	backdrop.addEventListener("click", (event) => {
		if (event.target === backdrop) closeLiveClassManager();
	});
	document.body.appendChild(backdrop);
	return backdrop;
}

function formatClockTime(value, duration = 0) {
	const [rawHours = "0", rawMinutes = "0"] = String(value || "").split(":");
	const totalMinutes = Number(rawHours) * 60 + Number(rawMinutes) + Number(duration || 0);
	const hours = Math.floor((totalMinutes % 1440) / 60);
	const minutes = totalMinutes % 60;
	const suffix = hours >= 12 ? "PM" : "AM";
	return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function formatLiveClassDate(value) {
	if (!value) return "Date not set";
	const date = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(undefined, {
		day: "2-digit",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	}).format(date);
}

async function renderLiveClassManager(shell) {
	const body = shell.querySelector(".biqat-modal-body");
	const batch = currentBatchName();
	if (!batch) {
		body.textContent = "Batch not found.";
		return;
	}

	try {
		const classes = (await apiCall("list_batch_live_classes", { batch })) || [];
		body.replaceChildren();
		if (!classes.length) {
			body.append(createTextElement("p", "No live classes scheduled.", "biqat-muted"));
			return;
		}

		for (const liveClass of classes) {
			const row = document.createElement("div");
			row.className = "biqat-live-class-row";
			const details = document.createElement("div");
			details.className = "biqat-live-class-details";
			details.append(
				createTextElement("strong", liveClass.title || "Live class"),
				createTextElement(
					"span",
					`${formatLiveClassDate(liveClass.date)} · ${formatClockTime(
						liveClass.time
					)}–${formatClockTime(liveClass.time, liveClass.duration)} · ${
						liveClass.timezone || "Timezone not set"
					}`,
					"biqat-muted"
				)
			);
			const remove = createTextElement(
				"button",
				"Delete",
				"biqat-button biqat-button-danger"
			);
			remove.type = "button";
			remove.addEventListener("click", async () => {
				if (!window.confirm(`Delete “${liveClass.title}” and its linked calendar event?`))
					return;
				remove.disabled = true;
				remove.textContent = "Deleting…";
				try {
					await apiCall("delete_live_class", { live_class: liveClass.name });
					window.location.reload();
				} catch (error) {
					alert(error.message);
					remove.disabled = false;
					remove.textContent = "Delete";
				}
			});
			row.append(details, remove);
			body.append(row);
		}
	} catch (error) {
		body.textContent = error.message;
	}
}

function openLiveClassManager() {
	const shell = createLiveClassManagerShell();
	renderLiveClassManager(shell);
}

function isAdministratorSession() {
	const cookies = new URLSearchParams(document.cookie.split("; ").join("&"));
	return cookies.get("user_id") === "Administrator";
}

function ensureLiveClassManagerButton() {
	if (!currentBatchName() || !isAdministratorSession()) return;
	const existing = document.getElementById(LIVE_CLASS_MANAGER_BUTTON_ID);
	if (existing) return;

	for (const heading of document.querySelectorAll("div")) {
		if (heading.textContent.trim() !== "Live Class" || heading.children.length) continue;
		const header = heading.parentElement;
		const addButton = Array.from(header?.children || []).find(
			(element) => element.tagName === "BUTTON" && element.textContent.trim() === "Add"
		);
		if (!header || !addButton) continue;

		const manage = createTextElement("button", "Manage", "biqat-button");
		manage.id = LIVE_CLASS_MANAGER_BUTTON_ID;
		manage.type = "button";
		manage.style.marginLeft = "auto";
		manage.addEventListener("click", openLiveClassManager);
		header.style.gap = "0.5rem";
		header.insertBefore(manage, addButton);
		return;
	}
}

function gradingCall(method, args = {}) {
	return apiCall(method, args, GRADING_API_BASE);
}

async function resolveGradingContext() {
	if (gradingContext !== undefined) return gradingContext;
	try {
		gradingContext = await gradingCall("get_grading_context");
	} catch {
		// A learner or signed-out visitor simply has no grading queue.
		gradingContext = null;
	}
	return gradingContext;
}

function closeGradingPanel() {
	document.getElementById(GRADING_PANEL_ID)?.remove();
}

function createGradingPanelShell() {
	closeGradingPanel();
	const backdrop = document.createElement("div");
	backdrop.id = GRADING_PANEL_ID;
	backdrop.className = "biqat-modal-backdrop";
	backdrop.innerHTML = `
		<section class="biqat-modal" role="dialog" aria-modal="true">
			<header class="biqat-modal-header">
				<div><h2 class="text-xl font-semibold">Grading</h2><p class="biqat-muted">Assignments and open-ended quiz answers waiting for review.</p></div>
				<button type="button" class="biqat-button" data-action="close" aria-label="Close">×</button>
			</header>
			<div class="biqat-modal-body"></div>
		</section>`;
	backdrop.querySelector('[data-action="close"]').addEventListener("click", closeGradingPanel);
	backdrop.addEventListener("click", (event) => {
		if (event.target === backdrop) closeGradingPanel();
	});
	document.body.appendChild(backdrop);
	return backdrop;
}

const GRADING_PAGE_LENGTH = 20;
let gradingQuery = {};

async function openGradingPanel() {
	const shell = createGradingPanelShell();
	const body = shell.querySelector(".biqat-modal-body");
	body.textContent = "Loading submissions…";
	gradingQuery = { status: "pending", course: "", instructor: "", kind: "", search: "", start: 0 };
	try {
		const context = (await resolveGradingContext()) || {};
		const options = await gradingCall("get_grading_filters");
		body.replaceChildren();
		if (context.kind === "instructor") body.append(createNotificationToggle(context));
		body.append(buildGradingFilterBar(context, options));

		const list = document.createElement("div");
		list.className = "biqat-grading-list";
		body.append(list);
		await refreshGradingList(shell, context);
	} catch (error) {
		body.textContent = error.message;
	}
}

function createFilterSelect(label, values, onChange) {
	const wrapper = document.createElement("label");
	wrapper.className = "biqat-grading-filter";
	wrapper.append(createTextElement("span", label));
	const select = document.createElement("select");
	for (const { value, text } of values) {
		const option = document.createElement("option");
		option.value = value;
		option.textContent = text;
		select.append(option);
	}
	select.addEventListener("change", () => onChange(select.value));
	wrapper.append(select);
	return wrapper;
}

function buildGradingFilterBar(context, options) {
	const bar = document.createElement("div");
	bar.className = "biqat-grading-filters";
	const rerun = () => {
		gradingQuery.start = 0;
		const shell = document.getElementById(GRADING_PANEL_ID);
		if (shell) refreshGradingList(shell, context);
	};

	const search = document.createElement("input");
	search.type = "search";
	search.placeholder = "Search learner or title";
	search.className = "biqat-grading-search";
	let searchTimer;
	search.addEventListener("input", () => {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			gradingQuery.search = search.value.trim();
			rerun();
		}, 300);
	});
	bar.append(search);

	bar.append(
		createFilterSelect(
			"Status",
			[
				{ value: "pending", text: "Pending" },
				{ value: "graded", text: "Graded" },
				{ value: "all", text: "All" },
			],
			(value) => {
				gradingQuery.status = value;
				rerun();
			}
		)
	);

	bar.append(
		createFilterSelect(
			"Type",
			[
				{ value: "", text: "All types" },
				{ value: "assignment", text: "Assignments" },
				{ value: "quiz", text: "Quiz answers" },
			],
			(value) => {
				gradingQuery.kind = value;
				rerun();
			}
		)
	);

	if (options.courses?.length) {
		bar.append(
			createFilterSelect(
				"Course",
				[{ value: "", text: "All courses" }].concat(
					options.courses.map((course) => ({ value: course.name, text: course.title }))
				),
				(value) => {
					gradingQuery.course = value;
					rerun();
				}
			)
		);
	}

	if (options.instructors?.length) {
		bar.append(
			createFilterSelect(
				"Instructor",
				[{ value: "", text: "All instructors" }].concat(
					options.instructors.map((row) => ({ value: row.name, text: row.full_name }))
				),
				(value) => {
					gradingQuery.instructor = value;
					rerun();
				}
			)
		);
	}

	return bar;
}

async function refreshGradingList(shell, context, append = false) {
	const list = shell.querySelector(".biqat-grading-list");
	if (!list) return;
	if (!append) {
		list.replaceChildren(createTextElement("p", "Loading…", "biqat-muted"));
	}

	let page;
	try {
		page = await gradingCall("list_gradings", {
			...gradingQuery,
			page_length: GRADING_PAGE_LENGTH,
		});
	} catch (error) {
		list.replaceChildren(createTextElement("p", error.message, "biqat-muted"));
		return;
	}

	if (!append) list.replaceChildren();
	list.querySelector(".biqat-grading-more")?.remove();
	list.querySelector(".biqat-grading-count")?.remove();

	if (!page.total) {
		list.append(createTextElement("p", "Nothing matches these filters.", "biqat-muted"));
		return;
	}

	const shown = Math.min(gradingQuery.start + page.rows.length, page.total);
	list.append(
		createTextElement("p", `Showing ${shown} of ${page.total}`, "biqat-grading-count")
	);

	for (const row of page.rows) {
		list.append(row.kind === "quiz" ? renderQuizAnswerRow(row, context) : renderAssignmentRow(row, context));
	}

	if (page.has_more) {
		const more = createTextElement("button", "Load more", "biqat-button biqat-grading-more");
		more.type = "button";
		more.addEventListener("click", () => {
			gradingQuery.start += GRADING_PAGE_LENGTH;
			more.remove();
			refreshGradingList(shell, context, true);
		});
		list.append(more);
	}
}

function createAttributionSelect(context, selected) {
	// Staff record a grade on behalf of the expert who actually made the call;
	// an instructor always credits themselves, so the control is theirs only.
	if (!context.can_attribute) return null;
	const wrapper = document.createElement("label");
	wrapper.className = "biqat-grading-attribution";
	wrapper.append(createTextElement("span", "On behalf of", "text-xs text-ink-gray-5"));
	const select = document.createElement("select");
	const auto = document.createElement("option");
	auto.value = "";
	auto.textContent = "Course instructor (default)";
	select.append(auto);
	for (const instructor of context.instructors || []) {
		const option = document.createElement("option");
		option.value = instructor.name;
		option.textContent = instructor.full_name;
		select.append(option);
	}
	if (selected) select.value = selected;
	wrapper.append(select);
	wrapper.selectElement = select;
	return wrapper;
}

function createNotificationToggle(context) {
	const wrapper = document.createElement("label");
	wrapper.className = "biqat-grading-toggle";
	const checkbox = document.createElement("input");
	checkbox.type = "checkbox";
	checkbox.checked = Boolean(context.notify_on_submission);
	checkbox.addEventListener("change", async () => {
		checkbox.disabled = true;
		try {
			await gradingCall("set_my_notification_preference", { enabled: checkbox.checked ? 1 : 0 });
			context.notify_on_submission = checkbox.checked ? 1 : 0;
		} catch (error) {
			checkbox.checked = !checkbox.checked;
			alert(error.message);
		} finally {
			checkbox.disabled = false;
		}
	});
	wrapper.append(checkbox, createTextElement("span", "Email me when a learner submits work"));
	return wrapper;
}

function formatSubmittedOn(value) {
	if (!value) return "";
	const date = new Date(String(value).replace(" ", "T"));
	return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

/**
 * A queue of a hundred submissions is unreadable if every prompt and answer is
 * expanded, so each row collapses to title/learner/course/date and builds its
 * detail only when opened.
 */
function createGradingRow({ title, learner, course, submitted, badges, buildDetail }) {
	const row = document.createElement("article");
	row.className = "biqat-grading-row";

	const summary = document.createElement("button");
	summary.type = "button";
	summary.className = "biqat-grading-summary";
	summary.setAttribute("aria-expanded", "false");

	const heading = document.createElement("div");
	heading.className = "biqat-grading-heading";
	const titleRow = document.createElement("div");
	titleRow.className = "biqat-grading-title-row";
	titleRow.append(createTextElement("strong", title || "Untitled", "biqat-grading-title"));
	for (const badge of badges || []) {
		if (badge) titleRow.append(createTextElement("span", badge, "biqat-grading-badge"));
	}
	heading.append(
		titleRow,
		createTextElement(
			"span",
			[learner, course, formatSubmittedOn(submitted)].filter(Boolean).join(" · "),
			"biqat-grading-meta"
		)
	);
	const chevron = document.createElement("span");
	chevron.className = "lucide-chevron-down size-4 shrink-0 text-ink-gray-5";
	summary.append(heading, chevron);

	const detail = document.createElement("div");
	detail.className = "biqat-grading-detail";
	detail.hidden = true;

	summary.addEventListener("click", () => {
		const open = detail.hidden;
		if (open && !detail.dataset.built) {
			detail.append(buildDetail());
			detail.dataset.built = "true";
		}
		detail.hidden = !open;
		summary.setAttribute("aria-expanded", open ? "true" : "false");
		row.dataset.open = open ? "true" : "false";
	});

	row.append(summary, detail);
	return row;
}

function createSubmissionDetail(prompt, answer, controls) {
	const fragment = document.createDocumentFragment();
	if (prompt) {
		const promptBlock = document.createElement("div");
		promptBlock.className = "biqat-grading-prompt";
		promptBlock.innerHTML = prompt;
		fragment.append(promptBlock);
	}
	const answerBlock = document.createElement("div");
	answerBlock.className = "biqat-grading-answer";
	answerBlock.innerHTML = answer || "<em>No answer submitted.</em>";
	fragment.append(answerBlock, controls);
	return fragment;
}

function gradedBadges(row) {
	const badges = [row.kind === "quiz" ? "Quiz" : "Assignment"];
	if (row.status && row.status !== "Not Graded") badges.push(row.status);
	if (row.attributed_instructor_name) badges.push(row.attributed_instructor_name);
	return badges;
}

function renderAssignmentRow(submission, context) {
	const row = createGradingRow({
		title: submission.title,
		learner: submission.learner,
		course: submission.course_title,
		submitted: submission.submitted,
		badges: gradedBadges(submission),
		buildDetail: () => {
			const controls = document.createElement("div");
			controls.className = "biqat-grading-controls";

			const comments = document.createElement("textarea");
			comments.rows = 2;
			comments.placeholder = "Feedback for the learner (optional)";
			comments.value = stripHtml(submission.feedback);

			const attribution = createAttributionSelect(context, submission.attributed_instructor);
			const actions = document.createElement("div");
			actions.className = "biqat-grading-actions";
			const status = document.createElement("select");
			for (const value of ["Pass", "Fail", "Not Applicable"]) {
				const option = document.createElement("option");
				option.value = value;
				option.textContent = value;
				status.append(option);
			}
			if (submission.status && submission.status !== "Not Graded") status.value = submission.status;

			const save = createTextElement("button", "Save grade", "biqat-button biqat-button-solid");
			save.type = "button";
			save.addEventListener("click", async () => {
				save.disabled = true;
				save.textContent = "Saving…";
				try {
					await gradingCall("grade_assignment_submission", {
						submission: submission.id,
						status: status.value,
						comments: comments.value,
						attributed_to: attribution?.selectElement.value || null,
					});
					markGradingRowSaved(row);
				} catch (error) {
					alert(error.message);
					save.disabled = false;
					save.textContent = "Save grade";
				}
			});

			actions.append(status, save);
			controls.append(comments);
			if (attribution) controls.append(attribution);
			controls.append(actions);

			const detail = createSubmissionDetail(submission.prompt, submission.answer, controls);
			if (submission.attachment) {
				const link = createTextElement("a", "Open submitted file", "biqat-grading-attachment");
				link.href = submission.attachment;
				link.target = "_blank";
				link.rel = "noopener";
				detail.insertBefore(link, detail.lastChild);
			}
			return detail;
		},
	});
	return row;
}

function renderQuizAnswerRow(answer, context) {
	const row = createGradingRow({
		title: answer.title,
		learner: answer.learner,
		course: answer.course_title,
		submitted: answer.submitted,
		badges: gradedBadges(answer),
		buildDetail: () => {
			const controls = document.createElement("div");
			controls.className = "biqat-grading-controls";

			const feedback = document.createElement("textarea");
			feedback.rows = 2;
			feedback.placeholder = "Feedback for the learner (optional)";
			feedback.value = stripHtml(answer.feedback);

			const attribution = createAttributionSelect(context, answer.attributed_instructor);
			const actions = document.createElement("div");
			actions.className = "biqat-grading-actions";
			const marks = document.createElement("input");
			marks.type = "number";
			marks.min = "0";
			marks.max = String(answer.marks_out_of || 0);
			marks.value = String(answer.marks || 0);
			marks.setAttribute("aria-label", "Marks");
			const outOf = createTextElement(
				"span",
				`/ ${answer.marks_out_of || 0}`,
				"text-xs text-ink-gray-5"
			);
			const save = createTextElement("button", "Save marks", "biqat-button biqat-button-solid");
			save.type = "button";
			save.addEventListener("click", async () => {
				save.disabled = true;
				save.textContent = "Saving…";
				try {
					await gradingCall("grade_quiz_answer", {
						quiz_result: answer.id,
						marks: marks.value,
						feedback: feedback.value,
						attributed_to: attribution?.selectElement.value || null,
					});
					markGradingRowSaved(row);
				} catch (error) {
					alert(error.message);
					save.disabled = false;
					save.textContent = "Save marks";
				}
			});

			actions.append(marks, outOf, save);
			controls.append(feedback);
			if (attribution) controls.append(attribution);
			controls.append(actions);

			return createSubmissionDetail(answer.question || answer.prompt, answer.answer, controls);
		},
	});
	return row;
}

function stripHtml(value) {
	if (!value) return "";
	const holder = document.createElement("div");
	holder.innerHTML = value;
	return holder.textContent.trim();
}

/**
 * Keep the row in place after saving rather than removing it: the grader can
 * see the result landed, and a mistaken grade stays visible to correct.
 */
function markGradingRowSaved(row) {
	row.dataset.saved = "true";
	const meta = row.querySelector(".biqat-grading-meta");
	if (meta) meta.textContent = `Saved · ${meta.textContent}`;
	const detail = row.querySelector(".biqat-grading-detail");
	if (detail) detail.hidden = true;
	row.dataset.open = "false";
	row.querySelector(".biqat-grading-summary")?.setAttribute("aria-expanded", "false");
}

function currentExpertUsername() {
	const match = window.location.pathname.match(/\/user\/(expert-[^/?#]+)/);
	return match ? decodeURIComponent(match[1]) : null;
}

function findProfileTabGroup() {
	for (const button of document.querySelectorAll("button")) {
		if (button.textContent.trim() === "About" && button.parentElement) {
			return button.parentElement;
		}
	}
	return null;
}

/**
 * A managed instructor has no User account, so "Certificates" (none earned) and
 * "Roles" (a toggle list implying platform access they deliberately lack) say
 * nothing true about them. Hide both and show the courses they teach instead.
 */
function hideIrrelevantExpertTabs() {
	const group = findProfileTabGroup();
	if (!group) return;
	for (const button of group.querySelectorAll("button")) {
		const label = button.textContent.trim();
		if (label === "Certificates" || label === "Roles") button.hidden = true;
	}
}

function renderExpertCourses(courses) {
	const section = document.createElement("section");
	section.id = EXPERT_COURSES_SECTION_ID;
	section.className = "biqat-expert-courses";
	section.append(createTextElement("h2", "Courses", "biqat-expert-courses-title"));

	if (!courses.length) {
		section.append(
			createTextElement("p", "No published courses yet.", "biqat-muted")
		);
		return section;
	}

	const list = document.createElement("div");
	list.className = "biqat-expert-course-list";
	for (const course of courses) {
		const card = document.createElement("a");
		card.className = "biqat-expert-course";
		card.href = `${getLmsBasePath()}/courses/${encodeURIComponent(course.name)}`;

		if (course.image) {
			const image = document.createElement("img");
			image.src = course.image;
			image.alt = "";
			image.loading = "lazy";
			card.append(image);
		}

		const text = document.createElement("div");
		text.className = "biqat-expert-course-text";
		text.append(createTextElement("strong", course.title || course.name));
		if (course.role) text.append(createTextElement("span", course.role, "biqat-grading-badge"));
		if (course.short_introduction) {
			text.append(
				createTextElement("p", course.short_introduction, "biqat-expert-course-intro")
			);
		}
		card.append(text);
		list.append(card);
	}
	section.append(list);
	return section;
}

function getLmsBasePath() {
	const match = window.location.pathname.match(/^(.*?)\/user\//);
	return match ? match[1] : "/lms";
}

async function ensureExpertProfileSections() {
	const username = currentExpertUsername();
	if (!username) {
		document.getElementById(EXPERT_COURSES_SECTION_ID)?.remove();
		return;
	}

	hideIrrelevantExpertTabs();
	if (document.getElementById(EXPERT_COURSES_SECTION_ID)) return;

	const group = findProfileTabGroup();
	const host = group?.parentElement;
	if (!host) return;

	// Claim the slot before awaiting so repeated DOM updates cannot insert twice.
	const placeholder = document.createElement("section");
	placeholder.id = EXPERT_COURSES_SECTION_ID;
	host.append(placeholder);

	let courses = [];
	try {
		courses = (await apiCall("get_expert_courses", { username })) || [];
	} catch {
		placeholder.remove();
		return;
	}

	if (!document.body.contains(placeholder)) return;
	placeholder.replaceWith(renderExpertCourses(courses));
}

// Ordered by how naturally "Grading" sits after each entry.
const GRADING_ANCHOR_LABELS = [
	"Assignments",
	"Quizzes",
	"Jobs",
	"Certifications",
	"Batches",
	"Courses",
	"Home",
];

function sidebarNavItemLabel(item) {
	for (const span of item.querySelectorAll("span")) {
		if (span.children.length) continue;
		if (span.textContent.trim()) return span;
	}
	return null;
}

/**
 * Locate a nav entry by its visible label rather than by icon markup: the
 * sidebar renders icons as Lucide components, so their markup is not
 * guaranteed to carry a matching class.
 */
function findSidebarNavEntry(sidebar) {
	for (const wanted of GRADING_ANCHOR_LABELS) {
		const accepted = new Set([wanted, SIDEBAR_TRANSLATIONS[wanted]].filter(Boolean));
		for (const span of sidebar.querySelectorAll("span")) {
			if (span.children.length) continue;
			const text = (
				span.getAttribute(SIDEBAR_SOURCE_LABEL_ATTRIBUTE) || span.textContent
			).trim();
			if (!accepted.has(text)) continue;

			const entry = span.closest("a, button");
			if (!entry || entry.id === GRADING_BUTTON_ID) continue;
			if (entry.closest(`#${SIDEBAR_LANGUAGE_SELECTOR_ID}`)) continue;
			return entry;
		}
	}
	return null;
}

function setElementClass(element, value) {
	// SVG elements expose `className` as a read-only SVGAnimatedString.
	element.setAttribute("class", value);
}

function buildGradingEntry(anchor) {
	if (!anchor) {
		const fallback = createTextElement("button", "Grading", "biqat-sidebar-grading");
		fallback.type = "button";
		return fallback;
	}

	const entry = anchor.cloneNode(true);
	entry.removeAttribute("href");
	entry.removeAttribute("to");
	entry.classList.remove("router-link-active", "router-link-exact-active");
	entry.removeAttribute("aria-current");

	const icon = entry.querySelector('[class*="lucide-"]');
	const iconClass = icon?.getAttribute("class");
	if (iconClass) {
		setElementClass(icon, iconClass.replace(/lucide-[\w-]+/g, "lucide-square-check-big"));
	}

	const label = sidebarNavItemLabel(entry);
	if (label) {
		label.removeAttribute(SIDEBAR_SOURCE_LABEL_ATTRIBUTE);
		label.textContent = sidebarLanguage === "am" ? SIDEBAR_TRANSLATIONS.Grading : "Grading";
	}
	// A cloned keyboard-shortcut hint would be wrong on this entry.
	for (const kbd of entry.querySelectorAll("kbd")) kbd.remove();
	return entry;
}

async function ensureGradingSidebarButton(sidebar) {
	if (document.getElementById(GRADING_BUTTON_ID)) return;
	const context = await resolveGradingContext();
	if (!context) return;
	if (document.getElementById(GRADING_BUTTON_ID)) return;

	// Clone a real nav entry so it inherits the upstream sidebar's spacing,
	// hover, active and theme styling. If the sidebar markup ever changes shape
	// the entry still renders, just with local styling, rather than vanishing.
	const anchor = findSidebarNavEntry(sidebar);
	const entry = buildGradingEntry(anchor);
	entry.id = GRADING_BUTTON_ID;
	entry.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		openGradingPanel();
	});

	if (anchor) {
		anchor.insertAdjacentElement("afterend", entry);
		return;
	}

	const selector = document.getElementById(SIDEBAR_LANGUAGE_SELECTOR_ID);
	if (selector) selector.insertAdjacentElement("afterend", entry);
	else sidebar.querySelector(":scope > .flex.flex-col.overflow-y-auto")?.append(entry);
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
		ensureLiveClassManagerButton();
		ensureExpertProfileSections();
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
	ensureLiveClassManagerButton();
	ensureExpertProfileSections();
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
