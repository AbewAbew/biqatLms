# Biqat Learning Implementation and Operations Record

Last updated: 16 August 2026

This document records the Frappe Learning installation, infrastructure work,
upgrades, customizations, production fixes, and operating procedures completed
during the initial Biqat LMS implementation. It is intended to be the detailed
technical handover for development and production operations.

Do not place passwords, private keys, OAuth secrets, Cloudflare tokens, Chapa
credentials, database dumps, or private learner information in this file or
anywhere else in Git.

## 1. Project objective

Biqat Learning is an Ethiopian legal-education platform built on Frappe
Learning. Biqat controls the technical publishing process: legal instructors
provide expertise and course materials, while the Biqat team creates, edits,
tests, publishes, and supports the courses.

The implementation has four important design decisions:

1. Use native Frappe Bench locally and in production, without Docker in the
   production VM.
2. Keep reusable customizations in the `biqat_lms` Git repository while keeping
   users, courses, files, enrollments, and other runtime data in the site
   database and file storage.
3. Keep this LMS database isolated from the other Frappe/ERPNext project in the
   WSL environment.
4. Test locally, commit directly to GitHub `main`, and pull the tested custom app
   into production. No branch is created unless explicitly requested.

## 2. Architecture

### 2.1 Source and runtime separation

| Layer | Location | Purpose |
| --- | --- | --- |
| Local development | WSL, `/home/solskjaer/biqat/learning-bench` | Development, migrations, builds, and tests |
| Local site | `learning.localhost` | Local functional testing |
| Local database | Dedicated MariaDB container on `127.0.0.1:3307` | Isolates this LMS from other Frappe projects |
| Custom source | `apps/biqat_lms` | Version-controlled Biqat app |
| GitHub | `AbewAbew/biqatLms`, branch `main` | Deployment source for the custom app |
| Production | Google Cloud VM `biqat-lms-prod` | Public native-Bench deployment |
| Production site | `biqat.localhost` | Internal Frappe site name |
| Public URL | `https://biqat.lexprime.et/lms` | Learner and administrator LMS address |

Git does not contain the site database, course content, uploaded images,
student records, enrollments, certificates, or private files. Those require
separate database and file backups.

### 2.2 Pinned and required software versions

| Component | Pinned, tested, or required version |
| --- | --- |
| Ubuntu | 24.04 LTS, x86-64 |
| Frappe Framework | `v15.118.0` |
| Frappe Learning | `v2.60.1` |
| Payments | `version-15` |
| Biqat Learning | `main` |
| Python | 3.12 |
| Node.js | 22 |
| Yarn | 1.22 |
| Bench CLI | 5.31.0 |
| MariaDB | 10.11 |
| Redis | 7 |
| Nginx | 1.24 |
| wkhtmltopdf | 0.12.6.1 with patched Qt; host installation still requires final verification |

Do not run an unreviewed `bench update` in production. The LMS, Frappe, and
Payments versions must be upgraded deliberately and tested together.

## 3. Local WSL setup

The LMS uses its own Bench and database endpoint so it does not mix with the
existing Frappe/ERPNext project.

Start the local database and Bench:

```bash
cd /home/solskjaer/biqat
docker compose up -d database

cd /home/solskjaer/biqat/learning-bench
bench start
```

Open:

```text
http://learning.localhost:8100/lms
```

Relevant local ports include:

| Service | Address |
| --- | --- |
| LMS web | `127.0.0.1:8100` |
| Socket.IO | Bench-managed local port |
| Dedicated MariaDB | `127.0.0.1:3307` |

If the frontend works but Socket.IO shows connection errors, confirm the full
`bench start` process is running rather than only `bench serve`.

## 4. Google Cloud production infrastructure

### 4.1 VM and network

| Setting | Value |
| --- | --- |
| Google Cloud project | `wired-record-505513-s7` |
| VM | `biqat-lms-prod` |
| Zone | `africa-south1-c` |
| Static address resource | `biqat-lms-prod-ip` |
| Static external IP | `34.35.7.236` |
| Network tag | `biqat-lms-prod` |
| Web firewall rule | `biqat-lms-web` |
| Public web ports | TCP 80 and 443 |

