import frappe
from frappe.tests.utils import FrappeTestCase
from lms.lms.utils import can_modify_course

from biqat_lms.api import get_course_details, get_course_experts_map, get_profile_details


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

	def test_duplicate_course_assignment_is_rejected(self):
		self.profile.append(
			"courses",
			{"course": self.course.name, "role": "Reviewer", "display_order": 20},
		)
		with self.assertRaises(frappe.ValidationError):
			self.profile.save(ignore_permissions=True)
