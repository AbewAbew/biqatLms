# Biqat Learning

Customizations and integrations for the Biqat Frappe Learning platform.

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
| Frappe Learning | `v2.54.2` |
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

Biqat normalizes the LMS branding API to return logo and favicon values as
plain `/files/...` URLs. A small LMS-page compatibility script preserves those
URLs when the stock Branding form saves them. This prevents the stock LMS
object-versus-string mismatch from clearing a new upload or breaking the image
preview after a reload. It also repairs the stock sidebar's incompatible
`banner_image.file_url` lookup and cache-busts favicon updates, so a newly
uploaded Biqat logo replaces the old Frappe icon.

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

The current production host was prepared as follows:

- VM name: `biqat-lms-prod`
- Zone: `africa-south1-c`
- Operating system: Ubuntu 24.04 LTS, x86-64
- Deployment type: native Frappe Bench, without Docker
- Bench path: `$HOME/frappe/learning-bench`
- Internal site name: `biqat.localhost`
- Temporary access: public IPv4 over HTTP
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
bench get-app --branch v2.54.2 lms https://github.com/frappe/lms.git
bench get-app --branch main biqat_lms https://github.com/AbewAbew/biqatLms.git
```

The site applications were installed in this order:

```bash
bench --site biqat.localhost install-app payments
bench --site biqat.localhost install-app lms
bench --site biqat.localhost install-app biqat_lms
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
sudo supervisorctl status
curl -I -H "Host: biqat.localhost" http://127.0.0.1/lms
```

All Supervisor processes should report `RUNNING`, and the HTTP request should
return a successful response.

If `git pull --ff-only` refuses to update, stop and inspect `git status` and
the commit history. Do not force-reset production or overwrite uncommitted
files.

## Fresh Bench installation

This app targets Frappe Framework v15 and Frappe Learning v2.54.2. Install its
upstream dependencies first:

```bash
cd "$PATH_TO_YOUR_BENCH"
bench get-app --branch version-15 payments https://github.com/frappe/payments.git
bench get-app --branch v2.54.2 lms https://github.com/frappe/lms.git
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

- Reserve the VM's external IPv4 address so it does not change.
- Purchase or select a domain, point its DNS record to the VM, and enable
  trusted HTTPS.
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
