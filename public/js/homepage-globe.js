/*
 * Homepage hero: a three.js version of the "draft" globe drawn in
 * include/svg/hero-php-globe.svg.
 *
 * The flat SVG stays in the page as the fallback (no JavaScript, no WebGL,
 * small screens, reduced motion) and as the layout reference: the 3D globe is
 * measured off its outline circle and wordmark so the two line up exactly,
 * then the flat versions fade out underneath it. See homepage-motion.js for
 * when this module is loaded at all.
 */
import {
    BufferGeometry,
    CanvasTexture,
    CircleGeometry,
    Color,
    Float32BufferAttribute,
    Fog,
    Group,
    LineBasicMaterial,
    LineDashedMaterial,
    LineLoop,
    LineSegments,
    MathUtils,
    Mesh,
    MeshBasicMaterial,
    PerspectiveCamera,
    PlaneGeometry,
    Quaternion,
    SRGBColorSpace,
    Scene,
    WebGLRenderer,
} from '/js/ext/three-0.187.0.min.js';

const SEGMENTS = 96;
const INTRO_SECONDS = 1.8;
const CAMERA_DISTANCE = 10;
const CAMERA_FOV = 30;

// Shapes from the SVG, in its units: the globe outline is r=112, the orbit
// ellipse is 158×74 rotated -24°.
const ORBIT_RADIUS = 158 / 112;
const ORBIT_TILT = Math.acos(74 / 158);
const ORBIT_ROLL = MathUtils.degToRad(24);
const WORDMARK_ROLL = MathUtils.degToRad(10);

