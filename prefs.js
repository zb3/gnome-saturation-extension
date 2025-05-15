import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { MAX_MONITORS_SUPPORTED, getLogicalMonitors } from './monitors.js';

class Preferences {
    _settings = null;
    _page = null;
    _monitorCombo = null;
    _saturationAdjustment = null;
    _hueAdjustment = null;
    _invSwitch = null;

    _activeMonitorId = null;
    _ignoreSettingChanges = false; // Flag to prevent recursive updates
    _monitorsInSettings = [];

    constructor(window, settings) {
        this._settings = settings;

        this._page = new Adw.PreferencesPage();

        // add this page now (synchronously) for compatibility with GNOME <47
        window.add(this._page);
    }

    _buildMonitorModel() {
        const _monitorModel = new Gtk.StringList();
        _monitorModel.append(_('All Monitors'));

        for (let t=0; t<this._logicalMonitors.length; t++) {
            _monitorModel.append(
                (t+1)+': '+this._logicalMonitors[t].connectors.join(', ')
            );
        }

        return _monitorModel;
    }

    _updateControlsForSelectedMonitor() {
        if (this._ignoreSettingChanges) return;

        this._ignoreSettingChanges = true; // Prevent feedback loops

        const satFactors = this._settings.get_value('saturation-factors').deep_unpack();
        const hueShifts = this._settings.get_value('hue-shifts').deep_unpack();
        const colorInverts = this._settings.get_value('invert-colors').deep_unpack();

        let index = 0;

        if (this._activeMonitorId) {
            index = this._monitorsInSettings.indexOf(this._activeMonitorId) + 1;
            if (!index) {
                if (this._monitorsInSettings.length === MAX_MONITORS_SUPPORTED) {
                    // need to evict something.. first try a monitor that is no longer present
                    // then the first one

                    let monitorToRemove = 0;

                    for (let t=0; t<this._monitorsInSettings.length; t++) {
                        let stillPresent = false;
                        for (let k=0; k<this._logicalMonitors.length; k++) {
                            if (this._monitorsInSettings[t] === this._logicalMonitors[k].id) {
                                stillPresent = true;
                                break;
                            }
                        }

                        if (!stillPresent) {
                            monitorToRemove = t;
                            break;
                        }
                    }

                    this._monitorsInSettings.splice(monitorToRemove, 1);
                    satFactors.splice(monitorToRemove, 1);
                    hueShifts.splice(monitorToRemove, 1);
                    colorInverts.splice(monitorToRemove, 1);
                }

                index = this._monitorsInSettings.length + 1;

                this._monitorsInSettings.push(this._activeMonitorId);

                // these are always filled with max..
                satFactors[index] = 1.0;
                hueShifts[index] = 0.0;
                colorInverts[index] = false;

                this._settings.set_value('saturation-factors', new GLib.Variant('ad', satFactors));
                this._settings.set_value('hue-shifts', new GLib.Variant('ad', hueShifts));
                this._settings.set_value('invert-colors', new GLib.Variant('ab', colorInverts));
                this._settings.set_strv('monitor-ids', this._monitorsInSettings);
            }
        }

        let currentSat = satFactors[index];
        let currentHue = hueShifts[index];
        let currentInvert = colorInverts[index];

        this._saturationAdjustment.set_value(currentSat);
        this._hueAdjustment.set_value(currentHue);
        this._invSwitch.set_active(currentInvert);

        this._ignoreSettingChanges = false;
    }

    _onMonitorSelectionChanged() {
        const index = this._monitorCombo.selected;

        if (!index) {
            this._settings.set_boolean('use-per-monitor-settings', false);
            this._activeMonitorId = null;
        } else {
            this._settings.set_boolean('use-per-monitor-settings', true);
            this._activeMonitorId = this._logicalMonitors[index-1].id;
        }

        this._updateControlsForSelectedMonitor();
    }

