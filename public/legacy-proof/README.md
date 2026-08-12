# Legacy proof runtime

This directory is the only browser boundary for the Tornado withdrawal circuit's legacy proving stack.

- `websnark-0.0.4-50fa113b.js` is vendored from `@tornado/websnark@0.0.4`, which embeds
  `@tornado/snarkjs@0.1.20` and `big-integer@1.6.42`.
- The vendored bundle accepts explicit memory/concurrency options and reports nested Groth16 worker
  failures. It is not processed or rewritten by Vite.
- `legacyProof.frame.js` loads the bundle in a separate same-origin realm, verifies its SHA-256 first,
  and exposes only a message-based `prove` operation.
- The frame is used because the old circuit evaluator's synchronous component graph exceeds the
  smaller JavaScript stack available to a modern dedicated Worker.

Update `src/config/legacyProofManifest.ts` and the known proof fixture whenever this bundle or either
proving asset changes.