export function mountGlobe(art) {
    const svg = art.querySelector('svg');
    const outline = svg?.querySelector('[data-globe-outline]');
    const wordmark = svg?.querySelector('[data-globe-wordmark]');

    if (!outline || !wordmark) {
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'hero__canvas';
    let renderer;

    try {
        renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
        return; // No WebGL: keep the SVG.
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    art.append(canvas);

    const scene = new Scene();
    const camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
    camera.position.z = CAMERA_DISTANCE;
    scene.fog = new Fog(0xffffff, CAMERA_DISTANCE - 1, CAMERA_DISTANCE + 1.6);

    const colors = { draft: new Color(), brand: new Color(), paper: new Color() };

    /* --- Scene graph ---------------------------------------------------- */

    // Positioned and scaled to match the SVG outline; everything inside is in
    // units of the globe radius.
    const root = new Group();
    scene.add(root);

    // Pointer and scroll tilt the whole drawing a little.
    const tilt = new Group();
    root.add(tilt);

    // Axial tilt, then spin.
    const axis = new Group();
    axis.rotation.z = MathUtils.degToRad(-18);
    tilt.add(axis);

    const gridMaterial = new LineBasicMaterial({ transparent: true, opacity: 0.55 });
    const grid = new LineSegments(sphereGrid(), gridMaterial);
    axis.add(grid);

    const equatorMaterial = new LineBasicMaterial({ transparent: true, opacity: 0.5 });
    const equator = new LineSegments(ring(1.002), equatorMaterial);
    equator.rotation.x = Math.PI / 2;
    axis.add(equator);

    // The outline always faces the camera, like the circle in the SVG.
    const outlineMaterial = new LineBasicMaterial({ transparent: true, opacity: 0.9, fog: false });
    const silhouette = new LineSegments(ring(1), outlineMaterial);
    root.add(silhouette);

    // The orbit from the SVG, with a node travelling along it and a short
    // brand-coloured trail behind the node.
    const orbitRoll = new Group();
    orbitRoll.rotation.z = ORBIT_ROLL;
    tilt.add(orbitRoll);

    const orbit = new Group();
    orbit.rotation.x = ORBIT_TILT;
    orbitRoll.add(orbit);

    const orbitMaterial = new LineBasicMaterial({ transparent: true, opacity: 0.75 });
    const orbitLine = new LineSegments(ring(ORBIT_RADIUS), orbitMaterial);
    orbit.add(orbitLine);

    // Two laps, so the trail's draw range never has to wrap around.
    const trailMaterial = new LineBasicMaterial({ transparent: true, opacity: 0.9 });
    const trail = new LineSegments(ring(ORBIT_RADIUS * 1.001, 2), trailMaterial);
    orbit.add(trail);

    const node = new Group();
    const nodeFillMaterial = new MeshBasicMaterial({ fog: false });
    const nodeRingMaterial = new LineBasicMaterial({ fog: false });
    node.add(new Mesh(new CircleGeometry(0.045, 24), nodeFillMaterial));
    node.add(new LineLoop(circlePoints(0.045, 24), nodeRingMaterial));
    orbit.add(node);

    // A second, dashed orbit going the other way.
    const dashedRoll = new Group();
    dashedRoll.rotation.z = MathUtils.degToRad(-52);
    tilt.add(dashedRoll);

    const dashedMaterial = new LineDashedMaterial({ transparent: true, opacity: 0.6, dashSize: 0.035, gapSize: 0.045 });
    const dashed = new LineSegments(ring(1.18), dashedMaterial);
    dashed.computeLineDistances();
    dashed.rotation.x = MathUtils.degToRad(74);
    dashedRoll.add(dashed);

    // The PHP wordmark, as a stack of outlined layers for a little depth.
    const wordmarkGroup = new Group();
    tilt.add(wordmarkGroup);

    const wordmarkTexture = new CanvasTexture(document.createElement('canvas'));
    wordmarkTexture.colorSpace = SRGBColorSpace;
    const wordmarkLayers = [0.95, 0.35, 0.15].map((opacity, depth) => {
        const material = new MeshBasicMaterial({
            map: wordmarkTexture,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            fog: false,
        });
        const layer = new Mesh(new PlaneGeometry(1, 1), material);
        layer.position.z = -depth * 0.07;
        layer.userData.opacity = opacity;
        wordmarkGroup.add(layer);

        return layer;
    });

    const drawn = [grid, equator, silhouette, orbitLine, dashed];

    /* --- Layout --------------------------------------------------------- */

    const layout = { width: 1, height: 1, wordmarkAspect: 1 };

    function measure() {
        const box = canvas.getBoundingClientRect();
        const circle = outline.getBoundingClientRect();
        const mark = wordmark.getBoundingClientRect();

        if (box.width === 0 || circle.width === 0) {
            return;
        }

        layout.width = box.width;
        layout.height = box.height;
        renderer.setSize(box.width, box.height, false);
        camera.aspect = box.width / box.height;
        camera.updateProjectionMatrix();

        // World units per CSS pixel on the z = 0 plane.
        const unit = 2 * CAMERA_DISTANCE * Math.tan(MathUtils.degToRad(CAMERA_FOV / 2)) / box.height;
        const toWorld = (x, y) => [
            (x - box.left - box.width / 2) * unit,
            -(y - box.top - box.height / 2) * unit,
        ];

        const radius = circle.width / 2 * unit;
        const [cx, cy] = toWorld(circle.left + circle.width / 2, circle.top + circle.height / 2);
        root.position.set(cx, cy, 0);
        root.scale.setScalar(radius);

        // Fade the far side of the globe into the paper, for depth.
        scene.fog.near = CAMERA_DISTANCE - radius * 0.2;
        scene.fog.far = CAMERA_DISTANCE + radius * 2.4;

        // The wordmark's unrotated size, from its own coordinate system.
        const inner = wordmark.firstElementChild;
        const bbox = inner.getBBox();
        const svgUnit = circle.width / 224; // CSS px per SVG unit (the outline is 224 wide)
        const scale = 2.6 * svgUnit * unit / radius;
        const [mx, my] = toWorld(mark.left + mark.width / 2, mark.top + mark.height / 2);

        wordmarkGroup.position.set((mx - cx) / radius, (my - cy) / radius, 0.12);
        wordmarkGroup.userData.baseY = wordmarkGroup.position.y;
        wordmarkLayers.forEach((layer) => layer.scale.set(bbox.width * scale, bbox.height * scale, 1));
        layout.wordmarkAspect = bbox.width / bbox.height;
        layout.wordmarkPixels = bbox.width * 2.6 * svgUnit;

        drawWordmark(bbox);
    }

    function drawWordmark(bbox) {
        const paths = [...wordmark.querySelectorAll('path')];
        const target = wordmarkTexture.image;
        const ratio = Math.min(window.devicePixelRatio, 2) * 1.5;
        const pad = 2;
        const k = (layout.wordmarkPixels * ratio) / bbox.width;

        target.width = Math.ceil((bbox.width + pad * 2) * k);
        target.height = Math.ceil((bbox.height + pad * 2) * k);

        const context = target.getContext('2d');
        context.clearRect(0, 0, target.width, target.height);
        context.setTransform(k, 0, 0, k, (pad - bbox.x) * k, (pad - bbox.y) * k);
        context.strokeStyle = `#${colors.brand.getHexString()}`;
        context.lineWidth = 0.5;
        context.lineJoin = 'round';
        paths.forEach((path) => context.stroke(new Path2D(path.getAttribute('d'))));

        // Account for the padding in the plane's size.
        const grow = [(bbox.width + pad * 2) / bbox.width, (bbox.height + pad * 2) / bbox.height];
        wordmarkLayers.forEach((layer) => {
            layer.scale.x *= grow[0];
            layer.scale.y *= grow[1];
        });
        wordmarkTexture.needsUpdate = true;
    }

    /* --- Theme ---------------------------------------------------------- */

    function applyColors() {
        const style = getComputedStyle(document.documentElement);
        const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;

        colors.draft.set(read('--draft', '#b4a5d3'));
        colors.brand.set(read('--brand', '#6b4cda'));
        colors.paper.set(read('--paper', '#fbfaf7'));

        gridMaterial.color.copy(colors.draft);
        outlineMaterial.color.copy(colors.draft);
        orbitMaterial.color.copy(colors.draft);
        dashedMaterial.color.copy(colors.draft);
        equatorMaterial.color.copy(colors.brand);
        trailMaterial.color.copy(colors.brand);
        nodeRingMaterial.color.copy(colors.brand);
        nodeFillMaterial.color.copy(colors.paper);
        scene.fog.color.copy(colors.paper);
    }

    applyColors();
    measure();

    const themeObserver = new MutationObserver(() => {
        applyColors();
        measure();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    new ResizeObserver(measure).observe(art);

    /* --- Input ---------------------------------------------------------- */

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener('pointermove', (event) => {
        pointer.tx = event.clientX / window.innerWidth * 2 - 1;
        pointer.ty = event.clientY / window.innerHeight * 2 - 1;
    }, { passive: true });

    let scrollProgress = 0;
    const hero = art.closest('.hero') ?? art;
    window.addEventListener('scroll', () => {
        const rect = hero.getBoundingClientRect();
        scrollProgress = MathUtils.clamp(-rect.top / rect.height, 0, 1);
    }, { passive: true });

    /* --- Loop ----------------------------------------------------------- */

    const counts = new Map(drawn.map((line) => [line, line.geometry.getAttribute('position').count]));
    const trailCount = trail.geometry.getAttribute('position').count / 2; // vertices per lap
    const trailLength = Math.round(trailCount * 0.14) & ~1;
    const parentQuaternion = new Quaternion();
    let start = null;
    let previous = 0;
    let shown = false;

    function frame(now) {
        start ??= now;
        const time = (now - start) / 1000;
        const delta = Math.min((now - previous) / 1000, 0.1);
        previous = now;

        // Draw the lines on, like the rest of the page's "draft" art.
        const intro = easeOutCubic(MathUtils.clamp(time / INTRO_SECONDS, 0, 1));
        drawn.forEach((line) => line.geometry.setDrawRange(0, Math.floor(counts.get(line) * intro / 2) * 2));
        const wordmarkIn = easeOutCubic(MathUtils.clamp((time - INTRO_SECONDS * 0.45) / 1.2, 0, 1));
        wordmarkLayers.forEach((layer) => { layer.material.opacity = layer.userData.opacity * wordmarkIn; });

        // Ease the pointer in, so the drawing drifts rather than jumps.
        const ease = 1 - Math.exp(-delta * 3);
        pointer.x += (pointer.tx - pointer.x) * ease;
        pointer.y += (pointer.ty - pointer.y) * ease;

        tilt.rotation.x = pointer.y * 0.16 + scrollProgress * 0.5;
        tilt.rotation.y = pointer.x * 0.24;
        axis.rotation.y = time * 0.12 + scrollProgress * 1.4;
        dashedRoll.rotation.y = -time * 0.05;

        // The node and its trail travel along the orbit.
        const lap = (time * 0.08) % 1;
        const angle = lap * Math.PI * 2;
        node.position.set(Math.cos(angle) * ORBIT_RADIUS, Math.sin(angle) * ORBIT_RADIUS, 0);
        node.parent.getWorldQuaternion(parentQuaternion);
        node.quaternion.copy(parentQuaternion.invert());
        node.visible = intro === 1;
        const head = (Math.floor(lap * trailCount / 2) * 2) + trailCount;
        trail.geometry.setDrawRange(head - trailLength, intro === 1 ? trailLength : 0);

        // The wordmark floats in front, turning a little more than the globe.
        wordmarkGroup.rotation.set(
            pointer.y * 0.25,
            Math.sin(time * 0.45) * 0.2 + pointer.x * 0.4,
            WORDMARK_ROLL,
        );
        wordmarkGroup.position.y = wordmarkGroup.userData.baseY + Math.sin(time * 0.8) * 0.02;

        renderer.render(scene, camera);

        if (!shown) {
            shown = true;
            art.classList.add('hero__art--3d');
        }
    }

    /* --- Only animate while it can be seen ------------------------------ */

    let onScreen = true;
    const updateLoop = () => renderer.setAnimationLoop(onScreen && !document.hidden ? frame : null);

    new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        updateLoop();
    }).observe(art);
    document.addEventListener('visibilitychange', updateLoop);

    canvas.addEventListener('webglcontextlost', () => {
        renderer.setAnimationLoop(null);
        themeObserver.disconnect();
        art.classList.remove('hero__art--3d');
        canvas.remove();
    });

    updateLoop();
}

/* --- Geometry helpers --------------------------------------------------- */

function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
}

// A circle in the XY plane as line-segment pairs, optionally several laps.
function ring(radius, laps = 1) {
    const positions = [];

    for (let i = 0; i < SEGMENTS * laps; i++) {
        const a = i / SEGMENTS * Math.PI * 2;
        const b = (i + 1) / SEGMENTS * Math.PI * 2;
        positions.push(
            Math.cos(a) * radius, Math.sin(a) * radius, 0,
            Math.cos(b) * radius, Math.sin(b) * radius, 0,
        );
    }

    return withPositions(positions);
}

function circlePoints(radius, segments) {
    const positions = [];

    for (let i = 0; i < segments; i++) {
        const a = i / segments * Math.PI * 2;
        positions.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    }

    return withPositions(positions);
}

// Parallels every 20° and meridians every 30° of a unit sphere.
function sphereGrid() {
    const positions = [];
    const push = (a, b) => positions.push(...a, ...b);

    for (let lat = -60; lat <= 60; lat += 20) {
        if (lat === 0) {
            continue; // The equator is drawn separately, in the brand colour.
        }

        const phi = MathUtils.degToRad(lat);
        const y = Math.sin(phi);
        const r = Math.cos(phi);

        for (let i = 0; i < SEGMENTS; i++) {
            const a = i / SEGMENTS * Math.PI * 2;
            const b = (i + 1) / SEGMENTS * Math.PI * 2;
            push([Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(b) * r, y, Math.sin(b) * r]);
        }
    }

    for (let lon = 0; lon < 180; lon += 30) {
        const theta = MathUtils.degToRad(lon);

        for (let i = 0; i < SEGMENTS; i++) {
            const a = i / SEGMENTS * Math.PI * 2;
            const b = (i + 1) / SEGMENTS * Math.PI * 2;
            push(
                [Math.cos(a) * Math.cos(theta), Math.sin(a), Math.cos(a) * Math.sin(theta)],
                [Math.cos(b) * Math.cos(theta), Math.sin(b), Math.cos(b) * Math.sin(theta)],
            );
        }
    }

    return withPositions(positions);
}

function withPositions(positions) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

    return geometry;
}