    _onSettingsChanged() {
        if (this._ignoreSettingChanges) return;

        const newSat = this._saturationAdjustment.get_value();
        const newHue = this._hueAdjustment.get_value();
        const newInvert = this._invSwitch.get_active();

        this._ignoreSettingChanges = true;

        let satFactors = this._settings.get_value('saturation-factors').deep_unpack();
        let hueShifts = this._settings.get_value('hue-shifts').deep_unpack();
        let colorInverts = this._settings.get_value('invert-colors').deep_unpack();

        let index = this._activeMonitorId ? this._monitorsInSettings.indexOf(this._activeMonitorId) + 1 : 0;

        satFactors[index] = newSat;
        hueShifts[index] = newHue;
        colorInverts[index] = newInvert;

        this._settings.set_value('saturation-factors', new GLib.Variant('ad', satFactors));
        this._settings.set_value('hue-shifts', new GLib.Variant('ad', hueShifts));
        this._settings.set_value('invert-colors', new GLib.Variant('ab', colorInverts));


        this._ignoreSettingChanges = false;
    }

    async _fillPreferencesPage(page) {
        this._logicalMonitors = await getLogicalMonitors();

        if (this._logicalMonitors.length > 1) {
            const usePerMonitor = this._settings.get_boolean('use-per-monitor-settings');

            const monitorGroup = new Adw.PreferencesGroup();
            page.add(monitorGroup);

            this._activeMonitorIndex = usePerMonitor ? 1 : 0;

            this._monitorCombo = new Adw.ComboRow({
                title: _('Apply Settings To'),
                model: this._buildMonitorModel(),
                selected: this._activeMonitorIndex
            });
            monitorGroup.add(this._monitorCombo);

            this._monitorCombo.connect('notify::selected', this._onMonitorSelectionChanged.bind(this));

            this._monitorsInSettings = this._settings.get_strv('monitor-ids');
        } else {
            this._settings.set_boolean('use-per-monitor-settings', false);
        }


        const satGroup = new Adw.PreferencesGroup({
            title: _('Saturation')
        });
        page.add(satGroup);

        this._saturationAdjustment = new Gtk.Adjustment({
            lower: 0,
            upper: 2,
            step_increment: 0.01,
            page_increment: 0.1,
            value: 1.0,
        });

        const saturationScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: this._saturationAdjustment,
            digits: 2,
            hexpand: true
        });
        saturationScale.add_mark(0, Gtk.PositionType.BOTTOM, '0');
        saturationScale.add_mark(1, Gtk.PositionType.BOTTOM, '1');

        satGroup.add(new Adw.PreferencesRow({
            title: _('Saturation Intensity'),
            child: saturationScale
        }));

        satGroup.add(new Adw.SpinRow({
            adjustment: this._saturationAdjustment,
            digits: 3
        }));

        this._saturationAdjustment.connect('value-changed', this._onSettingsChanged.bind(this));


        const hueGroup = new Adw.PreferencesGroup({ title: _('Hue Shift') });
        page.add(hueGroup);

        this._hueAdjustment = new Gtk.Adjustment({
            lower: 0,
            upper: 360,
            step_increment: 0.5,
            page_increment: 1,
            value: 0.0
        });

        const hueScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: this._hueAdjustment,
            digits: 1, hexpand: true
        });

        hueScale.add_mark(180, Gtk.PositionType.BOTTOM, '180°');

        hueGroup.add(new Adw.PreferencesRow({
            title: _('Hue Shift'),
            child: hueScale
        }));

        hueGroup.add(new Adw.SpinRow({
            adjustment: this._hueAdjustment,
            digits: 1
        }));

        this._hueAdjustment.connect('value-changed', this._onSettingsChanged.bind(this));

        const invGroup = new Adw.PreferencesGroup({});
        page.add(invGroup);

        this._invSwitch = new Adw.SwitchRow({
            title: _('Invert Colors'),
        })

        this._invSwitch.connect('notify::active', this._onSettingsChanged.bind(this));

        invGroup.add(this._invSwitch);

        this._updateControlsForSelectedMonitor();
    }

    async fill() {
        await this._fillPreferencesPage(this._page);
    }
}

export default class SaturationPrefs extends ExtensionPreferences {
    async fillPreferencesWindow(window) {
        const preferences = new Preferences(window, this.getSettings());
        await preferences.fill();
    }
}