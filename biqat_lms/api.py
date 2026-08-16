import json
from typing import Any

import frappe
from frappe import _
from frappe.client import get_list as frappe_get_list
from frappe.utils import cint, escape_html
from lms.lms.api import get_created_batches as lms_get_created_batches
from lms.lms.api import get_created_courses as lms_get_created_courses
from lms.lms.api import get_my_batches as lms_get_my_batches
from lms.lms.api import get_my_courses as lms_get_my_courses
from lms.lms.api import get_profile_details as lms_get_profile_details
from lms.lms.doctype.lms_batch.lms_batch import (
	create_google_meet_live_class as lms_create_google_meet_live_class,
)
from lms.lms.utils import (
	can_modify_batch,
	can_modify_course,
	has_moderator_role,
)
from lms.lms.utils import (
	enroll_in_program as lms_enroll_in_program,
)
from lms.lms.utils import (
	get_batch_details as lms_get_batch_details,
)
from lms.lms.utils import (
	get_batches as lms_get_batches,
)
from lms.lms.utils import (
	get_course_details as lms_get_course_details,
)
from lms.lms.utils import (
	get_courses as lms_get_courses,
)
from lms.lms.utils import (
	get_program_details as lms_get_program_details,
)

from biqat_lms.setup.programs import sync_program_member_count

ALLOWED_PAYMENT_GATEWAY_SETTINGS = {"Chapa Settings", "Mpesa Settings"}
EXPERT_USERNAME_PREFIX = "expert-"
INSTRUCTOR_MANAGER_ROLES = {"Moderator", "System Manager"}
INSTRUCTOR_PROFILE_FIELDS = (
	"name",
	"full_name",
	"profile_slug",
	"enabled",
	"professional_title",
	"organization",
	"contact_email",
	"linkedin",
	"profile_image",
	"cover_image",
	"biography",
)


@frappe.whitelist()
def get_list(
	doctype: str,
	fields: str | list[str | dict[str, Any]] | None = None,
	filters: str | list | dict[str, Any] | None = None,
	group_by: str | list[str] | None = None,
	order_by: str | list[str] | None = None,
	limit_start: int | str | None = None,
	limit_page_length: int | str = 20,
	parent: str | None = None,
	debug: bool | int = False,
	as_dict: bool | int = True,
	or_filters: str | list[list] | dict[str, Any] | None = None,
	expand: str | list[str] | None = None,
):
	rows = frappe_get_list(
		doctype=doctype,
		fields=fields,
		filters=filters,
		group_by=group_by,
		order_by=order_by,
		limit_start=limit_start,
		limit_page_length=limit_page_length,
		parent=parent,
		debug=debug,
		as_dict=as_dict,
		or_filters=or_filters,
		expand=expand,
	)

	if doctype == "DocType" and _is_payment_gateway_settings_query(filters):
		return [row for row in rows if _row_name(row) in ALLOWED_PAYMENT_GATEWAY_SETTINGS]

	return rows


def _is_payment_gateway_settings_query(filters) -> bool:
	parsed_filters = frappe.parse_json(filters) if isinstance(filters, str) else filters

	if isinstance(parsed_filters, dict):
		return parsed_filters.get("module") == "Payment Gateways"

	for condition in parsed_filters or []:
		if not isinstance(condition, list | tuple):
			continue
		if len(condition) == 3 and condition == ["module", "=", "Payment Gateways"]:
			return True
		if len(condition) >= 4 and condition[-3:] == ["module", "=", "Payment Gateways"]:
			return True

	return False


def _row_name(row):
	if isinstance(row, dict):
		return row.get("name")
	return row[0] if row else None


