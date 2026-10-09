# Runtime service configuration in this app — design

Mechanism and justification: with the shared package. Here is what changes in
this repo.

## Five changes

1. **One service-address module.** `src/lib/serviceAddresses.ts` exports
   `resolveServiceAddresses()`, which delegates to the shared reader. Thin on
   purpose, and its purpose is testability: it gives this app one named place
   where service addresses are decided, and that place has a test. The relay was
   previously decided in `App.tsx` and the file host in `SlideEditor.tsx`, neither
   assertable without rendering the app.

2. **The serving config becomes a template.** `nginx.conf` moves to
   `nginx.conf.template`, copied into the base image's template directory rather
   than its active config directory, and gains one location that returns the
   configuration.

   The exact-match form (`location = /config.js`) is load-bearing, not
   stylistic. This config already hard-caches `*.js` for a year via a regex
   location. An exact match outranks a regex match; a prefix match does not.
   With a prefix match a browser would cache the configuration for a year and
   keep using whichever environment it first saw.

3. **The entry page loads it before the bundle**, as a plain script tag rather
   than a fetch, because app modules capture these URLs at import time.

4. **The serving stage carries production defaults** as environment lines, and
   restricts the substitution filter to our own prefix. The defaults are what
   make an empty environment resolve to production. The filter matters because
   the substitution tool replaces any `$NAME` it recognises and this config
   contains nginx's own `$uri`.

5. **The signer is passed explicitly** to the shared auth provider. It was
   omitted before, which inherited a hardcoded production default.

## What is deliberately not changed

The build arguments stay. They are what makes the no-environment case resolve to
production for values the bundle reads directly, so removing them would turn
this from an additive change into a behavioural one for a live service.

The shared library's own remaining production literals are not touched here.
Four of them still override anything this app does, and they are owned
elsewhere and routed.
