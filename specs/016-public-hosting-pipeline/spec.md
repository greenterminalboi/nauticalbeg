# Feature Specification: Public Hosting & Deployment Pipeline

**Feature Branch**: `016-public-hosting-pipeline`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Host NauticalBeg so people can access it publicly, with a deployment pipeline." Decisions made in conversation on 2026-09-25: host on Cloudflare Pages at the free `*.pages.dev` address (no custom domain for now); pipeline on GitHub Actions with preview deploys for pull requests and production deploys on push to `main`. Build this before 017 (share links), which needs a public address to point at.

## Background (findings, 2026-09-25)

- NauticalBeg runs entirely in the browser: it reads, parses, stores and draws the save on the user's own machine. Hosting it means serving static files; there is no server to run for this feature.
- Today it only runs locally, through the Vite dev server (`npm run dev`) or the dev-only `Dockerfile`. There is no production build step for serving, and there is no CI (no `.github/` directory). The repo is on GitHub.
- The dev server sends two cross-origin isolation headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). `ARCHITECTURE.md` records that the in-browser database *may* not need them, but this was never confirmed. The hosted site either sends them too or has to prove they aren't needed.
- The production build is about 126MB. The two largest files are the in-browser database engine files (about 33MB and 38MB). The chosen host limits single files to 25MB, so the build as it stands today cannot be uploaded unchanged. The two map files (15–16MB each) are under the limit but large enough that compression and caching matter.
- The app ships derived data under existing permissions: traced map geometry (allowed by the asset stance in the constitution), Encyclopedia reference data (constitution's Encyclopedia-data exception), and the pdx.tools EU5 token file (permission recorded in `specs/015-save-format-support/spec.md`). Public hosting is the first time any of this reaches people other than the project owner.
- The test suite has known flakiness: one chart test fails intermittently, and the whole suite times out on a busy machine. A pipeline that blocks deploys on tests has to handle this.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open NauticalBeg from a link (Priority: P1)

An EU5 player gets a link to NauticalBeg on Discord or a forum. They open it in their browser, with nothing to install and no account to create. They drop in their save and get the same Overview, map and tabs the project owner sees locally. Their save never leaves their computer.

**Why this priority**: This is the feature. Everything else supports getting here and staying here.

**Independent Test**: From a machine that has never run the project, open the public address in an up-to-date Chrome, Firefox and Safari, load the real `MP_RUS_1657_01_03_….eu5` save, and confirm it reaches the loaded state with the same in-game date, player nation and Overview headline figures as the local dev build shows for the same file.

**Acceptance Scenarios**:

1. **Given** a visitor with an up-to-date desktop browser and no prior visit, **When** they open the public address, **Then** the app's start screen appears without errors.
2. **Given** the hosted app, **When** a visitor loads a save (text, compressed or binary, per 015), **Then** it reaches the loaded state and every tab and map mode shows data, matching the local build for the same file.
3. **Given** a visitor loads a save on the hosted app, **When** their network traffic is inspected, **Then** no request carries save contents or anything derived from them off the device.
4. **Given** a visitor who has already loaded the app once, **When** they come back, **Then** the large app files are not downloaded again unless a new version has been deployed.
5. **Given** a visitor kept a save on a previous visit (the existing "keep" feature), **When** they return to the same address in the same browser, **Then** they can resume it as they can locally today.

---

### User Story 2 - Changes reach the public site automatically (Priority: P1)

The project owner merges or pushes a change to `main`. Without running any manual deploy step, the checks run, and if they pass, the public site is updated. If the checks fail, the public site stays on the last good version and the owner can see why.

**Why this priority**: The owner asked for the pipeline as part of hosting. Without it, every future feature (017 onward) needs a manual, error-prone release.

**Independent Test**: Push a small visible change (for example, the version shown in the app) to `main` and confirm it appears on the public site with no manual step. Then push a change that deliberately fails a test and confirm the public site does not change and the failure is visible in GitHub.

**Acceptance Scenarios**:

1. **Given** a push to `main` whose checks pass, **When** the pipeline finishes, **Then** the public site serves the new version.
2. **Given** a push to `main` whose checks fail (type check, tests or build), **When** the pipeline finishes, **Then** the public site keeps serving the previous version and the failing step is shown in GitHub.
3. **Given** a bad version reached the public site, **When** the owner wants to undo it, **Then** they can put the previous version back within 5 minutes without rebuilding it.
4. **Given** any deploy, **When** a visitor opens the app, **Then** they can tell which version they are on (for bug reports).

---

### User Story 3 - Preview a change before it goes public (Priority: P2)

The owner opens a pull request. The pipeline runs the same checks and publishes that branch to its own preview address, and posts the address on the pull request. The owner clicks through the change on a real hosted copy before merging. The public site is not affected.

**Why this priority**: Very useful, but the site works without it. Several past bugs only showed up in a real browser, so being able to test the hosted version before merging is worth having.

**Independent Test**: Open a pull request with a visible change and confirm a preview address is posted on it, the preview shows the change, and the public address does not.

**Acceptance Scenarios**:

1. **Given** a pull request, **When** its checks pass, **Then** a preview address for that branch is posted on the pull request.
2. **Given** a preview is live, **When** the public address is opened, **Then** it still shows the `main` version.
3. **Given** new commits are pushed to the pull request, **When** the pipeline finishes, **Then** the preview shows the latest commit.

---

### Edge Cases

- **Unsupported or old browser**: the visitor sees a clear message that their browser is missing something the app needs (e.g. private browsing blocking local storage), instead of a blank page or a stuck loading screen.
- **Mobile visitor**: the site opens. Loading a large save on a phone may fail for lack of memory; if it does, the visitor sees a clear error, not a frozen tab. Mobile support is otherwise out of scope.
- **Deploy lands while a visitor is using the app**: their current session keeps working. The new version is picked up on their next load, without a half-old, half-new app.
- **Slow connection**: the one-time download of the large app files shows progress, per constitution Principle V.
- **File over the host's size limit**: the build step fails with a message naming the file, rather than deploying a site with a missing piece.
- **Flaky test**: an intermittent test failure does not silently block releases, and does not silently let real failures through either (see FR-011).
- **Deploy credentials missing, expired or revoked**: the pipeline fails clearly at the deploy step; checks still run.
- **Pull request from a fork**: checks run but no preview is published, and deploy credentials are never exposed to fork code.
- **Chosen `pages.dev` name already taken**: the host assigns a variant; the actual address is recorded in the README.

## Requirements *(mandatory)*

### Functional Requirements

**Public site**

- **FR-001**: NauticalBeg MUST be reachable at a public HTTPS address on the host's free subdomain, with no login or account.
- **FR-002**: The hosted app MUST offer every capability the local build does, including all 015 save formats, the keep/resume feature, the map, map modes, the Encyclopedia and every tab.
- **FR-003**: Save files and anything derived from them MUST stay on the visitor's device, as they do locally (constitution Principle I). The hosted site MUST NOT add analytics, telemetry or crash reporting that could receive save contents.
- **FR-004**: The hosted site MUST send whatever browser headers the app needs to run (the cross-origin isolation headers), or the plan MUST show by testing in a real browser that the app works fully without them.
- **FR-005**: Every file the app needs MUST be deployable within the host's per-file size limit. If a file is instead served from a third-party source, that source MUST only serve app code, never receive save data, and be recorded in the security constitution.
- **FR-006**: Large, rarely-changing files (database engine, map data, Encyclopedia data) MUST be compressed in transit and cached by the browser, so a returning visitor doesn't download them again unless they changed.
- **FR-007**: The app MUST show which deployed version it is (e.g. a short commit ID or version number) in a place a visitor can find for bug reports.
- **FR-008**: If the visitor's browser lacks a capability the app requires, the app MUST say so plainly instead of failing silently.

**Pipeline**

- **FR-009**: Every push to `main` MUST run the type check, the test suite and the production build, and MUST deploy to the public site only if all three pass.
- **FR-010**: Every pull request MUST run the same checks. Pull requests from the owner's own repo MUST also get a preview deploy at a separate address, posted on the pull request. Pull requests from forks MUST NOT get deploy credentials.
- **FR-011**: Known-flaky tests MUST be handled explicitly: either fixed as part of this feature, or listed as known-flaky with a documented retry, so they neither block deploys at random nor hide real failures.
- **FR-012**: A failed pipeline MUST leave the public site on its previous version and show which step failed.
- **FR-013**: The owner MUST be able to put the previous version back live within 5 minutes without rebuilding it, and the steps MUST be written down.
- **FR-014**: Deploy credentials MUST be kept only as encrypted repository secrets, never committed or printed in logs, and scoped to the least access needed to deploy this one site. The security constitution's "Secrets Management" section MUST be updated to describe them.
- **FR-015**: The steps to set up hosting from scratch (create the host project, create and store the credentials, first deploy) MUST be written down so the project owner can redo them without this conversation.

**Redistribution**

- **FR-016**: Before the first public deploy, everything the site ships MUST be checked against the constitution's redistribution rules: no Paradox art, icons or textures, and only permitted derived data (map geometry, Encyclopedia data, the pdx.tools token file). The site MUST carry a short notice that NauticalBeg is an unofficial fan tool not affiliated with Paradox Interactive.

### Key Entities

- **Deployment**: one published version of the site, tied to one commit. Either production (the public address) or a preview (one per pull request branch). The previous production deployment stays available for rollback.
- **Pipeline run**: the checks and optional deploy triggered by a push or pull request, with a pass/fail result per step.
- **Deploy credential**: the secret that lets the pipeline publish to the host, stored as a repository secret.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor on a 50 Mbps connection sees the start screen within 5 seconds of opening the public address.
- **SC-002**: The real `MP_RUS_1657` save loads on the hosted site and shows the same in-game date, player nation and Overview headline figures as the local build, in the latest Chrome, Firefox and Safari.
- **SC-003**: A returning visitor with no new deploy since their last visit re-downloads less than 1MB before the start screen appears.
- **SC-004**: A change pushed to `main` is live on the public site within 15 minutes, with no manual step.
- **SC-005**: Over 10 consecutive pipeline runs with no code change, zero fail because of flaky tests.
- **SC-006**: Rolling back to the previous version takes under 5 minutes, measured in one real rehearsal.
- **SC-007**: While a save is loaded and explored on the hosted site, zero network requests carry save contents (checked in the browser's network panel).
- **SC-008**: Hosting costs $0 per month at beta traffic.

## Assumptions

- Host is Cloudflare Pages on the free `*.pages.dev` address; no custom domain for now (decided 2026-09-25). A custom domain can be added later without changing the pipeline.
- Pipeline is GitHub Actions on the existing GitHub repo (decided 2026-09-25).
- The project owner creates the Cloudflare account and adds the deploy credential to GitHub themselves; they are never pasted into chat or committed.
- Desktop browsers are the target. Mobile only needs to open and fail gracefully.
- Beta traffic stays within the host's free tier.
- The pdx.tools token permission covers serving the token file from a public site. The owner re-confirms this with pdx.tools before the first public deploy if unsure. If it doesn't, text saves still work and binary saves fall back to the 015 "no token table" path.
- Share links, a backend and storage are out of scope; they belong to 017.
- No visitor accounts, analytics, or usage tracking.
