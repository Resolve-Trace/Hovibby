# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x (current) | ✅ Yes |

## Reporting a Vulnerability

**Please do not file a public GitHub issue for security vulnerabilities.**

To report a security vulnerability:

1. Open a private Security Advisory on your repository host.
2. Or email `security@[your-domain]`.

Include:
- A description of the vulnerability
- Steps to reproduce it
- The potential impact
- Any suggested fixes (optional)

We will:
- Acknowledge receipt within 72 hours
- Provide a timeline for a fix within 7 days
- Credit you in the release notes (unless you prefer anonymity)

## Important Limitations

ResolveTrace has **not been security audited**. The following areas carry known risk:

- **Key management:** Production deployments require proper signing key management. Ephemeral keys generated per-request are suitable only for development.
- **Authentication:** The v1 API does not include production-grade authentication. Deployments must add an authentication layer.
- **Storage security:** Off-chain storage is not encrypted by default. Use encrypted volumes or bucket encryption for sensitive data.
- **Hash chain limitations:** The hash chain detects unauthorized modifications to committed events but does not prevent event omission.

Do not use this software for legally sensitive workflows without an independent security review.
