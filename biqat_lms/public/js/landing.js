(function () {
	"use strict";

	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 1.5);
	const canvas = document.getElementById("webgl-canvas");
	let gl;
	try {
		gl = canvas.getContext("webgl", { alpha: false, antialias: false });
	} catch (_) {
		return;
	}

	if (!gl) {
		console.warn("WebGL not supported on this device");
		return;
	}

	function resize() {
		canvas.width = window.innerWidth * pixelRatio();
		canvas.height = window.innerHeight * pixelRatio();
		gl.viewport(0, 0, canvas.width, canvas.height);
	}

	resize();

	const vsSource = `
        attribute vec2 position;
        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `;

	const fsSource = `
        precision highp float;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform float u_time;

        // Simplex / hash noise
        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.1;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);
          vec2 mouse = (u_mouse - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

          // Solar Core coordinates slightly offset towards mouse
          vec2 sunPos = mouse * 0.15 + vec2(0.25, 0.05);
          vec2 p = uv - sunPos;
          float r = length(p);
          float angle = atan(p.y, p.x);

          // Ray noise
          float rays = fbm(vec2(angle * 3.0, u_time * 0.15)) * 0.35 +
                       fbm(vec2(angle * 7.0 - u_time * 0.1, r * 2.0)) * 0.25;

          // Corona radius
          float sunRadius = 0.38;
          float corona = 1.0 - smoothstep(sunRadius - 0.05, sunRadius + 0.5 + rays * 0.4, r);
          
          // Eclipse dark core
          float core = smoothstep(sunRadius - 0.08, sunRadius, r);

          // Solar Flare Color Gradient (Obsidian, Amber flare, Solar Gold)
          vec3 darkVoid = vec3(0.02, 0.024, 0.03);
          vec3 amber = vec3(1.0, 0.45, 0.15);
          vec3 gold = vec3(1.0, 0.85, 0.45);
          vec3 whiteCorona = vec3(1.0, 0.98, 0.92);

          vec3 color = mix(darkVoid, amber, pow(corona, 2.5));
          color = mix(color, gold, pow(corona, 4.0) * (0.8 + rays * 0.5));
          color = mix(color, whiteCorona, pow(corona, 7.0));

          // Eclipse shadow inside
          color *= core;

          // Soft vignette around edges
          float vignette = 1.0 - smoothstep(0.5, 1.4, length(uv));
          color *= vignette;

          gl_FragColor = vec4(color, 1.0);
        }
      `;

	function createShader(gl, type, source) {
		const shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			gl.deleteShader(shader);
			return null;
		}
		return shader;
	}

	const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
	const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
	if (!vs || !fs) return;
	const program = gl.createProgram();
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
	gl.useProgram(program);

	const posBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
		gl.STATIC_DRAW,
	);

	const posLocation = gl.getAttribLocation(program, "position");
	gl.enableVertexAttribArray(posLocation);
	gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

	const uRes = gl.getUniformLocation(program, "u_resolution");
	const uMouse = gl.getUniformLocation(program, "u_mouse");
	const uTime = gl.getUniformLocation(program, "u_time");

	let mouseTargetX = window.innerWidth * 0.5;
	let mouseTargetY = window.innerHeight * 0.5;
	let mouseCurrentX = mouseTargetX;
	let mouseCurrentY = mouseTargetY;

	window.addEventListener("mousemove", (e) => {
		mouseTargetX = e.clientX;
		mouseTargetY = window.innerHeight - e.clientY;
	});

	const startTime = performance.now();
	let frame;
	let contextLost = false;
	let heroVisible = true;
	function renderLoop() {
		frame = null;
		if (contextLost || document.hidden || !heroVisible) return;
		const now = reducedMotion.matches ? 0 : (performance.now() - startTime) * 0.001;
		mouseCurrentX += (mouseTargetX - mouseCurrentX) * 0.05;
		mouseCurrentY += (mouseTargetY - mouseCurrentY) * 0.05;

		gl.uniform2f(uRes, canvas.width, canvas.height);
		gl.uniform2f(uMouse, mouseCurrentX * pixelRatio(), mouseCurrentY * pixelRatio());
		gl.uniform1f(uTime, now);

		gl.drawArrays(gl.TRIANGLES, 0, 6);
		if (!reducedMotion.matches) frame = requestAnimationFrame(renderLoop);
	}
	function restart() {
		cancelAnimationFrame(frame);
		renderLoop();
	}
	window.addEventListener("resize", () => {
		resize();
		restart();
	});
	document.addEventListener("visibilitychange", restart);
	reducedMotion.addEventListener("change", restart);
	canvas.addEventListener("webglcontextlost", () => {
		contextLost = true;
		cancelAnimationFrame(frame);
		canvas.hidden = true;
	});
	if ("IntersectionObserver" in window) {
		new IntersectionObserver(([entry]) => {
			heroVisible = entry.isIntersecting;
			restart();
		}).observe(document.getElementById("hero"));
	}
	renderLoop();
})();
