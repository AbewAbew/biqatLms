from typing import Any

import frappe
from frappe.client import get_list as frappe_get_list

ALLOWED_PAYMENT_GATEWAY_SETTINGS = {"Chapa Settings", "Mpesa Settings"}


@frappe.whitelist()
def get_list(
	doctype: str,
	fields: str | list[str | dict[str, Any]] | None = None,
	filters: str | list | dict[str, Any] | None = None,
	group_by: str | list[str] | None = None,
	order_by: str | list[str] | None = None,
	limit_start: int | str | None = None,
	limit_page_length: int | str = 20,
	parent: str | None = None,
	debug: bool | int = False,
	as_dict: bool | int = True,
	or_filters: str | list[list] | dict[str, Any] | None = None,
	expand: str | list[str] | None = None,
):
	rows = frappe_get_list(
		doctype=doctype,
		fields=fields,
		filters=filters,
		group_by=group_by,
		order_by=order_by,
		limit_start=limit_start,
		limit_page_length=limit_page_length,
		parent=parent,
		debug=debug,
		as_dict=as_dict,
		or_filters=or_filters,
		expand=expand,
	)

	if doctype == "DocType" and _is_payment_gateway_settings_query(filters):
		return [row for row in rows if _row_name(row) in ALLOWED_PAYMENT_GATEWAY_SETTINGS]

	return rows


def _is_payment_gateway_settings_query(filters) -> bool:
	parsed_filters = frappe.parse_json(filters) if isinstance(filters, str) else filters

	if isinstance(parsed_filters, dict):
		return parsed_filters.get("module") == "Payment Gateways"

	for condition in parsed_filters or []:
		if not isinstance(condition, list | tuple):
			continue
		if len(condition) == 3 and condition == ["module", "=", "Payment Gateways"]:
			return True
		if len(condition) >= 4 and condition[-3:] == ["module", "=", "Payment Gateways"]:
			return True

	return False


def _row_name(row):
	if isinstance(row, dict):
		return row.get("name")
	return row[0] if row else None
