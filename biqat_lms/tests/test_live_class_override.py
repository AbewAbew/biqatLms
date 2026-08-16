from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import validate_email_address

from biqat_lms.overrides.lms_live_class import BiqatLMSLiveClass


class TestBiqatLMSLiveClass(FrappeTestCase):
	@patch("biqat_lms.overrides.lms_live_class.frappe.get_doc")
	def test_event_participants_use_resolved_user_email(self, get_doc):
		administrator_email = frappe.db.get_value("User", "Administrator", "email")
		self.assertTrue(validate_email_address(administrator_email))

		live_class = BiqatLMSLiveClass({"doctype": "LMS Live Class"})
		live_class.get_participants = MagicMock(
			return_value=["Administrator", "not-a-user-or-email", administrator_email]
		)
		event = frappe._dict({"name": "BIQAT-LIVE-CLASS-EVENT"})

		live_class.add_event_participants(event, "Biqat Live Classes")

		get_doc.assert_called_once()
		participant = get_doc.call_args.args[0]
		self.assertEqual(participant["reference_docname"], "Administrator")
		self.assertEqual(participant["email"], administrator_email)
		get_doc.return_value.save.assert_called_once_with()
