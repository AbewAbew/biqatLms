import frappe
from frappe.utils import validate_email_address
from lms.lms.doctype.lms_live_class.lms_live_class import LMSLiveClass


class BiqatLMSLiveClass(LMSLiveClass):
	"""Create calendar attendees from User emails instead of User document names."""

	def add_event_participants(self, event, calendar, add_video_conferencing=False):
		seen_emails = set()
		for participant in self.get_participants():
			email = frappe.db.get_value("User", participant, "email") or participant
			email = (email or "").strip()
			if not validate_email_address(email) or email.lower() in seen_emails:
				continue

			seen_emails.add(email.lower())
			frappe.get_doc(
				{
					"doctype": "Event Participants",
					"reference_doctype": "User",
					"reference_docname": participant,
					"email": email,
					"parent": event.name,
					"parenttype": "Event",
					"parentfield": "event_participants",
				}
			).save()
