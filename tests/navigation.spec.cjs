const {test, expect} = require('@playwright/test');
const path = require('node:path');
const script = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'tv-navigation.js');

async function setup(page, html) {
    await page.setContent(`<style>
        body { margin: 20px; background: #10141c; color: white; font: 20px sans-serif; }
        button, input, select { width: 150px; height: 60px; margin: 10px; }
        .row { display: flex; }
    </style>${html}`);
    await page.addScriptTag({path: script});
    await page.evaluate(() => {
        window.actions = [];
        window.addEventListener('cinejoy-tv-action', e => window.actions.push(e.detail));
    });
}

const focused = page => page.locator('[data-cj-tv-focus]');
const command = (page, name, args) => page.evaluate(
    ({name, args}) => window.CinejoyTV.command(name, args), {name, args});

test('arrow keys navigate spatially, OK activates once, and there is no cursor', async ({page}) => {
    await setup(page, '<div class="row"><button id="a">A</button><button id="b">B</button></div>' +
        '<div class="row"><button id="c">C</button><button id="d" onclick="this.dataset.clicked=Number(this.dataset.clicked||0)+1">D</button></div>');
    await command(page, 'focus');
    await expect(focused(page)).toHaveId('a');
    await page.keyboard.press('ArrowRight');
    await expect(focused(page)).toHaveId('b');
    await page.keyboard.press('ArrowDown');
    await expect(focused(page)).toHaveId('d');
    await page.keyboard.press('Enter');
    await expect(page.locator('#d')).toHaveAttribute('data-clicked', '1');
    await expect(page.locator('#d')).toHaveCSS('cursor', 'none');
    await page.keyboard.press('ArrowLeft');
    await expect(focused(page)).toHaveId('c');
    await page.keyboard.press('ArrowUp');
    await expect(focused(page)).toHaveId('a');
    await command(page, 'up');
    expect(await page.evaluate(() => window.actions.at(-1).type)).toBe('toolbar');
});

test('skips hidden, disabled, inert and duplicate wrapping controls', async ({page}) => {
    await setup(page, '<div class="row"><button id="a">A</button><button hidden>Hidden</button>' +
        '<button disabled>Disabled</button><div style="opacity:0"><button>Invisible</button></div>' +
        '<div inert><button>Inert</button></div><div role="button" tabindex="0"><button id="b">B</button></div></div>');
    await command(page, 'focus');
    await command(page, 'right');
    await expect(focused(page)).toHaveId('b');
});

test('scrolls horizontal shelves and vertically offscreen content into view', async ({page}) => {
    await setup(page, '<div id="shelf" class="row" style="width:380px;overflow:auto">' +
        '<button id="a" style="flex-shrink:0">A</button><button id="b" style="flex-shrink:0">B</button>' +
        '<button id="c" style="flex-shrink:0">C</button><button id="d" style="flex-shrink:0">D</button></div>' +
        '<button id="below" style="display:block;margin-top:1000px">Below</button>');
    await command(page, 'focus');
    for (let i = 0; i < 3; i++) await command(page, 'right');
    await expect(focused(page)).toHaveId('d');
    expect(await page.locator('#shelf').evaluate(el => el.scrollLeft)).toBeGreaterThan(200);
    await command(page, 'down');
    await expect(focused(page)).toHaveId('below');
    await expect(page.locator('#below')).toBeInViewport();
});

