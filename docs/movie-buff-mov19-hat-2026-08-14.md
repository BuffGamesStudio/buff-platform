# Movie Buff MOV-19 production HAT

Capture: 2026-08-14T18:54:38Z–2026-08-14T18:55:36Z (UTC)

## Exact target

- Hosted production alias: <https://movie-buff-sigma.vercel.app>
- Vercel deployment: `dpl_3rLVt4ftZiXqa4erRsr9TwiXc3VX`
- Deployment Git SHA: `ac7bd7c44d29a92a03864b9fe888d4a9a00c1e9a`
- Production Supabase ref: `yfatwreicmiocdxzyznd`
- Automated witness: Codex two-client browser harness
- Test room: `3dbc45bf-6dff-42d0-859f-307275c69dbb`

The immutable Vercel deployment hostname required Vercel Authentication, so
the browser run used the public production alias after the alias-to-deployment
binding was verified from Vercel deployment metadata immediately beforehand.
The harness records the expected deployment ID and SHA and refuses hosted runs
without both values.

## Acceptance result

Automated behavior: **PASS**.

- Independent starts: **PASS**. Player one manually started at
  `2026-08-14T18:55:12.890075Z`; player two remained unstarted at that point.
- Automatic timer start: **PASS**. Player two auto-started at
  `2026-08-14T18:55:32.484852Z`, 19.594 seconds after player one, after the
  server launch window expired. The answer input then unlocked.
- Different answer times: **PASS**. Player one submitted at
  `2026-08-14T18:55:33.615202Z`; player two submitted at
  `2026-08-14T18:55:36.659120Z` (3.044 seconds apart).
- Waiting states: **PASS**. Before player two started, its UI showed the
  automatic-launch countdown. After player one answered, player one showed
  “Your answer is locked” while player two could still answer.
- Phase advancement: **PASS**. Both clients reached round results and the
  authoritative phase advanced from `playback` through `answer` to `results`.

The three earlier recorded test runs were subsequently left through the normal
authenticated `leave_movie_buff_room` path. A read-back confirmed zero active
players in each test room. Smoke accounts were retained because no account
retention/deletion policy was supplied.

## Final exact-production recheck

Capture: 2026-08-14T19:06:56Z–2026-08-14T19:08:30Z (UTC)

- Target binding: the same production alias, deployment
  `dpl_3rLVt4ftZiXqa4erRsr9TwiXc3VX`, SHA
  `ac7bd7c44d29a92a03864b9fe888d4a9a00c1e9a`, and Supabase ref
  `yfatwreicmiocdxzyznd`.
- Test room: `38d57936-b314-4886-9efd-8739703216e6`.
- Independent starts: **PASS**. Player one manually started at
  `2026-08-14T19:07:31.645349Z`; player two remained unstarted.
- Automatic timer start: **PASS**. Player two auto-started at
  `2026-08-14T19:07:51.495195Z`, 19.850 seconds after player one; the answer
  input then unlocked.
- Different answer times: **PASS**. Player one submitted at
  `2026-08-14T19:07:52.933652Z`; player two submitted at
  `2026-08-14T19:07:56.751397Z` (3.818 seconds apart).
- Waiting states: **PASS**. Player two saw the automatic-launch countdown;
  after player one answered, player one was locked while player two could
  still answer.
- Phase advancement: **PASS**. Both clients reached results and the
  authoritative phase advanced from `playback` through `answer` to `results`.
- Cleanup: the browser leave sub-check did not complete, so both identities
  were signed in again and left through the normal authenticated
  `leave_movie_buff_room` RPC. Read-back confirmed both `left_at` values are
  set and zero active players remain; the room is cancelled. Smoke accounts
  remain retained under the policy stated above.

Final automated HAT result: **PASS**.

## Named independent human signoff for the current candidate

Recorded at: `2026-08-15T22:48:48-04:00` (America/New_York)

- Named reviewer: `emperor9`
- Role: `Independent QA reviewer`
- Independence: **CONFIRMED**
- Hosted production alias: <https://movie-buff-sigma.vercel.app>
- Vercel deployment: `dpl_2HGWmvGoZ53DdfL1kSa2X91QcuvU`
- Deployment Git SHA: `9077a7f1cb40f5a4d47ab8a742e205c56248aaa3`
- Production Supabase ref: `yfatwreicmiocdxzyznd`
- Test room: `a11a5368-0d82-40a2-85c2-f8e64e36db14`
- Independent manual starts: **PASS**
- Automatic timer start: **PASS**
- Waiting states: **PASS**
- Different answer times: **PASS**
- Phase advancement: **PASS**
- Production acceptance: **APPROVED**

The named reviewer supplied the completed acceptance record after observing the
two-client production run. This supersedes the pending-human status for the
current candidate; the earlier automated captures above remain historical
records for their respective deployment.