Direct public SSH troubleshooting reported the VM as unreachable even though
the VM itself was healthy. Google Cloud IAP is therefore the working SSH path:

```bash
gcloud compute ssh biqat-lms-prod \
  --zone=africa-south1-c \
  --tunnel-through-iap
```

Cloud Shell is not the VM. Its PID 1 was `bash`, so `systemctl` correctly failed
there with “System has not been booted with systemd.” Always confirm the target
before installing or managing services:

```bash
hostname
whoami
ps -p 1 -o comm=
cat /etc/os-release | grep PRETTY_NAME
```

On the actual VM, PID 1 is systemd and service commands work normally.

### 4.2 Installed host services and tools

The production VM contains:

- MariaDB server and client
- Redis
- Nginx
- Supervisor
- Cron
- Fail2ban
- Git and build tools
- Python 3.12 development and virtual-environment packages
- Node.js 22 through NVM
- Yarn 1.22
- `uv` and Bench CLI
- Xvfb and font libraries used by PDF generation

Representative prerequisite installation:

```bash
sudo apt update
sudo apt install -y \
  git curl build-essential pkg-config \
  python3-dev python3-venv \
  libmariadb-dev mariadb-server mariadb-client \
  redis-server nginx supervisor cron \
  libffi-dev libssl-dev xvfb libfontconfig1 \
  fail2ban
```

Only paste commands into the shell. Text labels such as “Install”, “Verify”,
“Then”, or “Finally” are documentation, not commands; pasting them caused the
harmless `command not found` messages seen during the initial setup.

### 4.3 MariaDB configuration

Frappe uses UTF-8 throughout. The production configuration is stored in:

```text
/etc/mysql/mariadb.conf.d/60-frappe.cnf
```

Expected content:

```ini
[mysqld]
character-set-client-handshake = FALSE
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

[mysql]
default-character-set = utf8mb4
```

Verify it after restarting MariaDB:

```bash
sudo systemctl restart mariadb
sudo mariadb -N -e "SELECT @@character_set_server, @@collation_server;"
```

A separate MariaDB administrative user named `frappe_admin` was created for
site provisioning. Its password must remain outside Git and outside shell
history wherever practical.

## 5. Production Bench and site installation

The production Bench is located at:

```text
$HOME/frappe/learning-bench
```

It was initialized with Frappe v15 and populated with Payments, Frappe
Learning, and Biqat Learning:

```bash
cd "$HOME/frappe"

bench init \
  --frappe-branch v15.118.0 \
  --python python3.12 \
  learning-bench

cd learning-bench

bench get-app \
  --branch version-15 \
  payments \
  https://github.com/frappe/payments.git

bench get-app \
  --branch v2.60.1 \
  lms \
  https://github.com/frappe/lms.git

bench get-app \
  --branch main \
  biqat_lms \
  https://github.com/AbewAbew/biqatLms.git
```

The internal site was created as `biqat.localhost`. Applications were installed
in dependency order:

```bash
bench --site biqat.localhost install-app payments
bench --site biqat.localhost install-app lms
bench --site biqat.localhost install-app biqat_lms

bench use biqat.localhost
bench --site biqat.localhost enable-scheduler
bench --site biqat.localhost list-apps
```

An initial failed `bench new-site` left a partial site directory. The failed
directory had to be moved out of the way before creating the site again with
the correct `frappe_admin` password. A successful site creation completed the
Frappe schema and prompted for the Frappe Administrator password.

## 6. Production process configuration

### 6.1 Supervisor

Before production configuration existed, Bench printed:

```text
frappe: ERROR (no such group)
```

That was expected because no Supervisor group had been generated yet. The final
production configuration creates these groups:

- `learning-bench-redis`
- `learning-bench-web`
- `learning-bench-workers`

Check them with:

```bash
sudo supervisorctl status
```

Every listed process should report `RUNNING`, including:

