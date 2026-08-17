"""Managed-instructor and staff grading for assignments and open-ended quiz answers.

Frappe Learning only lets `PRIVILEGED_ROLES` grade a submission, and those roles
carry broad Desk access. A Biqat managed instructor is deliberately not a Frappe
User with any role at all, so grading is exposed through the narrow whitelisted
API in this module instead: every entry point resolves the caller to either
Biqat staff or exactly one enabled Biqat Instructor Profile, scopes the work to
that profile's attributed courses, and writes with `ignore_permissions`.

Both writes deliberately avoid `Document.save()`:

* `LMSAssignmentSubmission.enforce_grading_permission` reverts the grading fields
  for any caller without a privileged role, which a managed instructor never has,
  so a save would silently discard their grade.
* `LMSQuizSubmission.validate_if_max_attempts_exceeded` counts existing
  submissions including the one being saved, so re-saving a graded quiz throws
  once the learner has used their attempts.

The scoring and notification behaviour those saves would have produced is
reproduced explicitly below.
"""

import frappe
from frappe import _
from frappe.desk.doctype.notification_log.notification_log import make_notification_logs
from frappe.utils import cint, get_url, validate_email_address
from lms.lms.utils import PRIVILEGED_ROLES, get_lms_route

ASSIGNMENT_SUBMISSION = "LMS Assignment Submission"
QUIZ_RESULT = "LMS Quiz Result"
QUIZ_SUBMISSION = "LMS Quiz Submission"
INSTRUCTOR_PROFILE = "Biqat Instructor Profile"
OPEN_ENDED = "Open Ended"
ASSIGNMENT_STATUSES = {"Pass", "Fail", "Not Graded", "Not Applicable"}
UNGRADED = "Not Graded"
PENDING = "pending"
GRADED = "graded"
MAX_PENDING_ROWS = 500


# ---------------------------------------------------------------------------
# Caller resolution
# ---------------------------------------------------------------------------


def resolve_grader():
	"""Identify the caller as Biqat staff or a single managed instructor.

	Staff are unscoped. A managed instructor is recognised purely by their
	profile's private contact email matching their login, so signing in with
	Google is all the provisioning they need.
	"""
	user = frappe.session.user
	if not user or user == "Guest":
		frappe.throw(_("Please sign in to grade submissions."), frappe.PermissionError)

	if user == "Administrator" or PRIVILEGED_ROLES & set(frappe.get_roles()):
		return frappe._dict({"kind": "staff", "profile": None, "user": user})

	profile = _profile_for_user(user)
	if profile:
		return frappe._dict({"kind": "instructor", "profile": profile, "user": user})

	frappe.throw(_("You do not have permission to grade submissions."), frappe.PermissionError)


def _profile_for_user(user: str) -> str | None:
	email = (frappe.db.get_value("User", user, "email") or user or "").strip()
	if not email or not validate_email_address(email):
		return None
	return frappe.db.get_value(INSTRUCTOR_PROFILE, {"contact_email": email, "enabled": 1}, "name")


def _scoped_courses(grader) -> list[str] | None:
	"""Courses the grader may act on. None means unscoped (staff)."""
	if grader.kind == "staff":
		return None
	return frappe.get_all(
		"Biqat Instructor Course",
		filters={
			"parent": grader.profile,
			"parenttype": INSTRUCTOR_PROFILE,
			"parentfield": "courses",
		},
		pluck="course",
	)


def _assert_course_allowed(grader, course: str):
	courses = _scoped_courses(grader)
	if courses is None:
		return
	if not course or course not in courses:
		frappe.throw(
			_("You are not the assigned instructor for this course."), frappe.PermissionError
		)


def _default_attribution(course: str) -> str | None:
	"""The managed instructor a grade is credited to when none is chosen."""
	rows = frappe.get_all(
		"Biqat Instructor Course",
		filters={"course": course, "parenttype": INSTRUCTOR_PROFILE, "parentfield": "courses"},
		fields=["parent"],
		order_by="display_order asc, idx asc",
		limit_page_length=1,
	)
	return rows[0].parent if rows else None


