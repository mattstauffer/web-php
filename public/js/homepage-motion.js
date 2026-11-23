/*
 * Homepage motion (public/index.php), built on Motion (https://motion.dev).
 *
 * Everything here is progressive: the page is complete without it, and with
 * prefers-reduced-motion nothing is animated at all. Content is only ever
 * hidden for an entrance when it starts below the fold, so nothing that is
 * already on screen flickers, and nothing stays hidden if a reveal never runs.
 */
import { animate, inView, scroll, stagger } from '/js/ext/motion-14.12.0.min.js';

const EASE_OUT = [0.22, 1, 0.36, 1];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

if (!reducedMotion.matches) {
    revealSections();
    revealGroups();
    drawScribbles();
    countStats();
    driftReleaseCard();
    riseHistory();
    loadGlobe();
}

function belowFold(element) {
    return element.getBoundingClientRect().top > window.innerHeight;
}

function hide(elements, offset) {
    elements.forEach((element) => {
        element.style.opacity = '0';
        element.style.transform = `translateY(${offset}px)`;
    });
}

function rise(elements, offset, options = {}) {
    return animate(elements, {
        opacity: [0, 1],
        transform: [`translateY(${offset}px)`, 'translateY(0px)'],
    }, { duration: 0.9, ease: EASE_OUT, ...options });
}

/* Section headings, panels and cards rise in as they scroll into view. */
function revealSections() {
    const selector = [
        '.section-intro',
        '.language-panel',
        '.tagline',
        '.code-showcase',
        '.ecosystem__panel',
        '.release-card',
        '.community__intro',
        '.foundation-card',
        '.history__intro',
    ].join(', ');

    document.querySelectorAll(selector).forEach((element) => {
        if (!belowFold(element)) {
            return;
        }

        hide([element], 28);
        inView(element, () => { rise(element, 28); }, { amount: 0.15 });
    });
}

/* Lists come in one item after another. */
function revealGroups() {
    const groups = [
        ['.logo-wall__list', ':scope > li', 0.05],
        ['.start-steps', ':scope > li', 0.12],
        ['.feature-list', '.feature-list__item', 0.09],
        ['.ecosystem__stat-row', '.stat-card', 0.1],
    ];

    groups.forEach(([groupSelector, itemSelector, gap]) => {
        document.querySelectorAll(groupSelector).forEach((group) => {
            if (!belowFold(group)) {
                return;
            }

            const items = [...group.querySelectorAll(itemSelector)];
            hide(items, 16);
            inView(group, () => { rise(items, 16, { delay: stagger(gap, { startDelay: 0.15 }) }); }, { amount: 0.25 });
        });
    });
}

/* The hand-drawn underlines draw themselves, one stroke after the other. */
function drawScribbles() {
    document.querySelectorAll('.scribble path').forEach((path) => {
        path.setAttribute('pathLength', '1');
        path.style.strokeDasharray = '1';
        path.style.strokeDashoffset = '1';

        inView(path.closest('.scribble'), () => {
            animate(path, { strokeDashoffset: [1, 0] }, { duration: 1.1, delay: 0.35, ease: [0.65, 0, 0.35, 1] });
        }, { amount: 1 });
    });
}

/*
 * The Packagist numbers count up. Only the visible (aria-hidden) copy is
 * touched; screen readers keep the spoken version next to it.
 */
function countStats() {
    document.querySelectorAll('.ecosystem__headline-stat > [aria-hidden], .stat-card__value > [aria-hidden]').forEach((element) => {
        const match = element.textContent.trim().match(/^(\d+(?:\.(\d+))?)(.*)$/);

        if (!match || !belowFold(element)) {
            return;
        }

        const [, number, decimals = '', suffix] = match;
        const target = parseFloat(number);
        const format = (value) => value.toFixed(decimals.length) + suffix;

        element.textContent = format(0);
        inView(element, () => {
            animate(0, target, {
                duration: 1.6,
                ease: EASE_OUT,
                onUpdate: (value) => { element.textContent = format(value); },
                onComplete: () => { element.textContent = number + suffix; },
            });
        }, { amount: 1 });
    });
}

/* The rings and the outlined numeral behind the featured release drift apart on scroll. */
function driftReleaseCard() {
    const card = document.querySelector('.release-card__version');

    if (!card) {
        return;
    }

    const options = { target: card, offset: ['start end', 'end start'] };
    const parts = [
        ['.release-card__ring--outer', ['translateY(40px)', 'translateY(-40px)']],
        ['.release-card__ring--inner', ['translateY(-24px) scale(.96)', 'translateY(24px) scale(1.04)']],
        ['.release-card__numeral-outline', ['translate(-10px, -6px)', 'translate(14px, 8px)']],
    ];

    parts.forEach(([selector, transform]) => {
        const element = card.querySelector(selector);

        if (element) {
            scroll(animate(element, { transform }, { ease: 'linear' }), options);
        }
    });
}

/* The timeline's ticks rise in from the newest release backwards. */
function riseHistory() {
    const history = document.querySelector('[data-release-history]');

    if (!history || !belowFold(history)) {
        return;
    }

    const marks = [...history.querySelectorAll('.history__mark')];
    hide(marks, 18);
    inView(history, () => {
        rise(marks, 18, { duration: 0.6, delay: stagger(0.025, { from: 'last', startDelay: 0.2 }) });
    }, { amount: 0.4 });
}

/*
 * The 3D hero globe. It needs a wide screen (smaller ones show the drawing
 * faded into the background anyway), and it is fetched only once the page
 * has loaded, so three.js never competes with the content.
 */
function loadGlobe() {
    const art = document.querySelector('[data-hero-globe]');
    const wide = window.matchMedia('(min-width: 64rem)');
    let loaded = false;

    if (!art || navigator.connection?.saveData) {
        return;
    }

    const load = () => {
        if (loaded || !wide.matches) {
            return;
        }

        loaded = true;
        import(art.dataset.heroGlobe)
            .then(({ mountGlobe }) => mountGlobe(art))
            .catch(() => { /* The SVG stays. */ });
    };

    const whenIdle = () => ('requestIdleCallback' in window ? requestIdleCallback(load, { timeout: 2000 }) : setTimeout(load, 200));

    if (document.readyState === 'complete') {
        whenIdle();
    } else {
        window.addEventListener('load', whenIdle, { once: true });
    }

    wide.addEventListener('change', load);
}
