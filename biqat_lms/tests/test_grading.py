from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from biqat_lms.grading import (
	get_grading_context,
	grade_assignment_submission,
	grade_quiz_answer,
	list_pending_gradings,
	notify_instructor_of_assignment,
	set_my_notification_preference,
)


class TestBiqatGrading(FrappeTestCase):
	def setUp(self):
		super().setUp()
		frappe.set_user("Administrator")
		test_id = frappe.generate_hash(length=8)
		self.instructor_email = f"grading-instructor-{test_id}@example.com"
		self.outsider_email = f"grading-outsider-{test_id}@example.com"
		self.student_email = f"grading-student-{test_id}@example.com"

		self.course = frappe.get_doc(
			{
				"doctype": "LMS Course",
				"title": f"Grading Course {test_id}",
				"description": "Course used to verify managed instructor grading.",
				"short_introduction": "Grading test course.",
				"published": 1,
				"instructors": [{"instructor": "Administrator"}],
			}
		).insert(ignore_permissions=True)

		self.other_course = frappe.get_doc(
			{
				"doctype": "LMS Course",
				"title": f"Unassigned Course {test_id}",
				"description": "A course this instructor is not attributed to.",
				"short_introduction": "Out of scope course.",
				"published": 1,
				"instructors": [{"instructor": "Administrator"}],
			}
		).insert(ignore_permissions=True)

		self.profile = frappe.get_doc(
			{
				"doctype": "Biqat Instructor Profile",
				"full_name": "Dr. Grading Expert",
				"contact_email": self.instructor_email,
				"enabled": 1,
				"courses": [{"course": self.course.name, "role": "Instructor", "display_order": 1}],
			}
		).insert(ignore_permissions=True)

		for email, first_name in (
			(self.instructor_email, "Grading"),
			(self.outsider_email, "Outsider"),
			(self.student_email, "Student"),
		):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": email,
					"first_name": first_name,
					"enabled": 1,
					"user_type": "Website User",
					"send_welcome_email": 0,
				}
			).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")
		super().tearDown()

	def _create_assignment_submission(self, course=None):
		course = course or self.course.name
		assignment = frappe.get_doc(
			{
				"doctype": "LMS Assignment",
				"title": f"Assignment {frappe.generate_hash(length=6)}",
				"type": "Text",
				"question": "<p>Explain the doctrine.</p>",
				"course": course,
			}
		).insert(ignore_permissions=True)

		return frappe.get_doc(
			{
				"doctype": "LMS Assignment Submission",
				"assignment": assignment.name,
				"assignment_title": assignment.title,
				"course": course,
				"member": self.student_email,
				"type": "Text",
				"answer": "<p>The learner's answer.</p>",
				"status": "Not Graded",
			}
		).insert(ignore_permissions=True)

	def _create_open_ended_quiz_submission(self, course=None):
		course = course or self.course.name
		question = frappe.get_doc(
			{
				"doctype": "LMS Question",
				"question": "Discuss the enforceability of the clause.",
				"type": "Open Ended",
			}
		).insert(ignore_permissions=True)

		quiz = frappe.get_doc(
			{
				"doctype": "LMS Quiz",
				"title": f"Quiz {frappe.generate_hash(length=6)}",
				"course": course,
				"max_attempts": 1,
				"total_marks": 10,
				"passing_percentage": 50,
				"questions": [{"question": question.name, "marks": 10, "type": "Open Ended"}],
			}
		).insert(ignore_permissions=True)

		submission = frappe.get_doc(
			{
				"doctype": "LMS Quiz Submission",
				"quiz": quiz.name,
				"quiz_title": quiz.title,
				"course": course,
				"member": self.student_email,
				"score_out_of": 10,
				"percentage": 0,
				"passing_percentage": 50,
				"result": [
					{
						"question": question.question,
						"question_name": question.name,
						"answer": "The learner's essay answer.",
						"is_correct": 0,
						"marks": 0,
						"marks_out_of": 10,
					}
				],
			}
		).insert(ignore_permissions=True)
		return submission

	# -- caller resolution ------------------------------------------------

	def test_instructor_is_recognised_by_profile_contact_email(self):
		frappe.set_user(self.instructor_email)
		context = get_grading_context()

		self.assertEqual(context["kind"], "instructor")
		self.assertEqual(context["profile"], self.profile.name)
		self.assertFalse(context["can_attribute"])

	def test_staff_are_unscoped_and_may_attribute(self):
		frappe.set_user("Administrator")
		context = get_grading_context()

		self.assertEqual(context["kind"], "staff")
		self.assertTrue(context["can_attribute"])
		self.assertIn(self.profile.name, [row["name"] for row in context["instructors"]])

	def test_unrelated_user_cannot_reach_the_grading_queue(self):
		frappe.set_user(self.outsider_email)
		with self.assertRaises(frappe.PermissionError):
			list_pending_gradings()

	def test_disabled_profile_loses_grading_access(self):
		self.profile.enabled = 0
		self.profile.save(ignore_permissions=True)

		frappe.set_user(self.instructor_email)
		with self.assertRaises(frappe.PermissionError):
			list_pending_gradings()

	# -- queue scoping ----------------------------------------------------

	def test_instructor_queue_is_limited_to_attributed_courses(self):
		mine = self._create_assignment_submission()
		theirs = self._create_assignment_submission(course=self.other_course.name)

		frappe.set_user(self.instructor_email)
		pending = list_pending_gradings()

		names = [row["name"] for row in pending["assignments"]]
		self.assertIn(mine.name, names)
		self.assertNotIn(theirs.name, names)

	def test_open_ended_answers_appear_in_the_queue(self):
		submission = self._create_open_ended_quiz_submission()

		frappe.set_user(self.instructor_email)
		pending = list_pending_gradings()

		self.assertEqual(len(pending["quiz_answers"]), 1)
		self.assertEqual(pending["quiz_answers"][0].submission, submission.name)

	# -- assignment grading ----------------------------------------------

	def test_instructor_grade_survives_the_stock_permission_check(self):
		"""enforce_grading_permission reverts grading fields for unprivileged
		callers, so a managed instructor's grade must not be written via save()."""
		submission = self._create_assignment_submission()

		frappe.set_user(self.instructor_email)
		grade_assignment_submission(submission.name, "Pass", "Well argued.")

		stored = frappe.db.get_value(
			"LMS Assignment Submission",
			submission.name,
			["status", "comments", "biqat_attributed_instructor", "biqat_graded_by"],
			as_dict=True,
		)
		self.assertEqual(stored.status, "Pass")
		self.assertEqual(stored.comments, "Well argued.")
		self.assertEqual(stored.biqat_attributed_instructor, self.profile.name)
		self.assertEqual(stored.biqat_graded_by, self.instructor_email)

	def test_instructor_cannot_grade_a_course_they_do_not_teach(self):
		submission = self._create_assignment_submission(course=self.other_course.name)

		frappe.set_user(self.instructor_email)
		with self.assertRaises(frappe.PermissionError):
			grade_assignment_submission(submission.name, "Pass")

		self.assertEqual(
			frappe.db.get_value("LMS Assignment Submission", submission.name, "status"),
			"Not Graded",
		)

	def test_staff_grade_defaults_to_the_courses_managed_instructor(self):
		submission = self._create_assignment_submission()

		frappe.set_user("Administrator")
		grade_assignment_submission(submission.name, "Pass", "Recorded for the expert.")

		stored = frappe.db.get_value(
			"LMS Assignment Submission",
			submission.name,
			["biqat_attributed_instructor", "biqat_graded_by"],
			as_dict=True,
		)
		self.assertEqual(stored.biqat_attributed_instructor, self.profile.name)
		self.assertEqual(stored.biqat_graded_by, "Administrator")

	def test_learner_notification_credits_the_instructor_not_the_internal_account(self):
		submission = self._create_assignment_submission()

		frappe.set_user("Administrator")
		with patch("biqat_lms.grading.make_notification_logs") as make_logs:
			grade_assignment_submission(submission.name, "Pass")

		notification = make_logs.call_args[0][0]
		self.assertIn(self.profile.full_name, notification.subject)
		self.assertNotIn("Administrator", notification.subject)
		self.assertIsNone(notification.from_user)
		self.assertEqual(make_logs.call_args[0][1], [self.student_email])

	def test_invalid_grade_is_rejected(self):
		submission = self._create_assignment_submission()

		frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):
			grade_assignment_submission(submission.name, "Excellent")

	# -- quiz grading -----------------------------------------------------

	def test_grading_an_open_ended_answer_rolls_up_the_score(self):
		"""Re-saving the parent would trip validate_if_max_attempts_exceeded, so
		the score roll-up is reproduced without a document save."""
		submission = self._create_open_ended_quiz_submission()
		result = frappe.db.get_value("LMS Quiz Result", {"parent": submission.name}, "name")

		frappe.set_user(self.instructor_email)
		grade_quiz_answer(result, 8, "Good reasoning.")

		stored = frappe.db.get_value(
			"LMS Quiz Result",
			result,
			["marks", "biqat_graded", "biqat_feedback", "biqat_attributed_instructor"],
			as_dict=True,
		)
		self.assertEqual(stored.marks, 8)
		self.assertEqual(stored.biqat_graded, 1)
		self.assertEqual(stored.biqat_feedback, "Good reasoning.")
		self.assertEqual(stored.biqat_attributed_instructor, self.profile.name)

		parent = frappe.db.get_value(
			"LMS Quiz Submission", submission.name, ["score", "percentage"], as_dict=True
		)
		self.assertEqual(parent.score, 8)
		self.assertEqual(parent.percentage, 80)

	def test_graded_answers_leave_the_queue(self):
		submission = self._create_open_ended_quiz_submission()
		result = frappe.db.get_value("LMS Quiz Result", {"parent": submission.name}, "name")

		frappe.set_user(self.instructor_email)
		grade_quiz_answer(result, 5)

		self.assertEqual(list_pending_gradings()["quiz_answers"], [])

	def test_marks_cannot_exceed_the_allotted_total(self):
		submission = self._create_open_ended_quiz_submission()
		result = frappe.db.get_value("LMS Quiz Result", {"parent": submission.name}, "name")

		frappe.set_user(self.instructor_email)
		with self.assertRaises(frappe.ValidationError):
			grade_quiz_answer(result, 50)

	# -- notification preference -----------------------------------------

	def test_submission_alert_is_opt_in(self):
		submission = self._create_assignment_submission()
		doc = frappe.get_doc("LMS Assignment Submission", submission.name)

		with patch("biqat_lms.grading.frappe.sendmail") as sendmail:
			notify_instructor_of_assignment(doc)
		self.assertFalse(sendmail.called)

		frappe.db.set_value(
			"Biqat Instructor Profile", self.profile.name, "notify_on_submission", 1
		)
		with patch("biqat_lms.grading.frappe.sendmail") as sendmail:
			notify_instructor_of_assignment(doc)

		self.assertTrue(sendmail.called)
		self.assertEqual(sendmail.call_args.kwargs["recipients"], [self.instructor_email])

	def test_instructor_can_mute_their_own_alerts(self):
		frappe.set_user(self.instructor_email)

		set_my_notification_preference(1)
		self.assertEqual(
			frappe.db.get_value(
				"Biqat Instructor Profile", self.profile.name, "notify_on_submission"
			),
			1,
		)

		set_my_notification_preference(0)
		self.assertEqual(
			frappe.db.get_value(
				"Biqat Instructor Profile", self.profile.name, "notify_on_submission"
			),
			0,
		)
