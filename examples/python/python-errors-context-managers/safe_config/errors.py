"""Domain exceptions exposed by safe_config."""


class ConfigError(Exception):
    """Base class for errors callers may handle as configuration failures."""


class ConfigNotFoundError(ConfigError):
    """The requested configuration file does not exist."""


class ConfigFormatError(ConfigError):
    """Configuration contents do not satisfy the required JSON object contract."""


class ConfigWriteError(ConfigError):
    """A valid configuration could not be persisted."""
