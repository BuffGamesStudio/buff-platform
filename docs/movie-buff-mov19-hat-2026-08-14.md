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

The room’s three recorded test runs were subsequently left through the normal
authenticated `leave_movie_buff_room` path. A read-back confirmed zero active
players in each test room. Smoke accounts were retained because no account
retention/deletion policy was supplied.

## Human signoff

- Named reviewer: **PENDING — no reviewer name and role were supplied**
- Production acceptance status: **Automated HAT PASS; named human acceptance
  not yet recorded**

Do not fill the reviewer field with an inferred operator or automation identity.
Provide the reviewer’s name and role to finalize the independent MOV-19 signoff.
