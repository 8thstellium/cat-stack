/* Cat Stack's generated music and sound effects. No audio files are used. */
(function (root) {
  'use strict';

  var ns = root.CatStack = root.CatStack || {};
  var context = null;
  var master = null;
  var musicBus = null;
  var keysBus = null;
  var effectsBus = null;
  var noiseBuffer = null;
  var timer = null;
  var nextStepTime = 0;
  var step = 0;
  var loop = 0;
  var muted = false;
  var BEAT = 60 / 72;
  var CHORDS = [
    [55, 58, 62, 65, 69], // Gm9
    [48, 52, 58, 62, 69], // C13
    [53, 57, 60, 64, 67], // Fmaj9
    [50, 53, 57, 60, 64]  // Dm9
  ];
  var BASS = [43, 36, 41, 38];
  var FIFTH = [50, 43, 48, 45];
  var MOTIF = [77, 79, 81, 84, 81, 79, 77, 74];

  try { muted = root.localStorage.getItem('catStackMuted') === 'true'; } catch (_) {}

  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function makeNoise(seconds) {
    var size = Math.ceil(context.sampleRate * seconds);
    var buffer = context.createBuffer(1, size, context.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function envelope(gain, at, peak, attack, decay) {
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  function oscillator(type, frequency, at, duration, volume, output, options) {
    var osc = context.createOscillator();
    var amp = context.createGain();
    var opts = options || {};
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    if (opts.endFrequency) osc.frequency.exponentialRampToValueAtTime(opts.endFrequency, at + duration);
    if (opts.detune) osc.detune.value = opts.detune;
    envelope(amp, at, volume, opts.attack || 0.008, duration);
    osc.connect(amp);
    amp.connect(output);
    osc.start(at);
    osc.stop(at + duration + 0.03);
  }

  function noiseHit(at, duration, volume, filterType, frequency, q) {
    var source = context.createBufferSource();
    var filter = context.createBiquadFilter();
    var amp = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q || 0.7;
    envelope(amp, at, volume, 0.002, duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(musicBus);
    source.start(at);
    source.stop(at + duration + 0.03);
  }

  function chord(notes, at) {
    for (var i = 0; i < notes.length; i++) {
      var when = at + i * 0.013;
      var frequency = hz(notes[i]);
      oscillator('sine', frequency, when, 1.85, 0.08, keysBus, { attack: 0.028 });
      oscillator('triangle', frequency, when, 1.2, 0.02, keysBus,
        { attack: 0.025, detune: i % 2 ? 4 : -4 });
    }
  }

  function bass(midi, at) {
    oscillator('sine', hz(midi), at, 0.49, 0.22, musicBus, { attack: 0.014 });
  }

  function kick(at) {
    oscillator('sine', 110, at, 0.23, 0.3, musicBus,
      { attack: 0.002, endFrequency: 45 });
  }

  function snare(at) { noiseHit(at, 0.16, 0.12, 'bandpass', 1500, 0.5); }
  function hat(at, strong) { noiseHit(at, 0.046, strong ? 0.05 : 0.03, 'highpass', 5600, 0.7); }

  function melody(midi, at) {
    oscillator('triangle', hz(midi), at, 0.42, 0.09, musicBus, { attack: 0.003 });
  }

  function scheduleStep(at) {
    var bar = Math.floor(step / 8);
    var within = step % 8;
    if (within === 0) {
      chord(CHORDS[bar], at);
      bass(BASS[bar], at);
    }
    if (within === 5) bass(FIFTH[bar], at);
    if (within === 0 || within === 4) kick(at);
    if (within === 2 || within === 6) snare(at);
    hat(at, within % 2 === 0);

    if (loop % 2 === 0 && (within === 0 || within === 3)) {
      var noteIndex = bar * 2 + (within === 3 ? 1 : 0);
      var note = MOTIF[noteIndex];
      if (noteIndex === 5) note = Math.random() < 0.5 ? 79 : 81;
      melody(note, at + 0.03);
    }
  }

  function scheduler() {
    if (!context || context.state !== 'running' || root.document && root.document.hidden) return;
    if (nextStepTime < context.currentTime - 0.2) nextStepTime = context.currentTime + 0.05;
    var count = 0;
    while (nextStepTime < context.currentTime + 0.1 && count++ < 8) {
      scheduleStep(nextStepTime);
      nextStepTime += step % 2 === 0 ? BEAT * 0.62 : BEAT * 0.38;
      step++;
      if (step === 32) { step = 0; loop++; }
    }
  }

  function setMasterGain() {
    if (!context) return;
    var now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(muted ? 0 : 1.0, now + 0.04);
  }

  function createGraph() {
    var AudioContextType = root.AudioContext || root.webkitAudioContext;
    if (!AudioContextType) return false;
    context = new AudioContextType();
    master = context.createGain();
    master.gain.value = muted ? 0 : 1.0;
    var compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 2;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.2;
    compressor.connect(master);
    master.connect(context.destination);

    musicBus = context.createGain();
    musicBus.gain.value = 1.6;
    var lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2400;
    lowpass.Q.value = 0.45;
    musicBus.connect(lowpass);
    lowpass.connect(compressor);
    keysBus = context.createGain();
    keysBus.gain.value = 0.92;
    keysBus.connect(musicBus);
    var tremolo = context.createOscillator();
    var tremoloDepth = context.createGain();
    tremolo.frequency.value = 4;
    tremoloDepth.gain.value = 0.08;
    tremolo.connect(tremoloDepth);
    tremoloDepth.connect(keysBus.gain);
    tremolo.start();
    var sweep = context.createOscillator();
    var sweepDepth = context.createGain();
    sweep.frequency.value = 0.05;
    sweepDepth.gain.value = 180;
    sweep.connect(sweepDepth);
    sweepDepth.connect(lowpass.frequency);
    sweep.start();

    effectsBus = context.createGain();
    effectsBus.gain.value = 0.75;
    effectsBus.connect(compressor);
    noiseBuffer = makeNoise(0.5);

    // A quiet, sparse vinyl texture made from generated noise and tiny clicks.
    var vinyl = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
    var data = vinyl.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.015;
    for (var n = 0; n < 9; n++) {
      var pos = Math.floor(Math.random() * (data.length - 80));
      var strength = (Math.random() * 2 - 1) * 0.15;
      for (var j = 0; j < 80; j++) data[pos + j] += strength * (1 - j / 80) * (Math.random() * 2 - 1);
    }
    var vinylSource = context.createBufferSource();
    var vinylGain = context.createGain();
    vinylSource.buffer = vinyl;
    vinylSource.loop = true;
    vinylGain.gain.value = 0.12;
    vinylSource.connect(vinylGain);
    vinylGain.connect(musicBus);
    vinylSource.start();

    nextStepTime = context.currentTime + 0.06;
    timer = root.setInterval(scheduler, 25);
    scheduler();
    return true;
  }

  function start() {
    if (!context && !createGraph()) return false;
    if (context.state !== 'running') {
      context.resume().then(function () {
        if (nextStepTime < context.currentTime) nextStepTime = context.currentTime + 0.05;
        scheduler();
      }).catch(function () {});
    }
    return true;
  }

  function toggleMute() {
    muted = !muted;
    try { root.localStorage.setItem('catStackMuted', String(muted)); } catch (_) {}
    start();
    setMasterGain();
    return muted;
  }

  function playDrop() {
    if (!context || context.state !== 'running') return;
    var at = context.currentTime + 0.005;
    oscillator('sine', 520, at, 0.13, 0.18, effectsBus,
      { attack: 0.003, endFrequency: 300 });
  }

  function playMerge(kind) {
    if (!context || context.state !== 'running') return;
    var scale = [0, 2, 4, 7, 9];
    var index = Math.max(0, Math.min(9, Math.floor(kind || 1) - 1));
    var midi = 72 + scale[index % scale.length] + 12 * Math.floor(index / scale.length);
    var at = context.currentTime + 0.005;
    oscillator('triangle', hz(midi), at, 0.23, 0.12, effectsBus, { attack: 0.002 });
    oscillator('sine', hz(midi + 12), at + 0.015, 0.15, 0.04, effectsBus, { attack: 0.002 });
  }

  function playMega() {
    if (!context || context.state !== 'running') return;
    var at = context.currentTime + 0.005;
    [77, 81, 84, 88, 91].forEach(function (midi, index) {
      oscillator('triangle', hz(midi), at + index * 0.065, 0.48, 0.09, effectsBus,
        { attack: 0.003 });
    });
  }

  if (root.document) root.document.addEventListener('visibilitychange', function () {
    if (!context) return;
    if (root.document.hidden) {
      context.suspend().catch(function () {});
    } else {
      context.resume().then(function () {
        nextStepTime = context.currentTime + 0.05;
        scheduler();
      }).catch(function () {});
    }
  });

  ns.audio = {
    start: start,
    toggleMute: toggleMute,
    isMuted: function () { return muted; },
    playDrop: playDrop,
    playMerge: playMerge,
    playMega: playMega
  };
})(typeof window !== 'undefined' ? window : globalThis);
