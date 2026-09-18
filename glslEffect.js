import Shell from 'gi://Shell';
import Cogl from 'gi://Cogl';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import {MAX_MONITORS_SUPPORTED} from './monitors.js';

const USE_SHADER_EFFECT = !Shell.GLSLEffect;

const SHADER_DECL = `
${USE_SHADER_EFFECT ? 'uniform sampler2D tex;' : ''}
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
${USE_SHADER_EFFECT ? 'cogl_color_out = cogl_color_in * texture2D (tex, vec2 (cogl_tex_coord_in[0].xy));' : ''}
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
    if (!a || !b || a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i])
            return false;
    }
    return true;
}

let _staticSnippet = null;


// Shared methods and uniform dispatch logic
const SaturationEffectCommon = {
    _initUniforms() {
        this._uniforms = {
            usePerMonitor: 'use_per_monitor',
            monitorCount: 'monitor_count',
            compositorSize: 'compositor_size',
            monitorRects: 'monitor_rects',
            saturationFactors: 'saturation_factors',
            hueShifts: 'hue_shifts',
            colorInverts: 'color_inverts',
        };
        this._params = {};
    },

    setMonitorParams(monitorCount, monitorRects, compositorSize) {
        this._setUniform(this._uniforms.monitorCount, 1, [monitorCount]);
        this._setUniform(this._uniforms.monitorRects, 4, monitorRects);
        this._setUniform(this._uniforms.compositorSize, 2, compositorSize);
        this.queue_repaint();
    },

    setParams(newParams) {
        if (newParams.usePerMonitor !== this._params.usePerMonitor) {
            this._setUniform(this._uniforms.usePerMonitor, 1, [newParams.usePerMonitor]);
            this._params.usePerMonitor = newParams.usePerMonitor;
        }

        if (!compareFloatArray(newParams.saturationFactors, this._params.saturationFactors)) {
            this._setUniform(this._uniforms.saturationFactors, 1, newParams.saturationFactors);
            this._params.saturationFactors = newParams.saturationFactors.slice();
        }

        if (!compareFloatArray(newParams.hueShifts, this._params.hueShifts)) {
            this._setUniform(this._uniforms.hueShifts, 1, newParams.hueShifts);
            this._params.hueShifts = newParams.hueShifts.slice();
        }

        if (!compareFloatArray(newParams.colorInverts, this._params.colorInverts)) {
            this._setUniform(this._uniforms.colorInverts, 1, newParams.colorInverts);
            this._params.colorInverts = newParams.colorInverts.slice();
        }

        this.queue_repaint();
    },
};

export let SaturationEffect;

if (USE_SHADER_EFFECT) {
    // GNOME >= 51 (Clutter.ShaderEffect)
    SaturationEffect = GObject.registerClass(
        class _SaturationEffect extends Clutter.ShaderEffect {
            constructor(params) {
                super(params);
                this._initUniforms();
            }

            _setUniform(uniform, nComponents, value) {
                if (nComponents === value.length) {
                    this.set_uniform_float(uniform, nComponents, value);
                } else {
                    const count = value.length / nComponents;
                    for (let i = 0; i < count; i++) {
                        this.set_uniform_float(`${uniform}[${i}]`, nComponents,
                            value.slice(i * nComponents, (i + 1) * nComponents));
                    }
                }
            }

            vfunc_get_static_snippet() {
                if (!_staticSnippet) {
                    _staticSnippet = Cogl.Snippet.new(
                        Cogl.SnippetHook.FRAGMENT,
                        SHADER_DECL,
                        null
                    );
                    _staticSnippet.set_replace(SHADER_CODE);
                }
                return _staticSnippet;
            }
        }
    );
} else {
    // GNOME < 51 (Shell.GLSLEffect)
    SaturationEffect = GObject.registerClass(
        class _SaturationEffect extends Shell.GLSLEffect {
            constructor(params) {
                super(params);

                this._initUniforms();

                for (const name of Object.keys(this._uniforms))
                    this._uniforms[name] = this.get_uniform_location(this._uniforms[name]);
            }

            _setUniform(uniform, nComponents, value) {
                this.set_uniform_float(uniform, nComponents, value);
            }

            vfunc_build_pipeline() {
                const hook = Cogl.SnippetHook ? Cogl.SnippetHook.FRAGMENT : Shell.SnippetHook.FRAGMENT;
                this.add_glsl_snippet(hook, SHADER_DECL, SHADER_CODE, false);
            }
        }
    );
}

Object.assign(SaturationEffect.prototype, SaturationEffectCommon);
