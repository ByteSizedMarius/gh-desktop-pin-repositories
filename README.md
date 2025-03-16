# gh-desktop-pin-repositories

Adds the option to pin repos at the top of the list. Also disables auto-updates (as updating will require re-patching anyways; not tested yet whether this patch works – will show when next update releases). Sadly to get this working, you will need to set up the dev environment and compile gh desktop. Context: https://github.com/desktop/desktop/issues/8183.

Please note:
- These are not languages I usually tinker with (PRs welcome)
- May be unstable. Works for me but not guarantees
- Tested on Windows only

![Pinning Action](pin.gif)

## Apply

1. Setup the dev env as per [official instructions](https://github.com/desktop/desktop/blob/development/docs/contributing/setup.md)
2. `git clone https://github.com/desktop/desktop`
3. `cd desktop`
4. `git checkout 19c76e1`. This controls which version of github the patch is applied to. `19c76e1` is `3.4.18`.
6. Download the [patch](add-pins.patch).
5. `git apply add-pins.patch`
6. `yarn`
7. `yarn build:prod`
8. `yarn package`
9. Install (yarn helpfully prints the installer path to the console). Should work without having to uninstall the other version.