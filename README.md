# gh-desktop-patches

This repository contains multiple different patches for github desktop, including the ability to pin repositories at the top of the repo list.

Context: https://github.com/desktop/desktop/issues/8183, https://github.com/desktop/desktop/issues/3410

Please check [Notes](#notes) for the tradeoffs made by using this method.

![Pinning Action](pin.gif)

## Features

The following patches are available. They can be freely applied in any combination. 

| Patch | Description |
|-------|-------------|
| **pins** | Pin repositories to the top of the list |
| **archive** | Archive repositories to a section at the bottom of the list |
| **remove-recent** | Remove the "Recent" repositories section |
| **disable-auto-updates** | Disable automatic updates, as updating would remove the patches |
| **fix-auth-handler** | Fix the authentication handler, as when building for prod without the GitHub Desktop app tokens (which are not public), the wrong OAuth callback is registered, making logging in more difficult |
| **separate-instance** | Run alongside official GitHub Desktop or run multiple patched versions simultaneously with multiple accounts. Create one version without and one with this patch and install them both. See [Multiple Accounts](#multiple-accounts) |
| **worktree** *(experimental)* | Detect when a branch is checked out in another worktree and offer to add that worktree to GitHub Desktop |

To get pins to work, at least `pins` and `fix-auth-handler` are required. Without `disable-auto-updates`, the patched version will be overwritten on the next automatic update.

## Quick Start

> Requires Node.js, Git, and Yarn installed

```bash
node apply.js
```

### Flags

The script will:
1. Check prerequisites
2. Clone/setup the GitHub Desktop repository
3. Let you select which features to enable
4. Applies patches
5. Guide you through the build process

| Flag | Description |
|------|-------------|
| `--test` | Test all patch combinations |
| `--debug` | Run in dev mode (`yarn start`) instead of building |

## Notes

- These patches are for GitHub Desktop 3.5.2 (`release-3.5.2`)
- The resulting installer and executable will be unsigned
- Uses the Developer OAuth app for authentication. For enterprise installations or auth issues, install official GitHub Desktop first, authenticate, then run the patched installer to "update". See also [official docs](https://github.com/desktop/desktop/blob/development/docs/technical/oauth.md).
- If `separate-instance` is applied, a separate instance is installed, allowing multiple accounts on one machine

## Multiple Accounts

If you use two accounts, both will overwrite your global git config with whichever you install later. To fix this, keep the second account's repos in a dedicated directory and use a conditional git config:

**Default `~/.gitconfig`:**
```ini
[user]
    name = Your Name
    email = your@email.com

[includeIf "gitdir:C:/path/to/work-repos/**"]
    path = ~/.gitconfig-work
```

**`~/.gitconfig-work`:**
```ini
[user]
    name = Work Name
    email = work@email.com
```

This is just one way to solve this issue.