@frappe.whitelist(allow_guest=True)
def get_courses(filters: dict | None = None, start: int = 0):
	"""Return LMS courses with separate public expert attribution."""
	courses = lms_get_courses(filters=filters, start=start)
	course_names = [course.name for course in courses]
	experts_by_course = get_course_experts_map(course_names)
	preserve_editor_identity = _get_non_moderator_editor_courses(course_names)

	for course in courses:
		experts = experts_by_course.get(course.name, [])
		course.biqat_experts = experts
		if experts and course.name not in preserve_editor_identity:
			course.instructors = experts

	return courses


@frappe.whitelist(allow_guest=True)
def get_course_details(course: str):
	"""Return course details while keeping public experts separate from editors."""
	details = lms_get_course_details(course)
	if not details:
		return details

	experts = get_course_experts_map([details.name]).get(details.name, [])
	details.biqat_experts = experts
	if experts and (has_moderator_role() or not can_modify_course(details.name)):
		details.instructors = experts

	return details


@frappe.whitelist()
def get_created_courses():
	"""Return administrator dashboard courses with their public instructors."""
	courses = lms_get_created_courses()
	experts_by_course = get_course_experts_map([course.name for course in courses])
	for course in courses:
		experts = experts_by_course.get(course.name, [])
		course.biqat_experts = experts
		if experts:
			course.instructors = experts
	return courses


@frappe.whitelist()
def get_my_courses():
	"""Return student Home courses with their public instructors."""
	courses = lms_get_my_courses()
	experts_by_course = get_course_experts_map([course.name for course in courses])
	for course in courses:
		experts = experts_by_course.get(course.name, [])
		course.biqat_experts = experts
		if experts:
			course.instructors = experts
	return courses


@frappe.whitelist(allow_guest=True)
def get_batches(filters: dict | None = None, start: int = 0, order_by: str = "start_date"):
	"""Return batch cards with managed public instructors."""
	batches = lms_get_batches(filters=filters, start=start, order_by=order_by)
	return _apply_batch_experts(batches)


@frappe.whitelist(allow_guest=True)
def get_batch_details(batch: str):
	"""Return batch details with managed public instructors."""
	details = lms_get_batch_details(batch)
	if not details:
		return details
	return _apply_batch_experts([details])[0]


@frappe.whitelist()
def get_created_batches():
	"""Return administrator Home batches with managed public instructors."""
	return _apply_batch_experts(lms_get_created_batches())


@frappe.whitelist()
def get_my_batches():
	"""Return learner Home batches with managed public instructors."""
	return _apply_batch_experts(lms_get_my_batches())


@frappe.whitelist()
def get_program_details(program_name: str):
	"""Return Program course cards with their public instructors."""
	program = lms_get_program_details(program_name)
	if not program:
		return program

	courses = program.get("courses") or []
	experts_by_course = get_course_experts_map([course.name for course in courses])
	for course in courses:
		experts = experts_by_course.get(course.name, [])
		course.biqat_experts = experts
		if experts:
			course.instructors = experts

	return program


@frappe.whitelist()
def enroll_in_program(program: str):
	"""Enroll a learner and keep the Program child table and count consistent."""
	result = lms_enroll_in_program(program)
	member = frappe.db.get_value(
		"LMS Program Member",
		{"parent": program, "member": frappe.session.user},
		"name",
	)
	if member:
		frappe.db.set_value(
			"LMS Program Member",
			member,
			"parentfield",
			"program_members",
			update_modified=False,
		)
	sync_program_member_count(program)
	return result


@frappe.whitelist(allow_guest=True)
def get_course_experts(course: str):
	"""Return enabled public expert profiles for an accessible LMS course."""
	if not lms_get_course_details(course):
		return []
	return get_course_experts_map([course]).get(course, [])


