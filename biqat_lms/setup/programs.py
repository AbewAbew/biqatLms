from collections import Counter

import frappe


def sync_program_member_count(program: str) -> int:
	"""Recalculate one Program's stored member count from its child rows."""
	member_count = frappe.db.count(
		"LMS Program Member",
		filters={"parent": program, "parenttype": "LMS Program"},
	)
	frappe.db.set_value(
		"LMS Program",
		program,
		"member_count",
		member_count,
		update_modified=False,
	)
	return member_count


def sync_program_member_counts():
	"""Repair legacy self-enrollment rows and all Program member counters."""
	programs = set(frappe.get_all("LMS Program", pluck="name"))
	if not programs:
		return

	members = frappe.get_all(
		"LMS Program Member",
		filters={"parenttype": "LMS Program"},
		fields=["name", "parent", "parentfield"],
	)
	counts = Counter()
	for member in members:
		if member.parent not in programs:
			continue
		counts[member.parent] += 1
		if member.parentfield != "program_members":
			frappe.db.set_value(
				"LMS Program Member",
				member.name,
				"parentfield",
				"program_members",
				update_modified=False,
			)

	for program in programs:
		frappe.db.set_value(
			"LMS Program",
			program,
			"member_count",
			counts[program],
			update_modified=False,
		)
