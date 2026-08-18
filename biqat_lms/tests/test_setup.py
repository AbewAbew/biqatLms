import datetime
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.website.utils import get_home_page_via_hooks
from lms import __version__ as lms_version
from packaging.version import Version

import biqat_lms.hooks as biqat_hooks
import frappe.utils.telemetry.pulse.client
from biqat_lms.api import (
	ALLOWED_PAYMENT_GATEWAY_SETTINGS,
	get_chart_data,
	get_chart_details,
	get_course_completion_data,
	get_list,
	get_sidebar_settings,
	normalize_time_fields,
	telemetry_boot_config,
)
from biqat_lms.overrides.lms_live_class import BiqatLMSLiveClass
from biqat_lms.page_renderers import CUSTOMIZATION_SCRIPT, inject_customization_script
from biqat_lms.setup.payment_defaults import (
	CHAPA_GATEWAY,
	CHAPA_SETTINGS_DOCTYPE,
	configure_ethiopian_payments,
	ensure_ethiopian_birr,
	set_default_currency_if_empty,
)
from biqat_lms.setup.site_defaults import ETHIOPIAN_TIMEZONE, configure_ethiopian_timezone


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

	def test_site_timezone_is_ethiopian(self):
		frappe.db.set_single_value("System Settings", "time_zone", "UTC")

		configure_ethiopian_timezone()

		self.assertEqual(
			frappe.db.get_single_value("System Settings", "time_zone"), ETHIOPIAN_TIMEZONE
		)

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

	def test_site_root_serves_the_lms(self):
		# get_home_page consults hooks before Website Settings and takes the last
		# installed app's value, so biqat_lms wins over lms and the stock default.
		self.assertEqual(biqat_hooks.home_page, "lms")
		self.assertEqual(frappe.get_hooks("home_page")[-1], "lms")
		self.assertEqual(get_home_page_via_hooks(), "lms")

	def test_statistics_endpoints_are_staff_only(self):
		# Upstream whitelists all three with allow_guest=True and no role check,
		# so the site root would hand platform figures to any visitor.
		for cmd, override in (
			("lms.lms.api.get_chart_details", "biqat_lms.api.get_chart_details"),
			("lms.lms.utils.get_chart_data", "biqat_lms.api.get_chart_data"),
			(
				"lms.lms.utils.get_course_completion_data",
				"biqat_lms.api.get_course_completion_data",
			),
			("lms.lms.api.get_sidebar_settings", "biqat_lms.api.get_sidebar_settings"),
		):
			self.assertEqual(biqat_hooks.override_whitelisted_methods[cmd], override)

		frappe.set_user("Guest")
		self.addCleanup(frappe.set_user, "Administrator")

		with self.assertRaises(frappe.PermissionError):
			get_chart_details()
		with self.assertRaises(frappe.PermissionError):
			get_chart_data("New Signups")
		with self.assertRaises(frappe.PermissionError):
			get_course_completion_data()

	def test_statistics_sidebar_entry_is_hidden_from_non_staff(self):
		frappe.db.set_single_value("LMS Settings", "allow_guest_access", 1)
		frappe.db.set_single_value("LMS Settings", "statistics", 1)

		self.assertEqual(get_sidebar_settings()["statistics"], 1)

		frappe.set_user("Guest")
		self.addCleanup(frappe.set_user, "Administrator")

		# The frontend drops a sidebar item whose lower-cased label matches a
		# falsy key, so this is what removes the entry.
		self.assertEqual(get_sidebar_settings()["statistics"], 0)

	def test_google_meet_live_class_uses_biqat_timezone_wrapper(self):
		self.assertEqual(
			biqat_hooks.override_whitelisted_methods[
				"lms.lms.doctype.lms_batch.lms_batch.create_google_meet_live_class"
			],
			"biqat_lms.api.create_google_meet_live_class",
		)

	def test_live_class_uses_email_safe_doctype_override(self):
		self.assertEqual(
			biqat_hooks.override_doctype_class["LMS Live Class"],
			"biqat_lms.overrides.lms_live_class.BiqatLMSLiveClass",
		)
		self.assertIsInstance(frappe.new_doc("LMS Live Class"), BiqatLMSLiveClass)

	def test_missing_telemetry_endpoint_is_stubbed(self):
		# The LMS frontend targets a newer Frappe; without the override this
		# command raises and every page load logs a traceback in the console.
		self.assertEqual(
			biqat_hooks.override_whitelisted_methods[
				"frappe.utils.telemetry.pulse.client.boot_config"
			],
			"biqat_lms.api.telemetry_boot_config",
		)
		self.assertFalse(
			hasattr(frappe.utils.telemetry.pulse.client, "boot_config"),
			"Frappe now defines boot_config; drop the biqat_lms stub.",
		)
		self.assertEqual(telemetry_boot_config(), {})

	def test_home_live_class_apis_use_zero_padded_time_wrapper(self):
		self.assertEqual(
			biqat_hooks.override_whitelisted_methods["lms.lms.api.get_admin_live_classes"],
			"biqat_lms.api.get_admin_live_classes",
		)
		self.assertEqual(
			biqat_hooks.override_whitelisted_methods["lms.lms.api.get_my_live_classes"],
			"biqat_lms.api.get_my_live_classes",
		)

	def test_normalize_time_fields_zero_pads_single_digit_hours(self):
		# Frappe returns Time fields as timedelta before serialization, and as an
		# unpadded "H:MM:SS" string after: "3:30:00" fails Date's ISO 8601 parsing
		# once the frontend builds "{date}T{time}", producing "Invalid Date".
		timedelta_row = frappe._dict({"time": datetime.timedelta(hours=3, minutes=30)})
		string_row = frappe._dict({"time": "3:30:00"})
		padded_row = frappe._dict({"time": "10:45:00"})
		empty_row = frappe._dict({"time": None})
		rows = [timedelta_row, string_row, padded_row, empty_row]

		normalize_time_fields(rows, ("time",))

		self.assertEqual(timedelta_row.time, "03:30:00")
		self.assertEqual(string_row.time, "03:30:00")
		self.assertEqual(padded_row.time, "10:45:00")
		self.assertIsNone(empty_row.time)

	def test_get_list_zero_pads_live_class_time_for_the_batch_page(self):
		stock_row = frappe._dict({"name": "LIVE-CLASS-TEST", "time": "3:30:00"})
		with patch("biqat_lms.api.frappe_get_list", return_value=[stock_row]):
			rows = get_list(doctype="LMS Live Class", fields=["name", "time"])

		self.assertEqual(rows[0].time, "03:30:00")
