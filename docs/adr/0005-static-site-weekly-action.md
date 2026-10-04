# 0005: Static site refreshed by a weekly GitHub Action

**Status:** accepted 2026-10-04

**Decision:** a Node script fetches and computes, then writes JSON. A static HTML dashboard reads that JSON. A scheduled GitHub Action refreshes it weekly and Vercel serves it. There's no server, no database and no login.

**Why:** nobody needs to log in, and the data changes weekly. A Next.js + Supabase stack (as in Redline) would add moving parts without adding value. Zero runtime dependencies also keeps the repo easy to audit.
