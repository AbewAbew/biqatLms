import re

import frappe
from frappe import _
from frappe.model.document import Document

SLUG_SEPARATOR = re.compile(r"[^a-z0-9]+")


class BiqatInstructorProfile(Document):
	def validate(self):
		self.full_name = (self.full_name or "").strip()
		self.profile_slug = self._get_unique_slug(self.profile_slug or self.full_name)
		self._validate_course_assignments()

	def _get_unique_slug(self, value: str) -> str:
		base_slug = SLUG_SEPARATOR.sub("-", value.lower()).strip("-") or "instructor"
		candidate = base_slug
		suffix = 2

		filters = {"profile_slug": candidate}
		if self.name:
			filters["name"] = ["!=", self.name]

		while frappe.db.exists("Biqat Instructor Profile", filters):
			candidate = f"{base_slug}-{suffix}"
			filters["profile_slug"] = candidate
			suffix += 1

		return candidate

	def _validate_course_assignments(self):
		assigned_courses = set()
		for row in self.courses:
			if row.course in assigned_courses:
				frappe.throw(_("Course {0} is assigned more than once.").format(frappe.bold(row.course)))
			assigned_courses.add(row.course)
			row.role = (row.role or _("Instructor")).strip()
			if row.display_order is None:
				row.display_order = 10
