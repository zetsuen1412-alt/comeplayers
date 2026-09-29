import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Original ComePlayers tones, generated as mono PCM for Android and iOS.
const destination = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/mobile/assets/sounds');
mkdirSync(destination, { recursive: true });
function render(name, seconds, notes) {
  const rate = 22050;
  const samples = Math.ceil(seconds * rate);
  const output = Buffer.alloc(44 + samples * 2);
  output.write('RIFF'); output.writeUInt32LE(output.length - 8, 4); output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16); output.writeUInt16LE(1, 20); output.writeUInt16LE(1, 22);
  output.writeUInt32LE(rate, 24); output.writeUInt32LE(rate * 2, 28); output.writeUInt16LE(2, 32); output.writeUInt16LE(16, 34);
  output.write('data', 36); output.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const time = i / rate;
    let sample = 0;
    for (const [start, frequency, duration] of notes) {
      const t = time - start;
      if (t < 0 || t >= duration) continue;
      const envelope = Math.min(1, t / .012) * Math.exp(-5 * t / duration) * Math.min(1, (duration - t) / .03);
      sample += .38 * envelope * (Math.sin(2 * Math.PI * frequency * t) + .13 * Math.sin(4 * Math.PI * frequency * t));
    }
    output.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }
  writeFileSync(resolve(destination, name), output);
}
render('comeplayers_message.wav', 1, [[0, 659.25, .65], [.15, 987.77, .75]]);
render('comeplayers_call.wav', 4, [[0, 523.25, .6], [.22, 659.25, .6], [.44, 783.99, .85], [1.5, 523.25, .6], [1.72, 659.25, .6], [1.94, 783.99, .85]]);
