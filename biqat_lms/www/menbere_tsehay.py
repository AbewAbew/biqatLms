from lms.lms.utils import get_lms_route


def get_context(context):
	context.courses_url = get_lms_route("courses")
