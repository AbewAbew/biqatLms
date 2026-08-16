from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate
from lms.lms.utils import can_modify_course

from biqat_lms.api import (
	create_google_meet_live_class,
	delete_live_class,
	enroll_in_program,
	get_batch_details,
	get_batch_experts_map,
	get_course_details,
	get_course_experts_map,
	get_created_courses,
	get_my_courses,
	get_profile_details,
	get_program_details,
	list_instructor_profiles,
	save_instructor_profile,
	set_batch_instructor_profiles,
	set_course_instructor_profiles,
)
from biqat_lms.setup.instructor_profiles import prune_orphaned_instructor_attributions
from biqat_lms.setup.programs import sync_program_member_counts


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
		self.batch = frappe.get_doc(
			{
				"doctype": "LMS Batch",
				"title": f"Managed Instructor Batch {test_id}",
				"description": "A batch used to verify public teacher attribution.",
				"batch_details": "Managed instructor batch details.",
				"start_date": add_days(nowdate(), 1),
				"end_date": add_days(nowdate(), 2),
				"start_time": "10:00:00",
				"end_time": "11:00:00",
				"timezone": "Africa/Addis_Ababa",
				"medium": "Online",
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

	@patch("biqat_lms.api.lms_create_google_meet_live_class")
	def test_google_meet_live_class_inherits_batch_timezone(self, create_live_class):
		create_live_class.return_value = frappe._dict({"name": "LIVE-CLASS-TEST"})

		result = create_google_meet_live_class(
			batch_name=self.batch.name,
			google_meet_account="Biqat Google Meet",
			title="Ethiopian Arbitration Live Session",
			duration=60,
			date=add_days(nowdate(), 1),
			time="10:00:00",
		)

		self.assertEqual(result.name, "LIVE-CLASS-TEST")
		self.assertEqual(create_live_class.call_args.kwargs["timezone"], "Africa/Addis_Ababa")

	@patch("biqat_lms.api.lms_create_google_meet_live_class")
	def test_google_meet_live_class_keeps_batch_timezone(self, create_live_class):
		create_live_class.return_value = frappe._dict({"name": "LIVE-CLASS-TEST"})

		create_google_meet_live_class(
			batch_name=self.batch.name,
			google_meet_account="Biqat Google Meet",
			title="Ethiopian Arbitration Live Session",
			duration=60,
			date=add_days(nowdate(), 1),
			time="10:00:00",
			timezone="Africa/Nairobi",
		)

		self.assertEqual(create_live_class.call_args.kwargs["timezone"], "Africa/Addis_Ababa")

	@patch("biqat_lms.api.frappe.get_doc")
	@patch("biqat_lms.api.frappe.db.exists", return_value=True)
	def test_system_administrator_can_delete_live_class(self, exists, get_doc):
		live_class = get_doc.return_value
		live_class.name = "LIVE-CLASS-TEST"
		live_class.title = "Ethiopian Arbitration Live Session"

		result = delete_live_class(live_class.name)

		self.assertEqual(result["name"], live_class.name)
		live_class.delete.assert_called_once_with()

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

	def test_student_program_enrollment_updates_member_count(self):
		program = frappe.get_doc(
			{
				"doctype": "LMS Program",
				"title": f"Managed Instructor Program {frappe.generate_hash(length=8)}",
				"published": 1,
				"program_courses": [{"course": self.course.name}],
			}
		).insert(ignore_permissions=True)

		frappe.set_user(self.student_email)
		enroll_in_program(program.name)

		member = frappe.db.get_value(
			"LMS Program Member",
			{"parent": program.name, "member": self.student_email},
			"parentfield",
		)
		self.assertEqual(member, "program_members")
		self.assertEqual(frappe.db.get_value("LMS Program", program.name, "member_count"), 1)

		frappe.db.set_value("LMS Program Member", {"parent": program.name}, "parentfield", "members")
		frappe.db.set_value("LMS Program", program.name, "member_count", 0)
		sync_program_member_counts()

		self.assertEqual(
			frappe.db.get_value("LMS Program Member", {"parent": program.name}, "parentfield"),
			"program_members",
		)
		self.assertEqual(frappe.db.get_value("LMS Program", program.name, "member_count"), 1)

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

	def test_batch_profile_api_keeps_internal_manager_private(self):
		batch_doc = frappe.get_doc("LMS Batch", self.batch.name)
		self.assertEqual([row.instructor for row in batch_doc.instructors], ["Administrator"])

		set_batch_instructor_profiles(self.batch.name, [self.profile.name])
		profiles = list_instructor_profiles(batch=self.batch.name)
		self.assertEqual([profile.name for profile in profiles if profile.selected], [self.profile.name])
		self.assertEqual(
			get_batch_experts_map([self.batch.name])[self.batch.name][0].full_name,
			self.profile.full_name,
		)

		stock_details = frappe._dict(
			{
				"name": self.batch.name,
				"instructors": [
					frappe._dict({"name": "Administrator", "full_name": "Administrator"})
				],
			}
		)
		with patch("biqat_lms.api.lms_get_batch_details", return_value=stock_details):
			details = get_batch_details(self.batch.name)

		self.assertEqual(details.instructors[0].full_name, self.profile.full_name)
		self.assertEqual(details.biqat_experts[0].profile_name, self.profile.name)

	def test_managed_instructor_is_invited_to_live_class_without_a_login(self):
		set_batch_instructor_profiles(self.batch.name, [self.profile.name])
		frappe.get_doc(
			{
				"doctype": "LMS Batch Enrollment",
				"batch": self.batch.name,
				"member": self.student_email,
			}
		).insert(ignore_permissions=True)

		event = frappe.get_doc(
			{
				"doctype": "Event",
				"subject": "Test Live Class",
				"event_type": "Public",
				"starts_on": frappe.utils.now_datetime(),
			}
		).insert(ignore_permissions=True)

		live_class = frappe.get_doc({"doctype": "LMS Live Class", "batch_name": self.batch.name})
		live_class.add_event_participants(event, calendar=None)

		participants = frappe.get_all(
			"Event Participants",
			filters={"parent": event.name},
			fields=["email", "reference_doctype", "reference_docname"],
		)
		by_email = {row.email: row for row in participants}

		self.assertIn(self.instructor_email, by_email)
		self.assertEqual(by_email[self.instructor_email].reference_doctype, "Biqat Instructor Profile")
		self.assertEqual(by_email[self.instructor_email].reference_docname, self.profile.name)
		self.assertIn(self.student_email, by_email)
		self.assertFalse(frappe.db.exists("User", {"email": self.instructor_email}))

	def _create_and_orphan_batch(self):
		"""Create, attribute, then hard-delete a batch, leaving a dangling link behind.

		Mirrors production: a batch was deleted after being attributed to a
		profile, and Document.save() validates every Link field on the whole
		document, so the dangling row silently blocked all later saves.
		"""
		orphan_batch = frappe.get_doc(
			{
				"doctype": "LMS Batch",
				"title": f"Orphan Batch {frappe.generate_hash(length=8)}",
				"description": "Deleted after attribution to simulate a dangling link.",
				"batch_details": "Temporary batch for the orphaned-link regression test.",
				"start_date": add_days(nowdate(), 1),
				"end_date": add_days(nowdate(), 2),
				"start_time": "10:00:00",
				"end_time": "11:00:00",
				"timezone": "Africa/Addis_Ababa",
				"medium": "Online",
			}
		).insert(ignore_permissions=True)
		self.profile.append(
			"batches",
			{"batch": orphan_batch.name, "role": "Instructor", "display_order": 5},
		)
		self.profile.save(ignore_permissions=True)

		frappe.db.delete("LMS Batch", {"name": orphan_batch.name})
		frappe.db.delete("Course Instructor", {"parent": orphan_batch.name})
		return orphan_batch.name

	def test_stale_batch_link_does_not_block_new_attribution(self):
		orphan_batch_name = self._create_and_orphan_batch()

		set_batch_instructor_profiles(self.batch.name, [self.profile.name])

		self.assertEqual(
			get_batch_experts_map([self.batch.name])[self.batch.name][0].full_name,
			self.profile.full_name,
		)
		remaining_batches = frappe.get_doc("Biqat Instructor Profile", self.profile.name).batches
		self.assertNotIn(orphan_batch_name, [row.batch for row in remaining_batches])

	def test_migration_repair_prunes_stale_attribution_links(self):
		orphan_batch_name = self._create_and_orphan_batch()

		prune_orphaned_instructor_attributions()

		remaining_batches = frappe.get_doc("Biqat Instructor Profile", self.profile.name).batches
		self.assertNotIn(orphan_batch_name, [row.batch for row in remaining_batches])

	def test_student_cannot_manage_profiles(self):
		frappe.set_user(self.student_email)
		with self.assertRaises(frappe.PermissionError):
			list_instructor_profiles()
