import frappe


def prune_orphaned_instructor_attributions():
	"""Drop instructor profile attribution rows left behind by deleted courses or batches.

	frappe.model.Document.save() validates every Link field on the whole document,
	so a single row still pointing at a since-deleted LMS Course or LMS Batch blocks
	saving unrelated attribution changes on the same profile. Run after every
	migrate so a deleted course/batch can never wedge a profile shut.
	"""
	for profile_name in frappe.get_all("Biqat Instructor Profile", pluck="name"):
		doc = frappe.get_doc("Biqat Instructor Profile", profile_name)
		changed = False

		valid_courses = valid_link_names("LMS Course", [row.course for row in doc.courses])
		kept_courses = [row for row in doc.courses if row.course in valid_courses]
		if len(kept_courses) != len(doc.courses):
			doc.set("courses", kept_courses)
			changed = True

		valid_batches = valid_link_names("LMS Batch", [row.batch for row in doc.batches])
		kept_batches = [row for row in doc.batches if row.batch in valid_batches]
		if len(kept_batches) != len(doc.batches):
			doc.set("batches", kept_batches)
			changed = True

		if changed:
			doc.save(ignore_permissions=True)


def valid_link_names(doctype: str, names: list[str]) -> set[str]:
	"""Return the subset of `names` that still exist as documents of `doctype`."""
	names = list(dict.fromkeys(name for name in names if name))
	if not names:
		return set()
	return set(frappe.get_all(doctype, filters={"name": ["in", names]}, pluck="name"))
