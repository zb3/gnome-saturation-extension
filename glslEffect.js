import Shell from 'gi://Shell';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';

import { MAX_MONITORS_SUPPORTED } from './monitors.js';

const SHADER_DECL = `
uniform float use_per_monitor;
uniform float monitor_count; // Actual number of monitors with specific settings (0 to MAX_MONITORS_SUPPORTED)
uniform vec2 compositor_size;

uniform vec4 monitor_rects[${MAX_MONITORS_SUPPORTED}]; // x, y, width, height (top-left origin)
uniform float saturation_factors[${MAX_MONITORS_SUPPORTED + 1}]; // saturation factor per monitor
uniform float hue_shifts[${MAX_MONITORS_SUPPORTED + 1}]; // hue shift (radians) per monitor
uniform float color_inverts[${MAX_MONITORS_SUPPORTED + 1}]; // whether to invert colors per monitor

// Hue shift function
vec3 hueShift(vec3 col, float hue) {
    const vec3 k = vec3(0.57735, 0.57735, 0.57735);
    float cosAngle = cos(hue);
    return vec3(col * cosAngle + cross(k, col) * sin(hue) + k * dot(k, col) * (1.0 - cosAngle));
}`;

const SHADER_CODE = `
vec3 color = cogl_color_out.rgb;

float saturation_factor = saturation_factors[0];
float hue_shift = hue_shifts[0];
float invert_colors = color_inverts[0];

if (use_per_monitor == 1.0 && monitor_count > 0.0) {
    // cogl_tex_coord_in in my setup was always top left
    vec2 frag_coord = vec2(cogl_tex_coord_in[0].x * compositor_size.x,
                           cogl_tex_coord_in[0].y * compositor_size.y);

    for (int i = 0; i < ${MAX_MONITORS_SUPPORTED}; i++) {
        if (i >= int(monitor_count)) break;
        vec4 rect = monitor_rects[i];

        if (frag_coord.x >= rect.x && frag_coord.x < (rect.x + rect.z) &&
            frag_coord.y >= rect.y && frag_coord.y < (rect.y + rect.w))
        {
            saturation_factor = saturation_factors[i+1];
            hue_shift = hue_shifts[i+1];
            invert_colors = color_inverts[i+1];
            break;
        }
    }
}

if (invert_colors == 1.0) {
    color = 1.0 - color;
}

if (hue_shift != 0.0) {
    color = hueShift(color, hue_shift);
}

if (saturation_factor != 1.0) {
    // screen to linear - approx
    color = pow(color, vec3(2.2));

    float luminance = dot(color, vec3(0.212656, 0.715158, 0.072186));
    vec3 gray = vec3(luminance);
    float mix_factor = saturation_factor;
    if (mix_factor > 1.0) {
        mix_factor = 1.0 + (mix_factor - 1.0) * 5.0;
        vec3 delta = color - gray;
        delta = mix(delta, vec3(sign(delta.x)*0.0001, sign(delta.y)*0.0001, sign(delta.z)*0.0001), step(abs(delta), vec3(0.0001)));
        vec3 limit_pos = (1.0 - gray) / delta;
        vec3 limit_neg = gray / (-delta);
        vec3 limit = mix(limit_neg, limit_pos, step(vec3(0.0), delta));
        limit = min(limit, vec3(1e6));
        float max_factor = min(min(limit.x, limit.y), limit.z);
        mix_factor = min(mix_factor, max_factor);
    }
    color = mix(gray, color, mix_factor);

    // linear to screen - approx
    color = pow(color, vec3(1.0/2.2));
}

cogl_color_out.rgb = color;
`;

function compareFloatArray(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export const SaturationEffect = GObject.registerClass(
class SaturationEffect extends Shell.GLSLEffect {
    _usePerMonitorLocation = -1;
    _monitorCountLocation = -1;
    _compositorSizeLocation = -1;
    _monitorRectsLocation = -1;
    _saturationFactorsLocation = -1;
    _hueShiftsLocation = -1;
    _colorInvertsLocation = -1;
    _params = {};

    constructor(params) {
        super(params);

        this._usePerMonitorLocation = this.get_uniform_location('use_per_monitor');
        this._monitorCountLocation = this.get_uniform_location('monitor_count');
        this._compositorSizeLocation = this.get_uniform_location('compositor_size');
        this._monitorRectsLocation = this.get_uniform_location('monitor_rects');
        this._saturationFactorsLocation = this.get_uniform_location('saturation_factors');
        this._hueShiftsLocation = this.get_uniform_location('hue_shifts');
        this._colorInvertsLocation = this.get_uniform_location('color_inverts');
    }

    setMonitorParams(monitorCount, monitorRects, compositorSize) {
        this.set_uniform_float(this._monitorCountLocation, 1, [monitorCount]);
        this.set_uniform_float(this._monitorRectsLocation, 4, monitorRects);
        this.set_uniform_float(this._compositorSizeLocation, 2, compositorSize);
    }

    setParams(newParams) {
        if (newParams.use_per_monitor !== this._params.use_per_monitor) {
            this.set_uniform_float(this._usePerMonitorLocation, 1, [newParams.use_per_monitor]);
            this._params.use_per_monitor = newParams.use_per_monitor;
        }

        if (!compareFloatArray(newParams.saturation_factors, this._params.saturation_factors)) {
            this.set_uniform_float(this._saturationFactorsLocation, 1, newParams.saturation_factors);
            this._params.saturation_factors = newParams.saturation_factors.slice();
        }

        if (!compareFloatArray(newParams.hue_shifts, this._params.hue_shifts)) {
            this.set_uniform_float(this._hueShiftsLocation, 1, newParams.hue_shifts);
            this._params.hue_shifts = newParams.hue_shifts.slice();
        }

        if (!compareFloatArray(newParams.color_inverts, this._params.color_inverts)) {
            this.set_uniform_float(this._colorInvertsLocation, 1, newParams.color_inverts);
            this._params.color_inverts = newParams.color_inverts.slice();
        }

        this.queue_repaint();
    }

    vfunc_build_pipeline() {
        const hook = Cogl.SnippetHook ? Cogl.SnippetHook.FRAGMENT : Shell.SnippetHook.FRAGMENT;
        this.add_glsl_snippet(hook, SHADER_DECL, SHADER_CODE, false);
    }
});
