from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from biqat_lms.home_dashboard import get_home_dashboard


class TestHomeDashboard(FrappeTestCase):
	def test_staff_uses_the_stock_instructor_home(self):
		with patch("biqat_lms.home_dashboard.frappe.get_roles", return_value=["Moderator"]):
			self.assertEqual(get_home_dashboard(), {"show": False})

	def test_learner_summary_uses_real_lms_records(self):
		enrollments = [
			frappe._dict(progress=100),
			frappe._dict(progress=45),
			frappe._dict(progress=None),
		]
		with (
			patch("biqat_lms.home_dashboard.frappe.get_roles", return_value=["LMS Student"]),
			patch("biqat_lms.home_dashboard.frappe.get_all", return_value=enrollments),
			patch("biqat_lms.home_dashboard.frappe.db.get_value", return_value="Biqat Learner"),
			patch("biqat_lms.home_dashboard.frappe.db.count", side_effect=[2, 1]),
			patch(
				"biqat_lms.home_dashboard.get_streak_info",
				return_value={"current_streak": 4, "longest_streak": 9},
			),
		):
			summary = get_home_dashboard()

		self.assertTrue(summary["show"])
		self.assertEqual(summary["full_name"], "Biqat Learner")
		self.assertEqual(summary["enrolled_courses"], 3)
		self.assertEqual(summary["completed_courses"], 1)
		self.assertEqual(summary["completion_percent"], 33)
		self.assertEqual(summary["certificates"], 2)
		self.assertEqual(summary["batches"], 1)
		self.assertEqual(summary["current_streak"], 4)
		self.assertEqual(summary["longest_streak"], 9)

	def test_guest_cannot_read_a_dashboard(self):
		frappe.set_user("Guest")
		self.addCleanup(frappe.set_user, "Administrator")

		with self.assertRaises(frappe.PermissionError):
			get_home_dashboard()
