(function () {
    'use strict';
    if (window.CinejoyTV) return;

    const channel = 'cinejoy-tv-1';
    const selector = 'a[href],button,input:not([type="hidden"]),textarea,select,summary,label,video,iframe,' +
        '[role="button"],[role="link"],[role="tab"],[role="option"],[role="checkbox"],' +
        '[role="radio"],[role="switch"],[tabindex],[contenteditable="true"]';
    const directions = ['up', 'down', 'left', 'right'];
    let current = null;
    let insideFrame = false;
    let pendingField = null;
    let pendingFrame = null;
    let sequence = 0;
    let route = location.href;
    let lastAction = null;
    let playerTimer = null;
    let armedCommand = null;
    let lastClick = null;

    function notify(action) {
        if (window !== window.top) {
            window.parent.postMessage({channel, action}, '*');
        } else if (window.TvShell && typeof window.TvShell.postMessage === 'function') {
            window.TvShell.postMessage(JSON.stringify(action));
        } else {
            lastAction = action;
            window.dispatchEvent(new CustomEvent('cinejoy-tv-action', {detail: action}));
        }
    }

    function visible(element, cache) {
        if (!element || !element.isConnected || element.disabled ||
            element.getAttribute('aria-disabled') === 'true' ||
            element.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
            let style = cache && cache.get(node);
            if (!style) {
                style = getComputedStyle(node);
                if (cache) cache.set(node, style);
            }
            if (style.display === 'none' || style.visibility === 'hidden' ||
                style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
        }
        return true;
    }

    function scope() {
        const overlays = Array.from(document.querySelectorAll(
            'dialog[open],[role="dialog"],[aria-modal="true"],[role="menu"],[role="listbox"]'));
        return overlays.reverse().find(el => visible(el)) || document;
    }

    function candidates() {
        const root = scope();
        const cache = new Map();
        return Array.from(root.querySelectorAll(selector)).filter(el => {
            if (!visible(el, cache)) return false;
            if (el.tagName === 'INPUT' && el.type === 'hidden') return false;
            if (el.tagName === 'LABEL' && (!el.control || el.control.disabled)) return false;
            // Hero panels and cards sometimes wrap real buttons in another role=button.
            if (el.matches('[role="button"]') && el.querySelector(
                'button,a[href],input,select,textarea,[role="button"]')) return false;
            const childButton = el.tagName === 'BUTTON' && el.querySelector('button');
            if (childButton && el.textContent.trim() === childButton.textContent.trim()) return false;
            return el.tabIndex >= 0 || el.matches(
                'a[href],button,input,textarea,select,summary,label,video,iframe,[role],[contenteditable="true"]');
        });
    }

    function onScreen(element) {
        let rect = element.getBoundingClientRect();
        let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
        let right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
        for (let node = element.parentElement; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            rect = node.getBoundingClientRect();
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
                left = Math.max(left, rect.left);
                right = Math.min(right, rect.right);
            }
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
                top = Math.max(top, rect.top);
                bottom = Math.min(bottom, rect.bottom);
            }
        }
        return right - left > 2 && bottom - top > 2;
    }

    function focus(element) {
        if (!element) return;
        if (current) current.removeAttribute('data-cj-tv-focus');
        current = element;
        insideFrame = false;
        current.setAttribute('data-cj-tv-focus', '');
        if (!current.hasAttribute('tabindex') && current.tabIndex < 0) {
            current.setAttribute('tabindex', '-1');
        }
        current.focus({preventScroll: true});
        current.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
    }

    function ensureFocus() {
        const list = candidates();
        if (current && list.includes(current)) return current;
        const active = document.activeElement;
        const first = list.includes(active) ? active : list.find(onScreen) || list[0];
        if (first) focus(first);
        return first;
    }

    function move(direction) {
        const old = current;
        if (!ensureFocus() || old !== current) return 'handled';
        if (current.matches('input[type="range"]') && (direction === 'left' || direction === 'right')) {
            if (current.step === 'any') {
                const min = current.min === '' ? 0 : Number(current.min);
                const max = current.max === '' ? 100 : Number(current.max);
                const step = current.getAttribute('aria-label') === 'Seek Video' ? 10 : (max - min) / 100;
                current.value = String(Math.max(min, Math.min(max, current.valueAsNumber +
                    (direction === 'right' ? step : -step))));
            } else if (direction === 'left') current.stepDown();
            else current.stepUp();
            current.dispatchEvent(new Event('input', {bubbles: true}));
            current.dispatchEvent(new Event('change', {bubbles: true}));
            return 'handled';
        }
        const a = current.getBoundingClientRect();
        const horizontal = direction === 'left' || direction === 'right';
        const forward = direction === 'right' || direction === 'down';
        const primary = horizontal ? (a.left + a.right) / 2 : (a.top + a.bottom) / 2;
        const cross = horizontal ? (a.top + a.bottom) / 2 : (a.left + a.right) / 2;
        let best = null, bestScore = Infinity;
        for (const candidate of candidates()) {
            if (candidate === current) continue;
            const b = candidate.getBoundingClientRect();
            const otherPrimary = horizontal ? (b.left + b.right) / 2 : (b.top + b.bottom) / 2;
            const distance = (otherPrimary - primary) * (forward ? 1 : -1);
            if (distance <= 2) continue;
            const otherCross = horizontal ? (b.top + b.bottom) / 2 : (b.left + b.right) / 2;
            const overlap = horizontal
                ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
                : Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const score = distance + Math.abs(otherCross - cross) * 2 + (overlap > 2 ? 0 : 10000);
            if (score < bestScore) {
                best = candidate;
                bestScore = score;
            }
        }
        if (best) focus(best);
        else if (direction === 'up' && scope() === document) notify({type: 'toolbar'});
        else {
            const scrollable = findScroller(current, horizontal);
            const delta = (forward ? 1 : -1) * (horizontal ? innerWidth : innerHeight) * 0.65;
            scrollable.scrollBy(horizontal ? {left: delta} : {top: delta});
        }
        return 'handled';
    }

    function findScroller(element, horizontal) {
        for (let node = element.parentElement; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (/(auto|scroll)/.test(horizontal ? style.overflowX : style.overflowY) &&
                (horizontal ? node.scrollWidth > node.clientWidth : node.scrollHeight > node.clientHeight)) {
                return node;
            }
        }
        return window;
    }

    function send(frame, name, args) {
        if (frame && frame.isConnected && frame.contentWindow) {
            frame.contentWindow.postMessage({channel, command: name, args}, '*');
        } else {
            insideFrame = false;
            notify({type: 'message', text: 'The embedded player has closed. Select it again.'});
        }
    }

    function edit(element) {
        const token = String(++sequence);
        pendingField = {token, element};
        pendingFrame = null;
        if (element.tagName === 'SELECT') {
            notify({type: 'select', token, selected: element.selectedIndex,
                options: Array.from(element.options).slice(0, 500).map(option => ({
                    label: option.label, disabled: option.disabled ||
                        !!(option.parentElement && option.parentElement.disabled)
                }))});
        } else {
            notify({type: 'edit', token, value: element.isContentEditable ? element.textContent : element.value,
                inputType: element.type || 'text',
                label: element.getAttribute('aria-label') || element.getAttribute('placeholder') || ''});
        }
    }

    function setField(name, args) {
        if (pendingFrame) {
            send(pendingFrame, name, args);
            pendingFrame = null;
            return 'handled';
        }
        if (!pendingField || !args || args.token !== pendingField.token ||
            !pendingField.element.isConnected) {
            notify({type: 'message', text: 'The field changed while you were typing. Select it again.'});
            return 'handled';
        }
        const element = pendingField.element;
        pendingField = null;
        if (name === 'select') {
            const index = args.index;
            if (!Number.isInteger(index) || !element.options || !element.options[index] ||
                element.options[index].disabled || element.options[index].parentElement.disabled) {
                notify({type: 'message', text: 'That option is not available.'});
                return 'handled';
            }
            element.selectedIndex = index;
        } else {
            const value = String(args.value).slice(0, 10000);
            if ((element.type === 'color' && !/^#[0-9a-f]{6}$/i.test(value)) ||
                (element.type === 'number' && value !== '' && !Number.isFinite(Number(value)))) {
                notify({type: 'message', text: 'Enter a valid number or a color such as #ffffff.'});
                return 'handled';
            }
            if (element.isContentEditable) element.textContent = value;
            else {
                const prototype = element.tagName === 'TEXTAREA'
                    ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
            }
        }
        element.dispatchEvent(new Event('input', {bubbles: true}));
        element.dispatchEvent(new Event('change', {bubbles: true}));
        focus(element);
        return 'handled';
    }

    function activate() {
        if (!ensureFocus()) return 'handled';
        if (current.tagName === 'IFRAME') {
            insideFrame = true;
            send(current, 'focus');
        } else if (current.tagName === 'VIDEO') {
            media('playPause', current);
        } else if (current.tagName === 'SELECT' || current.tagName === 'TEXTAREA' ||
            current.isContentEditable || (current.tagName === 'INPUT' &&
                /^(text|search|email|url|tel|password|number|color)$/.test(current.type))) {
            if (!current.readOnly) edit(current);
        } else {
            const target = current;
            const now = performance.now();
            target.click();
            if (target.tagName === 'BUTTON' && lastClick && lastClick.target === target &&
                now - lastClick.time < 400) {
                target.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, cancelable: true, detail: 2}));
                lastClick = null;
            } else lastClick = {target, time: now};
            focusAfterChange();
        }
        return 'handled';
    }

    function focusAfterChange() {
        [120, 350].forEach(delay => setTimeout(() => {
            const root = scope();
            if (!visible(current) || (root !== document && !root.contains(current))) ensureFocus();
        }, delay));
    }

    function revealPlayer() {
        const player = document.querySelector('.player-root[role="application"]');
        if (!player) return;
        player.dispatchEvent(new MouseEvent('mousemove', {bubbles: true, clientX: innerWidth / 2, clientY: innerHeight / 2}));
        // The site's controls fade on mouse inactivity. Keep only its control bars visible for remote use.
        for (const label of ['Servers', 'Back']) {
            const control = player.querySelector('button[aria-label="' + label + '"]');
            let bar = control;
            while (bar && bar.parentElement !== player) bar = bar.parentElement;
            if (bar) bar.setAttribute('data-cj-tv-playerbar', '');
        }
        clearTimeout(playerTimer);
        playerTimer = setTimeout(() => {
            player.querySelectorAll('[data-cj-tv-playerbar]').forEach(el => el.removeAttribute('data-cj-tv-playerbar'));
            const video = player.querySelector('video');
            if (video && !video.paused && current && player.contains(current)) {
                current.removeAttribute('data-cj-tv-focus');
            }
        }, 6000);
    }

    function openPlayerMenu(name) {
        const labels = {servers: 'Servers', subtitles: 'Subtitles', settings: 'Settings'};
        const player = document.querySelector('.player-root[role="application"]') || document;
        const button = Array.from(player.querySelectorAll('button')).find(el =>
            visible(el) && (el.getAttribute('aria-label') || el.title || el.textContent).trim() === labels[name]);
        if (button) {
            button.click();
            focusAfterChange();
        } else {
            const frame = current && current.tagName === 'IFRAME' ? current
                : Array.from(document.querySelectorAll('iframe')).find(el => visible(el));
            if (frame) send(frame, name);
            else notify({type: 'message', text: 'This player does not expose that menu. Use its on-page controls.'});
        }
        return 'handled';
    }

    function media(name, preferred) {
        const video = preferred || Array.from(document.querySelectorAll('video'))
            .filter(el => visible(el))
            .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
        if (!video) {
            const frame = current && current.tagName === 'IFRAME' ? current
                : Array.from(document.querySelectorAll('iframe')).find(el => visible(el));
            if (frame) send(frame, name);
            else notify({type: 'message', text: 'No HTML5 video is available yet. Use the on-page Play button or another server.'});
            return 'handled';
        }
        if (name === 'pause' || (name === 'playPause' && !video.paused)) video.pause();
        else if (name === 'play' || name === 'playPause') {
            const promise = video.play();
            if (promise) promise.catch(() => notify({
                type: 'message', text: 'Playback was refused. Try the on-page Play button or another server.'
            }));
        } else if (name === 'rewind' || name === 'forward') {
            if (!video.seekable.length) {
                notify({type: 'message', text: 'Seeking is not available until the video has loaded.'});
            } else {
                const start = video.seekable.start(0), end = video.seekable.end(video.seekable.length - 1);
                video.currentTime = Math.max(start, Math.min(end, video.currentTime + (name === 'forward' ? 10 : -10)));
            }
        } else if (name === 'fullscreen') {
            // Prefer the website's control so subtitles and custom controls remain in fullscreen.
            const button = Array.from(document.querySelectorAll('button')).find(el => visible(el) &&
                /^(enter )?full\s?screen$/i.test((el.getAttribute('aria-label') || el.title || el.textContent).trim()));
            if (button) button.click();
            else if (video.requestFullscreen) video.requestFullscreen().catch(() => notify({
                type: 'message', text: 'Use the player fullscreen button. This provider requires a direct interaction.'
            }));
            else notify({type: 'message', text: 'Fullscreen is not supported by this player.'});
        }
        return 'handled';
    }

    function pauseAll() {
        document.querySelectorAll('video,audio').forEach(video => video.pause());
        document.querySelectorAll('iframe').forEach(frame => send(frame, 'pauseAll'));
        return 'handled';
    }

    function back() {
        const overlay = scope();
        if (overlay !== document) {
            const submenuBack = Array.from(overlay.querySelectorAll('.menu-back-btn')).find(el => visible(el));
            const close = submenuBack || Array.from(overlay.querySelectorAll('button,[role="button"]')).find(el =>
                visible(el) && /^(close|cancel|dismiss|back)(\b|$)/i.test(
                    (el.getAttribute('aria-label') || el.title || el.textContent).trim()));
            if (close) {
                close.click();
                focusAfterChange();
            } else if (overlay.classList.contains('settings-popover')) {
                const player = overlay.closest('.player-root');
                const trigger = player && player.querySelector(
                    'button[aria-label="Subtitles"].scale-105,button[aria-label="Settings"].scale-105');
                if (trigger) {
                    trigger.click();
                    focus(trigger);
                } else notify({type: 'message', text: 'Use the player menu button to close this panel.'});
            }
            else {
                (document.activeElement || overlay).dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape', code: 'Escape', bubbles: true, cancelable: true
                }));
                setTimeout(() => { if (visible(overlay)) notify({type: 'back'}); }, 80);
            }
        } else if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => notify({type: 'back'}));
        } else notify({type: window === window.top ? 'back' : 'leave'});
        return 'handled';
    }

    function command(name, args) {
        lastAction = null;
        if (name === 'arm') {
            if (!args || !['activate', 'fullscreen'].includes(args.name)) return false;
            armedCommand = args.name;
            if (insideFrame && current && current.tagName === 'IFRAME') send(current, name, args);
            return true;
        }
        if (route !== location.href) {
            route = location.href;
            if (current) current.removeAttribute('data-cj-tv-focus');
            current = null;
            insideFrame = false;
            pendingField = null;
            pendingFrame = null;
        }
        if (name === 'text' || name === 'select') return setField(name, args);
        if (name === 'pauseAll') return pauseAll();
        if (name === 'blur') {
            if (current) current.removeAttribute('data-cj-tv-focus');
            return 'handled';
        }
        if (insideFrame && current && current.tagName === 'IFRAME' && current.isConnected) {
            send(current, name, args);
            return 'handled';
        }
        revealPlayer();
        if (directions.includes(name)) move(name);
        else if (name === 'activate') activate();
        else if (name === 'focus') {
            ensureFocus();
            if (current) current.setAttribute('data-cj-tv-focus', '');
        } else if (name === 'back') back();
        else if (['servers', 'subtitles', 'settings'].includes(name)) openPlayerMenu(name);
        else if (['playPause', 'play', 'pause', 'rewind', 'forward', 'fullscreen'].includes(name)) media(name);
        return lastAction || 'handled';
    }

    window.addEventListener('message', event => {
        const data = event.data;
        if (!data || data.channel !== channel) return;
        if (window !== window.top && event.source === window.parent && typeof data.command === 'string') {
            command(data.command, data.args);
            return;
        }
        const frame = Array.from(document.querySelectorAll('iframe')).find(el => el.contentWindow === event.source);
        if (!frame || !data.action || typeof data.action.type !== 'string') return;
        const action = data.action;
        if (action.type === 'leave' || action.type === 'toolbar' || action.type === 'back') {
            if (frame === current && insideFrame) focus(frame);
        } else if (action.type === 'edit' || action.type === 'select') {
            if (frame !== current || !insideFrame) return;
            pendingFrame = frame;
            pendingField = null;
            notify(action);
        } else if (action.type === 'message') notify(action);
    });

    document.addEventListener('keydown', event => {
        // Android supplies commands directly. This also supports USB keyboards and browser tests.
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        const map = {ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'activate'};
        const name = event.key === 'Enter' && armedCommand ? armedCommand : map[event.key];
        if (!name) return;
        armedCommand = null;
        event.preventDefault();
        event.stopImmediatePropagation();
        command(name);
    }, true);

    document.addEventListener('keyup', event => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);

    document.addEventListener('focusin', event => {
        const element = event.target;
        if (!element.matches || !element.matches(selector) || !visible(element)) return;
        if (current && current !== element) current.removeAttribute('data-cj-tv-focus');
        current = element;
        current.setAttribute('data-cj-tv-focus', '');
    });

    function installStyle() {
        if (!document.documentElement || document.getElementById('cj-tv-style')) return;
        const style = document.createElement('style');
        style.id = 'cj-tv-style';
        style.textContent = '* { cursor: none !important; }' +
            '[data-cj-tv-playerbar] { opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; }' +
            '[data-cj-tv-focus] { outline: 4px solid #a3e635 !important; outline-offset: -4px !important;' +
            ' box-shadow: 0 0 0 2px #10141c !important; scroll-margin: 12px !important; }' +
            'html { scroll-behavior: auto !important; }';
        document.documentElement.appendChild(style);
    }
    if (document.documentElement) installStyle();
    else document.addEventListener('DOMContentLoaded', installStyle, {once: true});
    window.CinejoyTV = Object.freeze({command});
})();
