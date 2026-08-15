import frappe
from frappe.tests.utils import FrappeTestCase
from lms import __version__ as lms_version
from packaging.version import Version

import biqat_lms.hooks as biqat_hooks
from biqat_lms.api import ALLOWED_PAYMENT_GATEWAY_SETTINGS, get_list
from biqat_lms.page_renderers import CUSTOMIZATION_SCRIPT, inject_customization_script
from biqat_lms.setup.payment_defaults import (
	CHAPA_GATEWAY,
	CHAPA_SETTINGS_DOCTYPE,
	configure_ethiopian_payments,
	ensure_ethiopian_birr,
	set_default_currency_if_empty,
)


class TestBiqatLMSSetup(FrappeTestCase):
	def test_required_apps_are_installed(self):
		installed_apps = set(frappe.get_installed_apps())

		self.assertTrue({"biqat_lms", "lms", "payments"}.issubset(installed_apps))
		self.assertGreaterEqual(Version(lms_version), Version("2.60.1"))

	def test_ethiopian_payment_defaults_are_installed(self):
		configure_ethiopian_payments()

		currency = frappe.db.get_value(
			"Currency",
			"ETB",
			["enabled", "fraction", "fraction_units", "symbol", "number_format"],
			as_dict=True,
		)
		self.assertEqual(currency.enabled, 1)
		self.assertEqual(currency.fraction, "Santim")
		self.assertEqual(currency.fraction_units, 100)
		self.assertEqual(currency.symbol, "Br")
		self.assertEqual(currency.number_format, "#,###.##")

		chapa_meta = frappe.db.get_value(
			"DocType",
			CHAPA_SETTINGS_DOCTYPE,
			["module", "custom", "issingle"],
			as_dict=True,
		)
		self.assertEqual(chapa_meta.module, "Payment Gateways")
		self.assertEqual(chapa_meta.custom, 1)
		self.assertEqual(chapa_meta.issingle, 1)

	def test_existing_default_currency_is_preserved(self):
		frappe.db.set_single_value("LMS Settings", "default_currency", "USD")

		ensure_ethiopian_birr()
		set_default_currency_if_empty()

		self.assertEqual(frappe.db.get_single_value("LMS Settings", "default_currency"), "USD")

	def test_chapa_placeholder_creates_gateway(self):
		settings = frappe.get_single(CHAPA_SETTINGS_DOCTYPE)
		settings.integration_status = "Not Connected"
		settings.save(ignore_permissions=True)

		gateway = frappe.get_doc("Payment Gateway", CHAPA_GATEWAY)
		self.assertEqual(gateway.gateway_settings, CHAPA_SETTINGS_DOCTYPE)
		self.assertEqual(gateway.gateway_controller, CHAPA_SETTINGS_DOCTYPE)

	def test_chapa_cannot_be_activated_before_integration(self):
		chapa_settings = frappe.get_single(CHAPA_SETTINGS_DOCTYPE)
		chapa_settings.integration_status = "Not Connected"
		chapa_settings.save(ignore_permissions=True)

		lms_settings = frappe.get_single("LMS Settings")
		lms_settings.payment_gateway = CHAPA_GATEWAY
		with self.assertRaises(frappe.ValidationError):
			lms_settings.save(ignore_permissions=True)

	def test_only_biqat_payment_gateways_are_exposed(self):
		gateways = get_list(
			"DocType",
			fields=["name", "issingle"],
			filters={"module": "Payment Gateways"},
			limit_page_length=100,
		)

		self.assertEqual({row.name for row in gateways}, ALLOWED_PAYMENT_GATEWAY_SETTINGS)

	def test_lms_page_includes_ui_customization(self):
		html = (
			"<html><head><script type='module' src='/assets/lms/app.js'></script></head>"
			"<body><div id='app'></div></body></html>"
		)
		customized_html = inject_customization_script(html)

		self.assertIn(CUSTOMIZATION_SCRIPT, customized_html)
		self.assertEqual(customized_html.count(CUSTOMIZATION_SCRIPT), 1)
		self.assertLess(customized_html.index(CUSTOMIZATION_SCRIPT), customized_html.index("app.js"))
		self.assertEqual(inject_customization_script(customized_html), customized_html)

	def test_default_website_profile_redirects_to_lms(self):
		self.assertIn({"source": "/me", "target": "/lms"}, biqat_hooks.website_redirects)
