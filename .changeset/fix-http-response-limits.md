---
"@mail-edge/http-client": patch
---

Return typed failures and cancel the owning stream when JSON responses exceed the byte limit.
Preserve uncertain delivery when response consumption fails.
