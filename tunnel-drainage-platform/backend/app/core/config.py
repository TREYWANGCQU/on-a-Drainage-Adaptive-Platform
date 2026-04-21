from starlette.config import Config
from starlette.datastructures import CommaSeparatedStrings

config = Config(".env")

PROJECT_NAME = "Tunnel Drainage Platform"
VERSION = "1.0.0"
API_PREFIX = "/api"

ALLOWED_HOSTS = config("ALLOWED_HOSTS", cast=CommaSeparatedStrings, default=["*"])
