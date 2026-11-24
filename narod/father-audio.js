(() => {
  'use strict';

  function create() {
    let ac, master, roomBus, effectsBus, fridge, staticBuffer;
    let enabled = true, ambient = true, muted = false, playing = false;
    let cracks = 0;
    const voices = new Set();
    let humRoom = 0;

    function gain(value, destination) {
      const node = ac.createGain();
      node.gain.value = value;
      node.connect(destination);
      return node;
    }

    function machine(type, frequency, level) {
      const oscillator = ac.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const volume = gain(level, roomBus);
      oscillator.connect(volume);
      oscillator.start();
      return volume;
    }

    function gains() {
      if (!ac) return;
      effectsBus.gain.value = enabled && !muted ? 1 : 0;
      roomBus.gain.value = playing && ambient && !muted ? 1 : 0;
      fridge.gain.setTargetAtTime(humRoom === 4 ? .020 : .002, ac.currentTime, .14);
    }

    function init() {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      if (!ac) {
        ac = new Context();
        const limiter = ac.createDynamicsCompressor();
        limiter.threshold.value = -10;
        limiter.knee.value = 5;
        limiter.ratio.value = 9;
        limiter.connect(ac.destination);
        master = gain(.48, limiter);
        effectsBus = gain(0, master);
        roomBus = gain(0, master);
        machine('triangle', 50, .019);
        fridge = machine('sine', 102, .003);
        staticBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const samples = staticBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      ac.resume().catch(() => {});
      gains();
    }

    function connect(source, chain, duration) {
      let output = source;
      for (const node of chain) output = output.connect(node);
      output.connect(effectsBus);
      voices.add(source);
      source.onended = () => {
        voices.delete(source);
        source.disconnect();
        for (const node of chain) node.disconnect();
      };
      source.start();
      source.stop(ac.currentTime + duration);
    }

    function stop() {
      for (const source of voices) source.stop();
      voices.clear();
    }

    function envelope(volume, duration, pan) {
      const g = ac.createGain();
      g.gain.setValueAtTime(Math.max(.002, volume), ac.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + duration);
      const stereo = ac.createStereoPanner();
      stereo.pan.value = Math.max(-1, Math.min(1, pan));
      return [g, stereo];
    }

    function tone(freq, duration, volume=.08, type='triangle', end=freq, pan=0) {
      if (!ac || !enabled || muted) return;
      const source = ac.createOscillator();
      source.type = type;
      source.frequency.setValueAtTime(freq, ac.currentTime);
      source.frequency.exponentialRampToValueAtTime(Math.max(20,end), ac.currentTime + duration);
      connect(source, envelope(volume, duration, pan), duration);
    }

    function hiss(duration, volume=.04, frequency=500, pan=0) {
      if (!ac || !enabled || muted) return;
      const source = ac.createBufferSource();
      source.buffer = staticBuffer;
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = frequency;
      connect(source, [filter, ...envelope(volume, duration, pan)], duration);
    }

    function crack() {
      if (!ac || !enabled || muted) return;
      cracks++;
      const t = ac.currentTime;
      const source = ac.createBufferSource();
      source.buffer = staticBuffer;
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = .65;
      filter.frequency.setValueAtTime(3600,t);
      filter.frequency.exponentialRampToValueAtTime(790,t+.13);
      const peak = ac.createGain();
      peak.gain.setValueAtTime(.001,t);
      peak.gain.linearRampToValueAtTime(.84,t+.004);
      peak.gain.exponentialRampToValueAtTime(.10,t+.045);
      peak.gain.exponentialRampToValueAtTime(.001,t+.18);
      connect(source, [filter, peak], .19);
      tone(145,.12,.26,'triangle',46);
    }

    function state(play, room, sfx, amb, quiet) {
      if (playing && !play || (!muted && quiet) || (enabled && !sfx)) stop();
      playing=play;
      humRoom=room;
      enabled=sfx;
      ambient=amb;
      muted=quiet;
      gains();
    }

    return { init, tone, hiss, crack, stop, state, inspect: () => ({
      context: ac?.state || null, ambience: !!roomBus?.gain.value, effects: !!effectsBus?.gain.value,
      voices: voices.size, cracks
    }) };
  }

  window.FatherAudio = { create };
})();
