import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?$/;

export function parseVersion(text) {
    const values = new Map();
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const match = /^(VERSION_NAME|VERSION_CODE)=(.+)$/.exec(line);
        if (!match || values.has(match[1])) throw new Error('Invalid or duplicated version.properties entry.');
        values.set(match[1], match[2].trim());
    }
    const name = values.get('VERSION_NAME');
    const codeText = values.get('VERSION_CODE');
    if (!name || !versionPattern.test(name)) throw new Error('VERSION_NAME must be a semantic version without build metadata.');
    if (!codeText || !/^[1-9]\d*$/.test(codeText)) throw new Error('VERSION_CODE must be a positive integer.');
    const code = Number(codeText);
    if (!Number.isSafeInteger(code) || code > 2100000000) throw new Error('VERSION_CODE exceeds the Android limit.');
    return {name, code};
}

export function validateTag(tag, version, previous = []) {
    if (tag !== `v${version.name}`) throw new Error('Release tag must exactly match v + VERSION_NAME.');
    if (previous.some(old => old.code >= version.code)) {
        throw new Error('VERSION_CODE must be greater than every previous version tag.');
    }
}

export function changelogEntry(markdown, name) {
    const lines = markdown.split(/\r?\n/);
    const start = lines.findIndex(line => line.startsWith(`## [${name}]`));
    if (start < 0) throw new Error(`CHANGELOG.md needs an entry for ${name}.`);
    let end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
    if (end < 0) end = lines.length;
    const entry = lines.slice(start + 1, end).join('\n').trim();
    if (!entry) throw new Error('The release changelog entry must not be empty.');
    return entry;
}

function git(args, cwd) {
    return execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

export function checkTag(root, tag) {
    const version = parseVersion(readFileSync(path.join(root, 'version.properties'), 'utf8'));
    validateTag(tag, version);
    const head = git(['rev-parse', 'HEAD'], root);
    if (git(['rev-parse', `refs/tags/${tag}^{commit}`], root) !== head) {
        throw new Error('The checked-out commit does not match the release tag.');
    }
    git(['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], root);
    const tags = git(['tag', '--list', 'v*'], root).split('\n').filter(other => other && other !== tag);
    const previous = tags.filter(other => versionPattern.test(other.slice(1)))
        .map(other => parseVersion(git(['show', `refs/tags/${other}:version.properties`], root)));
    validateTag(tag, version, previous);
    changelogEntry(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version.name);
    return version;
}

export function packageRelease(root, sourceApk) {
    const version = parseVersion(readFileSync(path.join(root, 'version.properties'), 'utf8'));
    const entry = changelogEntry(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version.name);
    const source = path.resolve(root, sourceApk);
    const bytes = readFileSync(source);
    if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('The APK must be a non-empty ZIP-format file.');
    const filename = `Cinejoy-TV-v${version.name}.apk`;
    const output = path.join(root, 'dist');
    mkdirSync(output, {recursive: true});
    const destination = path.join(output, filename);
    if (source !== destination) copyFileSync(source, destination);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(`${destination}.sha256`, `${checksum}  ${filename}\n`);
    const notes = `# Cinejoy TV ${version.name}\n\n${entry}\n\n` +
        `- Android version code: ${version.code}\n` +
        '- Minimum Android version: 6.0 (API 23), with Android System WebView.\n' +
        '- Verify the APK against the attached SHA-256 checksum.\n' +
        '- Device playback is not certified by CI. Complete the TV checklist before publishing this draft.\n' +
        '- Release-signed APKs cannot update the initial debug-signed APK in place.\n';
    writeFileSync(path.join(output, 'release-notes.md'), notes);
    return {filename, checksum, version};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const [command, argument] = process.argv.slice(2);
    const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
    if (command === 'check-tag' && argument) console.log(JSON.stringify(checkTag(root, argument)));
    else if (command === 'package' && argument) console.log(JSON.stringify(packageRelease(root, argument)));
    else throw new Error('Usage: node scripts/release.mjs check-tag <vVERSION> | package <signed-apk>');
}
