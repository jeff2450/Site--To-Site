# Site-to-App Converter — Full Build Specification

## 1. Product Summary

Build a web service that takes a live website URL (target audience: sites built with AI app builders like Lovable, Bolt.new, v0, Replit) and packages it into:
- An installable **Android APK** (WebView shell via Capacitor)
- A **Windows EXE** (BrowserWindow shell via Electron)

v1 scope: URL-wrapping only (Approach A). No arbitrary source-code execution on the server. This keeps the attack surface small and the product universal across every AI builder's output.

## 2. Tech Stack

**Frontend (converter site itself)**
- React + Vite + TypeScript + Tailwind
- Supabase: Auth, Postgres (jobs/users tables), Storage (build artifacts)

**Backend**
- Node.js + Fastify (or Express) — REST API for submitting/polling conversion jobs
- BullMQ + Redis — job queue for async builds
- Docker — isolated, ephemeral build containers per job

**App-generation templates**
- Android: Capacitor project, `server.url` pointed at the target site
- Windows: Electron project + `electron-builder`, `loadURL()` pointed at the target site

**Build infrastructure**
- Persistent VM (Hetzner/DigitalOcean, 8GB+ RAM) running Docker, not serverless functions — Gradle and Wine builds are too long-running/heavy for typical function limits
- Android build image: JDK + Android SDK cmdline-tools + Gradle
- Windows build image: Node + Wine + `electron-builder` (cross-compiles Windows EXE from Linux)

**Signing**
- One Android keystore for sideloaded APKs (v1). Play Store publishing deferred — requires the user's own developer account.
- Windows code-signing cert deferred to a paid tier (unsigned EXE works, just triggers a SmartScreen warning — disclose this in the UI).

## 3. Core Flow

1. User submits: target URL, app name, package ID / bundle ID, icon (image upload)
2. Job enqueued in BullMQ
3. Worker picks up job → spins up ephemeral Docker build container → clones the relevant template → injects validated config → runs the platform build command → uploads artifact to Supabase Storage → marks job complete
4. User polls job status, gets a **time-limited signed download URL** on completion

## 4. OWASP Top 10:2025 — Threat Model for This Service

The 2025 list reordered and merged several categories from 2021 (SSRF is now folded into Broken Access Control; two new categories — Software Supply Chain Failures and Mishandling of Exceptional Conditions — were added). Mapped to this specific app:

### A01 — Broken Access Control (includes SSRF)
This is the single biggest risk for a "give me a URL and I'll fetch/build something from it" service.
- **SSRF via the submitted URL**: if your backend ever fetches the URL server-side (to validate it, screenshot it for an icon, check headers, etc.), an attacker can point it at `http://169.254.169.254/latest/meta-data/` (cloud instance metadata), internal services, `localhost`, or RFC1918 ranges. Mitigation: resolve the hostname yourself, reject any URL resolving to a private/loopback/link-local IP, reject `file://`/`ftp://` schemes, only allow `https://`, and do this check again at request time (not just at submission — DNS rebinding attacks change the resolved IP between check and use).
- **Job/artifact ownership**: every job and download URL must be scoped to the user who created it. Use Supabase Row Level Security so a user can never poll or download another user's job by guessing/incrementing an ID. Use UUIDs, not sequential IDs, for job references.
- **Signed URLs**: artifact downloads should use short-lived signed URLs from Supabase Storage, not permanently public files.

### A02 — Security Misconfiguration
- Docker build containers: no privileged mode, no unnecessary capabilities, read-only filesystem where possible, dropped to a non-root user.
- No default credentials anywhere (Redis, Postgres, admin panels).
- Separate environment configs for dev/staging/prod — no debug endpoints or verbose stack traces reachable in production.
- Lock down which outbound network calls the build containers can make (they don't need general internet access if you're just running Gradle/electron-builder against local template files).