- Redis cache and queue
- Frappe web
- Node Socket.IO
- Scheduler
- Short worker
- Long worker

The first automated `bench setup production` attempt failed because Bench had
been installed as a `uv` tool whose isolated Python environment did not contain
`pip` for the Ansible prerequisite. Production Nginx and Supervisor files were
therefore completed using Bench's generated configurations and the host's
existing packages.

### 6.2 Socket.IO Node.js path

Supervisor initially failed Socket.IO with:

```text
Cannot start socketio: node not found
```

Node had been installed through NVM and was available in the interactive shell,
but not in Supervisor's service PATH. A system-visible link to the NVM Node.js
binary was added at `/usr/local/bin/node`, after which the Socket.IO process
remained `RUNNING`.

Verify after a restart:

```bash
command -v node
node --version
sudo supervisorctl status
```

### 6.3 Nginx configuration

Bench's generated Nginx file initially referenced the `main` log format, which
Ubuntu's default Nginx configuration did not define:

```text
unknown log format "main"
```

The Bench site configuration was adjusted to use Ubuntu's available `combined`
format. Always validate before reloading:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Regenerating Nginx configuration can restore the unsupported `main` value, so
check the generated file again after running `bench setup nginx`.

### 6.4 Static asset permissions

The LMS HTML loaded while frontend assets returned 404. Nginx logs showed the
real cause as `Permission denied`, not a missing build:

```text
stat() .../sites/assets/lms/frontend/... failed (13: Permission denied)
```

The asset files and symlinks existed, but Nginx could not traverse the OS Login
user's home directory. Traverse-only access was granted so `www-data` could
reach the Bench `sites/assets` symlinks. The files themselves remain owned by
the Bench user.

Use these diagnostics if the problem returns:

```bash
cd "$HOME/frappe/learning-bench"
namei -l sites/assets/lms/frontend/favicon.png
sudo -u www-data stat sites/assets/lms/frontend/favicon.png
sudo tail -n 50 /var/log/nginx/error.log
```

Do not make the whole home directory writable by Nginx. It needs directory
traversal and read access to published assets, not ownership of the Bench.

### 6.5 Host-based routing

Before the public domain was attached, requesting `127.0.0.1` without the
correct Host header returned 403 while this request succeeded:

```bash
curl -I -H "Host: biqat.localhost" http://127.0.0.1
```

This is normal Frappe/Nginx host-based site selection. The temporary public IP
and later the production domain were mapped to `biqat.localhost` through Bench.

## 7. Domain, Cloudflare, and HTTPS

The `biqat.lexprime.et` DNS record was moved from the earlier VPS to the static
Google Cloud IP:

```text
Old address: 116.203.199.52
New address: 34.35.7.236
```

Production Bench configuration:

```bash
cd "$HOME/frappe/learning-bench"

bench setup add-domain biqat.lexprime.et --site biqat.localhost
bench config dns_multitenant on
bench --site biqat.localhost set-config host_name https://biqat.lexprime.et
bench setup nginx --yes
```

The Cloudflare `A` record named `biqat` points to `34.35.7.236`. DNS-only mode
was used during cutover. HTTPS was issued on the Google VM and the public LMS
became available at:

```text
https://biqat.lexprime.et/lms
```

If Cloudflare proxying is enabled later, use **Full (strict)** SSL mode. Do not
use Flexible mode.

The full cutover and rollback procedure is in
[`DOMAIN_CUTOVER.md`](DOMAIN_CUTOVER.md).

## 8. Google authentication

Before Google OAuth was configured, ordinary email signup displayed both
“Please ask your administrator to verify your sign-up” and “Please setup
default outgoing Email Account.” That behavior occurred because the site had
no outgoing mail account from which to send verification or password messages.
It was not a course-enrollment error. Outgoing email still needs to be
configured for password resets, notifications, and email-link login even when
Google is the preferred signup method.

The Google OAuth web client uses:

```text
Authorized JavaScript origin:
https://biqat.lexprime.et

Authorized redirect URI:
https://biqat.lexprime.et/api/method/frappe.integrations.oauth2_logins.login_via_google
```

