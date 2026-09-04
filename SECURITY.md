# Security Policy

## Scope

Treat issues as security vulnerabilities when they could expose credentials or personal data, bypass authentication or Cloudflare Turnstile protections, permit unauthorized access, enable code or script injection, weaken origin or API protections, or otherwise affect the confidentiality, integrity, or availability of the site or its Worker APIs.

## Supported versions

Only the current development line on `main` is supported for security fixes. The beta site and this public development repository are the supported places to validate changes; production is maintained separately in `huihui.dev-stable`.

## Reporting a vulnerability

Do not open a normal public issue or pull request for a suspected vulnerability, and do not include secrets or sensitive technical details in public discussions. Include the affected path or component, a concise impact description, reproduction steps or proof of concept where safe, the conditions needed to reproduce it, and any suggested mitigation in a private report.

This repository does not currently expose a verified private vulnerability-reporting channel that can be referenced here. Do not disclose sensitive vulnerability details publicly while a private reporting path is unavailable.

## Responsible disclosure

Allow maintainers reasonable time to investigate and address a report before public disclosure. Do not access, modify, or delete data beyond what is necessary to demonstrate the issue, and stop testing if you encounter personal data, credentials, or production systems. Please coordinate disclosure timing with the maintainers after a fix or mitigation is available.
