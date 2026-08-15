# Managed Instructor Workflow

Biqat operates as the course publisher. Lawyers and teachers provide subject
matter expertise, while Biqat's internal team structures, uploads, tests and
publishes the learning experience.

## Roles

| Participant | Platform responsibility |
| --- | --- |
| External instructor | Supplies expertise, materials and final approval |
| Biqat publishing team | Builds, edits, tests, prices and publishes courses |
| Student | Registers, enrolls, studies and completes assessments |

An external instructor does not need a Frappe User account. If the instructor
also wants to study a course, they can register as a normal `LMS Student`; that
student account is not connected to the public instructor profile.

## Why Biqat profiles are separate

Frappe Learning's standard **Instructors** field is also an authorization
mechanism. A User placed in that field receives course modification access.
Biqat therefore uses two independent relationships:

- The stock LMS instructor relation identifies internal course editors.
- **Biqat Instructor Profile** records control public attribution only.

Do not add an external teacher to the stock LMS instructor field merely to
show their name publicly.

## Create an instructor profile

An Administrator, System Manager or LMS Moderator can manage profiles without
leaving the LMS:

1. Open **Settings → Users**.
2. Find **Instructor profiles** and select **Manage instructors**.
3. Select **New instructor** or edit an existing instructor.

The Desk **Biqat Instructor Profile** form remains available as an advanced
fallback.

Complete the following fields:

- Full Name
- Professional Title
- Organization
- Contact Email (internal and never returned by the public API)
- LinkedIn URL
- Profile Photo
- Cover Image
- Biography

The profile address is generated automatically from the instructor's name.
Uploaded profile and cover images are public because they are displayed to
students.

## Assign the instructor to courses

When creating a course or editing its **Settings** tab:

1. Select the external teacher under **Instructor**.
2. The selection saves automatically. New-course selections are applied when
   the course is created.

The internal course-editor relation is intentionally hidden in the Biqat LMS.
Frappe retains the logged-in Biqat administrator as the editor automatically,
while only the managed teacher is presented in the course form and to learners.

For advanced attribution, the profile's Desk **Course Attribution** table also
allows the following public roles:

- Lead Instructor
- Instructor
- Subject Matter Expert
- Guest Lecturer
- Reviewer

Use **Display Order** when several experts belong to the same course. Lower
numbers appear first.

Saving this table changes public attribution only. It does not create a User,
assign an LMS role or grant permission to edit the course.

## Public behavior

When an enabled profile is assigned to a course:

- Course cards display the public expert rather than the internal editor.
- The course overview displays the expert's name and photograph.
- The sidebar instructor card displays role, title, organization and biography.
- Selecting the instructor opens a read-only LMS profile with the full bio.
- The stock **Course creator** heading is relabeled **Instructor**.

Disabling a profile removes it from public attribution without deleting its
biography or course assignments. If no enabled Biqat profile is assigned, the
LMS falls back to its stock editor attribution.

## Course production process

1. The instructor provides an outline, objectives, source materials, videos,
   quiz questions, biography, photograph and usage permission.
2. Biqat creates the course and retains the real editor relationship internally.
3. Biqat converts and uploads lessons, assessments, resources and captions.
4. Biqat performs editorial, legal-context and technical quality checks.
5. The instructor reviews a prepared preview and requests corrections.
6. Biqat applies corrections, configures enrollment, pricing and certification,
   and publishes the approved course.
7. Biqat manages students, support, reporting and future course revisions.

## Internal access rule

Only trusted Biqat publishing accounts should receive `Moderator`,
`Course Creator` or `System Manager` access. External instructors should remain
ordinary students or have no account at all.

## Deployment

This feature adds two DocTypes and server method overrides, so production must
run `migrate` after pulling the app:

```bash
cd "$HOME/frappe/learning-bench"
bench --site biqat.localhost backup --with-files --compress
git -C apps/biqat_lms pull --ff-only upstream main
bench --site biqat.localhost migrate
bench build --app biqat_lms
bench --site biqat.localhost clear-cache
bench restart
```