Social-login signup must be allowed in the Google Social Login Key. New Google
users are created as Website Users and Frappe Learning assigns the `LMS
Student` role.

Frappe OAuth normally sends a website user to `/me` when the login request did
not contain an explicit destination. That opened Frappe's profile editor after
Google signup. Biqat now defines this redirect:

```text
/me → /lms
```

Therefore a normal Google signup or login opens the LMS directly. An explicit,
safe destination supplied by an LMS action can still be honored before this
fallback is needed.

Production must run `bench migrate` after pulling the commit that introduced
this hook so Frappe rebuilds its website route cache.

### 8.1 Google Calendar and Meet

Frappe Learning creates Google Meet rooms through Google Calendar events. The
Google Calendar API and the full Calendar OAuth scope are therefore required;
the separate Google Meet API is not required by the installed integration.

The existing web OAuth client can be reused, provided its original social-login
callback remains present and this exact Calendar callback is added:

```text
https://biqat.lexprime.et?cmd=frappe.integrations.doctype.google_calendar.google_calendar.google_callback
```

`Google Settings` stores the matching client ID and secret. Its API Key and
Google Drive Picker fields are not required for Calendar/Meet. A Google
Calendar record was created and authorized by the operational host account,
then linked to an enabled LMS Google Meet account. Students do not authorize
Google Calendar individually.

The OAuth project is currently in Testing. Only the operational Google account
needs to be a test user, but Calendar refresh authorization expires after seven
days in this mode. Move the OAuth application to production and complete any
required Google verification before relying on unattended live-class
scheduling.

## 9. Frappe Learning upgrade

The first installation used Frappe Learning v2.54.2. That release did not show
the redesigned **Course editor** tab expected from the reference deployment.
The LMS app was upgraded and pinned to v2.60.1.

The upgrade process was:

```bash
cd "$HOME/frappe/learning-bench"
bench --site biqat.localhost backup --with-files --compress

git -C apps/lms stash push -u -m "pre-v2.60.1-cloud-upgrade"
git -C apps/lms fetch --depth=1 \
  https://github.com/frappe/lms.git \
  refs/tags/v2.60.1:refs/tags/v2.60.1
git -C apps/lms checkout --detach v2.60.1

bench setup requirements lms
bench --site biqat.localhost migrate
NODE_OPTIONS=--max-old-space-size=4096 bench build --app lms
bench restart
```

The detached tag is intentional: it prevents an accidental upstream update
from moving production beyond the tested LMS release.

## 10. Ethiopian payment configuration

The Payments app is installed, but a live Chapa connection has not been
implemented.

The `biqat_lms` app currently provides:

- Ethiopian Birr (`ETB`) with symbol `Br`
- Santim as the fractional unit
- `ETB` as the default LMS currency only when no prior default exists
- Chapa as a visible **Not Connected** placeholder
- Mpesa retained as a visible alternative
- Other bundled gateways hidden from the LMS gateway creation interface
- India GST forced off and removed from the LMS configuration interface

Selecting Chapa as an active payment gateway is blocked until the actual API
integration, secrets, callback verification, idempotency, transaction logging,
refund behavior, and end-to-end tests exist.

Implementation files:

```text
biqat_lms/setup/payment_defaults.py
biqat_lms/api.py
biqat_lms/hooks.py
biqat_lms/public/js/lms_customizations.js
```

No Chapa API key or live payment request is present.

## 11. Branding and LMS interface customization

### 11.1 Logo and favicon

The Desk at `/app` and the Vue LMS at `/lms` load branding differently. An
uploaded logo initially worked in Desk while remaining broken in the LMS, and
the favicon remained the upstream default.

Biqat adds frontend compatibility handling that:

- normalizes the uploaded branding file response used by the LMS;
- repairs the sidebar image when the upstream frontend has an incomplete URL;
- cache-busts favicon changes;
- applies the selected Biqat branding consistently under `/lms`.