@frappe.whitelist()
def list_instructor_profiles(
	search: str | None = None, course: str | None = None, batch: str | None = None
):
	"""List managed instructor profiles for the LMS-native management controls."""
	_require_instructor_manager()
	if search is not None and not isinstance(search, str):
		frappe.throw(_("Invalid search query."), frappe.ValidationError)

	filters = {}
	or_filters = None
	if search:
		term = f"%{search.strip()}%"
		or_filters = {
			"full_name": ["like", term],
			"professional_title": ["like", term],
			"organization": ["like", term],
		}

	profiles = frappe.get_all(
		"Biqat Instructor Profile",
		filters=filters,
		or_filters=or_filters,
		fields=list(INSTRUCTOR_PROFILE_FIELDS),
		order_by="enabled desc, full_name asc",
		limit_page_length=200,
	)
	selected = set()
	if course:
		_validate_course(course)
		selected = set(
			frappe.get_all(
				"Biqat Instructor Course",
				filters={
					"course": course,
					"parenttype": "Biqat Instructor Profile",
					"parentfield": "courses",
				},
				pluck="parent",
			)
		)
	elif batch:
		_validate_batch(batch)
		selected = set(
			frappe.get_all(
				"Biqat Instructor Batch",
				filters={
					"batch": batch,
					"parenttype": "Biqat Instructor Profile",
					"parentfield": "batches",
				},
				pluck="parent",
			)
		)

	for profile in profiles:
		profile.selected = profile.name in selected
	return profiles


@frappe.whitelist()
def save_instructor_profile(profile: str | dict):
	"""Create or update a managed instructor without creating a login account."""
	_require_instructor_manager()
	values = json.loads(profile) if isinstance(profile, str) else profile
	if not isinstance(values, dict):
		frappe.throw(_("Invalid instructor profile."), frappe.ValidationError)

	name = values.get("name")
	if name:
		doc = frappe.get_doc("Biqat Instructor Profile", name)
	else:
		doc = frappe.new_doc("Biqat Instructor Profile")

	for fieldname in INSTRUCTOR_PROFILE_FIELDS:
		if fieldname in {"name", "profile_slug"} or fieldname not in values:
			continue
		setattr(doc, fieldname, values[fieldname])

	doc.full_name = (doc.full_name or "").strip()
	if not doc.full_name:
		frappe.throw(_("Full name is required."), frappe.ValidationError)

	if doc.is_new():
		doc.insert()
	else:
		doc.save()
	return frappe.get_doc("Biqat Instructor Profile", doc.name).as_dict()


@frappe.whitelist()
def set_instructor_profile_status(profile: str, enabled: int | str = 1):
	"""Enable or disable a managed instructor profile from the LMS Users panel."""
	_require_instructor_manager()
	doc = frappe.get_doc("Biqat Instructor Profile", profile)
	doc.enabled = cint(enabled)
	doc.save()
	return {"name": doc.name, "enabled": doc.enabled}


@frappe.whitelist()
def set_course_instructor_profiles(course: str, profiles: str | list[str] | None = None):
	"""Replace public instructor attribution for a course without changing its editors."""
	_require_course_manager(course)
	profile_names = json.loads(profiles) if isinstance(profiles, str) else (profiles or [])
	if not isinstance(profile_names, list) or any(not isinstance(name, str) for name in profile_names):
		frappe.throw(_("Invalid instructor selection."), frappe.ValidationError)

	profile_names = list(dict.fromkeys(profile_names))
	if profile_names:
		valid_profiles = set(
			frappe.get_all(
				"Biqat Instructor Profile",
				filters={"name": ["in", profile_names], "enabled": 1},
				pluck="name",
			)
		)
		missing = [name for name in profile_names if name not in valid_profiles]
		if missing:
			frappe.throw(
				_("These instructor profiles are unavailable: {0}").format(", ".join(missing)),
				frappe.ValidationError,
			)

	existing_profiles = set(
		frappe.get_all(
			"Biqat Instructor Course",
			filters={
				"course": course,
				"parenttype": "Biqat Instructor Profile",
				"parentfield": "courses",
			},
			pluck="parent",
		)
	)
	profiles_to_update = existing_profiles | set(profile_names)
	for profile_name in profiles_to_update:
		doc = frappe.get_doc("Biqat Instructor Profile", profile_name)
		doc.set("courses", [row for row in doc.courses if row.course != course])
		if profile_name in profile_names:
			doc.append(
				"courses",
				{
					"course": course,
					"role": _("Instructor"),
					"display_order": (profile_names.index(profile_name) + 1) * 10,
				},
			)
		doc.save()

	return get_course_experts_map([course]).get(course, [])


