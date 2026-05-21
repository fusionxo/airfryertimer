/**
 * timer-worker.js
 * Dedicated background Web Worker for running a reliable countdown loop.
 * Helps bypass main-thread browser timer throttling on mobile devices.
 */

let intervalId = null;

self.onmessage = function(event) {
  const data = event.data;
  
  if (data.action === 'start') {
    if (intervalId) {
      clearInterval(intervalId);
    }
    
    // Start counting down at exactly 1-second intervals
    intervalId = setInterval(() => {
      self.postMessage({ type: 'tick' });
    }, 1000);
    
  } else if (data.action === 'stop') {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
