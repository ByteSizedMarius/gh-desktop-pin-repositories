# gh-desktop-pin-repositories

Adds the option to pin repos at the top of the list. 
Also disables auto-updates (as updating will require re-patching anyways; not tested yet whether this patch works – will show when next update releases). 
Sadly to get this working, you will need to set up the dev environment and compile gh desktop. 
Context: https://github.com/desktop/desktop/issues/8183, https://github.com/desktop/desktop/issues/3410

Please note:
- These are not languages I usually tinker with (PRs welcome)
- May be unstable. Works for me but not guarantees
- Tested on Windows only
- The resulting installer and executable will be unsigned
- Will use the Developer OAuth app for authentication. This will not work with enterprise. See [official docs](https://github.com/desktop/desktop/blob/development/docs/technical/oauth.md) regarding this

![Pinning Action](pin.gif)

## Apply

1. **Setup the dev env as per [official instructions](https://github.com/desktop/desktop/blob/development/docs/contributing/setup.md)**

2. **Prepare the github repository**
```
git clone https://github.com/desktop/desktop
cd desktop
git checkout 19c76e1
```
Latter command controls which version of github the patch is applied to. `19c76e1` is `3.4.18`. 
Changes to the patches may be required for newer versions.

3. **Clone the patches**
```
cd ..
git clone https://github.com/ByteSizedMarius/gh-desktop-pin-repositories
cd desktop
```

4. **Apply the patches**

This will:
- Add the ability to pin repositories in the list, as well as changing how the selected repository is shown \*
- Disable automatic updates, as this would remove the patch
- Fix the authentication handler, as when building for prod without the github desktop app tokens (which are obv not public), the wrong oauth callback is registered, making logging in more difficult

Note: If you also want to remove the recent section (I found it not to be necessary anymore with the ability to pin), apply `../gh-desktop-pin-repositories/add_pins_remove_recent.patch` instead of `add_pins.patch`

```
git apply ../gh-desktop-pin-repositories/add_pins.patch ../gh-desktop-pin-repositories/disable_auto_updates.patch ../gh-desktop-pin-repositories/fix_auth_handler.patch
```

5. **Build**
```
yarn
yarn build:prod
yarn package
```

If you instead just want to try it out (without replacing your current installation) you may run it in development mode first:
```
yarn
yarn build:dev
yarn start
```

6. **Install**
Yarn helpfully prints the installer path to the console.

It should work without having to uninstall your previous version, keeping your authentication, repositories and settings.

---

\* Previously pins/recents never showed as selected. When you selected a pin, the repository item lower down in the list would show as selected. This would cause the listview to scroll down to the selected repository next time you opened the repo-pane. Instead, now the pinned repositories will show as selected.