### 11.2 Upstream onboarding and help

The stock **Getting started** popup was disabled so it no longer redirects
administrators to Frappe's documentation. The upstream Help Centre link was
removed pending a Biqat user manual.

### 11.3 Powered-by controls

The bottom-left Help and **Powered by Frappe Learning** icons are hidden from
the LMS sidebar. This applies to the Vue LMS at `/lms`, not only the Desk.

### 11.4 Sidebar language selector

An Amharic/English selector was added directly below the user identity area.

- Amharic is the default sidebar language.
- English can be selected at any time.
- The choice is stored in browser local storage.
- It applies to both administrator and student LMS sidebars.
- Current scope is sidebar labels only; it does not translate course content or
  the complete LMS interface.

Vue reuses sidebar DOM elements when role visibility changes. The first
implementation could therefore display a stale label, such as **Batches**, on
a button whose real route and tooltip were **Programs**. The translator now
prefers Vue's newly rendered English label and clears stale source metadata
when English is selected, keeping labels attached to their real actions.

The customization script is injected before the upstream LMS application by:

```text
biqat_lms/page_renderers.py
```

The main browser logic is in:

```text
biqat_lms/public/js/lms_customizations.js
```

## 12. Managed instructor publishing

Frappe Learning's stock course instructor is also a course-editing permission
relationship. Biqat needs public teacher attribution without giving every
external lawyer a login or edit permission.

The custom app therefore separates:

- internal course editors, retained by Frappe for authorization; and
- public Biqat instructor profiles, displayed to learners.

### 12.1 Instructor profile fields

The custom **Biqat Instructor Profile** supports:

- full name;
- professional title;
- organization;
- private contact email;
- LinkedIn URL;
- profile photograph;
- cover image;
- HTML biography;
- enabled/disabled status;
- course attribution and display order.

Creating one of these profiles does not create a Frappe User and does not grant
course editing access.

### 12.2 LMS-native management

Administrators and moderators can manage instructor profiles from the LMS
Settings interface instead of opening Desk. The course Settings form uses a
native-looking selector for the public teacher. The stock editor selector is
hidden from this workflow; Biqat retains the actual internal editor in the
underlying course document.

### 12.3 Public attribution coverage

Managed instructors now replace the internal editor in learner-facing data
returned for:

- the main course list;
- course details;
- administrator Home course cards;
- student Home and enrolled-course cards;
- Program course cards;
- public instructor profile pages.

The Program page needed its own server override because the upstream
`get_program_details` function called its internal course-detail helper
directly, bypassing the initial course API override.

The detailed editorial workflow is in
[`MANAGED_INSTRUCTOR_WORKFLOW.md`](MANAGED_INSTRUCTOR_WORKFLOW.md).

### 12.4 Public batch teachers and internal batch managers

An upstream LMS Batch instructor is a real Frappe User stored in the required
`instructors` child table. It grants operational permissions to manage the
batch and host its live classes. A Biqat Instructor Profile is public teacher
attribution only and deliberately creates no login or permissions.

Biqat keeps those concepts separate while presenting only managed teachers in
the Batch form. The selected profiles are stored as Biqat batch attribution
and returned on learner-facing batch cards and details. The currently logged-in
Biqat administrator is silently retained as the internal batch manager needed
by Frappe. This prevents `Data missing in table: Instructors` without exposing
course-editor accounts in the teacher selector.

The reusable instructor profile picker also closes on outside clicks in event
capture phase, and the profile manager uses Frappe surface tokens so it follows
both light and dark themes.

## 13. Programs and learner enrollment

Programs and Batches are different concepts:

- A **Program** is a structured learning path containing multiple courses.
- A **Batch** is a learner cohort or scheduled delivery group.

The sidebar label bug described in section 11.4 made a Programs button look
like Batches; it was not intended navigation behavior.

### 13.1 Program member-count defect

The installed upstream LMS self-enrollment method created an `LMS Program
Member` child row directly. It did not update the parent Program's stored
`member_count`, and it wrote the child row with parent field `members` instead
of the actual table field `program_members`.

