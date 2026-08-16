# Biqat Learning

Customizations and integrations for the Biqat Frappe Learning platform.

The complete, dated technical handover for the initial installation and
customization session is available in
[`docs/IMPLEMENTATION_HISTORY.md`](docs/IMPLEMENTATION_HISTORY.md). It covers
the local and cloud architecture, every completed customization, deployment,
production troubleshooting, validation, and remaining work.

## Architecture

The project deliberately separates source code from runtime data:

- Local development and testing run in WSL using Frappe Bench.
- Product customizations live in this `biqat_lms` repository.
- GitHub `main` is the deployment source for this custom app.
- Production runs with native Frappe Bench on a dedicated Google Cloud VM.
- Courses, users, enrollments, uploaded files, and database content are not
  stored in Git. They must be protected with database and file backups.

No development branches are created unless explicitly requested. The current
workflow commits tested changes directly to `main`.

## Pinned application versions

| Component | Version or branch |
| --- | --- |
| Frappe Framework | `v15.118.0` |
| Payments | `version-15` |
| Frappe Learning | `v2.60.1` |
| Biqat Learning | `main` |
| Python | `3.12` |
| Node.js | `22` |
| Yarn | `1.22` |
| MariaDB | `10.11` |
| Redis | `7` |

Do not run an unreviewed `bench update` in production. It can update Frappe,
Payments, and LMS together and move the server away from the versions tested
locally.

## Local WSL environment

The local Bench is located at:

```text
/home/solskjaer/biqat/learning-bench
```

The local site is `learning.localhost`, and its dedicated MariaDB container
listens only on `127.0.0.1:3307`. This keeps it separate from other Frappe
projects in WSL.

Start the local database and Bench:

```bash
cd /home/solskjaer/biqat
docker compose up -d database

cd /home/solskjaer/biqat/learning-bench
bench start
```

Open <http://learning.localhost:8100/lms>.

Before committing a customization, run:

```bash
cd /home/solskjaer/biqat/learning-bench
bench --site learning.localhost migrate
bench build --app biqat_lms
bench --site learning.localhost run-tests --app biqat_lms
```

## Ethiopian payment defaults

Installing or migrating `biqat_lms` configures the LMS for the Ethiopian
market without making an external payment connection:

- Ethiopian Birr (`ETB`) is enabled with the `Br` symbol and Santim fraction.
- `ETB` becomes the LMS default currency only when no default was previously
  selected. An administrator's existing currency choice is preserved.
- `Chapa` appears in **New Payment Gateway** with a **Not Connected** status.
- The administrator's **New Payment Gateway** list is limited to `Chapa` and
  `Mpesa`; the other bundled providers remain installed but hidden there.
- The India-specific GST switch is removed from the LMS interface and its
  stored setting is forced off.
- Saving the Chapa placeholder registers it in the Payment Gateway list, but
  the LMS prevents selecting it as the active gateway until the real API,
  callback verification, and transaction tests are implemented.

No Chapa API key, secret, endpoint call, or live payment behavior exists yet.
Secrets must never be committed when that integration is added.

## Branding image compatibility

Frappe Learning v2.60.1 returns consistent file objects for its logo and
favicon. Biqat leaves that upstream API intact and adds a small frontend
fallback that repairs the sidebar image if necessary and cache-busts favicon
updates, so a newly uploaded Biqat logo replaces an older cached icon.

## Course editor

Frappe Learning is pinned to v2.60.1. The older v2.54.2 release did not include
the **Course editor** tab; the pinned release includes the redesigned chapter
and lesson editor used by course instructors and moderators.

## Managed instructor publishing

Biqat separates public instructor attribution from Frappe Learning's internal
course-editor relationship. Administrators can create independent instructor
profiles with biographies, photographs, professional titles and course
assignments without creating User accounts or granting course modification
access. Students see those experts on course cards, course pages and read-only
profile pages, while Biqat retains editorial control.

The operating procedure is documented in
[`docs/MANAGED_INSTRUCTOR_WORKFLOW.md`](docs/MANAGED_INSTRUCTOR_WORKFLOW.md).

## Live classes and Ethiopian time

The timezone saved on an LMS Batch is authoritative for its Google Meet live
classes. Installation and migration set Frappe's site timezone to
`Africa/Addis_Ababa`, repair existing Live Class timezone fields from their
Batch, and handle the browser's equivalent `Africa/Nairobi` canonical name.
System administrators can use **Batch → Live Class → Manage** to inspect the
saved timezone or delete a session and its linked Google Calendar event.

## Onboarding and help

Frappe Learning's stock **Getting started** popup and its link to the upstream
Frappe Help Centre are disabled. The **Powered by Frappe Learning** sidebar
icon is also hidden. The server-side onboarding status is left untouched so
this area can later be replaced with Biqat's own setup steps and user manual.

## GitHub workflow

Only files inside `apps/biqat_lms` belong to this repository. Bench runtime
files and site data must not be committed.

After a change works locally:

```bash
cd /home/solskjaer/biqat/learning-bench/apps/biqat_lms
git status
git add <changed-files>
git commit -m "Describe the tested change"
git push origin main
```

Never commit passwords, API keys, database dumps, private files, or site
backups.

## Google Cloud production VM

The completed Cloudflare DNS and HTTPS cutover, including verification and
rollback instructions, is documented in
[`docs/DOMAIN_CUTOVER.md`](docs/DOMAIN_CUTOVER.md).

The current production host was prepared as follows:

- VM name: `biqat-lms-prod`
- Zone: `africa-south1-c`
- Operating system: Ubuntu 24.04 LTS, x86-64
- Deployment type: native Frappe Bench, without Docker
- Bench path: `$HOME/frappe/learning-bench`
- Internal site name: `biqat.localhost`
- Public address: `https://biqat.lexprime.et/lms`
- SSH access: Google Cloud IAP, restricted to TCP port 22 from
  `35.235.240.0/20`

