# Security policy

## Reporting a vulnerability

Please do not publish an unpatched vulnerability in a public issue, discussion, pull request, or social-media post.

Until a dedicated security email is configured, use the repository's **GitHub private vulnerability reporting** feature. If that feature is unavailable, contact the repository maintainer privately through a channel listed on the maintainer's GitHub profile and disclose only that you need a secure reporting channel. Do not send exploit details through a public channel.

A public release must not proceed until at least one monitored private reporting route is confirmed.

Include, when safe:

- Affected version or commit.
- Reproduction steps using synthetic data.
- Expected impact.
- Suggested mitigation, if known.

Allow maintainers a reasonable opportunity to investigate and release a fix before public disclosure. Do not access systems or data for which you do not have authorization.

## Sensitive information

Public GitHub issues must never contain:

- Patient or clinical information.
- Real credentials, session tokens, cookies, or secret values.
- Production database contents or backups.
- Sensitive deployment details that would facilitate an attack.

Use synthetic examples and redact operational identifiers.

## Project status

This project is an early open-source demonstration and is not declared production-ready for real patient information. Production healthcare deployment requires independent security and applicable legal/compliance review. No automatic compliance with Moroccan Law 09-08, CNDP requirements, HIPAA, GDPR, or another framework is claimed.