### A03 — Software Supply Chain Failures
- Your Capacitor and Electron templates are the thing every generated app inherits — pin exact dependency versions, run `npm audit` / Dependabot/Renovate on the templates continuously, and don't `npm install` inside a customer-facing build path without a lockfile.
- If you ever move to Approach B (building from a user's exported source), this becomes critical: never run `npm install`/`npm run build` on arbitrary user code without a fully sandboxed, network-restricted, ephemeral, resource-capped container — treat it as running untrusted code, because it is.
- Verify build tool images (JDK, Android SDK, electron-builder base images) come from official sources and are pinned to specific digests, not `:latest`.

### A04 — Cryptographic Failures
- The Android keystore and any future code-signing certs are your crown jewels — store them in a secrets manager (not env vars in plaintext, not in the repo), restrict which service/container can access them, and never let the private key leave the signing step.
- All traffic HTTPS-only, including internal calls between your API and build workers if they cross a network boundary.
- Supabase service-role keys stay server-side only, never shipped to the frontend.

### A05 — Injection
Very relevant here because user input (app name, package ID, icon filename) flows into build config files and shell/gradle commands.
- **Package ID / bundle ID**: strict allow-list validation — only `a-z0-9.` in the standard reverse-domain format. Reject anything else outright; don't sanitize-and-continue.
- **App display name**: escape for XML (it lands in `AndroidManifest.xml` / `strings.xml` and Electron's `package.json`/`Info.plist`-equivalent) — don't string-concatenate user input directly into config files; use a templating library that escapes by default.
- **Icon upload**: validate actual file content (magic bytes), not just the extension — don't trust `icon.png` as proof it's a PNG. Re-encode the image server-side (e.g., via `sharp`) rather than passing the uploaded bytes straight into the build — this neutralizes polyglot-file attacks.
- Never build shell commands via string concatenation with user input; use parameterized subprocess calls.

### A06 — Insecure Design
- **Abuse potential is the core design risk for this product**: nothing stops someone from wrapping a phishing site or a brand's real site (impersonation) into an APK/EXE that looks legitimate. Build this in from day one: Terms of Service prohibiting impersonation/phishing use, a reporting/takedown mechanism, and rate limiting per account/IP on job creation.
- Consider a basic automated check against the target URL (e.g., cross-reference against a phishing/malware blocklist API) before allowing a build.
- Rate-limit and CAPTCHA job submission to prevent mass-automated malicious app generation.

### A07 — Authentication Failures
- Use Supabase Auth rather than rolling your own; enforce email verification before allowing job submission (raises the cost of throwaway abuse accounts).
- Rate-limit login/signup endpoints; use Supabase's built-in protections (or add your own) against credential stuffing.

### A08 — Software or Data Integrity Failures
- Verify the integrity of your own build templates before each use (checksum the template repo state) so a compromised CI step can't silently inject malicious code into every generated app.
- If you sign APKs/EXEs, make sure the signing step happens in a trusted, isolated stage that only your pipeline can trigger — never expose a "sign this file" endpoint that takes arbitrary input.

### A09 — Security Logging and Alerting Failures
- Log every job (who, what URL, when, outcome) — this is both an abuse-investigation tool and a legal paper trail if someone reports a malicious app built through your service.
- Alert on anomalies: one account submitting many jobs rapidly, repeated jobs targeting the same third-party domain (possible impersonation pattern), build failures spiking (could indicate probing/attack attempts against the build pipeline).
- Don't log secrets (keystore passwords, Supabase service keys) even at debug level.

### A10 — Mishandling of Exceptional Conditions
- Build failures are routine here (bad URLs, unreachable sites, malformed icons) — handle them as expected states with clear user-facing errors, not raw stack traces or container logs leaking into the response.
- Make sure a crashed/killed build worker can't leave a job stuck "in progress" forever or leave orphaned containers running — timeouts and cleanup on every path, including crashes.

## 5. Non-OWASP but Service-Specific Risks Worth Flagging

- **Leaked credentials in wrapped sites**: some AI-builder sites embed API keys or Supabase anon keys client-side. You're not responsible for their security posture, but a short disclaimer in your UI ("we wrap your site as-is; make sure it doesn't expose secrets you don't want in a distributable app") is good practice.
- **Trademark/impersonation liability**: since anyone can submit any URL, your ToS should be explicit that users must own or have rights to the site they're converting, and you should respond promptly to takedown requests.
- **Windows SmartScreen / Android "unknown sources" friction**: not a security bug in your system, but disclose it to users so they're not surprised — an unsigned EXE and a sideloaded APK will both trigger OS warnings.

## 6. Suggested Build Order

1. Templates (Capacitor + Electron) working manually end-to-end for one hardcoded URL
2. API + queue + single build worker, no auth yet, local testing only
3. Add Supabase auth + RLS-scoped jobs table + signed download URLs
4. Add input validation/sanitization (A05) and SSRF-safe URL checks (A01) — do this before any public exposure
5. Add rate limiting, ToS, abuse reporting (A06)
6. Add logging/alerting (A09)
7. Public beta
