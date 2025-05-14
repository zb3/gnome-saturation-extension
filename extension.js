import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { SaturationEffect } from './glslEffect.js';
import { MAX_MONITORS_SUPPORTED } from './monitors.js';

export default class SaturationExtension extends Extension {
    _settings = null;
    _effect = null;
    _monitorManager = null;
    _monitorCount = 0;
    _settingsChangedId = 0;
    _monitorChangedId = 0;

    enable() {
        this._settings = this.getSettings();
        this._monitorManager = global.backend.get_monitor_manager();

        this._effect = new SaturationEffect();

        Main.layoutManager.uiGroup.add_effect(this._effect);
        Main.layoutManager.uiGroup.connect('destroy', () => (this._effect = null));

        // Ensure effect applies over fullscreen windows
        if (Meta.disable_unredirect_for_display) {
            Meta.disable_unredirect_for_display(global.display);
        } else {
            global.compositor.disable_unredirect();
        }

        this._settingsChangedId = this._settings.connect('changed', (_, key) => this._syncSettings(key));
        this._monitorChangedId = Main.layoutManager.connect('monitors-changed', () => this._syncMonitorSettings());

        this._syncMonitorSettings();
        this._syncSettings();
    }

    _syncMonitorSettings() {
        if (!this._effect) return;

        const compositorSize = [Main.layoutManager.uiGroup.width, Main.layoutManager.uiGroup.height];

        const storedIds = this._settings.get_strv('monitor-ids');

        let monitorRects = [];
        let monitorCount = 0;

        for (let t=0; t<MAX_MONITORS_SUPPORTED && t<storedIds.length; t++) {
            let monitorIdx = this._monitorManager.get_monitor_for_connector(storedIds[t]);
            if (monitorIdx === -1) {
                continue;
            }

            const monitor = Main.layoutManager.monitors[monitorIdx];

            monitorRects.push(monitor.x, monitor.y, monitor.width, monitor.height);
            monitorCount++;
        }

        this._monitorCount = monitorCount;
        this._effect.setMonitorParams(monitorCount, monitorRects, compositorSize);
    }

    _syncSettings(key) {
        if (!this._effect) return;

        if (key === 'monitor-ids') {
            this._syncMonitorSettings();
        }

        const usePerMonitor = this._settings.get_boolean('use-per-monitor-settings');
        const storedSats = this._settings.get_value('saturation-factors').deep_unpack();
        const storedHuesDeg = this._settings.get_value('hue-shifts').deep_unpack();
        const storedColorInverts = this._settings.get_value('invert-colors').deep_unpack();

        const saturationFactors = [];
        const hueShifts = [];
        const colorInverts = [];

        for (let t=0; t<=this._monitorCount && t <= MAX_MONITORS_SUPPORTED; t++) {
            saturationFactors.push(parseFloat(storedSats[t] || 0.0));
            hueShifts.push(parseFloat(storedHuesDeg[t] || 0.0)*Math.PI/180);
            colorInverts.push(storedColorInverts[t] ? 1.0 : 0.0);
        }

        // glslEffect only allows setting float values
        this._effect.setParams({
            use_per_monitor: usePerMonitor ? 1 : 0,
            saturation_factors: saturationFactors,
            hue_shifts: hueShifts,
            color_inverts: colorInverts
        });
    }

    disable() {
        Main.layoutManager.disconnect(this._monitorChangedId);
        Main.layoutManager.uiGroup.remove_effect(this._effect);
        this._effect = null;

        // Restore unredirect
        if (Meta.enable_unredirect_for_display) {
            Meta.enable_unredirect_for_display(global.display);
        } else {
            global.compositor.enable_unredirect();
        }

        this._settings.disconnect(this._settingsChangedId);
        this._settings = null;
        this._monitorManager = null;
    }
}
