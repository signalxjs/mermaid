# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Use one of the following private channels:

1. **GitHub Security Advisories** — preferred. Open a private report at
   <https://github.com/signalxjs/mermaid/security/advisories/new>.
2. **Email** — contact the maintainer directly: **Andreas Ekdahl**
   <andy@ekdahls.net>.

Please include:

- A description of the issue and its impact.
- Steps to reproduce, ideally a minimal proof of concept.
- Affected package(s) and version(s).
- Any suggested mitigation, if you have one.

## Response

- We aim to acknowledge new reports within a few business days.
- Once a fix is ready, a patched version will be published to npm and a
  security advisory will be posted on GitHub crediting the reporter
  (unless they prefer to remain anonymous).

## Supported versions

Security fixes are applied to the latest released minor line of `@sigx/mermaid`
(currently `0.1.x`). Older minors are not patched.

Note that `mermaid` itself is a **peer dependency**: vulnerabilities in mermaid's
own parsing or SVG generation are reported to
[mermaid-js/mermaid](https://github.com/mermaid-js/mermaid/security), and you fix
them by upgrading your own `mermaid` install — no release of this package is
needed. `@sigx/mermaid` initializes mermaid with `securityLevel: 'strict'` by
default; raising it is opt-in.