@frappe.whitelist()
def set_batch_instructor_profiles(batch: str, profiles: str | list[str] | None = None):
	"""Replace public batch attribution without granting batch permissions."""
	_require_batch_manager(batch)
	profile_names = json.loads(profiles) if isinstance(profiles, str) else (profiles or [])
	if not isinstance(profile_names, list) or any(not isinstance(name, str) for name in profile_names):
		frappe.throw(_("Invalid instructor selection."), frappe.ValidationError)

	profile_names = list(dict.fromkeys(profile_names))
	if profile_names:
		valid_profiles = set(
			frappe.get_all(
				"Biqat Instructor Profile",
				filters={"name": ["in", profile_names], "enabled": 1},
				pluck="name",
			)
		)
		missing = [name for name in profile_names if name not in valid_profiles]
		if missing:
			frappe.throw(
				_("These instructor profiles are unavailable: {0}").format(", ".join(missing)),
				frappe.ValidationError,
			)

	existing_profiles = set(
		frappe.get_all(
			"Biqat Instructor Batch",
			filters={
				"batch": batch,
				"parenttype": "Biqat Instructor Profile",
				"parentfield": "batches",
			},
			pluck="parent",
		)
	)
	for profile_name in existing_profiles | set(profile_names):
		doc = frappe.get_doc("Biqat Instructor Profile", profile_name)
		doc.set("batches", [row for row in doc.batches if row.batch != batch])
		if profile_name in profile_names:
			doc.append(
				"batches",
				{
					"batch": batch,
					"role": _("Instructor"),
					"display_order": (profile_names.index(profile_name) + 1) * 10,
				},
			)
		doc.save()

	return get_batch_experts_map([batch]).get(batch, [])


@frappe.whitelist()
def create_google_meet_live_class(
	batch_name: str,
	google_meet_account: str,
	title: str,
	duration: int,
	date: str,
	time: str,
	timezone: str | None = None,
	description: str | None = None,
):
	"""Create a Meet session using the Batch's authoritative timezone."""
	frappe.only_for(["Moderator", "Batch Evaluator"])
	_validate_batch(batch_name)
	effective_timezone = frappe.db.get_value("LMS Batch", batch_name, "timezone") or (
		timezone or ""
	).strip()
	if not effective_timezone:
		frappe.throw(_("Please set a timezone on this batch before creating a live class."))

	return lms_create_google_meet_live_class(
		batch_name=batch_name,
		google_meet_account=google_meet_account,
		title=title,
		duration=duration,
		date=date,
		time=time,
		timezone=effective_timezone,
		description=description,
	)


@frappe.whitelist()
def list_batch_live_classes(batch: str):
	"""Return scheduled sessions with their actual saved timezone for administration."""
	_require_live_class_administrator()
	_validate_batch(batch)
	return frappe.get_all(
		"LMS Live Class",
		filters={"batch_name": batch},
		fields=[
			"name",
			"title",
			"date",
			"time",
			"duration",
			"timezone",
			"conferencing_provider",
			"event",
		],
		order_by="date asc, time asc",
	)


@frappe.whitelist()
def delete_live_class(live_class: str):
	"""Delete a session and let LMS remove its linked Google Calendar event."""
	_require_live_class_administrator()
	if not isinstance(live_class, str) or not frappe.db.exists("LMS Live Class", live_class):
		frappe.throw(_("Live class not found."), frappe.DoesNotExistError)

	doc = frappe.get_doc("LMS Live Class", live_class)
	result = {"name": doc.name, "title": doc.title}
	doc.delete()
	return result


