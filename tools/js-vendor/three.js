// Entry point for public/js/ext/three-<version>.min.js (see "build:vendor" in package.json).
// Only what the homepage globe uses is re-exported, so the rest is tree-shaken away.
export {
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
} from 'three';
