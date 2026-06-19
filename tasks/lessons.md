# Lessons

- Treat prior agent completion claims as hypotheses until the corresponding build,
  database, and browser workflows have been independently verified.
- When the user supplies an original implementation plan, treat that artifact as
  authoritative and audit every checkbox before claiming milestone completion.
- Read UTF-8 source explicitly in Windows PowerShell before treating mojibake in
  terminal output as a defect in the application.
- Treat AI feedback as a hypothesis list, not a command list: implement the
  concrete issues that are real now, and file wider production-readiness audits
  as separate work when they need broad evidence.
- Any feature that fetches user- or spreadsheet-provided URLs from the server
  needs SSRF-style checks: timeout, size limits, redirect limits, content-type
  checks, and private/internal network blocking.
- When an admin edit changes login identity, update the profile, login account,
  and audit record together inside one transaction.
