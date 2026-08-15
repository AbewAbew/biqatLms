import frappe
from frappe import _

CHAPA_GATEWAY = "Chapa"
CHAPA_SETTINGS_DOCTYPE = "Chapa Settings"


def configure_ethiopian_payments():
	"""Install the Ethiopian currency and the inactive Chapa placeholder."""
	ensure_ethiopian_birr()
	ensure_chapa_settings_doctype()
	set_default_currency_if_empty()
	disable_india_gst()


def ensure_ethiopian_birr():
	values = {
		"currency_name": "ETB",
		"enabled": 1,
		"fraction": "Santim",
		"fraction_units": 100,
		"smallest_currency_fraction_value": 0.01,
		"symbol": "Br",
		"number_format": "#,###.##",
	}

	if frappe.db.exists("Currency", "ETB"):
		frappe.db.set_value("Currency", "ETB", values, update_modified=False)
		return

	frappe.get_doc(
		{
			"doctype": "Currency",
			"name": "ETB",
			**values,
		}
	).insert(ignore_permissions=True)


def ensure_chapa_settings_doctype():
	if frappe.db.exists("DocType", CHAPA_SETTINGS_DOCTYPE):
		return

	frappe.get_doc(
		{
			"doctype": "DocType",
			"name": CHAPA_SETTINGS_DOCTYPE,
			"module": "Payment Gateways",
			"custom": 1,
			"issingle": 1,
			"fields": [
				{
					"fieldname": "integration_status",
					"fieldtype": "Select",
					"label": "Integration Status",
					"options": "Not Connected",
					"default": "Not Connected",
					"reqd": 1,
					"description": (
						"Chapa is reserved for the Ethiopian payment integration. "
						"No API credentials are configured and no payment requests are sent yet."
					),
				}
			],
			"permissions": [
				{
					"role": "System Manager",
					"create": 1,
					"read": 1,
					"write": 1,
				},
				{
					"role": "Moderator",
					"create": 1,
					"read": 1,
					"write": 1,
				},
			],
		}
	).insert(ignore_permissions=True)


def set_default_currency_if_empty():
	if not frappe.db.get_single_value("LMS Settings", "default_currency"):
		frappe.db.set_single_value("LMS Settings", "default_currency", "ETB")


def disable_india_gst():
	frappe.db.set_single_value("LMS Settings", "apply_gst", 0)


def create_chapa_gateway(doc=None, method=None):
	"""Register Chapa after its placeholder settings are saved in the LMS UI."""
	if frappe.db.exists("Payment Gateway", CHAPA_GATEWAY):
		return

	frappe.get_doc(
		{
			"doctype": "Payment Gateway",
			"gateway": CHAPA_GATEWAY,
			"gateway_settings": CHAPA_SETTINGS_DOCTYPE,
			"gateway_controller": CHAPA_SETTINGS_DOCTYPE,
		}
	).insert(ignore_permissions=True)


def validate_payment_configuration(doc, method=None):
	doc.apply_gst = 0

	if doc.payment_gateway != CHAPA_GATEWAY:
		return

	frappe.throw(
		_(
			"Chapa is listed for the planned Ethiopian payment integration, but it is not connected yet. "
			"Choose another payment gateway or leave Payment Gateway empty."
		)
	)
