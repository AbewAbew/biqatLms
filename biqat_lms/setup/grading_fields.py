import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

INSTRUCTOR_PROFILE_LINK = "Biqat Instructor Profile"

# All Biqat-owned columns on upstream doctypes are prefixed so a future Frappe
# Learning release can add its own `graded`/`feedback` fields without colliding.
GRADING_CUSTOM_FIELDS = {
	"LMS Assignment Submission": [
		{
			"fieldname": "biqat_attributed_instructor",
			"label": "Attributed Instructor",
			"fieldtype": "Link",
			"options": INSTRUCTOR_PROFILE_LINK,
			"description": "Managed instructor whose judgement this grade represents. Shown to the learner.",
			"insert_after": "evaluator",
		},
		{
			"fieldname": "biqat_graded_by",
			"label": "Graded By (Internal)",
			"fieldtype": "Link",
			"options": "User",
			"description": "Account that recorded the grade. Internal audit trail, never shown to the learner.",
			"insert_after": "biqat_attributed_instructor",
			"read_only": 1,
		},
	],
	"LMS Quiz Result": [
		{
			"fieldname": "biqat_graded",
			"label": "Graded",
			"fieldtype": "Check",
			"description": "Set once a human has reviewed this answer. Distinguishes a deliberate zero from an unreviewed answer.",
			"insert_after": "marks_out_of",
		},
		{
			"fieldname": "biqat_feedback",
			"label": "Feedback",
			"fieldtype": "Small Text",
			"insert_after": "biqat_graded",
		},
		{
			"fieldname": "biqat_attributed_instructor",
			"label": "Attributed Instructor",
			"fieldtype": "Link",
			"options": INSTRUCTOR_PROFILE_LINK,
			"insert_after": "biqat_feedback",
		},
		{
			"fieldname": "biqat_graded_by",
			"label": "Graded By (Internal)",
			"fieldtype": "Link",
			"options": "User",
			"insert_after": "biqat_attributed_instructor",
			"read_only": 1,
		},
	],
}


def create_grading_custom_fields():
	"""Add the Biqat grading columns to the upstream submission doctypes."""
	create_custom_fields(GRADING_CUSTOM_FIELDS, ignore_validate=True)
	frappe.clear_cache()