Symptoms:

- the learner could enter the Program;
- the Program detail recognized the learner;
- the administrator's Program card still displayed `0 members`.

Biqat now overrides enrollment to:

1. retain upstream publication and duplicate-enrollment checks;
2. normalize the child row to `program_members`;
3. recalculate and store the Program member count.

An `after_migrate` repair also scans existing Program Member rows, corrects the
old parent field, and recalculates all Program counters. This repairs learners
who joined before the fix without requiring them to leave and rejoin.

Implementation:

```text
biqat_lms/api.py
biqat_lms/setup/programs.py
biqat_lms/hooks.py
```

## 14. Certificate PDF generation

Frappe renders certificates through `pdfkit`, which calls the external
`wkhtmltopdf` binary. Without it, certificate acquisition fails with:

```text
OSError: No wkhtmltopdf executable found
```

Frappe v15 requires wkhtmltopdf 0.12.6 with patched Qt. On the Ubuntu 24.04
x86-64 VM, install the official Jammy build:

```bash
sudo apt update
sudo apt install -y \
  curl xvfb libfontconfig1 \
  xfonts-base xfonts-75dpi

curl -fL \
  https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.jammy_amd64.deb \
  -o /tmp/wkhtmltox_0.12.6.1-3.jammy_amd64.deb

sudo apt install -y /tmp/wkhtmltox_0.12.6.1-3.jammy_amd64.deb
wkhtmltopdf --version
```

Expected output:

```text
wkhtmltopdf 0.12.6.1 (with patched qt)
```

Clear Frappe's cached binary check and restart processes:

```bash
cd "$HOME/frappe/learning-bench"
bench --site biqat.localhost clear-cache
bench restart

bench --site biqat.localhost execute \
  frappe.utils.pdf.is_wkhtmltopdf_valid
```

The final command must return `True`. Certificate PDF generation should then
be retested from a student account. This is a host dependency, not a GitHub app
change.

## 15. Source-code map

| Path | Responsibility |
| --- | --- |
| `biqat_lms/hooks.py` | App hooks, API overrides, OAuth fallback redirect, migrations |
| `biqat_lms/api.py` | Payment filtering, public instructor APIs, course/Program overrides, enrollment fix |
| `biqat_lms/branding.py` | Branding compatibility helpers |
| `biqat_lms/page_renderers.py` | Injects the Biqat browser customization into the LMS shell |
| `biqat_lms/public/js/lms_customizations.js` | Branding, UI removal, sidebar languages, instructor management and selectors |
| `biqat_lms/setup/payment_defaults.py` | ETB, Chapa placeholder, payment defaults, GST enforcement |
| `biqat_lms/setup/programs.py` | Program Member repair and count synchronization |
| `biqat_lms/biqat_learning/doctype/biqat_instructor_profile/` | Public instructor profile DocType and tests |
| `biqat_lms/biqat_learning/doctype/biqat_instructor_course/` | Instructor-to-course attribution child DocType |
| `biqat_lms/biqat_learning/doctype/biqat_instructor_batch/` | Instructor-to-batch attribution child DocType |
| `biqat_lms/tests/test_setup.py` | Installation, payment, rendering, and OAuth redirect tests |

The upstream `apps/lms` checkout should remain pinned. Reusable changes belong
in `apps/biqat_lms`, not as untracked production edits inside `apps/lms`.

## 16. Commit history for the implementation