test('recovers after SPA content replacement and respects modal focus', async ({page}) => {
    await setup(page, '<button id="old">Old page</button>');
    await command(page, 'focus');
    await page.locator('#old').evaluate(el => el.outerHTML = '<button id="new">New page</button>');
    await command(page, 'right');
    await expect(focused(page)).toHaveId('new');
    await page.evaluate(() => {
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.innerHTML = '<button id="close" onclick="this.parentElement.remove()">Close</button><button id="save">Save</button>';
        document.body.appendChild(dialog);
    });
    await command(page, 'focus');
    await expect(focused(page)).toHaveId('close');
    await command(page, 'right');
    await expect(focused(page)).toHaveId('save');
    await command(page, 'back');
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('native text entry updates reactive input and rejects stale field tokens', async ({page}) => {
    await setup(page, '<input id="search" type="search" placeholder="Find a title" oninput="this.dataset.received=this.value">');
    await command(page, 'focus');
    await command(page, 'activate');
    const action = await page.evaluate(() => window.actions.at(-1));
    expect(action).toMatchObject({type: 'edit', inputType: 'search', label: 'Find a title'});
    await command(page, 'text', {token: action.token, value: 'A "quoted" title'});
    await expect(page.locator('#search')).toHaveValue('A "quoted" title');
    await expect(page.locator('#search')).toHaveAttribute('data-received', 'A "quoted" title');
    await command(page, 'text', {token: action.token, value: 'stale'});
    await expect(page.locator('#search')).toHaveValue('A "quoted" title');
    expect(await page.evaluate(() => window.actions.at(-1).type)).toBe('message');
});

test('native selection and range controls work with the remote', async ({page}) => {
    await setup(page, '<div class="row"><select id="season"><option>Season 1</option><option>Season 2</option>' +
        '<optgroup label="Unavailable" disabled><option>Season 3</option></optgroup></select>' +
        '<input id="range" type="range" value="30" step="10"></div>');
    await command(page, 'focus');
    await command(page, 'activate');
    let action = await page.evaluate(() => window.actions.at(-1));
    expect(action.options[2].disabled).toBe(true);
    await command(page, 'select', {token: action.token, index: 1});
    await expect(page.locator('#season')).toHaveValue('Season 2');
    await command(page, 'right');
    await command(page, 'right');
    await expect(page.locator('#range')).toHaveValue('40');
});

test('cross-origin frames support focus, activation, text entry and Back escape', async ({page, context}) => {
    await context.addInitScript({path: script});
    await context.route('https://tv.test/**', route => route.fulfill({
        contentType: 'text/html', body: '<iframe id="player" style="width:600px;height:400px" src="https://player.test/"></iframe>'
    }));
    await context.route('https://player.test/**', route => route.fulfill({
        contentType: 'text/html', body: '<button id="play" onclick="this.textContent=\'Playing\'">Play</button>' +
            '<input id="search" style="margin-left:30px;width:200px" placeholder="Find">'
    }));
    await page.goto('https://tv.test/');
    await page.evaluate(() => {
        window.actions = [];
        window.addEventListener('cinejoy-tv-action', e => window.actions.push(e.detail));
    });
    const frame = page.frameLocator('#player');
    await command(page, 'focus');
    await command(page, 'activate');
    await expect(frame.locator('[data-cj-tv-focus]')).toHaveId('play');
    await command(page, 'activate');
    await expect(frame.locator('#play')).toHaveText('Playing');
    await command(page, 'right');
    await expect(frame.locator('[data-cj-tv-focus]')).toHaveId('search');
    await command(page, 'activate');
    await expect.poll(() => page.evaluate(() => window.actions.at(-1)?.type)).toBe('edit');
    const action = await page.evaluate(() => window.actions.at(-1));
    await command(page, 'text', {token: action.token, value: 'TV remote'});
    await expect(frame.locator('#search')).toHaveValue('TV remote');
    await command(page, 'back');
    // A second Back exits the main page, rather than trapping focus inside the player.
    await expect.poll(() => command(page, 'back').then(() =>
        page.evaluate(() => window.actions.at(-1)?.type))).toBe('back');
});

test('media keys control video and clamp seeks, while unavailable video reports an error', async ({page}) => {
    await setup(page, '<video id="video" style="width:640px;height:360px"></video>');
    await page.locator('video').evaluate(video => {
        let paused = true;
        Object.defineProperty(video, 'paused', {get: () => paused});
        Object.defineProperty(video, 'seekable', {value: {length: 1, start: () => 5, end: () => 120}});
        video.play = () => { paused = false; return Promise.resolve(); };
        video.pause = () => { paused = true; };
        video.currentTime = 115;
    });
    await command(page, 'playPause');
    expect(await page.locator('video').evaluate(v => v.paused)).toBe(false);
    await command(page, 'forward');
    expect(await page.locator('video').evaluate(v => v.currentTime)).toBe(120);
    await command(page, 'rewind');
    expect(await page.locator('video').evaluate(v => v.currentTime)).toBe(110);
    await command(page, 'pauseAll');
    expect(await page.locator('video').evaluate(v => v.paused)).toBe(true);
    await page.locator('video').evaluate(v => v.remove());
    await command(page, 'playPause');
    expect(await page.evaluate(() => window.actions.at(-1).text)).toContain('No HTML5 video');
});

test('reinjection is idempotent and a large catalogue stays responsive', async ({page}) => {
    await setup(page, '<div style="display:grid;grid-template-columns:repeat(6,170px)">' +
        Array.from({length: 1200}, (_, i) => `<button id="card${i}">Card ${i}</button>`).join('') + '</div>');
    await page.addScriptTag({path: script});
    await command(page, 'focus');
    const duration = await page.evaluate(() => {
        const start = performance.now();
        for (let i = 0; i < 10; i++) window.CinejoyTV.command('down');
        return (performance.now() - start) / 10;
    });
    expect(duration).toBeLessThan(200);
    await expect(focused(page)).toHaveId('card60');
    await expect(page.locator('#cj-tv-style')).toHaveCount(1);
});

test('the movie timeline supports step=any without throwing and seeks by ten seconds', async ({page}) => {
    await setup(page, '<input id="seek" type="range" aria-label="Seek Video" step="any" min="0" max="180" value="90">' +
        '<button style="display:block" id="next">Next control</button>');
    await command(page, 'focus');
    await command(page, 'right');
    await expect(page.locator('#seek')).toHaveValue('100');
    await command(page, 'left');
    await expect(page.locator('#seek')).toHaveValue('90');
    await command(page, 'down');
    await expect(focused(page)).toHaveId('next');
});

test('external subtitle language rows remain selectable when they contain a translation button', async ({page}) => {
    await setup(page, '<div id="host"></div>');
    // Svelte can create nested buttons through the DOM, though the HTML parser normally repairs them.
    await page.evaluate(() => {
        const language = document.createElement('button');
        language.id = 'urdu';
        language.textContent = 'Urdu EXTERNAL ';
        language.style.width = '300px';
        language.onclick = e => { if (e.target === language) language.dataset.selected = 'yes'; };
        const translate = document.createElement('button');
        translate.textContent = 'Translate';
        translate.style.cssText = 'width:80px;height:30px;margin:0';
        language.appendChild(translate);
        document.querySelector('#host').appendChild(language);
    });
    await command(page, 'focus');
    await expect(focused(page)).toHaveId('urdu');
    await command(page, 'activate');
    await expect(page.locator('#urdu')).toHaveAttribute('data-selected', 'yes');
});

test('native Player shortcuts reveal fading bars and Back closes subtitle submenus without leaving movie', async ({page}) => {
    await setup(page, '<div role="application" class="player-root">' +
        '<video style="width:640px;height:240px"></video>' +
        '<div id="bar" style="opacity:0"><button aria-label="Servers">Servers</button>' +
        '<button aria-label="Subtitles">Subtitles</button><button aria-label="Settings">Settings</button></div></div>');
    await page.evaluate(() => {
        const subtitle = document.querySelector('[aria-label="Subtitles"]');
        subtitle.onclick = () => {
            const old = document.querySelector('.settings-popover');
            if (old) { old.remove(); subtitle.classList.remove('scale-105'); return; }
            subtitle.classList.add('scale-105');
            const panel = document.createElement('div');
            panel.className = 'settings-popover';
            panel.setAttribute('role', 'dialog');
            panel.innerHTML = '<button class="menu-back-btn" id="submenu-back"></button><button id="font">Font</button>';
            panel.querySelector('#submenu-back').onclick = e => e.target.remove();
            document.querySelector('.player-root').appendChild(panel);
        };
    });
    await command(page, 'subtitles');
    await expect(page.locator('#bar')).toHaveCSS('opacity', '1');
    await expect(focused(page)).toHaveId('submenu-back');
    await command(page, 'back');
    await expect(page.locator('#submenu-back')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await command(page, 'back');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => window.actions.some(a => a.type === 'back'))).toBe(false);
});

test('subtitle delay, colors and upload labels are remote accessible', async ({page}) => {
    await setup(page, '<div role="dialog"><input id="delay" type="number" step="0.1" value="0">' +
        '<input id="color" type="color" value="#ffffff">' +
        '<label id="upload" style="display:block;width:200px;height:60px">Upload subtitle file' +
        '<input id="file" type="file" hidden></label></div>');
    await command(page, 'focus');
    await command(page, 'activate');
    let action = await page.evaluate(() => window.actions.at(-1));
    await command(page, 'text', {token: action.token, value: '-1.5'});
    await expect(page.locator('#delay')).toHaveValue('-1.5');
    await command(page, 'right');
    await command(page, 'activate');
    action = await page.evaluate(() => window.actions.at(-1));
    expect(action.inputType).toBe('color');
    await command(page, 'text', {token: action.token, value: '#a3e635'});
    await expect(page.locator('#color')).toHaveValue('#a3e635');
    await command(page, 'activate');
    action = await page.evaluate(() => window.actions.at(-1));
    await command(page, 'text', {token: action.token, value: 'not-a-color'});
    await expect(page.locator('#color')).toHaveValue('#a3e635');
    expect(await page.evaluate(() => window.actions.at(-1).type)).toBe('message');
    await command(page, 'down');
    await expect(focused(page)).toHaveId('upload');
    const chooser = page.waitForEvent('filechooser');
    expect(await command(page, 'arm', {name: 'activate'})).toBe(true);
    await page.keyboard.press('Enter');
    expect((await chooser).isMultiple()).toBe(false);
});

test('fullscreen can execute in a trusted keyboard activation instead of an untrusted script callback', async ({page}) => {
    await setup(page, '<div id="player"><video style="width:640px;height:360px"></video>' +
        '<button aria-label="Fullscreen" onclick="this.parentElement.requestFullscreen()">Fullscreen</button></div>');
    await page.evaluate(() => {
        document.addEventListener('keydown', event => { window.trustedKey = event.isTrusted; }, true);
    });
    await command(page, 'focus');
    expect(await command(page, 'arm', {name: 'fullscreen'})).toBe(true);
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('player');
    // The adapter consumes the key before other page handlers, avoiding double activation.
    expect(await page.evaluate(() => window.trustedKey)).toBeUndefined();
    await page.locator('#player').evaluate(player => {
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        dialog.innerHTML = '<button onclick="this.parentElement.remove()">Close</button>';
        player.appendChild(dialog);
    });
    await command(page, 'back');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.fullscreenElement?.id)).toBe('player');
    await command(page, 'back');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
});

test('double OK supports the player custom-speed control', async ({page}) => {
    await setup(page, '<button id="speed" ondblclick="this.dataset.custom=\'open\'">1x</button>');
    await command(page, 'focus');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.locator('#speed')).toHaveAttribute('data-custom', 'open');
});
