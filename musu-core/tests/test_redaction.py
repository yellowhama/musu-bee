"""Tests for redact_secrets()."""
import pytest
from musu_core.redaction import redact_secrets


def test_bearer_token():
    assert redact_secrets("Authorization: Bearer eyABCDEFGHIJKLMNOPQRSTUVWXYZ12") == \
        "Authorization: Bearer [REDACTED]"


def test_github_pat():
    s = "token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"
    assert "[REDACTED-GH-TOKEN]" in redact_secrets(s)


def test_openai_key():
    s = "key=sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCD"
    assert "[REDACTED-API-KEY]" in redact_secrets(s)


def test_dsn():
    s = "postgres://user:s3cr3tpassword@localhost:5432/db"
    assert "[REDACTED]@" in redact_secrets(s)
    assert "s3cr3tpassword" not in redact_secrets(s)


def test_jwt():
    jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    assert "[REDACTED-JWT]" in redact_secrets(jwt)


def test_pem_key():
    pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
    result = redact_secrets(pem)
    assert "[REDACTED-PEM]" in result
    assert "PRIVATE KEY" not in result


def test_no_false_positives():
    s = "channel=general message=hello world user=alice"
    assert redact_secrets(s) == s


def test_aws_key():
    s = "access_key=AKIAIOSFODNN7EXAMPLE"
    assert "[REDACTED-AWS-KEY]" in redact_secrets(s)
