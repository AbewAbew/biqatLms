import frappe

from biqat_lms.setup.payment_defaults import configure_ethiopian_payments

ETHIOPIAN_TIMEZONE = "Africa/Addis_Ababa"


def configure_ethiopian_site_defaults():
	"""Apply regional defaults used by both LMS records and Google Calendar."""
	configure_ethiopian_payments()
	configure_ethiopian_timezone()
	repair_live_class_timezones()
	disable_course_publish_broadcast()


def configure_ethiopian_timezone():
	"""Keep Frappe's calendar integration on Ethiopian wall-clock time."""
	frappe.db.set_single_value("System Settings", "time_zone", ETHIOPIAN_TIMEZONE)


def repair_live_class_timezones():
	"""Restore each saved live class to its parent Batch timezone."""
	frappe.db.sql(
		"""
		UPDATE `tabLMS Live Class` AS live_class
		INNER JOIN `tabLMS Batch` AS batch ON batch.name = live_class.batch_name
		SET live_class.timezone = batch.timezone
		WHERE COALESCE(batch.timezone, '') != ''
			AND COALESCE(live_class.timezone, '') != batch.timezone
		"""
	)


def disable_course_publish_broadcast():
	"""Keep the stock "course published" broadcast off.

	lms.lms.doctype.lms_course.lms_course.send_notification_for_published_courses
	runs daily via the scheduler whenever LMS Settings.send_notification_for_published_courses
	is set, and it credits the internal editor (e.g. "Administrator") by name in a
	message sent to every enabled user, not the managed instructor. That function
	is not whitelisted, so it cannot be intercepted the way course/batch/certificate
	data is elsewhere in this app. Force the toggle back off on every migrate so an
	admin exploring LMS Settings can't switch it on without also reintroducing the
	leak; this is enforced here rather than left as a one-time manual setting.
	"""
	if frappe.db.get_single_value("LMS Settings", "send_notification_for_published_courses"):
		frappe.db.set_single_value("LMS Settings", "send_notification_for_published_courses", "")
