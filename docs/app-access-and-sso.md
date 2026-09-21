# Who Can Use Your App?

Sign-in proves who someone is. It does not give them access to your workspace.

When you add authentication, Gofer asks:

> Who should be able to use this app: only members of its EAI workspace
> (recommended), or any authenticated EAI user?

The default is **workspace-only**. Gofer records your answer in the feature
specification. It asks again if you change this choice, not on every message.
Without an answer, Gofer must not broaden access.

The wider option lets EAI users enter the agreed app experience. It does not
give them your workspace's records, files, membership, or admin rights. Those
permissions need separate checks on the server.

## Can Users Use Their Company Sign-In?

This is a separate choice. Client single sign-on (SSO) lets staff use their
company identity through EAI. It must not change who may use the app.

Gofer first checks what your deployed EAI version and plan support. It does not
assume an SSO command or setup screen exists. Your EAI tenant administrator and
company identity administrator may need help from EAI platform support.

Microsoft supports company Entra sign-in through federation. This does not prove
that a particular EAI installation has a tested setup path.
[Microsoft setup guide](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-entra-id-federation-customers).

Before switching, test a pilot user, an unauthorized user, and a protected EAI
request. Preserve existing memberships and roles. Keep a tested recovery path.
Adding an SSO provider does not automatically migrate existing accounts.

## What Does This Change Protect?

Gofer requires tests for workspace members, non-members, removed members,
cross-workspace requests, and unavailable permission checks when auth is in
scope. A local prototype without authentication does not need these tests yet.

Updating Gofer does not repair a running app automatically. Existing apps need
their own code review, access tests, and release before the fix is live.
