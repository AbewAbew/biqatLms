"""Course content language, independent of the learner's interface language."""

import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import cint
from lms.lms.utils import can_modify_course, has_moderator_role

LANGUAGES = {"am": "Amharic", "en": "English"}
LANGUAGE_FIELD = "biqat_language"


def create_course_language_field():
	# Leave existing courses unclassified: their language cannot be inferred.
	create_custom_fields(
		{
			"LMS Course": [
				{
					"fieldname": LANGUAGE_FIELD,
					"label": "Course Language",
					"fieldtype": "Select",
					"options": "\nAmharic\nEnglish",
					"insert_after": "category",
					"description": "Language of the course content, used by the public course filter.",
					"in_standard_filter": 1,
				}
			]
		}
	)


def apply_language_filter(filters, course_language=None):
	filters = frappe.parse_json(filters) if isinstance(filters, str) else filters
	if filters is not None and not isinstance(filters, dict):
		frappe.throw(_("Course filters must be an object."))
	filters = dict(filters or {})
	if course_language:
		if course_language not in LANGUAGES:
			frappe.throw(_("Choose Amharic or English."))
		filters[LANGUAGE_FIELD] = LANGUAGES[course_language]
	return filters


@frappe.whitelist()
def can_manage_course_languages():
	return _can_manage_all() or bool(
		frappe.db.exists("Course Instructor", {"instructor": frappe.session.user, "parenttype": "LMS Course"})
	)


def _can_manage_all():
	return (
		frappe.session.user == "Administrator"
		or "System Manager" in frappe.get_roles()
		or bool(has_moderator_role())
	)


@frappe.whitelist()
def list_course_languages(search="", start=0):
	if not can_manage_course_languages():
		frappe.throw(_("You do not have permission to manage course languages."), frappe.PermissionError)
	filters = {}
	if not _can_manage_all():
		filters["name"] = [
			"in",
			frappe.get_all(
				"Course Instructor",
				{"instructor": frappe.session.user, "parenttype": "LMS Course"},
				pluck="parent",
			),
		]
	if search:
		filters["title"] = ["like", f"%{str(search)[:140]}%"]
	rows = frappe.get_all(
		"LMS Course",
		filters=filters,
		fields=["name", "title", LANGUAGE_FIELD, "published"],
		order_by="title asc, name asc",
		start=max(cint(start), 0),
		page_length=31,
	)
	return {"courses": rows[:30], "has_more": len(rows) > 30}


@frappe.whitelist(methods=["POST"])
def set_course_language(course, language):
	if not (_can_manage_all() or can_modify_course(course)):
		frappe.throw(_("You do not have permission to edit this course."), frappe.PermissionError)
	if language not in ("", *LANGUAGES.values()):
		frappe.throw(_("Choose Amharic or English, or leave the course unclassified."))
	if not frappe.db.exists("LMS Course", course):
		frappe.throw(_("Course not found."), frappe.DoesNotExistError)
	# Match LMS editor authorization, while updating only this field. Do not
	# re-save a stale whole course document from the management dialog.
	frappe.db.set_value("LMS Course", course, LANGUAGE_FIELD, language)
	return {"name": course, LANGUAGE_FIELD: language}
