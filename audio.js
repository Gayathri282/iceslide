/* ==========================================
   ICE SLIDE - Web Audio Synthesizer Engine
   Engaging background music & playful sound effects
   ========================================== */

(function (window) {
  "use strict";

  var actx = null;
  var masterGain = null;
  var musicGain = null;
  var sfxGain = null;
  var musicTimer = null;
  var isMusicPlaying = false;

  // Background Music Melody Pattern (Catchy, upbeat child-friendly theme)
  // Frequencies in Hz for notes: C4, D4, E4, F4, G4, A4, B4, C5, D5, E5, G5...
  var N = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00,
    REST: 0
  };

  // 16-step melody loop
  var bgmMelody = [
    N.E5, N.G5, N.C5, N.E5, N.D5, N.F5, N.B4, N.D5,
    N.C5, N.E5, N.G4, N.C5, N.D5, N.E5, N.D5, N.G4,
    N.E5, N.G5, N.C5, N.E5, N.D5, N.F5, N.A5, N.G5,
    N.C5, N.D5, N.E5, N.C5, N.D5, N.G4, N.C5, N.REST
  ];

  // Bassline loop notes
  var bgmBass = [
    N.C4, N.REST, N.C4, N.REST, N.G4, N.REST, N.G4, N.REST,
    N.A4, N.REST, N.A4, N.REST, N.F4, N.REST, N.G4, N.REST,
    N.C4, N.REST, N.C4, N.REST, N.G4, N.REST, N.B4, N.REST,
    N.F4, N.REST, N.G4, N.REST, N.C4, N.REST, N.C4, N.REST
  ];

  var stepIndex = 0;
  var tempoMs = 145; // Tempo pace

  function initAudio() {
    if (!actx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        actx = new AC();

        masterGain = actx.createGain();
        masterGain.gain.value = 0.5;
        masterGain.connect(actx.destination);

        musicGain = actx.createGain();
        musicGain.gain.value = 0.22;
        musicGain.connect(masterGain);

        sfxGain = actx.createGain();
        sfxGain.gain.value = 0.45;
        sfxGain.connect(masterGain);
      } catch (e) {
        actx = null;
      }
    }
    if (actx && actx.state === 'suspended') {
      actx.resume();
    }
    startMusic();
  }

  function startMusic() {
    if (isMusicPlaying) return;
    isMusicPlaying = true;
    stepIndex = 0;
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = setInterval(playMusicStep, tempoMs);
  }

  function stopMusic() {
    isMusicPlaying = false;
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function playMusicStep() {
    if (!actx || actx.state !== 'running' || !isMusicPlaying) return;

    var now = actx.currentTime;
    
    // Play Lead synth note
    var freq = bgmMelody[stepIndex % bgmMelody.length];
    if (freq > 0) {
      var osc = actx.createOscillator();
      var g = actx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.12, now + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, now + (tempoMs / 1000) * 0.85);

      osc.connect(g);
      g.connect(musicGain);
      osc.start(now);
      osc.stop(now + tempoMs / 1000);
    }

    // Play Bass note
    var bFreq = bgmBass[stepIndex % bgmBass.length];
    if (bFreq > 0) {
      var bOsc = actx.createOscillator();
      var bG = actx.createGain();
      bOsc.type = 'triangle';
      bOsc.frequency.setValueAtTime(bFreq / 2, now); // 1 octave lower

      bG.gain.setValueAtTime(0.001, now);
      bG.gain.linearRampToValueAtTime(0.18, now + 0.02);
      bG.gain.exponentialRampToValueAtTime(0.001, now + (tempoMs / 1000) * 0.9);

      bOsc.connect(bG);
      bG.connect(musicGain);
      bOsc.start(now);
      bOsc.stop(now + tempoMs / 1000);
    }

    stepIndex++;
  }

  function tone(o) {
    if (!actx || actx.state !== 'running') return;
    var t0 = actx.currentTime + (o.delay || 0);
    var osc = actx.createOscillator();
    var g = actx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.from, t0);
    if (o.to) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol || 0.2, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

    osc.connect(g);
    g.connect(sfxGain);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.03);
  }

  function noise(dur, vol, freq, q) {
    if (!actx || actx.state !== 'running') return;
    var n = Math.floor(actx.sampleRate * dur);
    var buf = actx.createBuffer(1, n, actx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) {
      d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    }
    var src = actx.createBufferSource();
    src.buffer = buf;
    var f = actx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq || 800;
    f.Q.value = q || 1;
    var g = actx.createGain();
    g.gain.value = vol;

    src.connect(f);
    f.connect(g);
    g.connect(sfxGain);
    src.start();
  }

  var sfx = {
    jump: function () {
      // Bouncy upbeat jump sound
      tone({ from: 320, to: 750, dur: 0.12, type: 'triangle', vol: 0.22 });
      tone({ from: 480, to: 920, dur: 0.10, type: 'sine', vol: 0.15, delay: 0.02 });
    },
    land: function () {
      // Soft snow squish
      noise(0.06, 0.08, 450, 1.2);
    },
    fish: function (elevated) {
      // Point gain chiming sound effect
      if (elevated) {
        // High score golden fish: 4-note chord cascade
        tone({ from: 523.25, dur: 0.08, type: 'sine', vol: 0.18 }); // C5
        tone({ from: 659.25, dur: 0.08, type: 'sine', vol: 0.18, delay: 0.05 }); // E5
        tone({ from: 783.99, dur: 0.08, type: 'sine', vol: 0.18, delay: 0.10 }); // G5
        tone({ from: 1046.50, dur: 0.16, type: 'triangle', vol: 0.22, delay: 0.15 }); // C6
      } else {
        // Regular fish: 2-note happy pop
        tone({ from: 659.25, dur: 0.08, type: 'sine', vol: 0.18 });
        tone({ from: 880.00, dur: 0.14, type: 'sine', vol: 0.20, delay: 0.06 });
      }
    },
    levelup: function () {
      // Level Up Fanfare tune!
      var notes = [440, 554.37, 659.25, 880, 1108.73]; // A, C#, E, A, C#
      for (var i = 0; i < notes.length; i++) {
        tone({ from: notes[i], dur: 0.18, type: 'triangle', vol: 0.2, delay: i * 0.06 });
      }
    },
    crash: function () {
      // Cute game over tumble sound
      noise(0.25, 0.2, 350, 0.8);
      tone({ from: 400, to: 120, dur: 0.35, type: 'sawtooth', vol: 0.2 });
      tone({ from: 220, to: 80, dur: 0.5, type: 'triangle', vol: 0.2, delay: 0.12 });
    }
  };

  window.IceAudio = {
    init: initAudio,
    startMusic: startMusic,
    stopMusic: stopMusic,
    sfx: sfx
  };
})(window);
