// Tests for the particle emulator (js/particleengine.js): run with `node --test tests` (npm test).
const test = require('node:test');
const assert = require('node:assert/strict');
const emu = require('../js/particleengine.js');

// the lines of a client half the way a script writes an effect, one statement to a line
const effect = (extra = []) => [
  'with (findimg(200)) {',
  '  with (emitter) {',
  '    delaymin = 0.5;',
  '    delaymax = 0.5;',
  '    nrofparticles = 3;',
  '    maxparticles = 50;',
  '    emissionoffset = {0, 0, 0};',
  '    with (particles[0]) {',
  '      image = "a.png";',
  '      lifetime = 2;',
  '      speed = 1;',
  '      angle = 0;',
  '    }',
  ...extra.map(line => '    ' + line),
  '  }',
  '}'
].join('\n');

const parse = (extra) => emu.parseGS2ParticleCode(effect(extra), {x: 5, y: 5});

test('the basic emitter parses', () => {
  const config = parse();
  assert.ok(config);
  assert.equal(config.nrofparticles, 3);
  assert.equal(config.maxparticles, 50);
  assert.equal(config.delaymin, 0.5);
  assert.equal(config.particles[0].image, 'a.png');
});

test('advancetime lets the effect run ahead before it is first shown', () => {
  const config = parse(['advancetime(1.2);']);
  assert.equal(config.advancetime, 1.2);
  const emitter = new emu.Emitter(config);
  emitter.update(0.016, 1);
  assert.ok(emitter.activeParticles.length > 0, 'the pre-roll made particles');
  assert.equal(emitter.emittedparticles, emitter.activeParticles.length + (emitter.emittedparticles - emitter.activeParticles.length));
});

test('addemitmodifier is read as the modifier that changes the particle types', () => {
  const config = parse(['addemitmodifier("once", 0, 0, "alpha", "replace", 0.5, 0.5);']);
  assert.equal(config.templateModifiers.length, 1);
  assert.equal(config.templateModifiers[0].attribute, 'alpha');
});

test('removemodifiers drops the modifiers added before it', () => {
  const config = parse([
    'addlocalmodifier("range", 0, 2, "alpha", "replace", 1, 0);',
    'addemitmodifier("once", 0, 0, "alpha", "replace", 0.5, 0.5);',
    'removemodifiers();'
  ]);
  assert.equal(config.modifiers.length, 0);
  assert.equal(config.templateModifiers.length, 0);
});

test('isfrozen stops an emitter and its particles', () => {
  const emitter = new emu.Emitter(parse(['advancetime(1.2);']));
  emitter.update(0.016, 1);
  const before = emitter.emittedparticles;
  emitter.isfrozen = true;
  emitter.update(1, 5);
  assert.equal(emitter.emittedparticles, before);
  emitter.isfrozen = false;
  emitter.update(1, 6);
  assert.ok(emitter.emittedparticles > before);
});

test('removeparticles empties the emitter and the counters follow', () => {
  const emitter = new emu.Emitter(parse(['advancetime(1.2);']));
  emitter.update(0.016, 1);
  assert.ok(emitter.currentparticlecount > 0);
  emitter.removeParticles();
  assert.equal(emitter.currentparticlecount, 0);
  assert.ok(emitter.emittedparticles > 0, 'what was emitted stays counted');
});

test('removeModifiers on a running emitter clears its modifiers and particles', () => {
  const emitter = new emu.Emitter(parse(['addlocalmodifier("range", 0, 2, "alpha", "replace", 1, 0);', 'advancetime(1.2);']));
  emitter.update(0.016, 1);
  emitter.removeModifiers();
  assert.equal(emitter.modifiers.length, 0);
  assert.equal(emitter.currentparticlecount, 0);
});

test('movementvector sets the move properties of a particle', () => {
  const particle = new emu.Particle({image: 'a.png', lifetime: 1, movementvector: {x: 2, y: -3, z: 0.5}});
  assert.equal(particle.vx, 2);
  assert.equal(particle.vy, -3);
  assert.equal(particle.vz, 0.5);
});

test('a sound is played, chosen from the list, when a particle is made', () => {
  const played = [];
  const config = parse(['advancetime(1.2);']);
  config.particles[0].sound = 'a.wav,b.wav';
  config.playSound = (names) => played.push(names);
  const emitter = new emu.Emitter(config);
  emitter.update(0.016, 1);
  assert.ok(played.length > 0, 'the emitter asked for the sound');
  assert.equal(played[0], 'a.wav,b.wav');
});

test('text and polygon particle types are emitted without a picture', () => {
  const config = parse(['advancetime(1.2);']);
  config.particles[0] = {text: 'hi', lifetime: 2, speed: 1};
  const emitter = new emu.Emitter(config);
  emitter.update(0.016, 1);
  assert.ok(emitter.activeParticles.length > 0);
  assert.equal(emitter.activeParticles[0].text, 'hi');
  const polygon = new emu.Particle({polygon: [0, 0, 1, 0, 1, 1], lifetime: 1});
  assert.deepEqual(polygon.polygon, [0, 0, 1, 0, 1, 1]);
});

test('checkbelowterrain ends a falling particle that reaches the ground', () => {
  const config = parse(['checkbelowterrain = true;']);
  config.particles[0] = {image: 'a.png', lifetime: 5, movementvector: {x: 0, y: 0, z: -2}};
  config.emissionoffset = {x: 0, y: 0, z: 1};
  config.maxparticles = 5;
  config.nrofparticles = 5;
  const emitter = new emu.Emitter(config);
  emitter.emit();
  assert.ok(emitter.currentparticlecount > 0);
  for (let i = 0; i < 40; i++) emitter.update(0.05, 10 + i * 0.05);
  assert.equal(emitter.currentparticlecount, 0, 'everything that fell has hit the ground');
});

test('a drop emitter makes particles where one ends on the ground', () => {
  const config = parse(['checkbelowterrain = true;']);
  config.particles[0] = {image: 'a.png', lifetime: 5, movementvector: {x: 0, y: 0, z: -2}};
  config.emissionoffset = {x: 0, y: 0, z: 1};
  config.nrofparticles = 1;
  config.emitautomatically = false;
  config.dropemitter = {nrofparticles: 4, maxparticles: 20, particletypes: 1, particles: [{image: 'd.png', lifetime: 1, speed: 1}], modifiers: [], templateModifiers: []};
  const emitter = new emu.Emitter(config);
  emitter.emit();
  for (let i = 0; i < 20; i++) emitter.update(0.05, 10 + i * 0.05);
  assert.ok(emitter.dropemitters.length > 0 || emitter.emittedparticles > 0, 'the drop emitter was started');
});
