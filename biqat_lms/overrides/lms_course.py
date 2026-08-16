import frappe
from frappe import _
from frappe.desk.doctype.notification_log.notification_log import make_notification_logs
from frappe.utils import validate_email_address
from lms.lms.utils import get_lms_route

from biqat_lms.api import get_course_experts_map


def apply():
	"""Replace the stock course-publish broadcast with a version that credits the
	managed instructor instead of the internal editor, and fixes the email
	variant's recipients.

	send_notification_for_published_courses is a plain scheduled job, not a
	whitelisted method, so it cannot be intercepted through
	override_whitelisted_methods the way course/batch/certificate data is
	elsewhere in this app. Its two branches are patched directly onto the lms
	module instead, since it calls them as bare module-level names.
	"""
	import lms.lms.doctype.lms_course.lms_course as lms_course

	lms_course.send_system_notification_for_published_courses = (
		send_system_notification_for_published_courses
	)
	lms_course.send_email_notification_for_published_courses = (
		send_email_notification_for_published_courses
	)


def _enabled_student_emails() -> list[str]:
	users = frappe.get_all("User", {"enabled": 1}, pluck="name")
	return [user for user in users if validate_email_address(user)]


def _course_instructors(course_name: str) -> list[frappe._dict]:
	"""Managed instructors attributed to the course, or a generic faculty credit
	if none is assigned yet. Never falls back to the internal editor."""
	experts = get_course_experts_map([course_name]).get(course_name, [])
	if experts:
		return experts
	brand_name = frappe.db.get_single_value("Website Settings", "app_name") or "Our"
	return [frappe._dict({"full_name": f"{brand_name} Faculty", "user_image": None})]


def send_system_notification_for_published_courses(courses):
	students = _enabled_student_emails()
	for course in courses:
		instructor_name = _course_instructors(course.name)[0].full_name
		notification = frappe._dict(
			{
				"subject": _("{0} has published a new course {1}").format(
					frappe.bold(instructor_name), frappe.bold(course.title)
				),
				"email_content": _(
					"A new course '{0}' has been published that might interest you. Check it out!"
				).format(course.title),
				"document_type": "LMS Course",
				"document_name": course.name,
				"from_user": None,
				"type": "Alert",
				"link": get_lms_route(f"courses/{course.name}"),
			}
		)
		make_notification_logs(notification, students)
		frappe.db.set_value("LMS Course", course.name, "notification_sent", 1)


def send_email_notification_for_published_courses(courses):
	brand_name = frappe.db.get_single_value("Website Settings", "app_name")
	brand_logo = frappe.db.get_single_value("Website Settings", "banner_image")
	subject = _("A new course has been published on {0}").format(brand_name)
	template = "published_course_notification"
	students = _enabled_student_emails()

	for course in courses:
		args = {
			"brand_logo": brand_logo,
			"brand_name": brand_name,
			"title": course.title,
			"short_introduction": course.short_introduction,
			"instructors": _course_instructors(course.name),
			"course_url": frappe.utils.get_url(get_lms_route(f"courses/{course.name}")),
		}

		frappe.sendmail(
			recipients=students,
			subject=subject,
			template=template,
			args=args,
		)
		frappe.db.set_value("LMS Course", course.name, "notification_sent", 1)
