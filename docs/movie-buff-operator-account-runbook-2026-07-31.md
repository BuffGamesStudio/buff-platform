# Movie Buff operator account runbook

Date: Friday, July 31, 2026

## Purpose

This runbook covers the exact production steps needed to create the first real
Buff Games operator account for Movie Buff soft launch.

## Current proven production state

- Hosted app: `https://movie-buff-sigma.vercel.app`
- Current live browser session can be anonymous and still show as signed in.
- As of Friday, July 31, 2026, production hosted auth has:
  - anonymous users present
  - smoke/test users present
  - no real non-test full Buff Games account yet
- Hosted admin and rotation pages are proven to work for a real admin user once
  that user exists and has the correct role.

## Verified upgrade path

Verified on hosted production:

- Account page: `https://movie-buff-sigma.vercel.app/account`
- Anonymous account warning is shown on the account page
- Upgrade link routes to:
  - `https://movie-buff-sigma.vercel.app/sign-up?next=%2Faccount`

Verified sign-up form fields:

- Display name
- Email
- Password
- Create Buff Games Account
- Continue with Google

## Required operator setup steps

1. Open:
   - `https://movie-buff-sigma.vercel.app/account`
2. If the page says the session is anonymous, click:
   - `Upgrade Account`
3. On the sign-up page, create the real production account using either:
   - email + password
   - Google sign-in
4. Return to the account page and confirm the anonymous-session warning is gone.
5. Send the chosen account email to Codex.

## Codex follow-up steps after the user provides the email

1. Verify the account exists in hosted Supabase Auth.
2. Grant `platform_role = 'admin'` in the production `profiles` row.
3. If needed, also verify the hosted user metadata/app metadata are aligned.
4. Sign in with that account on hosted production.
5. Verify:
   - `/account`
   - `/admin`
   - `/admin/movies`
   - `/admin/sources`
   - `/admin/analytics/clips`
   - `/admin/analytics/rotation`
6. Rerun the full launch audit against the current production deployment.

## Risks

- The user may remain in an anonymous session and think they are fully signed in.
- The chosen account may be created successfully in Auth but not yet granted the
  application admin role.
- The operator account may work for sign-in but still fail admin checks until the
  `profiles.platform_role` row is updated.

## Launch gate

Movie Buff should not be treated as operationally soft-launch-ready until at
least one real non-test production Buff Games operator account exists and has
verified hosted admin access.
