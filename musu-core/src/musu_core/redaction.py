"""
redact_secrets: Scrub sensitive patterns from log strings before they are written.

Usage:
    from musu_core.redaction import install_redaction_filter
    install_redaction_filter()   # call once at server startup
"""
import logging
import re

_PATTERNS = [
    # PEM private/public keys
    (re.compile(r'-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----', re.MULTILINE), '[REDACTED-PEM]'),
    # Bearer tokens
    (re.compile(r'Bearer [A-Za-z0-9+/=._\-]{20,}'), 'Bearer [REDACTED]'),
    # GitHub PAT / fine-grained tokens
    (re.compile(r'gh[ps]_[A-Za-z0-9]{36,}'), '[REDACTED-GH-TOKEN]'),
    # OpenAI / generic sk- API keys
    (re.compile(r'sk-[A-Za-z0-9]{32,}'), '[REDACTED-API-KEY]'),
    # DSN / connection strings  (user:pass@host)
    (re.compile(r'://[^:\s@"\']+:[^@\s"\']+@'), '://[REDACTED]@'),
    # JWT  (three base64url segments)
    (re.compile(r'eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+'), '[REDACTED-JWT]'),
    # AWS-style access keys
    (re.compile(r'AKIA[A-Z0-9]{16}'), '[REDACTED-AWS-KEY]'),
    # Generic high-entropy hex secrets (32+ hex chars after = or :)
    (re.compile(r'(?<=[=: "\'])([0-9a-fA-F]{32,})'), '[REDACTED-HEX]'),
]


def redact_secrets(text: str) -> str:
    """Replace known secret patterns in *text* with safe placeholders."""
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


class _SecretRedactionFilter(logging.Filter):
    """logging.Filter that scrubs secrets from every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact_secrets(str(record.msg))
        if record.args:
            if isinstance(record.args, tuple):
                record.args = tuple(
                    redact_secrets(a) if isinstance(a, str) else a
                    for a in record.args
                )
            elif isinstance(record.args, dict):
                record.args = {
                    k: redact_secrets(v) if isinstance(v, str) else v
                    for k, v in record.args.items()
                }
        return True


_filter_installed = False


def install_redaction_filter() -> None:
    """Attach the secret-redaction filter to the root logger (idempotent)."""
    global _filter_installed
    if _filter_installed:
        return
    logging.getLogger().addFilter(_SecretRedactionFilter())
    _filter_installed = True
