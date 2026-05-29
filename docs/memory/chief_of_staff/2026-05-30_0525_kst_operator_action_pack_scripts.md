# CoS Memory - Operator Action Pack Scripts

Date: 2026-05-30 05:25 KST

Durable facts:

- Added repeatable operator action pack generation and verification scripts:
  - `scripts\windows\prepare-operator-action-pack.ps1`
  - `scripts\windows\verify-operator-action-pack.ps1`
- The action pack is a convenience wrapper for the remaining external release actions. It bundles the second-PC transfer zip, Partner Center submission copy, and support-mailbox verification email/template.
- The generator refuses dirty git state, verifies the latest final operator packet first, records source commit metadata, and excludes private `.pfx` material.
- The verifier checks required files, metadata schema, clean git metadata, final packet reference, nested second-PC and Partner Center zips, support template, checksums, and `.pfx` exclusion.
- This does not satisfy release gates. Public desktop release remains No-Go until second-PC MSIX install evidence, real multi-device evidence, `musu@musu.pro` inbox delivery evidence, and Partner Center/Microsoft Store approval evidence are recorded.
