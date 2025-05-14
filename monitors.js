import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// this should work in prefs.js, so we can't use internal gnome-shell js

Gio._promisify(Gio.DBusConnection.prototype, 'call');

export const MAX_MONITORS_SUPPORTED = 4;

export async function getLogicalMonitors() {
    const logicalMonitors = (await Gio.DBus.session.call(
        'org.gnome.Mutter.DisplayConfig',
        '/org/gnome/Mutter/DisplayConfig',
        'org.gnome.Mutter.DisplayConfig',
        'GetCurrentState',
        null,
        new GLib.VariantType('(ua((ssss)a(siiddada{sv})a{sv})a(iiduba(ssss)a{sv})a{sv})'),
        Gio.DBusCallFlags.NONE,
        -1,
        null
    )).unpack()[2].deepUnpack();

    const ret = [];

    for (const lm of logicalMonitors) {
        const monitors = lm[5];

        const nm = {id: monitors[0][0], connectors: []};
        for (const pm of monitors) {
            nm.connectors.push(pm[0]);
        }

        // in case that's not persistent
        nm.connectors.sort();

        ret.push(nm);
    }

    return ret;
}