| Commit | Change |
| --- | --- |
| `3228f45` | Initialized the custom app |
| `90b0286` | Configured Biqat LMS app metadata |
| `0f53728` | Corrected the MariaDB client package in CI |
| `01345c3` | Prepared direct-`main` deployment workflow |
| `083d787` | Added Ethiopian payment defaults and LMS branding |
| `50942d5` | Fixed branding and hid upstream onboarding |
| `b0b0f1c` | Hid Frappe branding from the LMS sidebar |
| `5b6f7a5` | Upgraded LMS integration to restore Course editor |
| `9768a01` | Hid India GST and upstream Frappe LMS controls |
| `1beace4` | Fixed LMS v2.60 sidebar branding controls |
| `e386974` | Added Amharic/English sidebar selector |
| `b7eebb9` | Added managed instructor profiles and runbooks |
| `959d2e2` | Integrated managed instructors into LMS forms and pages |
| `c34313c` | Displayed managed instructors on administrator Home cards |
| `3eb4c08` | Displayed managed instructors on student Home cards |
| `a9d4cf5` | Fixed Program instructor attribution and stale sidebar labels |
| `e88bcbc` | Redirected OAuth users to LMS and repaired Program counts |

## 17. Validation performed

The custom app currently has 20 automated tests covering, among other things:

- required app versions;
- Ethiopian payment defaults;
- preservation of an existing currency choice;
- Chapa placeholder creation and activation blocking;
- payment-provider filtering;
- LMS browser-script injection;
- OAuth `/me` fallback redirection;
- managed instructor privacy and permissions;
- course, Home, student, and Program attribution;
- instructor management APIs;
- Program enrollment parent field and member count;
- migration repair of existing Program rows.

Standard validation commands:

```bash
cd /home/solskjaer/biqat/learning-bench

bench --site learning.localhost migrate
bench build --app biqat_lms
bench --site learning.localhost run-tests --app biqat_lms
```

Additional static checks:

```bash
cd apps/biqat_lms
ruff check biqat_lms
node --check biqat_lms/public/js/lms_customizations.js
git diff --check
```

## 18. Standard production deployment

Connect through IAP:

```bash
gcloud compute ssh biqat-lms-prod \
  --zone=africa-south1-c \
  --tunnel-through-iap
```

On the VM, back up first and deploy only the custom app:

```bash
cd "$HOME/frappe/learning-bench"

bench --site biqat.localhost backup --with-files --compress

git -C apps/biqat_lms status
git -C apps/biqat_lms pull --ff-only upstream main

bench setup requirements --python
bench --site biqat.localhost migrate
bench build --app biqat_lms
bench --site biqat.localhost clear-cache
bench restart
```

The local repository calls GitHub `origin`; the cloud clone was created by
Bench with GitHub named `upstream`. Confirm with `git remote -v` rather than
changing remotes unnecessarily.

Verify production:

```bash
bench --site biqat.localhost list-apps
git -C apps/biqat_lms log -1 --oneline
grep CUSTOMIZATION_SCRIPT apps/biqat_lms/biqat_lms/page_renderers.py
sudo supervisorctl status
sudo nginx -t
curl -I -H "Host: biqat.lexprime.et" http://127.0.0.1/lms
curl -I https://biqat.lexprime.et/lms
curl -s https://biqat.lexprime.et/lms/batches \
  | grep -o 'lms_customizations.js?v=[0-9]*'
```

The production custom-app checkout uses the Git remote name `upstream`, not
`origin`. A deployment in August 2026 appeared to complete while production
continued serving customization script `v19`; the corrected code was `v23`.
The live HTML version check above is therefore mandatory after frontend
deployments. It confirms both that the intended commit was pulled and that the
running Frappe site is rendering the updated custom app. Do not rely only on a
successful local build or browser refresh.

### 18.1 Google Meet live classes inherit the Batch timezone

The upstream Live Class modal can omit its `timezone` request value when its
browser-generated canonical timezone list does not contain an IANA alias such
as `Africa/Addis_Ababa`. The stock Google Meet endpoint then fails with
`create_google_meet_live_class() missing 1 required positional argument:
'timezone'`.

Biqat overrides that endpoint through `override_whitelisted_methods`. When the
modal sends no timezone, the wrapper uses the timezone already saved on the LMS
Batch. An explicitly submitted timezone is still respected. This keeps Google
Calendar and Meet scheduling aligned with the administrator's Batch settings
and avoids making the administrator choose the same timezone twice.

Use a hard refresh (`Ctrl+Shift+R`) after frontend changes. If a PWA service
worker still serves an old bundle, clear the site's browser storage and reload.

