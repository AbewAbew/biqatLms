import frappe
from frappe.tests.utils import FrappeTestCase


class TestBiqatLMSSetup(FrappeTestCase):
	def test_required_apps_are_installed(self):
		installed_apps = set(frappe.get_installed_apps())

		self.assertTrue({"biqat_lms", "lms", "payments"}.issubset(installed_apps))
