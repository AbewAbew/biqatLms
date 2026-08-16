import frappe

from biqat_lms.setup.payment_defaults import configure_ethiopian_payments

ETHIOPIAN_TIMEZONE = "Africa/Addis_Ababa"


def configure_ethiopian_site_defaults():
	"""Apply regional defaults used by both LMS records and Google Calendar."""
	configure_ethiopian_payments()
	configure_ethiopian_timezone()
	repair_live_class_timezones()


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
