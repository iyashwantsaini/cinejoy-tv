import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {changelogEntry, checkTag, packageRelease, parseVersion, validateTag} from './release.mjs';

test('version properties accept stable and prerelease versions', () => {
    assert.deepEqual(parseVersion('# App version\r\nVERSION_NAME=1.2.3\r\nVERSION_CODE=7\r\n'), {name: '1.2.3', code: 7});
    assert.deepEqual(parseVersion('VERSION_NAME=2.0.0-rc.1\nVERSION_CODE=8'), {name: '2.0.0-rc.1', code: 8});
});

test('malformed, missing, duplicate and out-of-range versions fail explicitly', () => {
    for (const name of ['01.0.0', '1.0', '1.0.0+build', '1.0.0-01', '../bad', '1.0.0-']) {
        assert.throws(() => parseVersion(`VERSION_NAME=${name}\nVERSION_CODE=1`));
    }
    for (const code of ['0', '-1', '1.2', '01', '2100000001', 'no']) {
        assert.throws(() => parseVersion(`VERSION_NAME=1.0.0\nVERSION_CODE=${code}`));
    }
    assert.throws(() => parseVersion('VERSION_NAME=1.0.0'));
    assert.throws(() => parseVersion('VERSION_NAME=1.0.0\nVERSION_NAME=2.0.0\nVERSION_CODE=1'));
});

test('tag must match exactly and Android version codes must increase', () => {
    const version = {name: '1.0.1', code: 2};
    assert.doesNotThrow(() => validateTag('v1.0.1', version, [{name: '1.0.0', code: 1}]));
    assert.throws(() => validateTag('v1.0.2', version));
    assert.throws(() => validateTag('1.0.1', version));
    assert.throws(() => validateTag('v1.0.1', version, [{name: '1.0.0', code: 2}]));
    assert.throws(() => validateTag('v1.0.1', version, [{name: '1.0.0', code: 3}]));
});

test('release notes use only the requested changelog entry', () => {
    const text = '# Changes\n\n## [Unreleased]\nDraft\n\n## [1.0.1] - 2026-10-15\n\n- Fixed navigation.\n\n## [1.0.0]\nOld';
    assert.equal(changelogEntry(text, '1.0.1'), '- Fixed navigation.');
    assert.throws(() => changelogEntry(text, '2.0.0'));
    assert.throws(() => changelogEntry('## [1.0.0]\n\n## [0.9.0]\nOlder', '1.0.0'));
});

test('packaging creates versioned assets with an exact checksum', t => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'cinejoy-release-test-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    writeFileSync(path.join(root, 'version.properties'), 'VERSION_NAME=1.0.0\nVERSION_CODE=1');
    writeFileSync(path.join(root, 'CHANGELOG.md'), '## [1.0.0]\n\n- Initial version.\n');
    const bytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('fixture')]);
    writeFileSync(path.join(root, 'signed.apk'), bytes);
    const result = packageRelease(root, 'signed.apk');
    assert.equal(result.filename, 'Cinejoy-TV-v1.0.0.apk');
    const expected = createHash('sha256').update(bytes).digest('hex');
    assert.equal(result.checksum, expected);
    assert.deepEqual(readFileSync(path.join(root, 'dist', result.filename)), bytes);
    assert.equal(readFileSync(path.join(root, 'dist', `${result.filename}.sha256`), 'utf8'), `${expected}  ${result.filename}\n`);
    assert.match(readFileSync(path.join(root, 'dist', 'release-notes.md'), 'utf8'), /Device playback is not certified/);
    writeFileSync(path.join(root, 'bad.apk'), 'not an APK');
    assert.throws(() => packageRelease(root, 'bad.apk'));
});

test('tag checking verifies main ancestry and monotonic versions in an actual repository', t => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'cinejoy-release-git-test-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'Release Fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    writeFileSync(path.join(root, 'version.properties'), 'VERSION_NAME=1.0.0\nVERSION_CODE=1');
    writeFileSync(path.join(root, 'CHANGELOG.md'), '## [1.0.0]\n\n- Initial version.\n');
    git('add', '.');
    git('commit', '-m', 'Fixture version one');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('tag', 'v1.0.0');
    assert.deepEqual(checkTag(root, 'v1.0.0'), {name: '1.0.0', code: 1});
    writeFileSync(path.join(root, 'version.properties'), 'VERSION_NAME=1.0.1\nVERSION_CODE=2');
    writeFileSync(path.join(root, 'CHANGELOG.md'), '## [1.0.1]\n\n- Update.\n');
    git('add', '.');
    git('commit', '-m', 'Fixture version two');
    git('tag', 'v1.0.1');
    assert.throws(() => checkTag(root, 'v1.0.1'), /Command failed/);
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    assert.deepEqual(checkTag(root, 'v1.0.1'), {name: '1.0.1', code: 2});
    assert.throws(() => checkTag(root, 'v1.0.0'), /exactly match/);
});