## 19. Troubleshooting reference

### `systemctl` says the system was not booted with systemd

You are in Cloud Shell, not the Compute Engine VM. Connect with the IAP SSH
command from section 18.

### Direct SSH hangs

Use `--tunnel-through-iap`. Check the VM state, IAP permissions, and the IAP
source-range firewall rule before exposing public SSH.

### `frappe: ERROR (no such group)`

Supervisor production configuration has not been generated or linked. Inspect
`/etc/supervisor/conf.d/` and rerun only the relevant Bench production setup
step.

### Socket.IO is `FATAL` and says Node is missing

NVM Node.js is not in Supervisor's PATH. Confirm the system-visible Node link
and restart Supervisor.

### Nginx says `unknown log format "main"`

Change the generated Bench access log format to `combined`, then run
`sudo nginx -t` before reloading.

### LMS assets return 404 but files exist

Check `/var/log/nginx/error.log`. If it reports permission denied, use `namei`
and test access as `www-data`; fix directory traversal rather than rebuilding
files repeatedly.

### Root/IP request returns 403

Test with the correct Frappe Host header. Host-based site selection is working
as configured.

### Build warns that Redis cache is unavailable

During early setup this warning occurred before production Redis processes
were active. Confirm Redis and Supervisor state. A completed asset build can
still exist, but production should not be left with Redis unavailable.

### Course editor is missing

Confirm `git -C apps/lms describe --tags --exact-match` returns `v2.60.1`, then
rebuild the LMS frontend and clear browser cache.

### Course cards display the internal editor

Confirm an enabled Biqat Instructor Profile is assigned to the course, migrate
the custom app, clear cache, and verify the latest `biqat_lms` commit is
deployed.

### Program still displays zero members

Run:

```bash
bench --site biqat.localhost migrate

bench --site biqat.localhost execute frappe.db.get_value \
  --args '["LMS Program","Alternative Dispute Resolution","member_count"]'
```

The migration invokes the repair hook for existing enrollments.

### Certificate download returns `No wkhtmltopdf executable found`

Install and validate the patched binary using section 14.

## 20. Backups, security, and recovery

Create a manual production backup before every deployment:

```bash
cd "$HOME/frappe/learning-bench"
bench --site biqat.localhost backup --with-files --compress
```

Backups stored only on the same VM are not sufficient. Configure encrypted,
automated off-VM backups and perform a test restore.

Security rules:

- Never commit database passwords, OAuth secrets, Cloudflare credentials, TLS
  private keys, Chapa credentials, backups, or private uploads.
- Keep MariaDB and Redis private to the VM.
- Keep SSH restricted through IAP.
- Give external teachers no elevated role unless they truly require platform
  editing access.
- Review firewall rules, snapshots, monitoring, and alerting regularly.
- Use HTTPS everywhere and use Cloudflare Full (strict) if proxying is enabled.

If a custom-app deployment must be rolled back, prefer creating a normal Git
revert locally, testing it, and pushing the revert to `main`. Do not use
`git reset --hard` on production. Restore the site backup if a migration or
runtime data change also needs to be reversed.

## 21. Remaining work before public launch

- Configure a default outgoing email account.
- Test welcome emails, password reset, notifications, and email-link login.
- Complete an end-to-end Google signup test in a private browser window.
- Confirm wkhtmltopdf reports patched Qt and test a real student certificate.
- Implement Chapa only after credentials, callback security, transaction
  handling, refunds, and test-mode validation are designed.
- Configure automated encrypted off-VM backups and test recovery.
- Configure VM monitoring, disk alerts, uptime checks, and snapshot policy.
- Reboot the VM in a controlled window and confirm all Supervisor processes,
  Nginx, MariaDB, Redis, scheduled jobs, HTTPS, and LMS functionality recover.
- Create the Biqat help centre/user manual before restoring an LMS help link.
- Expand Amharic translation beyond the sidebar only after terminology review.
- Publish and, if required, verify the Google OAuth application so Calendar
  authorization does not expire every seven days.