def _resolve_attribution(grader, course: str, attributed_to: str | None) -> str | None:
	"""Whose expertise the learner sees credited for this grade.

	An instructor always credits themselves. Staff may record a grade on behalf
	of the expert who actually made the call, defaulting to the course's
	attributed instructor.
	"""
	if grader.kind == "instructor":
		return grader.profile

	if attributed_to:
		if not frappe.db.exists(INSTRUCTOR_PROFILE, {"name": attributed_to, "enabled": 1}):
			frappe.throw(_("That instructor profile is unavailable."), frappe.ValidationError)
		return attributed_to

	return _default_attribution(course)


# ---------------------------------------------------------------------------
# Read APIs
# ---------------------------------------------------------------------------


@frappe.whitelist()
def get_grading_context():
	"""Describe the signed-in grader for the LMS grading panel."""
	grader = resolve_grader()
	context = {
		"kind": grader.kind,
		"profile": grader.profile,
		"can_attribute": grader.kind == "staff",
		"notify_on_submission": 0,
		"instructors": [],
	}

	if grader.kind == "instructor":
		context["notify_on_submission"] = cint(
			frappe.db.get_value(INSTRUCTOR_PROFILE, grader.profile, "notify_on_submission")
		)
		context["full_name"] = frappe.db.get_value(INSTRUCTOR_PROFILE, grader.profile, "full_name")
	else:
		context["instructors"] = frappe.get_all(
			INSTRUCTOR_PROFILE,
			filters={"enabled": 1},
			fields=["name", "full_name"],
			order_by="full_name asc",
			limit_page_length=200,
		)

	return context


@frappe.whitelist()
def get_grading_filters():
	"""Courses and instructors the signed-in grader can filter by."""
	grader = resolve_grader()
	courses = _scoped_courses(grader)

	course_filters = {}
	if courses is not None:
		if not courses:
			return {"courses": [], "instructors": []}
		course_filters["name"] = ["in", courses]

	options = {
		"courses": frappe.get_all(
			"LMS Course",
			filters=course_filters,
			fields=["name", "title"],
			order_by="title asc",
			limit_page_length=500,
		),
		"instructors": [],
	}
	if grader.kind == "staff":
		options["instructors"] = frappe.get_all(
			INSTRUCTOR_PROFILE,
			filters={"enabled": 1},
			fields=["name", "full_name"],
			order_by="full_name asc",
			limit_page_length=200,
		)
	return options


@frappe.whitelist()
def get_pending_count():
	"""Total items awaiting review, for the sidebar badge."""
	grader = resolve_grader()
	courses = _scoped_courses(grader)
	if courses is not None and not courses:
		return {"count": 0}

	rows = _assignment_rows(courses, PENDING, None) + _quiz_rows(courses, PENDING, None)
	return {"count": len(rows)}


@frappe.whitelist()
def list_gradings(
	course: str | None = None,
	instructor: str | None = None,
	status: str = PENDING,
	kind: str | None = None,
	search: str | None = None,
	start: int | str = 0,
	page_length: int | str = 20,
):
	"""One page of assignment submissions and open-ended quiz answers.

	Both kinds are merged into a single list ordered oldest-first so the queue
	is worked in the order learners submitted, and so paging behaves sensibly
	across the two sources. Each source is capped at `MAX_PENDING_ROWS` before
	merging; the cap is high enough for a realistic backlog and keeps the query
	simple, and the reported total says when it has been reached.
	"""
	grader = resolve_grader()
	if status not in {PENDING, GRADED, "all"}:
		frappe.throw(_("Invalid status filter."), frappe.ValidationError)

	courses = _visible_courses(grader, course, instructor)
	if courses is not None and not courses:
		return {"rows": [], "total": 0, "has_more": False}

	rows = []
	if kind in (None, "", "assignment"):
		rows.extend(_assignment_rows(courses, status, search))
	if kind in (None, "", "quiz"):
		rows.extend(_quiz_rows(courses, status, search))

	rows.sort(key=lambda row: str(row.get("submitted") or ""))
	total = len(rows)
	start = max(cint(start), 0)
	page_length = cint(page_length) or 20

	return {
		"rows": rows[start : start + page_length],
		"total": total,
		"has_more": start + page_length < total,
	}


