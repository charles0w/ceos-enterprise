// Sanity tests for the Social Studio plan validator + ffmpeg arg builders.
// Run: npx -y tsx scripts/social-render-test.ts

import { validatePlan, planDuration, canvasFor, type EditPlan, type AssetMeta } from '../lib/social/plan';
import {
  atempoChain, buildClipCommands, buildConcatCommand, buildMusicCommand,
  buildOverlayCommand, concatListText, fadesFor,
} from '../lib/social/renderArgs';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failures++;
  console.error(`  ✗ ${name}`, detail ?? '');
}

const assets: AssetMeta[] = [
  { id: 'vid1', kind: 'video', duration: 60 },
  { id: 'vid2', kind: 'video', duration: 30 },
  { id: 'img1', kind: 'image', duration: null },
  { id: 'mus1', kind: 'audio', duration: 180 },
];

console.log('— validation —');
const good: EditPlan = {
  version: 1,
  title: 'Test cut',
  aspect: '9:16',
  fps: 30,
  clips: [
    { assetId: 'vid1', in: 5, out: 9, speed: 1.5, filter: 'punch', transitionAfter: { type: 'fade', duration: 0.4 }, label: 'hook' },
    { assetId: 'img1', in: 0, out: 2.5 },
    { assetId: 'vid2', in: 0, out: 6, muted: true },
  ],
  captions: [
    { text: 'WAIT FOR IT', start: 0, end: 1.4, style: { position: 'top', background: 'accent' } },
    { text: 'the payoff', start: 6.2, end: 8.0 },
  ],
  music: { assetId: 'mus1', volume: 0.25, fadeOut: 2 },
};
const v1 = validatePlan(good, assets);
check('valid plan accepted', v1.ok, v1.errors);
check('duration math: 4/1.5 + 2.5 + 6', Math.abs(planDuration(good) - (4 / 1.5 + 2.5 + 6)) < 1e-6, planDuration(good));

const bad = validatePlan({
  version: 1, aspect: '4:3',
  clips: [
    { assetId: 'nope', in: 0, out: 5 },
    { assetId: 'vid2', in: 10, out: 50 },          // exceeds 30s duration
    { assetId: 'mus1', in: 0, out: 5 },             // audio as clip
    { assetId: 'vid1', in: 5, out: 4 },             // in >= out
  ],
  captions: [{ text: '', start: 2, end: 1 }],
  music: { assetId: 'img1' },
}, assets);
check('bad plan rejected', !bad.ok);
check('catches unknown asset', bad.errors.some((e) => e.includes('not in the library')), bad.errors);
check('catches out > duration', bad.errors.some((e) => e.includes('exceeds asset duration')));
check('catches audio-as-clip', bad.errors.some((e) => e.includes('audio belongs in music')));
check('catches bad aspect', bad.errors.some((e) => e.includes('aspect')));
check('catches in>=out + empty caption + image music', bad.errors.length >= 6, bad.errors.length);

console.log('— atempo —');
check('1x', atempoChain(1) === 'atempo=1.0000');
check('3x → 2,1.5', atempoChain(3) === 'atempo=2.0000,atempo=1.5000');
check('0.25x → .5,.5', atempoChain(0.25) === 'atempo=0.5000,atempo=0.5000');

console.log('— canvas —');
check('9:16 final 1080x1920', JSON.stringify(canvasFor('9:16', 'final')) === '{"w":1080,"h":1920}');
check('9:16 draft 540x960', JSON.stringify(canvasFor('9:16', 'draft')) === '{"w":540,"h":960}');

console.log('— fades —');
const f0 = fadesFor(good, 0); // fades OUT into clip 1
const f1 = fadesFor(good, 1); // fades IN from clip 0
check('clip0 fade-out only', f0.fadeOut === 0.4 && !f0.fadeIn, f0);
check('clip1 fade-in only', f1.fadeIn === 0.4 && !f1.fadeOut, f1);
check('last clip no fades', !fadesFor(good, 2).fadeIn && !fadesFor(good, 2).fadeOut);

console.log('— clip commands —');
const c0 = buildClipCommands(good, 0, { kind: 'video', inputName: 'in_0.mp4' }, 'final');
check('video clip has primary + silent', !!c0.primary && c0.silent.length > 0);
const p0 = c0.primary!.join(' ');
check('trim args', p0.includes('-ss 5.000 -t 4.000 -i in_0.mp4'), p0);
check('speed in vf', p0.includes('setpts=(PTS-STARTPTS)/1.5'));
check('atempo in af', p0.includes('atempo=1.5000'));
check('scale+crop 1080x1920', p0.includes('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'));
check('look filter', p0.includes('eq=contrast=1.12:saturation=1.28'));
check('fade-out at dur-0.4 (4/1.5-0.4≈2.267)', p0.includes('fade=t=out:st=2.267:d=0.4'), p0);
check('mpegts out', p0.endsWith('-f mpegts clip_0.ts'));
check('final quality crf18', p0.includes('-crf 18'));

const c1 = buildClipCommands(good, 1, { kind: 'image', inputName: 'in_1.png' }, 'draft');
check('image clip: silent only', c1.primary === null);
const s1 = c1.silent.join(' ');
check('image loop+t', s1.includes('-loop 1 -t 2.500 -i in_1.png'), s1);
check('image gets silence', s1.includes('anullsrc=r=48000:cl=stereo'));
check('image fade-in from clip0 fade', s1.includes('fade=t=in:st=0:d=0.4'));
check('draft crf28', s1.includes('-crf 28'));

const c2 = buildClipCommands(good, 2, { kind: 'video', inputName: 'in_2.mp4' }, 'final');
check('muted clip: silent only', c2.primary === null && c2.silent.join(' ').includes('anullsrc'));

console.log('— concat / overlay / music —');
check('concat list', concatListText(['clip_0.ts', 'clip_1.ts']) === "file 'clip_0.ts'\nfile 'clip_1.ts'\n");
const cc = buildConcatCommand('list.txt', 'base.mp4').join(' ');
check('concat copy + adts fix + faststart', cc.includes('-c copy') && cc.includes('aac_adtstoasc') && cc.includes('+faststart'));

const ov = buildOverlayCommand('base.mp4', [
  { pngName: 'cap_0.png', start: 0, end: 1.4 },
  { pngName: 'cap_1.png', start: 6.2, end: 8 },
], 'final', 'caps.mp4');
const ovs = ov.join(' ');
check('overlay chain labels', ovs.includes("[0:v][1:v]overlay=0:0:enable='between(t,0.000,1.400)'[v1]") && ovs.includes("[v1][2:v]overlay=0:0:enable='between(t,6.200,8.000)'[vout]"), ovs);
check('overlay maps audio copy', ovs.includes('-map [vout] -map 0:a') && ovs.includes('-c:a copy'));

const mu = buildMusicCommand('caps.mp4', 'music.mp3', { volume: 0.25, fadeOut: 2 }, 11.17, 'out.mp4', true).join(' ');
check('music volume + fade + amix', mu.includes('volume=0.25') && mu.includes('afade=t=out:st=9.170:d=2') && mu.includes('amix=inputs=2:duration=first:dropout_transition=0:normalize=0'), mu);
check('music copies video', mu.includes('-c:v copy'));
const mu2 = buildMusicCommand('caps.mp4', 'music.mp3', {}, 10, 'out.mp4', false).join(' ');
check('amix fallback without normalize', !mu2.includes('normalize'));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
