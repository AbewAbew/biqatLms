import frappe
from frappe.tests.utils import FrappeTestCase

from biqat_lms.api import get_courses
from biqat_lms.course_languages import (
	LANGUAGE_FIELD,
	apply_language_filter,
	can_manage_course_languages,
	list_course_languages,
	set_course_language,
)


class TestCourseLanguages(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		self.addCleanup(frappe.set_user, "Administrator")
		self.prefix = f"Language test {frappe.generate_hash(length=8)}"
		self.names = []

	def course(self, language="", **fields):
		doc = frappe.get_doc(
			{
				"doctype": "LMS Course",
				"title": f"{self.prefix} {len(self.names):02d}",
				"description": "Course language test.",
				"short_introduction": "Course language test.",
				"instructors": [{"instructor": "Administrator"}],
				"published": 1,
				LANGUAGE_FIELD: language,
				**fields,
			}
		).insert(ignore_permissions=True)
		self.names.append(doc.name)
		return doc

	def filters(self, **extra):
		return {"name": ["in", self.names], "published": 1, **extra}

	def test_languages_are_filtered_before_pagination_and_featured_selection(self):
		english = {self.course("English").name for _ in range(32)}
		featured = self.course("English", featured=1).name
		self.course("Amharic", featured=1)
		self.course("Amharic")
		self.course()
		first = get_courses(self.filters(live=1), course_language="en")
		second = get_courses(self.filters(live=1), start=30, course_language="en")
		self.assertEqual(first[0].name, featured)
		self.assertEqual(len(first), 31)
		self.assertEqual(len(second), 2)
		self.assertEqual({row.name for row in first + second}, english | {featured})
		self.assertFalse({row.name for row in first} & {row.name for row in second})

	def test_all_languages_includes_unclassified_and_preserves_public_filters(self):
		amharic = self.course("Amharic")
		english = self.course("English")
		unclassified = self.course()
		self.course("English", published=0)
		frappe.db.set_single_value("LMS Settings", "allow_guest_access", 1)
		frappe.set_user("Guest")
		self.assertEqual(
			{row.name for row in get_courses(self.filters())},
			{
				amharic.name,
				english.name,
				unclassified.name,
			},
		)
		self.assertEqual(
			[row.name for row in get_courses(self.filters(), course_language="am")], [amharic.name]
		)

	def test_invalid_language_is_rejected_and_existing_filters_are_not_mutated(self):
		filters = {"category": "Contracts", "title": ["like", "%drafting%"]}
		filtered = apply_language_filter(frappe.as_json(filters), "en")
		self.assertEqual(filtered, {**filters, LANGUAGE_FIELD: "English"})
		self.assertNotIn(LANGUAGE_FIELD, filters)
		with self.assertRaises(frappe.ValidationError):
			apply_language_filter(filters, "invalid")

	def test_staff_can_assign_clear_and_search_languages(self):
		course = self.course()
		set_course_language(course.name, "Amharic")
		self.assertTrue(can_manage_course_languages())
		result = list_course_languages(search=self.prefix)
		self.assertEqual(result["courses"][0][LANGUAGE_FIELD], "Amharic")
		self.assertFalse(result["has_more"])
		set_course_language(course.name, "")
		self.assertEqual(frappe.db.get_value("LMS Course", course.name, LANGUAGE_FIELD), "")
		with self.assertRaises(frappe.ValidationError):
			set_course_language(course.name, "Unsupported")

	def test_guest_cannot_manage_languages(self):
		course = self.course()
		frappe.set_user("Guest")
		self.assertFalse(can_manage_course_languages())
		with self.assertRaises(frappe.PermissionError):
			list_course_languages()
		with self.assertRaises(frappe.PermissionError):
			set_course_language(course.name, "English")

	def test_course_editor_can_only_manage_assigned_courses(self):
		course = self.course()
		other = self.course()
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": f"language-{frappe.generate_hash(length=8)}@example.com",
				"first_name": "Language editor",
				"send_welcome_email": 0,
			}
		).insert(ignore_permissions=True)
		course.append("instructors", {"instructor": user.name})
		course.save(ignore_permissions=True)
		frappe.set_user(user.name)
		self.assertEqual([row.name for row in list_course_languages()["courses"]], [course.name])
		set_course_language(course.name, "English")
		with self.assertRaises(frappe.PermissionError):
			set_course_language(other.name, "English")
