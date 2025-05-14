# gnome-saturation-extension
A GNOME extension that let's you change the saturation (and hue) of the whole screen. Requires GNOME 45 or later.

## Important limitations
It's not possible to adjust saturation and hue the same way [gnome-gamma-tool](https://github.com/zb3/gnome-gamma-tool) adjusts gamma, therefore this extension uses a different method (a GLSL effect), but that method has its limitations.

* the adjustment affects screenshots and screencasts
* screenshots and screencasts in practice won't even work properly, see [this bug report](https://gitlab.gnome.org/GNOME/mutter/-/issues/4051)
* HDR is most likely not supported (I can't test it due to lack of a HDR monitor)
* per-monitor settings only affect logical monitors and only if they're not mirrored, up to 4 monitors are supported
* it needs to be updated for each new GNOME version

## Manual installation
```
git clone https://github.com/zb3/gnome-saturation-extension saturation-extension@zb3.me
cd gnome-saturation-extension
mkdir -p ~/.local/share/gnome-shell/extensions
cp -r saturation-extension@zb3.me ~/.local/share/gnome-shell/extensions
```
Then you **need to** log out (GNOME requires this), and once you log back in, you can use `gnome-extensions-app` to enable and tweak it, or you can do it manually:
```
gnome-extensions enable saturation-extension@zb3.me
```
and to open the preferences window:
```
gnome-extensions prefs saturation-extension@zb3.me
```

## Hacking/Testing
After changing XML settings schema files, we need to rebuild the `gschemas.compiled` file:
```
glib-compile-schemas schemas/
```

To test changes without needing to log in and log out, we can run a nested gnome-shell instance:
```
dbus-run-session -- gnome-shell --nested --wayland
```
(then you need enable the extension inside that nested shell)

However, it's important to note that in practice, the GLSL code might run using the older `gles2` backend which uses GLSL 1.0 ES shaders that are more limited. To ensure these users don't get a blank screen after enabling the extension, we need to test this extension using that specific backend:
```
dbus-run-session -- env CLUTTER_DRIVER=gles2 gnome-shell --nested --wayland
```
