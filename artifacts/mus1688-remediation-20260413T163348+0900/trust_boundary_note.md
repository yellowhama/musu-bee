# MUS-1688 trust-boundary note (token-only remediation)

- This remediation packet is restricted to visual token surfaces only (`globals.css`, `landing-exp/*`, `brand-tokens.test.ts`).
- The authoritative patch (`token_scope_full.patch`) contains no `AppShell` or workspace/company scope-routing logic.
- Query usage in-scope is limited to `searchParams.waitlist` on `landing-exp/page.tsx` and is used only for rendering success/error copy state.
- No tenant selection, auth scope mutation, or route scope synchronization behavior is changed in this packet.
- No style injection sinks were introduced in-scope (`dangerouslySetInnerHTML`, inline `style={...}`, dynamic CSS property writes).
