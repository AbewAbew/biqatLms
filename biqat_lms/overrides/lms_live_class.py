import frappe
from frappe.utils import validate_email_address
from lms.lms.doctype.lms_live_class.lms_live_class import LMSLiveClass


class BiqatLMSLiveClass(LMSLiveClass):
	"""Create calendar attendees from User emails, and invite the batch's managed
	instructor by their private contact email without granting them a login."""

	def add_event_participants(self, event, calendar, add_video_conferencing=False):
		seen_emails = set()

		for participant in self.get_participants():
			email = frappe.db.get_value("User", participant, "email") or participant
			self._add_participant(event, "User", participant, email, seen_emails)

		for profile_name, email in self._get_managed_instructors():
			self._add_participant(event, "Biqat Instructor Profile", profile_name, email, seen_emails)

	def _add_participant(self, event, reference_doctype, reference_docname, email, seen_emails):
		email = (email or "").strip()
		if not validate_email_address(email) or email.lower() in seen_emails:
			return

		seen_emails.add(email.lower())
		frappe.get_doc(
			{
				"doctype": "Event Participants",
				"reference_doctype": reference_doctype,
				"reference_docname": reference_docname,
				"email": email,
				"parent": event.name,
				"parenttype": "Event",
				"parentfield": "event_participants",
			}
		).save()

	def _get_managed_instructors(self) -> list[tuple[str, str]]:
		"""Managed instructor profiles never get a Frappe User, so invite them by
		their private contact email instead of through the User-based participant list."""
		return frappe.db.sql(
			"""
				SELECT profile.name, profile.contact_email
				FROM `tabBiqat Instructor Batch` AS assignment
				INNER JOIN `tabBiqat Instructor Profile` AS profile
					ON profile.name = assignment.parent
				WHERE assignment.parenttype = 'Biqat Instructor Profile'
					AND assignment.parentfield = 'batches'
					AND assignment.batch = %s
					AND profile.enabled = 1
					AND COALESCE(profile.contact_email, '') != ''
			""",
			(self.batch_name,),
		)
