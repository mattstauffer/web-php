// Entry point for public/js/ext/motion-<version>.min.js (see "build:vendor" in package.json).
// Only what the homepage uses is re-exported, so the rest is tree-shaken away.
export { animate, inView, scroll, stagger } from 'motion';
