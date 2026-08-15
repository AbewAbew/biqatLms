from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from lms.lms.utils import can_modify_course

from biqat_lms.api import (
	get_course_details,
	get_course_experts_map,
	get_created_courses,
	get_my_courses,
	get_profile_details,
	get_program_details,
	list_instructor_profiles,
	save_instructor_profile,
	set_course_instructor_profiles,
)


class TestBiqatInstructorProfile(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		test_id = frappe.generate_hash(length=8)
		self.student_email = f"managed-instructor-student-{test_id}@example.com"
		self.instructor_email = f"managed-instructor-{test_id}@example.com"
		self.course = frappe.get_doc(
			{
				"doctype": "LMS Course",
				"title": f"Managed Instructor Course {test_id}",
				"description": "A course used to verify managed instructor attribution.",
				"short_introduction": "Managed instructor test course.",
				"published": 1,
				"instructors": [{"instructor": "Administrator"}],
			}
		).insert(ignore_permissions=True)
		self.profile = frappe.get_doc(
			{
				"doctype": "Biqat Instructor Profile",
				"full_name": "Dr. Alem Example",
				"professional_title": "Senior Legal Educator",
				"organization": "Biqat Faculty Network",
				"contact_email": self.instructor_email,
				"biography": "<p>Experienced Ethiopian legal practitioner.</p>",
				"courses": [
					{
						"course": self.course.name,
						"role": "Lead Instructor",
						"display_order": 1,
					}
				],
			}
		).insert(ignore_permissions=True)
		self.student = frappe.get_doc(
			{
				"doctype": "User",
				"email": self.student_email,
				"first_name": "Managed",
				"last_name": "Student",
				"enabled": 1,
				"user_type": "Website User",
				"send_welcome_email": 0,
			}
		).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def test_profile_is_public_attribution_not_an_editor_account(self):
		self.assertTrue(self.profile.profile_slug)
		self.assertFalse(frappe.db.exists("User", {"email": self.instructor_email}))
		self.assertFalse(
			frappe.db.exists(
				"Course Instructor",
				{"parent": self.course.name, "instructor": self.student_email},
			)
		)

		frappe.set_user(self.student_email)
		self.assertFalse(can_modify_course(self.course.name))

		details = get_course_details(self.course.name)
		self.assertEqual(len(details.instructors), 1)
		self.assertEqual(details.instructors[0].full_name, self.profile.full_name)
		self.assertEqual(details.instructors[0].expert_role, "Lead Instructor")
		self.assertIn("Senior Legal Educator", details.instructors[0].bio)

	def test_expert_profile_route_returns_bio_without_private_contact_data(self):
		frappe.set_user(self.student_email)
		details = get_profile_details(f"expert-{self.profile.profile_slug}")

		self.assertEqual(details.full_name, self.profile.full_name)
		self.assertEqual(details.bio, self.profile.biography)
		self.assertEqual(details.headline, "Senior Legal Educator · Biqat Faculty Network")
		self.assertNotIn("contact_email", details)
		self.assertEqual(details.roles, [])

	def test_disabled_profiles_are_not_publicly_attributed(self):
		self.profile.enabled = 0
		self.profile.save(ignore_permissions=True)

		self.assertEqual(get_course_experts_map([self.course.name]), {})

	def test_admin_home_course_card_uses_public_instructor(self):
		stock_course = frappe._dict(
			{
				"name": self.course.name,
				"instructors": [frappe._dict({"name": "Administrator", "full_name": "Administrator"})],
			}
		)
		with patch("biqat_lms.api.lms_get_created_courses", return_value=[stock_course]):
			courses = get_created_courses()

		self.assertEqual(courses[0].instructors[0].full_name, self.profile.full_name)
		self.assertEqual(courses[0].biqat_experts[0].profile_name, self.profile.name)

	def test_student_home_course_card_uses_public_instructor(self):
		stock_course = frappe._dict(
			{
				"name": self.course.name,
				"membership": frappe._dict({"progress": 25}),
				"instructors": [frappe._dict({"name": "Administrator", "full_name": "Administrator"})],
			}
		)
		frappe.set_user(self.student_email)
		with patch("biqat_lms.api.lms_get_my_courses", return_value=[stock_course]):
			courses = get_my_courses()

		self.assertEqual(courses[0].instructors[0].full_name, self.profile.full_name)
		self.assertEqual(courses[0].membership.progress, 25)

	def test_student_program_course_card_uses_public_instructor(self):
		stock_course = frappe._dict(
			{
				"name": self.course.name,
				"instructors": [frappe._dict({"name": "Administrator", "full_name": "Administrator"})],
			}
		)
		stock_program = frappe._dict({"name": "Legal Program", "courses": [stock_course]})
		frappe.set_user(self.student_email)
		with patch("biqat_lms.api.lms_get_program_details", return_value=stock_program):
			program = get_program_details("Legal Program")

		self.assertEqual(program.courses[0].instructors[0].full_name, self.profile.full_name)
		self.assertEqual(program.courses[0].biqat_experts[0].profile_name, self.profile.name)

	def test_duplicate_course_assignment_is_rejected(self):
		self.profile.append(
			"courses",
			{"course": self.course.name, "role": "Reviewer", "display_order": 20},
		)
		with self.assertRaises(frappe.ValidationError):
			self.profile.save(ignore_permissions=True)

	def test_manager_can_create_and_edit_profile_from_lms_api(self):
		created = save_instructor_profile(
			{
				"full_name": "W/ro Selam Example",
				"professional_title": "Mediator",
				"organization": "Biqat Faculty Network",
				"contact_email": "selam@example.com",
				"biography": "<p>Accredited mediator.</p>",
			}
		)
		self.assertTrue(created.name)
		self.assertFalse(frappe.db.exists("User", "selam@example.com"))

		updated = save_instructor_profile(
			{"name": created.name, "full_name": "W/ro Selam Example", "professional_title": "Lead Mediator"}
		)
		self.assertEqual(updated.professional_title, "Lead Mediator")

		profiles = list_instructor_profiles(search="Selam")
		self.assertEqual([profile.name for profile in profiles], [created.name])

	def test_course_profile_api_changes_attribution_without_edit_access(self):
		second_profile = save_instructor_profile(
			{
				"full_name": "Ato Bekele Example",
				"professional_title": "Arbitrator",
			}
		)

		set_course_instructor_profiles(self.course.name, [second_profile.name])
		course_doc = frappe.get_doc("LMS Course", self.course.name)
		self.assertEqual([row.instructor for row in course_doc.instructors], ["Administrator"])

		profiles = list_instructor_profiles(course=self.course.name)
		selected = [profile.name for profile in profiles if profile.selected]
		self.assertEqual(selected, [second_profile.name])
		self.assertEqual(
			get_course_experts_map([self.course.name])[self.course.name][0].full_name,
			"Ato Bekele Example",
		)

	def test_student_cannot_manage_profiles(self):
		frappe.set_user(self.student_email)
		with self.assertRaises(frappe.PermissionError):
			list_instructor_profiles()
