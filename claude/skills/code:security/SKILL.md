---
description: Security audit of changed code on the current branch or dirty files on main. Summarizes findings without modifying code.
user_invocable: true
---

# Security Audit

<steps>
1. Determine scope. Run in parallel:
   - `git branch --show-current`
   - `git diff main...HEAD --stat` (if on a branch other than main)
   - `git diff --stat` and `git diff --cached --stat` (to catch dirty files on main)

   If on main with no dirty files, stop and tell the user there's nothing to audit.

2. Identify the changed files. Read every changed file in full, not just the diff.

3. Read the project's CLAUDE.md and any CLAUDE.local.md or CLAUDE.development.md for context on the project's architecture, conventions, and security-relevant patterns.

4. For each changed file, investigate the surrounding context:
   - Use Grep and Glob to find related code: callers, consumers, middleware, validators, auth checks
   - Read package.json, requirements.txt, Gemfile, or equivalent dependency files to understand which libraries are in use
   - Check how the project handles auth, input validation, data access, and secrets

5. Evaluate each change against these categories:

   <categories>
   **injection** - SQL injection, command injection, template injection, XSS, path traversal. Trace user input from entry point to where it's used.

   **authentication and authorization** - missing auth checks, privilege escalation, broken access control, insecure session handling, exposed tokens or secrets.

   **data exposure** - sensitive data in logs, error messages, API responses, or client-side code. PII leaks, verbose error details in production.

   **input validation** - missing or insufficient validation at system boundaries. Type coercion issues, unchecked array/object access, missing size limits.

   **dependency risks** - known vulnerable patterns in how dependencies are used. Insecure defaults, deprecated APIs, missing security headers.

   **secrets and configuration** - hardcoded credentials, API keys, connection strings. Secrets in source control, insecure environment variable handling.

   **cryptography** - weak algorithms, insecure random number generation, missing encryption for sensitive data at rest or in transit.

   **race conditions and state** - TOCTOU bugs, concurrent access without synchronization, missing atomicity where needed.
   </categories>

6. Produce a summary with this format:

   <output_format>
   **scope**
   what was audited: branch name, files examined, libraries and frameworks involved.

   **findings**
   for each finding:
   - severity: critical / high / medium / low
   - category (from the list above)
   - file, function, and line range
   - what the issue is and how it could be exploited or cause harm
   - suggested remediation direction (brief, not a code fix)

   order findings by severity, highest first.

   **positive patterns**
   security practices already in place that are working well.

   **summary**
   one paragraph: overall security posture of the changes, biggest concerns, and priority areas to address.
   </output_format>

7. This is read-only. Do not modify any files.
</steps>

<constraints>
- Trace user input end-to-end. Follow data from request entry points through to storage, rendering, or external calls.
- Read actual library documentation or source if needed to verify whether a usage pattern is safe.
- Only report findings grounded in code you read. Do not speculate or report theoretical issues without evidence in the codebase.
- Skip any section with nothing meaningful to report.
- Be direct about severity. Do not soften critical findings.
</constraints>