def ensure_internal_batch_manager(doc, method=None):
	"""Populate Frappe's required permission row without exposing it as the teacher."""
	if doc.instructors:
		return
	if frappe.session.user == "Guest" or not (
		frappe.session.user == "Administrator" or INSTRUCTOR_MANAGER_ROLES.intersection(frappe.get_roles())
	):
		return
	doc.append("instructors", {"instructor": frappe.session.user})


def _require_instructor_manager():
	if frappe.session.user == "Administrator":
		return
	if not INSTRUCTOR_MANAGER_ROLES.intersection(frappe.get_roles()):
		frappe.throw(_("You do not have permission to manage instructor profiles."), frappe.PermissionError)


def _require_live_class_administrator():
	if frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles():
		return
	frappe.throw(_("Only a system administrator can manage live classes."), frappe.PermissionError)


def _require_course_manager(course: str):
	_validate_course(course)
	if not can_modify_course(course):
		frappe.throw(_("You do not have permission to modify this course."), frappe.PermissionError)


def _require_batch_manager(batch: str):
	_validate_batch(batch)
	if not can_modify_batch(batch):
		frappe.throw(_("You do not have permission to modify this batch."), frappe.PermissionError)


def _validate_course(course: str):
	if not isinstance(course, str) or not frappe.db.exists("LMS Course", course):
		frappe.throw(_("Course not found."), frappe.DoesNotExistError)


def _validate_batch(batch: str):
	if not isinstance(batch, str) or not frappe.db.exists("LMS Batch", batch):
		frappe.throw(_("Batch not found."), frappe.DoesNotExistError)


@frappe.whitelist()
def get_profile_details(username: str):
	"""Resolve Biqat expert profile routes before falling back to LMS users."""
	if username.startswith(EXPERT_USERNAME_PREFIX):
		profile = _get_expert_profile(username.removeprefix(EXPERT_USERNAME_PREFIX))
		if profile:
			return _format_profile_details(profile)
	return lms_get_profile_details(username)


def get_course_experts_map(course_names: list[str]) -> dict[str, list[frappe._dict]]:
	course_names = list(dict.fromkeys(name for name in course_names if name))
	if not course_names:
		return {}

	placeholders = ", ".join(["%s"] * len(course_names))
	rows = frappe.db.sql(
		f"""
			SELECT
				assignment.course,
				assignment.role,
				assignment.display_order,
				profile.name AS profile_name,
				profile.profile_slug,
				profile.full_name,
				profile.professional_title,
				profile.organization,
				profile.profile_image,
				profile.cover_image,
				profile.biography,
				profile.linkedin
			FROM `tabBiqat Instructor Course` AS assignment
			INNER JOIN `tabBiqat Instructor Profile` AS profile
				ON profile.name = assignment.parent
			WHERE assignment.parenttype = 'Biqat Instructor Profile'
				AND assignment.parentfield = 'courses'
				AND profile.enabled = 1
				AND assignment.course IN ({placeholders})
			ORDER BY assignment.course, assignment.display_order, assignment.idx
		""",
		tuple(course_names),
		as_dict=True,
	)

	experts_by_course: dict[str, list[frappe._dict]] = {}
	for row in rows:
		experts_by_course.setdefault(row.course, []).append(_format_course_expert(row))
	return experts_by_course


