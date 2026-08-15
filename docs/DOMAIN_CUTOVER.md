# Biqat Domain Cutover to Google Cloud

This runbook moves `biqat.lexprime.et` from the earlier VPS to the Biqat LMS
running on the Google Cloud VM. It changes where the domain sends web traffic;
it does not migrate databases, users, uploaded files, or course content from
the old VPS.

## Current status

The cutover was completed and publicly verified on 15 August 2026:

- Project: `wired-record-505513-s7`
- VM: `biqat-lms-prod`
- Zone: `africa-south1-c`
- Network tag: `biqat-lms-prod`
- Static external address: `biqat-lms-prod-ip` (`34.35.7.236`)
- Static address status: `IN_USE` in `africa-south1`
- Firewall rule: `biqat-lms-web`
- Allowed ingress: TCP ports 80 and 443 from `0.0.0.0/0`
- Firewall target: VMs tagged `biqat-lms-prod`
- Bench: `$HOME/frappe/learning-bench`
- Internal Frappe site: `biqat.localhost`
- Public hostname prepared in Bench: `biqat.lexprime.et`
- `dns_multitenant` is enabled.
- The site `host_name` is set to `https://biqat.lexprime.et`.
- Nginx recognizes the hostname and redirects `/lms/` to `/lms`.
- Ubuntu Nginx now defines the `main` access-log format expected by Bench.
- The Cloudflare `biqat` A record resolves to `34.35.7.236` with a 300-second
  TTL and is exposed as DNS-only.
- Let's Encrypt HTTPS was issued on the Google VM through Bench.
- `https://biqat.lexprime.et/lms` responds successfully over HTTPS.

The remaining domain-related task is to finish end-to-end Google OAuth testing
with the production origin and redirect URI.

## DNS state before cutover

Before the completed cutover, the public record was:

```text
Type: A
Name: biqat
Current address: 116.203.199.52
TTL: 300 seconds
New address: 34.35.7.236
```

Do not add `lexprime.et` to another Cloudflare account or change its
nameservers. Sign in to the existing account that already manages the zone.

## Before changing DNS

1. Keep the old VPS running.
2. Back up its database and uploaded files if any of its information is still
   required.
3. Confirm the Google VM is running and all Supervisor processes are healthy.
4. Do not store Cloudflare, Google, database, OAuth, or TLS credentials in this
   repository.

Check the Google VM:

```bash
cd "$HOME/frappe/learning-bench"
sudo supervisorctl status
sudo nginx -t
curl -I -H "Host: biqat.lexprime.et" http://127.0.0.1/lms/
```

All Supervisor processes should be `RUNNING`, Nginx should report a successful
configuration test, and the HTTP test may return `301` because `/lms/` is
normalized to `/lms`.

## Change the Cloudflare record

1. Open <https://dash.cloudflare.com/>.
2. Sign in to the account that contains `lexprime.et`.
3. Select **lexprime.et**.
4. Open **DNS > Records**.
5. Edit the `A` record named `biqat`.
6. Replace `116.203.199.52` with `34.35.7.236`.
7. Set **Proxy status** to **DNS only** (grey cloud) for the cutover.
8. Save the record.

If `lexprime.et` is not listed, stop and obtain access from the person who
configured the domain. Do not recreate the zone.

## Confirm DNS propagation

Run this from Google Cloud Shell:

```bash
dig +short biqat.lexprime.et A
```

Continue only when the result is:

```text
34.35.7.236
```

Because the previous TTL is 300 seconds, the change should normally become
visible quickly, although some resolvers may take longer.

## Issue the HTTPS certificate

Connect to the Google VM after DNS resolves to `34.35.7.236`, then run each
command separately:

```bash
sudo apt update
```

```bash
sudo apt install -y certbot
```

```bash
cd "$HOME/frappe/learning-bench"
```

```bash
sudo -H /home/abenezerberbatov_gmail_com/.local/bin/bench setup lets-encrypt biqat.localhost --custom-domain biqat.lexprime.et
```

Follow the Certbot prompts. Bench temporarily stops Nginx, obtains the
certificate, adds its paths to the site domain configuration, regenerates
Nginx, restarts it, and adds certificate renewal to root's crontab.

Verify the result:

```bash
sudo nginx -t
curl -I https://biqat.lexprime.et/lms
```

The HTTPS request should return a successful response or an expected redirect
without a certificate warning.

## Cloudflare after HTTPS works

Keeping the record as **DNS only** is acceptable. If Cloudflare proxying is
enabled later, first set **SSL/TLS encryption mode** to **Full (strict)** and
then turn the record's cloud orange. Never use Cloudflare's **Flexible** mode
for this Frappe deployment.

## Google login configuration

After the domain works over HTTPS, the Google OAuth web client must contain
these exact values:

```text
Authorized JavaScript origin:
https://biqat.lexprime.et

Authorized redirect URI:
https://biqat.lexprime.et/api/method/frappe.integrations.oauth2_logins.login_via_google
```

Test **Login with Google** in a private browser window with an account that has
not previously been registered in Biqat. A new Website User should be created
and Frappe Learning should assign the `LMS Student` role.

## Final verification

Verify all of the following before shutting down the old VPS:

- `https://biqat.lexprime.et/lms` loads without a certificate warning.
- Branding images and frontend assets load successfully.
- Administrator login works.
- Google login creates or signs in a student.
- Existing courses, lessons, quizzes, files, and images are accessible.
- Student enrollment and course access behave as expected.
- All Supervisor processes remain `RUNNING`.
- A production backup can be created successfully.

Keep the old VPS and its backup for several days after the cutover. If an
urgent rollback is required before it is decommissioned, change the Cloudflare
`biqat` A record back to `116.203.199.52` and investigate the Google VM without
destroying either environment.