Installed host services include MariaDB, Redis, Nginx, Supervisor, Cron, and
Fail2ban. MariaDB uses `utf8mb4` with `utf8mb4_unicode_ci`. A separate
`frappe_admin` database administrator was created for site provisioning; its
password is not stored in this repository.

The production Bench was initialized and populated with:

```bash
bench init --frappe-branch v15.118.0 --python python3.12 learning-bench
bench get-app --branch version-15 payments https://github.com/frappe/payments.git
bench get-app --branch v2.60.1 lms https://github.com/frappe/lms.git
bench get-app --branch main biqat_lms https://github.com/AbewAbew/biqatLms.git
```

The site applications were installed in this order:

```bash
bench --site biqat.localhost install-app payments
bench --site biqat.localhost install-app lms
bench --site biqat.localhost install-app biqat_lms
```

### Upgrade an existing Bench to the pinned LMS release

The first production installation used LMS v2.54.2. Upgrade it to the tested
v2.60.1 tag to enable the redesigned **Course editor**:

```bash
cd "$HOME/frappe/learning-bench"
bench --site biqat.localhost backup --with-files --compress

git -C apps/lms fetch --depth=1 upstream tag v2.60.1
git -C apps/lms checkout --detach v2.60.1
git -C apps/biqat_lms pull --ff-only upstream main

bench setup requirements lms biqat_lms
bench --site biqat.localhost migrate
NODE_OPTIONS=--max-old-space-size=4096 bench build --app lms
bench build --app biqat_lms
bench --site biqat.localhost clear-cache
bench restart
```

Production processes are managed by Supervisor and web traffic is served by
Nginx. The following VM-specific fixes were required:

- The generated Supervisor configuration was linked into
  `/etc/supervisor/conf.d/learning-bench.conf`.
- The NVM Node.js executable was linked at `/usr/local/bin/node` so Supervisor
  can start Socket.IO after login sessions end or the VM reboots.
- Bench's Nginx configuration was generated with the Ubuntu-supported
  `combined` log format.
- The OS Login home directory grants traverse-only permission to Nginx so it
  can serve the Bench asset symlinks.
- The temporary public IP was added as a Bench domain mapping for
  `biqat.localhost`.

## Deploy a tested change from GitHub

Run these commands on the production VM. Create the backup before pulling new
code:

```bash
cd "$HOME/frappe/learning-bench"
bench --site biqat.localhost backup --with-files --compress

git -C apps/biqat_lms status
git -C apps/biqat_lms pull --ff-only upstream main

bench setup requirements --python
bench --site biqat.localhost migrate
bench build --app biqat_lms
bench restart
```

Verify the deployment:

```bash
bench --site biqat.localhost list-apps
git -C apps/biqat_lms log -1 --oneline
grep CUSTOMIZATION_SCRIPT apps/biqat_lms/biqat_lms/page_renderers.py
sudo supervisorctl status
curl -I -H "Host: biqat.localhost" http://127.0.0.1/lms
curl -s https://biqat.lexprime.et/lms/batches \
  | grep -o 'lms_customizations.js?v=[0-9]*'
```

All Supervisor processes should report `RUNNING`, and the HTTP request should
return a successful response. The live script version must match the version in
`page_renderers.py`; this catches a pull from the wrong remote or a stale cloud
checkout even when the local build and services themselves succeed. The cloud
clone uses `upstream`, while the local development checkout uses `origin`.

If `git pull --ff-only` refuses to update, stop and inspect `git status` and
the commit history. Do not force-reset production or overwrite uncommitted
files.

## Fresh Bench installation

This app targets Frappe Framework v15 and Frappe Learning v2.60.1. Install its
upstream dependencies first:

```bash
cd "$PATH_TO_YOUR_BENCH"
bench get-app --branch version-15 payments https://github.com/frappe/payments.git
bench get-app --branch v2.60.1 lms https://github.com/frappe/lms.git
bench get-app --branch main biqat_lms https://github.com/AbewAbew/biqatLms.git

bench --site "$SITE_NAME" install-app payments
bench --site "$SITE_NAME" install-app lms
bench --site "$SITE_NAME" install-app biqat_lms
```

## Operational commands

Check services:

```bash
sudo supervisorctl status
sudo nginx -t
sudo systemctl status mariadb nginx supervisor
```

Create a manual backup:

```bash
cd "$HOME/frappe/learning-bench"
bench --site biqat.localhost backup --with-files --compress
```

Inspect recent errors:

```bash
cd "$HOME/frappe/learning-bench"
tail -n 100 logs/web.error.log
tail -n 100 logs/worker.error.log
sudo tail -n 100 /var/log/nginx/error.log
```

## Remaining production work

Before public launch:

- Configure automated encrypted backups and copy them off the VM.
- Test recovery from a backup.
- Install and verify the patched wkhtmltopdf build required for PDF output.
- Configure outbound email and test password-reset and notification emails.
- Configure the selected payment provider; installing Payments alone does not
  activate a gateway.
- Review Google Cloud firewall rules, monitoring, snapshots, and alerting.
- Test a controlled VM reboot and confirm every Supervisor process returns to
  `RUNNING`.

## Contributing

This app uses `pre-commit` for formatting and linting:

```bash
cd apps/biqat_lms
pre-commit install
```

Configured checks include Ruff, ESLint, Prettier, and PyUpgrade. GitHub Actions
runs the application tests on pushes to `main` and security/lint checks for
pull requests when that workflow is used.

## License

AGPL-3.0
