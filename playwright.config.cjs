const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: true,
    workers: 2,
    forbidOnly: !!process.env.CI,
    use: {
        browserName: 'chromium',
        channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
        headless: true,
        viewport: {width: 1280, height: 720},
        trace: 'retain-on-failure'
    },
    reporter: process.env.CI
        ? [['list'], ['junit', {outputFile: 'test-results/navigation.xml'}]]
        : 'list'
});
