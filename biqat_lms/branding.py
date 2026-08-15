import frappe

BRANDING_IMAGE_FIELDS = ("banner_image", "footer_logo", "favicon", "app_logo")


@frappe.whitelist(allow_guest=True)
def get_branding():
	"""Return image URLs consistently so the LMS uploader can render them."""
	settings = frappe._dict()
	for fieldname in ("app_name", *BRANDING_IMAGE_FIELDS):
		settings[fieldname] = frappe.get_cached_value("Website Settings", None, fieldname)
	return settings