def _visible_courses(grader, course: str | None, instructor: str | None) -> list[str] | None:
	"""Intersect the grader's own scope with any course/instructor filter."""
	selections = []
	scoped = _scoped_courses(grader)
	if scoped is not None:
		selections.append(scoped)
	if instructor:
		selections.append(_courses_for_profile(instructor))
	if course:
		selections.append([course])

	if not selections:
		return None

	allowed = set(selections[0])
	for selection in selections[1:]:
		allowed &= set(selection)
	return sorted(allowed)


def _courses_for_profile(profile: str) -> list[str]:
	return frappe.get_all(
		"Biqat Instructor Course",
		filters={"parent": profile, "parenttype": INSTRUCTOR_PROFILE, "parentfield": "courses"},
		pluck="course",
	)


def _assignment_rows(courses: list[str] | None, status: str, search: str | None) -> list[dict]:
	filters = {}
	if status == PENDING:
		filters["status"] = UNGRADED
	elif status == GRADED:
		filters["status"] = ["!=", UNGRADED]
	if courses is not None:
		filters["course"] = ["in", courses]

	or_filters = None
	if search:
		term = f"%{search.strip()}%"
		or_filters = {
			"member_name": ["like", term],
			"member": ["like", term],
			"assignment_title": ["like", term],
		}

	rows = frappe.get_all(
		ASSIGNMENT_SUBMISSION,
		filters=filters,
		or_filters=or_filters,
		fields=[
			"name",
			"assignment",
			"assignment_title",
			"course",
			"member",
			"member_name",
			"question",
			"answer",
			"type",
			"assignment_attachment",
			"status",
			"comments",
			"biqat_attributed_instructor",
			"creation",
		],
		order_by="creation asc",
		limit_page_length=MAX_PENDING_ROWS,
	)
	_attach_course_titles(rows)
	_attach_instructor_names(rows)

	return [
		{
			"kind": "assignment",
			"id": row.name,
			"title": row.assignment_title,
			"learner": row.member_name or row.member,
			"course": row.course,
			"course_title": row.course_title,
			"submitted": row.creation,
			"status": row.status,
			"prompt": row.question,
			"answer": row.answer,
			"attachment": row.assignment_attachment,
			"feedback": row.comments,
			"attributed_instructor": row.biqat_attributed_instructor,
			"attributed_instructor_name": row.attributed_instructor_name,
		}
		for row in rows
	]


def _quiz_rows(courses: list[str] | None, status: str, search: str | None) -> list[dict]:
	conditions = ""
	values: list = [QUIZ_SUBMISSION, OPEN_ENDED]

	if status == PENDING:
		conditions += " AND IFNULL(result.biqat_graded, 0) = 0"
	elif status == GRADED:
		conditions += " AND IFNULL(result.biqat_graded, 0) = 1"

	if courses is not None:
		placeholders = ", ".join(["%s"] * len(courses))
		conditions += f" AND submission.course IN ({placeholders})"
		values.extend(courses)

	if search:
		term = f"%{search.strip()}%"
		conditions += (
			" AND (submission.member_name LIKE %s OR submission.member LIKE %s"
			" OR submission.quiz_title LIKE %s)"
		)
		values.extend([term, term, term])

	values.append(MAX_PENDING_ROWS)

	rows = frappe.db.sql(
		f"""
			SELECT
				result.name AS quiz_result,
				result.question,
				result.answer,
				result.marks,
				result.marks_out_of,
				result.biqat_graded,
				result.biqat_feedback,
				result.biqat_attributed_instructor,
				submission.quiz_title,
				submission.course,
				COALESCE(course.title, submission.course) AS course_title,
				submission.member,
				submission.member_name,
				submission.creation
			FROM `tab{QUIZ_RESULT}` AS result
			INNER JOIN `tab{QUIZ_SUBMISSION}` AS submission
				ON submission.name = result.parent
			INNER JOIN `tabLMS Question` AS question
				ON question.name = result.question_name
			LEFT JOIN `tabLMS Course` AS course
				ON course.name = submission.course
			WHERE result.parenttype = %s
				AND result.parentfield = 'result'
				AND question.type = %s
				{conditions}
			ORDER BY submission.creation ASC
			LIMIT %s
		""",
		tuple(values),
		as_dict=True,
	)
	_attach_instructor_names(rows)

	return [
		{
			"kind": "quiz",
			"id": row.quiz_result,
			"title": row.quiz_title,
			"learner": row.member_name or row.member,
			"course": row.course,
			"course_title": row.course_title,
			"submitted": row.creation,
			"status": _("Graded") if row.biqat_graded else UNGRADED,
			"prompt": row.question,
			"answer": row.answer,
			"marks": row.marks,
			"marks_out_of": row.marks_out_of,
			"feedback": row.biqat_feedback,
			"attributed_instructor": row.biqat_attributed_instructor,
			"attributed_instructor_name": row.attributed_instructor_name,
		}
		for row in rows
	]


def _attach_course_titles(rows: list) -> None:
	"""Resolve course titles in one query so the queue can group by course."""
	names = list({row.get("course") for row in rows if row.get("course")})
	if not names:
		return
	titles = dict(
		frappe.get_all(
			"LMS Course", filters={"name": ["in", names]}, fields=["name", "title"], as_list=True
		)
	)
	for row in rows:
		row["course_title"] = titles.get(row.get("course")) or row.get("course")


def _attach_instructor_names(rows: list) -> None:
	"""Show who a graded item is credited to without a per-row lookup."""
	names = list({row.get("biqat_attributed_instructor") for row in rows if row.get("biqat_attributed_instructor")})
	titles = (
		dict(
			frappe.get_all(
				INSTRUCTOR_PROFILE,
				filters={"name": ["in", names]},
				fields=["name", "full_name"],
				as_list=True,
			)
		)
		if names
		else {}
	)
	for row in rows:
		row["attributed_instructor_name"] = titles.get(row.get("biqat_attributed_instructor"))


# ---------------------------------------------------------------------------
# Write APIs
# ---------------------------------------------------------------------------


@frappe.whitelist()
def grade_assignment_submission(
	submission: str, status: str, comments: str | None = None, attributed_to: str | None = None
):
	"""Record a grade without tripping the stock role check.

	`enforce_grading_permission` reverts these fields for any caller lacking a
	privileged role, so the write goes through `db.set_value` and the learner
	notification `validate_status` would have raised is sent explicitly.
	"""
	grader = resolve_grader()
	if status not in ASSIGNMENT_STATUSES:
		frappe.throw(_("Invalid grade."), frappe.ValidationError)

	doc = frappe.db.get_value(
		ASSIGNMENT_SUBMISSION,
		submission,
		["name", "course", "member", "assignment", "assignment_title"],
		as_dict=True,
	)
	if not doc:
		frappe.throw(_("Submission not found."), frappe.DoesNotExistError)

	_assert_course_allowed(grader, doc.course)
	attribution = _resolve_attribution(grader, doc.course, attributed_to)

	frappe.db.set_value(
		ASSIGNMENT_SUBMISSION,
		submission,
		{
			"status": status,
			"comments": comments,
			"biqat_attributed_instructor": attribution,
			"biqat_graded_by": grader.user,
		},
	)

	_notify_learner_of_assignment_grade(doc, status, attribution)
	return {"name": submission, "status": status}


