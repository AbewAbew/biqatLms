app_name = "biqat_lms"
app_title = "Biqat Learning"
app_publisher = "Biqat"
app_description = "Customizations and integrations for the Biqat learning platform"
app_email = "abenezerberbatov@gmail.com"
app_license = "agpl-3.0"

# Apps
# ------------------

required_apps = ["frappe/lms"]

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "biqat_lms",
# 		"logo": "/assets/biqat_lms/logo.png",
# 		"title": "Biqat Learning",
# 		"route": "/biqat_lms",
# 		"has_permission": "biqat_lms.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/biqat_lms/css/biqat_lms.css"
# app_include_js = "/assets/biqat_lms/js/biqat_lms.js"

# include js, css files in header of web template
# web_include_css = "/assets/biqat_lms/css/biqat_lms.css"
# web_include_js = "/assets/biqat_lms/js/biqat_lms.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "biqat_lms/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "biqat_lms/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "biqat_lms.utils.jinja_methods",
# 	"filters": "biqat_lms.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "biqat_lms.install.before_install"
after_install = "biqat_lms.setup.payment_defaults.configure_ethiopian_payments"

# Keep site-level defaults present after app updates and migrations.
after_migrate = "biqat_lms.setup.payment_defaults.configure_ethiopian_payments"

# Uninstallation
# ------------

# before_uninstall = "biqat_lms.uninstall.before_uninstall"
# after_uninstall = "biqat_lms.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "biqat_lms.utils.before_app_install"
# after_app_install = "biqat_lms.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "biqat_lms.utils.before_app_uninstall"
# after_app_uninstall = "biqat_lms.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "biqat_lms.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"Chapa Settings": {
		"on_update": "biqat_lms.setup.payment_defaults.create_chapa_gateway",
	},
	"LMS Settings": {
		"validate": "biqat_lms.setup.payment_defaults.validate_payment_configuration",
	},
}

# Keep the stock payment integrations installed, but expose only the gateways
# selected for the Biqat LMS administrator interface.
override_whitelisted_methods = {
	"frappe.client.get_list": "biqat_lms.api.get_list",
	"lms.lms.api.get_profile_details": "biqat_lms.api.get_profile_details",
	"lms.lms.utils.get_course_details": "biqat_lms.api.get_course_details",
	"lms.lms.utils.get_courses": "biqat_lms.api.get_courses",
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"biqat_lms.tasks.all"
# 	],
# 	"daily": [
# 		"biqat_lms.tasks.daily"
# 	],
# 	"hourly": [
# 		"biqat_lms.tasks.hourly"
# 	],
# 	"weekly": [
# 		"biqat_lms.tasks.weekly"
# 	],
# 	"monthly": [
# 		"biqat_lms.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "biqat_lms.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "biqat_lms.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "biqat_lms.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["biqat_lms.utils.before_request"]
# after_request = ["biqat_lms.utils.after_request"]

# Job Events
# ----------
# before_job = ["biqat_lms.utils.before_job"]
# after_job = ["biqat_lms.utils.after_job"]

# LMS single-page application customizations
# -------------------------------------------

page_renderer = ["biqat_lms.page_renderers.BiqatLMSRenderer"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"biqat_lms.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []
