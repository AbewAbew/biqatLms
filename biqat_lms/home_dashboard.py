import frappe
from frappe import _
from frappe.utils import flt
from lms.lms.api import get_streak_info

LMS_STAFF_ROLES = {"Moderator", "Course Creator", "Batch Evaluator"}


@frappe.whitelist()
def get_home_dashboard():
	"""Return the signed-in learner's aggregate Home dashboard figures."""
	user = frappe.session.user
	if user == "Guest":
		frappe.throw(_("Please log in to view your learning dashboard."), frappe.PermissionError)

	roles = set(frappe.get_roles(user))
	if roles & LMS_STAFF_ROLES:
		return {"show": False}

	enrollments = frappe.get_all(
		"LMS Enrollment",
		filters={"member": user},
		fields=["progress"],
	)
	enrolled_courses = len(enrollments)
	completed_courses = sum(flt(row.progress) >= 100 for row in enrollments)
	completion_percent = (
		min(round((completed_courses / enrolled_courses) * 100), 100)
		if enrolled_courses
		else 0
	)

	streak = get_streak_info()
	return {
		"show": True,
		"user": user,
		"full_name": frappe.db.get_value("User", user, "full_name") or user,
		"enrolled_courses": enrolled_courses,
		"completed_courses": completed_courses,
		"completion_percent": completion_percent,
		"certificates": frappe.db.count("LMS Certificate", {"member": user}),
		"batches": frappe.db.count("LMS Batch Enrollment", {"member": user}),
		"current_streak": streak.get("current_streak", 0),
		"longest_streak": streak.get("longest_streak", 0),
	}
