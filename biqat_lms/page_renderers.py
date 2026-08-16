from frappe.website.page_renderers.base_renderer import BaseRenderer
from frappe.website.page_renderers.template_page import TemplatePage

CUSTOMIZATION_SCRIPT = '<script src="/assets/biqat_lms/js/lms_customizations.js?v=21"></script>'


class BiqatLMSRenderer(BaseRenderer):
	"""Render the stock LMS application with Biqat's small UI extension loaded."""

	def can_render(self):
		return self.path == "_lms"

	def render(self):
		response = TemplatePage(self.path, self.http_status_code).render()
		html = response.get_data(as_text=True)
		response.set_data(inject_customization_script(html))
		return response


def inject_customization_script(html: str) -> str:
	if CUSTOMIZATION_SCRIPT in html:
		return html
	return html.replace("<head>", f"<head>\n\t{CUSTOMIZATION_SCRIPT}", 1)