@frappe.whitelist()
def grade_quiz_answer(
	quiz_result: str,
	marks: int | str,
	feedback: str | None = None,
	attributed_to: str | None = None,
):
	"""Score one open-ended answer and roll the total up to its submission.

	Written field-by-field because re-saving the parent runs
	`validate_if_max_attempts_exceeded`, which counts the submission being saved
	and throws once the learner has used their attempts.
	"""
	grader = resolve_grader()
	row = frappe.db.get_value(
		QUIZ_RESULT,
		quiz_result,
		["name", "parent", "marks_out_of"],
		as_dict=True,
	)
	if not row:
		frappe.throw(_("Answer not found."), frappe.DoesNotExistError)

	submission = frappe.db.get_value(
		QUIZ_SUBMISSION,
		row.parent,
		["name", "course", "member", "quiz_title", "score_out_of"],
		as_dict=True,
	)
	if not submission:
		frappe.throw(_("Quiz submission not found."), frappe.DoesNotExistError)

	_assert_course_allowed(grader, submission.course)
	attribution = _resolve_attribution(grader, submission.course, attributed_to)

	marks = cint(marks)
	if marks < 0 or marks > cint(row.marks_out_of):
		frappe.throw(
			_("Marks must be between 0 and {0}.").format(cint(row.marks_out_of)),
			frappe.ValidationError,
		)

	frappe.db.set_value(
		QUIZ_RESULT,
		quiz_result,
		{
			"marks": marks,
			"biqat_graded": 1,
			"biqat_feedback": feedback,
			"biqat_attributed_instructor": attribution,
			"biqat_graded_by": grader.user,
		},
	)
	_recalculate_quiz_score(submission)

	if not _has_ungraded_open_ended(submission.name):
		_notify_learner_of_quiz_result(submission, attribution)

	return {"name": quiz_result, "marks": marks}


def _recalculate_quiz_score(submission) -> None:
	"""Reproduce `validate_marks`/`set_percentage` without saving the parent."""
	score = cint(
		frappe.db.sql(
			f"SELECT SUM(marks) FROM `tab{QUIZ_RESULT}` WHERE parent = %s AND parenttype = %s",
			(submission.name, QUIZ_SUBMISSION),
		)[0][0]
	)
	values = {"score": score}
	if score and cint(submission.score_out_of):
		values["percentage"] = (score / cint(submission.score_out_of)) * 100

	frappe.db.set_value(QUIZ_SUBMISSION, submission.name, values)


def _has_ungraded_open_ended(submission: str) -> bool:
	return bool(
		frappe.db.sql(
			f"""
				SELECT result.name
				FROM `tab{QUIZ_RESULT}` AS result
				INNER JOIN `tabLMS Question` AS question
					ON question.name = result.question_name
				WHERE result.parent = %s
					AND result.parenttype = %s
					AND question.type = %s
					AND IFNULL(result.biqat_graded, 0) = 0
				LIMIT 1
			""",
			(submission, QUIZ_SUBMISSION, OPEN_ENDED),
		)
	)


@frappe.whitelist()
def set_my_notification_preference(enabled: int | str):
	"""Let a managed instructor mute or unmute their own submission alerts."""
	grader = resolve_grader()
	if grader.kind != "instructor":
		frappe.throw(
			_("Only a managed instructor has a personal notification preference."),
			frappe.ValidationError,
		)

	enabled = 1 if cint(enabled) else 0
	frappe.db.set_value(INSTRUCTOR_PROFILE, grader.profile, "notify_on_submission", enabled)
	return {"notify_on_submission": enabled}


# ---------------------------------------------------------------------------
# Learner notifications
# ---------------------------------------------------------------------------


def _notify_learner_of_assignment_grade(doc, status: str, attribution: str | None) -> None:
	reviewer = _attribution_name(attribution)
	make_notification_logs(
		frappe._dict(
			{
				"subject": _("{0} has reviewed your assignment {1}").format(
					frappe.bold(reviewer), frappe.bold(doc.assignment_title or "")
				),
				"email_content": _("Your submission has been graded: {0}.").format(status),
				"document_type": ASSIGNMENT_SUBMISSION,
				"document_name": doc.name,
				"from_user": None,
				"type": "Alert",
				"link": get_lms_route(f"assignment-submission/{doc.assignment}/{doc.name}"),
			}
		),
		[doc.member],
	)


def _notify_learner_of_quiz_result(submission, attribution: str | None) -> None:
	reviewer = _attribution_name(attribution)
	make_notification_logs(
		frappe._dict(
			{
				"subject": _("{0} has reviewed your quiz {1}").format(
					frappe.bold(reviewer), frappe.bold(submission.quiz_title or "")
				),
				"email_content": _("Your answers have been reviewed and your score is updated."),
				"document_type": QUIZ_SUBMISSION,
				"document_name": submission.name,
				"from_user": None,
				"type": "Alert",
				"link": "",
			}
		),
		[submission.member],
	)


def _attribution_name(attribution: str | None) -> str:
	"""Never fall back to the internal grader's account name."""
	if attribution:
		name = frappe.db.get_value(INSTRUCTOR_PROFILE, attribution, "full_name")
		if name:
			return name
	brand = frappe.db.get_single_value("Website Settings", "app_name") or "Biqat"
	return _("The {0} team").format(brand)


# ---------------------------------------------------------------------------
# Instructor alerts on new submissions (doc_events)
# ---------------------------------------------------------------------------


def notify_instructor_of_assignment(doc, method=None):
	"""Alert the course's managed instructors that work is waiting."""
	_alert_instructors(
		course=doc.course,
		subject=_("New assignment submission to review"),
		detail=_("{0} submitted {1}.").format(doc.member_name or doc.member, doc.assignment_title or ""),
	)


def notify_instructor_of_quiz(doc, method=None):
	"""Alert only when a quiz actually contains work a human must review."""
	if not _submission_has_open_ended(doc.name):
		return
	_alert_instructors(
		course=doc.course,
		subject=_("New quiz answers to review"),
		detail=_("{0} submitted {1}.").format(doc.member_name or doc.member, doc.quiz_title or ""),
	)


def _submission_has_open_ended(submission: str) -> bool:
	return bool(
		frappe.db.sql(
			f"""
				SELECT result.name
				FROM `tab{QUIZ_RESULT}` AS result
				INNER JOIN `tabLMS Question` AS question
					ON question.name = result.question_name
				WHERE result.parent = %s
					AND result.parenttype = %s
					AND question.type = %s
				LIMIT 1
			""",
			(submission, QUIZ_SUBMISSION, OPEN_ENDED),
		)
	)


def _alert_instructors(course: str, subject: str, detail: str) -> None:
	"""Email the attributed instructors who have opted in.

	Alerts are opt-in per profile so an instructor on a large cohort is not
	emailed on every submission.
	"""
	if not course:
		return

	recipients = frappe.db.sql(
		f"""
			SELECT profile.contact_email
			FROM `tabBiqat Instructor Course` AS assignment
			INNER JOIN `tab{INSTRUCTOR_PROFILE}` AS profile
				ON profile.name = assignment.parent
			WHERE assignment.parenttype = %s
				AND assignment.parentfield = 'courses'
				AND assignment.course = %s
				AND profile.enabled = 1
				AND IFNULL(profile.notify_on_submission, 0) = 1
				AND IFNULL(profile.contact_email, '') != ''
		""",
		(INSTRUCTOR_PROFILE, course),
		pluck=True,
	)
	recipients = [email for email in dict.fromkeys(recipients) if validate_email_address(email)]
	if not recipients:
		return

	course_title = frappe.db.get_value("LMS Course", course, "title") or course
	grading_url = get_url(get_lms_route("grading"))
	frappe.sendmail(
		recipients=recipients,
		subject=subject,
		content=f"""
			<p>{frappe.utils.escape_html(detail)}</p>
			<p>{_("Course")}: <strong>{frappe.utils.escape_html(course_title)}</strong></p>
			<p><a href="{grading_url}">{_("Open the grading queue")}</a></p>
		""",
		now=False,
	)
