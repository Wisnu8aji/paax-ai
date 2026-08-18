# Tool execution environment ownership

The environment owns the final capability decision for workspace operations:
root resolution, protected paths, symlink policy, read/search bounds, command
allowlist, process timeout, abort, cleanup, and redacted audit hashes. The
conversation loop and approval service do not replace those checks.

`ToolExecutor` creates one immutable, invocation-bound `ToolExecutionContext`
after the canonical preflight and journal gate. An approved operation receives
an immutable `ToolApprovalReceipt` containing only the approval identity,
binding fingerprint, decision time, and expiry. The receipt confirms a human
decision; it cannot add permissions, expand a root, change a command, increase
a limit, or alter a timeout.

`LocalEnvironment` independently validates the context identity and policy when
one is supplied, then repeats its own path/command/limit/abort checks. The
legacy `approvalGranted` compatibility flag is not an authority for execution.
Docker and SSH remain explicit unsupported backends and never fall back to the
local process.
