### Biqat Learning

Customizations and integrations for the Biqat learning platform

### Installation

This app targets Frappe Framework v15 and Frappe Learning v2.54.2. Install its
upstream dependencies first:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app --branch version-15 payments https://github.com/frappe/payments.git
bench get-app --branch v2.54.2 lms https://github.com/frappe/lms.git
bench get-app --branch main biqat_lms https://github.com/AbewAbew/biqatLms.git

bench --site $SITE_NAME install-app payments
bench --site $SITE_NAME install-app lms
bench --site $SITE_NAME install-app biqat_lms
```

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/biqat_lms
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### CI

This app can use GitHub Actions for CI. The following workflows are configured:

- CI: Installs this app and runs unit tests on every push to `main`.
- Linters: Runs [Frappe Semgrep Rules](https://github.com/frappe/semgrep-rules) and [pip-audit](https://pypi.org/project/pip-audit/) on every pull request.


### License

agpl-3.0
