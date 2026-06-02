class EpubMergeError(Exception):
    """Base exception for expected project errors."""


class InvalidEpubError(EpubMergeError):
    """Raised when an EPUB is structurally invalid for this tool."""


class OrderingError(EpubMergeError):
    """Raised when input order cannot be determined safely."""


class ManifestError(EpubMergeError):
    """Raised when a reversible merge manifest is missing or invalid."""
