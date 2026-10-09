# Runtime service configuration in this app — requirements

The mechanism, the reasoning, the rejected alternatives and the measurements
that motivated all of it live with the shared package, in its
`specs/runtime-config/` and `docs/runtime-config-adoption.md`. This file records
only what is required here.

## Why this app needs changing

Measured before the change: the relay was decided by a literal in `src/App.tsx`
and the file host by a literal in `src/components/SlideEditor.tsx`, both frozen into
the bundle at build time. The signer was not decided here at all; the app passed
no `signerUrl` and silently inherited the shared library's hardcoded production
default, so it could not be redirected without changing the library.

Consequence: a staging deployment of this image would have talked to the
production relay, the production file host and the production signer, and a
staging signup would have created a real production account.

## Required here

1. The same built image serves production and staging, differing only in the
   environment given at container start.
2. With no environment given, behaviour is byte-for-byte what it is today: the
   production relay and the production file host, from the build args.
3. The relay, file host and signer are all redirectable. Converting only the
   relay would pass a careless review and still reach production.
4. The decision has one testable home in this app, rather than one literal per
   component. The previous arrangement could not be asserted about without
   rendering the app, which is why it drifted to literals and stayed there.
5. The configuration is readable before the bundle executes.
6. The configuration is not cached. This app hard-caches everything whose name
   ends in the script extension for a year, so the configuration needs an
   exact-match location to outrank that rule.

## Done criteria, as set by the orchestrator

- Production unchanged: the no-environment run reports production hosts.
- The staging run reports staging hosts **and makes no request to a production
  host**. The second half is the stronger claim and is the one checked, because
  a stray fetch to a production file host would satisfy the first half alone.
