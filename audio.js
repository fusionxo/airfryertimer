/**
 * audio.js
 * Procedural Audio Synthesizer using Web Audio API
 * Generates custom crisp alerts and continuous alarms offline.
 */

let audioCtx = null;
let isMuted = false;
let alarmIntervalId = null;
let alarmOscillators = [];

/**
 * Initializes the AudioContext on first user interaction.
 * Crucial for overcoming browser autoplay blocking.
 */
export function initAudio() {
  if (isMuted) return;
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (e) {
    console.error("Web Audio API not supported in this browser", e);
  }
}

/**
 * Safely sets the volume of a node with smooth transitions to avoid pops/clicks.
 */
function fadeOutAndStop(oscillator, gainNode, duration = 0.3) {
  if (!audioCtx) return;
  const time = audioCtx.currentTime;
  try {
    gainNode.gain.setValueAtTime(gainNode.gain.value, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.stop(time + duration);
  } catch (e) {
    // Oscillator may have already stopped
  }
}

/**
 * Toggles the global mute state of the synthesizer.
 * @param {boolean} muteState 
 */
export function setMuted(muteState) {
  isMuted = muteState;
  if (isMuted) {
    stopAlarm();
  } else {
    initAudio();
  }
}

/**
 * Returns the current mute state.
 */
export function getMuted() {
  return isMuted;
}

/**
 * Plays a warm, ascending arpeggio chime (E5 -> G5 -> C6) when starting a timer.
 */
export function playStartChime() {
  if (isMuted) return;
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const notes = [659.25, 783.99, 1046.50]; // E5, G5, C6
  const duration = 0.15;
  const spacing = 0.08;

  notes.forEach((freq, index) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'triangle'; // Smooth flute-like tone
    osc.frequency.setValueAtTime(freq, now + (index * spacing));
    
    gain.gain.setValueAtTime(0, now + (index * spacing));
    gain.gain.linearRampToValueAtTime(0.3, now + (index * spacing) + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (index * spacing) + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now + (index * spacing));
    osc.stop(now + (index * spacing) + duration);
  });
}

/**
 * Plays a bright, dual-frequency high chime (e.g. at transition boundaries).
 * "Time to shake/flip!"
 */
export function playTransitionChime() {
  if (isMuted) return;
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  
  // Custom futuristic transition double chime
  const playBeep = (freq, delay, dur, type = 'sine') => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + delay);
    
    // Add simple filter to make it sound premium
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2500, now + delay);
    
    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(0.4, now + delay + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now + delay);
    osc.stop(now + delay + dur);
  };

  playBeep(880.00, 0.0, 0.2, 'sine');       // A5
  playBeep(1318.51, 0.08, 0.25, 'triangle'); // E6
}

/**
 * Plays a soft, subtle low-frequency tick-tock pulse (optional user-friendly sound).
 */
export function playTickSound() {
  if (isMuted) return;
  if (!audioCtx) return;
  
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now); // Soft low-frequency thump
  
  gain.gain.setValueAtTime(0.05, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start(now);
  osc.stop(now + 0.06);
}

/**
 * Triggers a continuous, repeating premium melody alert that sounds until stopped.
 * Simulates a high-quality alarm with rhythmic pulses.
 */
export function playAlarm() {
  if (isMuted) return;
  initAudio();
  if (!audioCtx) return;
  
  // Ensure we don't pile up alarms
  stopAlarm();

  let count = 0;
  
  const triggerAlarmPulse = () => {
    if (isMuted || !audioCtx) return;
    const now = audioCtx.currentTime;
    
    // Play dual tone (harmony)
    const freqs = [880.00, 1100.00]; // A5 and C#6 (Beautiful major third chord alert)
    
    freqs.forEach((freq) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      
      // Tremolo/Vibrato effect
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.linearRampToValueAtTime(freq + 10, now + 0.15);
      osc.frequency.linearRampToValueAtTime(freq - 10, now + 0.3);
      
      // Volume envelope: sharp start, quick pulse, repeat
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(now);
      osc.stop(now + 0.5);
      
      alarmOscillators.push({ osc, gain });
    });
    
    count++;
    
    // Second pulse in the cycle
    if (count % 2 === 1) {
      setTimeout(() => {
        if (!alarmIntervalId || isMuted || !audioCtx) return;
        const subNow = audioCtx.currentTime;
        freqs.forEach((freq) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, subNow);
          
          gain.gain.setValueAtTime(0, subNow);
          gain.gain.linearRampToValueAtTime(0.25, subNow + 0.05);
          gain.gain.linearRampToValueAtTime(0.15, subNow + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, subNow + 0.45);
          
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          
          osc.start(subNow);
          osc.stop(subNow + 0.5);
          
          alarmOscillators.push({ osc, gain });
        });
      }, 250);
    }
  };

  // Trigger instantly, then schedule every 1.5 seconds
  triggerAlarmPulse();
  alarmIntervalId = setInterval(triggerAlarmPulse, 1500);
}

/**
 * Stops any active repeating alarms.
 */
export function stopAlarm() {
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
  
  // Clear any active oscillators cleanly
  alarmOscillators.forEach(({ osc, gain }) => {
    try {
      fadeOutAndStop(osc, gain, 0.1);
    } catch (e) {}
  });
  alarmOscillators = [];
}
