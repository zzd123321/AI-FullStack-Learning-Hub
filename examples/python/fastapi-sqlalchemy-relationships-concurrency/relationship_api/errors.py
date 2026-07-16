class ResourceNotFoundError(Exception):
    pass


class DuplicateResourceError(Exception):
    pass


class VersionConflictError(Exception):
    pass


class InvalidEntityTagError(Exception):
    pass