def get_batch_experts_map(batch_names: list[str]) -> dict[str, list[frappe._dict]]:
	batch_names = list(dict.fromkeys(name for name in batch_names if name))
	if not batch_names:
		return {}

	placeholders = ", ".join(["%s"] * len(batch_names))
	rows = frappe.db.sql(
		f"""
			SELECT
				assignment.batch,
				assignment.role,
				assignment.display_order,
				profile.name AS profile_name,
				profile.profile_slug,
				profile.full_name,
				profile.professional_title,
				profile.organization,
				profile.profile_image,
				profile.cover_image,
				profile.biography,
				profile.linkedin
			FROM `tabBiqat Instructor Batch` AS assignment
			INNER JOIN `tabBiqat Instructor Profile` AS profile
				ON profile.name = assignment.parent
			WHERE assignment.parenttype = 'Biqat Instructor Profile'
				AND assignment.parentfield = 'batches'
				AND profile.enabled = 1
				AND assignment.batch IN ({placeholders})
			ORDER BY assignment.batch, assignment.display_order, assignment.idx
		""",
		tuple(batch_names),
		as_dict=True,
	)

	experts_by_batch: dict[str, list[frappe._dict]] = {}
	for row in rows:
		experts_by_batch.setdefault(row.batch, []).append(_format_course_expert(row))
	return experts_by_batch


def _apply_batch_experts(batches: list) -> list:
	experts_by_batch = get_batch_experts_map([batch.name for batch in batches])
	for batch in batches:
		experts = experts_by_batch.get(batch.name, [])
		batch.biqat_experts = experts
		if experts:
			batch.instructors = experts
	return batches


def _format_course_expert(row: frappe._dict) -> frappe._dict:
	first_name = row.full_name.split()[0] if row.full_name else row.full_name
	return frappe._dict(
		{
			"name": f"Biqat Instructor Profile::{row.profile_name}",
			"profile_name": row.profile_name,
			"username": f"{EXPERT_USERNAME_PREFIX}{row.profile_slug}",
			"full_name": row.full_name,
			"first_name": first_name,
			"user_image": row.profile_image,
			"bio": _format_course_expert_bio(row),
			"headline": _format_headline(row),
			"professional_title": row.professional_title,
			"organization": row.organization,
			"expert_role": row.role,
		}
	)


def _format_course_expert_bio(row: frappe._dict) -> str:
	credentials = [row.role, row.professional_title, row.organization]
	credential_line = " · ".join(escape_html(value) for value in credentials if value)
	credential_html = f"<p><strong>{credential_line}</strong></p>" if credential_line else ""
	return f"{credential_html}{row.biography or ''}"


def _format_headline(profile: frappe._dict) -> str:
	return " · ".join(value for value in [profile.professional_title, profile.organization] if value)


def _get_expert_profile(profile_slug: str):
	return frappe.db.get_value(
		"Biqat Instructor Profile",
		{"profile_slug": profile_slug, "enabled": 1},
		[
			"name",
			"profile_slug",
			"full_name",
			"professional_title",
			"organization",
			"profile_image",
			"cover_image",
			"biography",
			"linkedin",
		],
		as_dict=True,
	)


def _format_profile_details(profile: frappe._dict) -> frappe._dict:
	name_parts = profile.full_name.split(maxsplit=1)
	return frappe._dict(
		{
			"name": profile.name,
			"username": f"{EXPERT_USERNAME_PREFIX}{profile.profile_slug}",
			"first_name": name_parts[0],
			"last_name": name_parts[1] if len(name_parts) > 1 else "",
			"full_name": profile.full_name,
			"user_image": profile.profile_image,
			"cover_image": profile.cover_image,
			"bio": profile.biography,
			"headline": _format_headline(profile),
			"linkedin": profile.linkedin,
			"github": None,
			"twitter": None,
			"language": None,
			"open_to": None,
			"roles": [],
		}
	)


def _get_non_moderator_editor_courses(course_names: list[str]) -> set[str]:
	if not course_names or has_moderator_role() or frappe.session.user == "Guest":
		return set()
	return set(
		frappe.get_all(
			"Course Instructor",
			filters={
				"instructor": frappe.session.user,
				"parenttype": "LMS Course",
				"parent": ["in", course_names],
			},
			pluck="parent",
		)
	)
