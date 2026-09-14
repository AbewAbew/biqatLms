(() => {
	"use strict";

	const FIELD = "biqat_language";
	const API = "/api/method/biqat_lms.course_languages.";
	const FILTER_ID = "biqat-course-languages";
	const languages = [
		["", "All languages"],
		["am", "አማርኛ"],
		["en", "English"],
	];
	const originalFetch = window.fetch.bind(window);
	let lastFilters = {};
	let managementAllowed;
	let managementRequest;
	let activeDialog;

	const coursePath = () => `/${window.lms_path || "lms"}/courses`;
	const onCourseList = () => location.pathname.replace(/\/$/, "") === coursePath();
	const chosenLanguage = () => new URLSearchParams(location.search).get("course_language") || "";

	// Filter on the server before pagination, including featured courses. The
	// upstream Vue application retains ownership of course cards and resources.
	window.fetch = (resource, options) => {
		const url = new URL(
			typeof resource === "string" ? resource : resource.url,
			location.origin,
		);
		if (
			onCourseList() &&
			[
				"/api/method/lms.lms.utils.get_courses",
				"/api/method/biqat_lms.api.get_courses",
			].includes(url.pathname) &&
			typeof options?.body === "string"
		) {
			try {
				const body = JSON.parse(options.body);
				lastFilters =
					typeof body.filters === "string"
						? JSON.parse(body.filters)
						: body.filters || {};
				body.course_language = chosenLanguage();
				options = { ...options, body: JSON.stringify(body) };
				updateFilterLinks();
			} catch (_) {
				// Leave an unfamiliar request format intact.
			}
		}
		return originalFetch(resource, options);
	};

	function filterUrl(language) {
		const url = new URL(location.href);
		if (language) url.searchParams.set("course_language", language);
		else url.searchParams.delete("course_language");
		// Native tab switches do not currently persist their tab in the URL.
		const tab = lastFilters.enrolled
			? "enrolled"
			: lastFilters.created
				? "created"
				: lastFilters.live
					? "live"
					: lastFilters.upcoming
						? "upcoming"
						: lastFilters.published === 0
							? "unpublished"
							: null;
		if (tab) url.searchParams.set("tab", tab);
		return url.pathname + url.search;
	}

	function updateFilterLinks() {
		for (const link of document.querySelectorAll(`#${FILTER_ID} a[data-language]`)) {
			link.href = filterUrl(link.dataset.language);
		}
	}

	function element(tag, text, className) {
		const node = document.createElement(tag);
		if (text) node.textContent = text;
		if (className) node.className = className;
		return node;
	}

	async function call(method, args = {}) {
		const headers = { "Content-Type": "application/json", Accept: "application/json" };
		if (window.csrf_token) headers["X-Frappe-CSRF-Token"] = window.csrf_token;
		const response = await originalFetch(API + method, {
			method: "POST",
			headers,
			body: JSON.stringify(args),
		});
		const payload = await response.json();
		if (!response.ok || payload.exc)
			throw new Error("Unable to save or load course languages. Please try again.");
		return payload.message;
	}

	function installStyles() {
		if (document.getElementById("biqat-language-styles")) return;
		const style = element("style");
		style.id = "biqat-language-styles";
		style.textContent = `
			#${FILTER_ID} { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin:0 0 20px; }
			#${FILTER_ID} .language-options { display:flex; flex-wrap:wrap; gap:4px; padding:4px; border:1px solid var(--outline-gray-2,#ddd); border-radius:10px; }
			#${FILTER_ID} a, .biqat-language-manage { padding:7px 12px; border-radius:7px; font-size:13px; color:var(--ink-gray-7,#444); text-decoration:none; }
			#${FILTER_ID} a:hover { background:var(--surface-gray-2,#f3f4f6); }
			#${FILTER_ID} a[aria-current="true"] { color:var(--surface-white,#fff); background:var(--ink-gray-9,#171717); }
			.biqat-language-manage { margin-left:auto; border:1px solid var(--outline-gray-2,#ddd); }
			#${FILTER_ID} a:focus-visible, .biqat-language-manage:focus-visible { outline:2px solid #b3832b; outline-offset:3px; }
			.biqat-language-dialog { width:min(760px,calc(100vw - 32px)); max-height:85dvh; margin:auto; padding:24px; border:1px solid var(--outline-gray-2,#ddd); border-radius:14px; background:var(--surface-base,#fff); color:var(--ink-gray-9,#171717); }
			.biqat-language-dialog::backdrop { background:rgb(0 0 0 / .5); }
			.biqat-language-dialog header { display:flex; justify-content:space-between; gap:20px; align-items:center; }
			.biqat-language-dialog h2 { font-size:20px; font-weight:600; }
			.biqat-language-dialog p { margin:12px 0; font-size:13px; color:var(--ink-gray-6,#555); }
			.biqat-language-dialog button, .biqat-language-dialog select, .biqat-language-dialog input { border:1px solid var(--outline-gray-2,#ddd); border-radius:7px; background:var(--surface-base,#fff); color:inherit; padding:8px 12px; font-size:14px; }
			.biqat-language-dialog button:disabled { opacity:.45; }
			.biqat-language-dialog input { width:100%; margin:8px 0 16px; }
			.biqat-language-row { display:grid; grid-template-columns:minmax(0,1fr) 160px; align-items:center; gap:12px; border-bottom:1px solid var(--outline-gray-2,#eee); padding:14px 0; }
			.biqat-language-row label { overflow-wrap:anywhere; font-size:14px; }
			.biqat-language-row small { display:block; margin-top:4px; color:var(--ink-gray-6,#555); }
			.biqat-language-dialog footer { display:flex; gap:12px; margin-top:20px; }
			@media(max-width:480px) { .biqat-language-row { grid-template-columns:1fr; } .biqat-language-manage { margin-left:0; } }
		`;
		document.head.append(style);
	}

	function ensureFilter() {
		if (!onCourseList()) {
			document.getElementById(FILTER_ID)?.remove();
			if (activeDialog) activeDialog.close();
			lastFilters = {};
			return;
		}
		let filter = document.getElementById(FILTER_ID);
		if (!filter) {
			const heading = [...document.querySelectorAll(".text-lg-semibold")].find(
				(node) => node.textContent.trim() === "All Courses",
			);
			if (!heading) return;
			installStyles();
			filter = element("nav");
			filter.id = FILTER_ID;
			filter.setAttribute("aria-label", "Course language");
			const options = element("div", "", "language-options");
			for (const [value, label] of languages) {
				const link = element("a", label);
				link.dataset.language = value;
				link.href = filterUrl(value);
				if (value === "am") link.lang = "am";
				if (chosenLanguage() === value) link.setAttribute("aria-current", "true");
				// Full navigation resets Vue's pagination and memory cache. Preserve
				// the latest search/category parameters, including recently typed text.
				link.addEventListener("click", () => {
					link.href = filterUrl(value);
				});
				options.append(link);
			}
			filter.append(options);
			heading.parentElement.insertAdjacentElement("afterend", filter);
		}
		if (managementAllowed && !filter.querySelector("button")) {
			const manage = element("button", "Manage course languages", "biqat-language-manage");
			manage.type = "button";
			manage.addEventListener("click", openManager);
			filter.append(manage);
		} else if (managementAllowed === undefined && !managementRequest) {
			const user = document.cookie
				.split("; ")
				.find((part) => part.startsWith("user_id="))
				?.slice(8);
			if (!user || user === "Guest") return;
			managementRequest = call("can_manage_course_languages")
				.then((allowed) => {
					managementAllowed = allowed;
					ensureFilter();
				})
				.catch(() => {
					managementAllowed = false;
				});
		}
	}

	function openManager() {
		if (activeDialog) return;
		const dialog = element("dialog", "", "biqat-language-dialog");
		activeDialog = dialog;
		dialog.setAttribute("aria-labelledby", "biqat-language-title");
		const header = element("header");
		const title = element("h2", "Course languages");
		title.id = "biqat-language-title";
		const close = element("button", "Close");
		close.type = "button";
		close.addEventListener("click", () => dialog.close());
		header.append(title, close);
		const searchLabel = element("label", "Find a course");
		searchLabel.htmlFor = "biqat-language-search";
		const search = element("input");
		search.id = searchLabel.htmlFor;
		search.type = "search";
		search.placeholder = "Search by course title";
		const status = element("p", "Loading courses…");
		status.setAttribute("role", "status");
		const rows = element("div");
		const footer = element("footer");
		const previous = element("button", "Previous");
		const next = element("button", "Next");
		previous.type = next.type = "button";
		footer.append(previous, next);
		dialog.append(
			header,
			element(
				"p",
				"Select the language of each course's content. Changes save automatically. Unclassified courses appear under All languages.",
			),
			searchLabel,
			search,
			status,
			rows,
			footer,
		);
		document.body.append(dialog);
		dialog.showModal();
		let start = 0;
		let sequence = 0;
		let changed = false;
		let debounce;
		let pendingSaves = 0;
		dialog.addEventListener("cancel", (event) => {
			if (pendingSaves) event.preventDefault();
		});
		dialog.addEventListener("close", () => {
			clearTimeout(debounce);
			dialog.remove();
			activeDialog = null;
			if (changed && onCourseList()) location.reload();
		});

		async function load() {
			const request = ++sequence;
			status.textContent = "Loading courses…";
			previous.disabled = next.disabled = true;
			try {
				const data = await call("list_course_languages", { search: search.value, start });
				if (request !== sequence || !dialog.isConnected) return;
				rows.replaceChildren();
				status.textContent = data.courses.length
					? "Choose a language below."
					: "No courses found.";
				for (const [index, course] of data.courses.entries()) {
					const row = element("div", "", "biqat-language-row");
					const label = element("label", course.title);
					label.htmlFor = `biqat-language-${index}`;
					const note = element("small", course.published ? "Published" : "Unpublished");
					label.append(note);
					const select = element("select");
					select.id = label.htmlFor;
					for (const value of ["", "Amharic", "English"]) {
						const option = element("option", value || "Unclassified");
						option.value = value;
						select.append(option);
					}
					select.value = course[FIELD] || "";
					select.addEventListener("change", async () => {
						const value = select.value;
						select.disabled = true;
						pendingSaves++;
						close.disabled = true;
						note.textContent = "Saving…";
						try {
							await call("set_course_language", {
								course: course.name,
								language: value,
							});
							course[FIELD] = value;
							changed = true;
							note.textContent = "Saved";
							status.textContent = `Language saved for ${course.title}.`;
						} catch (error) {
							select.value = course[FIELD] || "";
							note.textContent = "Not saved. Please try again.";
							status.textContent = error.message;
						} finally {
							select.disabled = false;
							pendingSaves--;
							close.disabled = pendingSaves > 0;
						}
					});
					row.append(label, select);
					rows.append(row);
				}
				previous.disabled = start === 0;
				next.disabled = !data.has_more;
			} catch (error) {
				if (request === sequence) status.textContent = error.message;
			}
		}
		previous.addEventListener("click", () => {
			start = Math.max(0, start - 30);
			load();
		});
		next.addEventListener("click", () => {
			start += 30;
			load();
		});
		search.addEventListener("input", () => {
			clearTimeout(debounce);
			sequence++;
			debounce = setTimeout(() => {
				start = 0;
				load();
			}, 250);
		});
		load();
	}

	let frame;
	function schedule() {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = null;
			ensureFilter();
		});
	}
	function initialize() {
		new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
		window.addEventListener("popstate", schedule);
		ensureFilter();
	}
	if (document.readyState === "loading")
		document.addEventListener("DOMContentLoaded", initialize, { once: true });
	else initialize();
})();
