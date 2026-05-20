/**
 * app.js
 * Main Air Fryer Timer application script.
 * Manages states, local presets, CRUD mutations, sequential timer intervals, PWA lifecycle.
 */

import * as Audio from './audio.js';

/* ==========================================================================
   DEFAULT PRESET RECIPES (Built-in standard delicious kitchen profiles)
   ========================================================================== */
const DEFAULT_RECIPES = [
  {
    id: 'preset-eggs',
    isPreset: true,
    name: 'Perfect Air Fried Eggs',
    category: 'breakfast',
    stages: [
      { name: 'Preheat Fryer', time: 180, temp: 120 }, // 3 minutes
      { name: 'Slow Cook', time: 480, temp: 120 },    // 8 minutes
      { name: 'Cold Water Bath', time: 180, temp: 0 }  // 3 minutes (Rest stage)
    ]
  },
  {
    id: 'preset-fries',
    isPreset: true,
    name: 'Extra Crispy French Fries',
    category: 'veggies',
    stages: [
      { name: 'Preheat Fryer', time: 180, temp: 200 }, // 3 minutes
      { name: 'First Half Cook', time: 600, temp: 200 }, // 10 minutes
      { name: 'Shake & Crisp Finish', time: 600, temp: 200 } // 10 minutes (after shaking)
    ]
  },
  {
    id: 'preset-wings',
    isPreset: true,
    name: 'Golden Chicken Wings',
    category: 'poultry',
    stages: [
      { name: 'Preheat Fryer', time: 240, temp: 200 }, // 4 minutes
      { name: 'Skin Down Sear', time: 720, temp: 200 }, // 12 minutes
      { name: 'Flip & Crispy Finish', time: 480, temp: 200 } // 8 minutes (after flipping)
    ]
  },
  {
    id: 'preset-salmon',
    isPreset: true,
    name: 'Glazed Salmon Fillet',
    category: 'seafood',
    stages: [
      { name: 'Preheat Fryer', time: 180, temp: 180 }, // 3 minutes
      { name: 'Juicy Cook', time: 480, temp: 180 },    // 8 minutes
      { name: 'Residual Resting', time: 120, temp: 60 } // 2 minutes warm rest
    ]
  }
];

/* ==========================================================================
   APPLICATION STATE
   ========================================================================== */
let state = {
  recipes: [],
  selectedRecipe: null,
  
  // Timer Running Engine States
  currentStageIndex: 0,
  stageTimeRemaining: 0, // In seconds
  totalDuration: 0,      // Cumulative seconds of selected recipe
  totalElapsed: 0,       // Total seconds completed in the current run
  
  isPlaying: false,
  timerIntervalId: null,
  isAlarmActive: false,
  
  // User Preferences
  isMuted: false,
  notificationsEnabled: false
};

// SVG Geometry Values
const INNER_RING_PERIMETER = 2 * Math.PI * 140; // R = 140 -> 879.6
const OUTER_RING_PERIMETER = 2 * Math.PI * 154; // R = 154 -> 967.6

/* ==========================================================================
   DOM ELEMENTS CACHE
   ========================================================================== */
const el = {
  // Navigation / Headers
  installBtn: document.getElementById('installBtn'),
  btnMute: document.getElementById('btnMute'),
  btnNotify: document.getElementById('btnNotify'),
  
  // Recipe Panel
  recipeList: document.getElementById('recipeList'),
  btnCreateRecipe: document.getElementById('btnCreateRecipe'),
  
  // Active Timer Dashboard
  timerCard: document.getElementById('timerCard'),
  stageNameDisplay: document.getElementById('stageNameDisplay'),
  timeDisplay: document.getElementById('timeDisplay'),
  tempDisplay: document.getElementById('tempDisplay'),
  innerProgressRing: document.getElementById('innerProgressRing'),
  outerProgressRing: document.getElementById('outerProgressRing'),
  
  // Playback Control Buttons
  btnPrev: document.getElementById('btnPrev'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  btnNext: document.getElementById('btnNext'),
  btnStop: document.getElementById('btnStop'),
  
  // Timeline Track
  timelineTrack: document.getElementById('timelineTrack'),
  totalElapsedVal: document.getElementById('totalElapsedVal'),
  totalDurationVal: document.getElementById('totalDurationVal'),
  stagesCompletedVal: document.getElementById('stagesCompletedVal'),
  
  // Custom Recipe Creator Modal
  recipeModal: document.getElementById('recipeModal'),
  recipeForm: document.getElementById('recipeForm'),
  modalClose: document.getElementById('modalClose'),
  btnCancelModal: document.getElementById('btnCancelModal'),
  modalTitle: document.getElementById('modalTitle'),
  recipeIdInput: document.getElementById('recipeId'),
  recipeNameInput: document.getElementById('recipeName'),
  recipeCategorySelect: document.getElementById('recipeCategory'),
  modalStagesContainer: document.getElementById('modalStagesContainer'),
  btnAddStageRow: document.getElementById('btnAddStageRow'),
  
  // Repeating Alarm Top Callout
  alarmBanner: document.getElementById('alarmBanner'),
  alarmRecipeName: document.getElementById('alarmRecipeName'),
  btnAlarmStop: document.getElementById('btnAlarmStop')
};

/* ==========================================================================
   INITIALIZATION & BOOTSTRAP
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  loadRecipes();
  loadPreferences();
  bindEvents();
  registerServiceWorker();
  
  // Select first recipe by default to load the screen
  if (state.recipes.length > 0) {
    selectRecipe(state.recipes[0].id);
  }
});

/**
 * Loads recipes from localStorage or populates default settings.
 */
function loadRecipes() {
  const local = localStorage.getItem('airfryer_custom_recipes');
  if (local) {
    try {
      const custom = JSON.parse(local);
      state.recipes = [...DEFAULT_RECIPES, ...custom];
    } catch (e) {
      console.error("Failed to parse custom recipes, fallback to defaults only", e);
      state.recipes = [...DEFAULT_RECIPES];
    }
  } else {
    state.recipes = [...DEFAULT_RECIPES];
  }
  renderRecipeList();
}

/**
 * Saves custom recipes to localStorage.
 */
function saveCustomRecipes() {
  const custom = state.recipes.filter(r => !r.isPreset);
  localStorage.setItem('airfryer_custom_recipes', JSON.stringify(custom));
}

/**
 * Loads user preferences (mute, notifications state) from storage.
 */
function loadPreferences() {
  const savedMute = localStorage.getItem('airfryer_mute_pref');
  state.isMuted = savedMute === 'true';
  Audio.setMuted(state.isMuted);
  updateMuteUI();
  
  // Notifications check
  if ('Notification' in window) {
    state.notificationsEnabled = Notification.permission === 'granted';
    updateNotificationUI();
  } else {
    el.btnNotify.style.display = 'none'; // API not supported
  }
}

/* ==========================================================================
   RECIPE CRUD MUTATIONS
   ========================================================================== */

/**
 * Displays all recipes (presets + custom) in the sidebar catalog.
 */
function renderRecipeList() {
  el.recipeList.innerHTML = '';
  
  if (state.recipes.length === 0) {
    el.recipeList.innerHTML = `
      <div class="empty-placeholder">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>No recipes available. Click "+" to create one.</p>
      </div>
    `;
    return;
  }
  
  state.recipes.forEach(recipe => {
    // Calculate total cooking time in recipe
    const totalSecs = recipe.stages.reduce((sum, stage) => sum + stage.time, 0);
    const timeString = formatMinutesSeconds(totalSecs);
    
    const item = document.createElement('div');
    item.className = `recipe-item ${state.selectedRecipe && state.selectedRecipe.id === recipe.id ? 'active' : ''}`;
    item.dataset.id = recipe.id;
    
    // Choose category icon
    let catIcon = '🍳';
    if (recipe.category === 'poultry') catIcon = '🍗';
    else if (recipe.category === 'seafood') catIcon = '🐟';
    else if (recipe.category === 'veggies') catIcon = '🍟';
    else if (recipe.category === 'bakery') catIcon = '🍰';
    
    item.innerHTML = `
      <div class="recipe-meta" onclick="app.handleRecipeClick('${recipe.id}')">
        <span class="recipe-name">${catIcon} ${recipe.name}</span>
        <div class="recipe-details">
          <span>⏱️ ${timeString}</span>
          <span>🔥 ${recipe.stages.length} step${recipe.stages.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div class="recipe-actions">
        ${!recipe.isPreset ? `
          <button title="Edit Recipe" class="btn-edit" onclick="app.openEditRecipeModal('${recipe.id}', event)">
            <svg style="width: 16px; height: 16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button title="Delete Recipe" class="btn-delete" onclick="app.deleteRecipe('${recipe.id}', event)">
            <svg style="width: 16px; height: 16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        ` : `
          <button title="Preset Template" style="opacity: 0.4; cursor: default;">
            <svg style="width: 16px; height: 16px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </button>
        `}
      </div>
    `;
    
    el.recipeList.appendChild(item);
  });
}

/**
 * Triggered when clicking on a recipe item. Sets it as the active timer target.
 */
function selectRecipe(id) {
  if (state.isPlaying) {
    if (!confirm("A timer is currently running. Loading a new recipe will stop and reset the active cooking. Continue?")) {
      return;
    }
    stopCooking();
  }
  
  const found = state.recipes.find(r => r.id === id);
  if (!found) return;
  
  state.selectedRecipe = found;
  
  // Highlight active listing
  document.querySelectorAll('.recipe-item').forEach(item => {
    item.classList.toggle('active', item.dataset.id === id);
  });
  
  resetCookingState();
  renderTimeline();
  updateTimerUI();
}

/**
 * Resets the local timing variables based on the active recipe schema.
 */
function resetCookingState() {
  state.currentStageIndex = 0;
  state.isPlaying = false;
  state.isAlarmActive = false;
  
  if (state.selectedRecipe && state.selectedRecipe.stages.length > 0) {
    state.stageTimeRemaining = state.selectedRecipe.stages[0].time;
    state.totalDuration = state.selectedRecipe.stages.reduce((acc, stg) => acc + stg.time, 0);
  } else {
    state.stageTimeRemaining = 0;
    state.totalDuration = 0;
  }
  
  state.totalElapsed = 0;
  hideAlarmBanner();
  updatePlaybackControlButtons();
}

/**
 * Deletes a user-created recipe from local memory.
 */
function deleteRecipe(id, event) {
  if (event) event.stopPropagation();
  
  const found = state.recipes.find(r => r.id === id);
  if (!found || found.isPreset) return;
  
  if (!confirm(`Are you sure you want to delete "${found.name}"?`)) {
    return;
  }
  
  // Remove from state list
  state.recipes = state.recipes.filter(r => r.id !== id);
  saveCustomRecipes();
  renderRecipeList();
  
  // If the active cooking target is deleted, default to first available
  if (state.selectedRecipe && state.selectedRecipe.id === id) {
    if (state.isPlaying) stopCooking();
    if (state.recipes.length > 0) {
      selectRecipe(state.recipes[0].id);
    } else {
      state.selectedRecipe = null;
      resetCookingState();
      updateTimerUI();
      renderTimeline();
    }
  }
}

/* ==========================================================================
   DYNAMIC MULTI-STAGE DOCK & DOME RENDERERS
   ========================================================================== */

/**
 * Computes step-by-step cooking stages inside the visual dashboard card.
 */
function renderTimeline() {
  el.timelineTrack.innerHTML = '';
  
  if (!state.selectedRecipe) {
    el.stagesCompletedVal.textContent = '0/0';
    el.totalElapsedVal.textContent = '00:00';
    el.totalDurationVal.textContent = '00:00';
    return;
  }
  
  const stages = state.selectedRecipe.stages;
  el.stagesCompletedVal.textContent = `${state.currentStageIndex}/${stages.length}`;
  el.totalDurationVal.textContent = formatMinutesSeconds(state.totalDuration);
  el.totalElapsedVal.textContent = formatMinutesSeconds(state.totalElapsed);
  
  stages.forEach((stage, idx) => {
    const step = document.createElement('div');
    step.className = 'timeline-step';
    if (idx < state.currentStageIndex) {
      step.classList.add('completed');
    } else if (idx === state.currentStageIndex) {
      step.classList.add('active');
    }
    
    // Custom label content
    const numNode = idx < state.currentStageIndex ? `✓` : `${idx + 1}`;
    
    step.innerHTML = `
      <div class="timeline-node">${numNode}</div>
      <div class="timeline-info">
        <div class="timeline-label">${stage.name}</div>
        <div class="timeline-time-temp">${formatMinutesSeconds(stage.time)} • ${stage.temp > 0 ? stage.temp + '°C' : 'OFF'}</div>
      </div>
    `;
    
    el.timelineTrack.appendChild(step);
  });
}

/**
 * Updates dynamic labels, times, fan speeds, and SVG dashboard offsets.
 */
function updateTimerUI() {
  if (!state.selectedRecipe || state.selectedRecipe.stages.length === 0) {
    el.stageNameDisplay.textContent = 'NO RECIPE';
    el.timeDisplay.textContent = '00:00';
    el.tempDisplay.innerHTML = `🔥 -- °C`;
    el.innerProgressRing.style.strokeDashoffset = INNER_RING_PERIMETER;
    el.outerProgressRing.style.strokeDashoffset = OUTER_RING_PERIMETER;
    el.timerCard.classList.remove('cooking-active');
    return;
  }
  
  const currentStage = state.selectedRecipe.stages[state.currentStageIndex];
  
  // Text content values
  el.stageNameDisplay.textContent = currentStage.name;
  el.timeDisplay.textContent = formatMinutesSeconds(state.stageTimeRemaining);
  el.tempDisplay.innerHTML = currentStage.temp > 0 
    ? `<svg style="width: 14px; height: 14px; display: inline; vertical-align: middle; margin-right: 2px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> ${currentStage.temp}°C`
    : `❄️ RESTING`;
  
  // Radial calculations
  // Inner ring: current stage progress
  const stageDuration = currentStage.time;
  const innerPercent = stageDuration > 0 ? (state.stageTimeRemaining / stageDuration) : 0;
  const innerOffset = INNER_RING_PERIMETER - (INNER_RING_PERIMETER * innerPercent);
  el.innerProgressRing.style.strokeDashoffset = innerOffset;
  
  // Outer ring: total recipe progress
  const totalPercent = state.totalDuration > 0 ? (1 - (state.totalElapsed / state.totalDuration)) : 1;
  const outerOffset = OUTER_RING_PERIMETER - (OUTER_RING_PERIMETER * totalPercent);
  el.outerProgressRing.style.strokeDashoffset = outerOffset;
  
  // Cooking state elements
  el.timerCard.classList.toggle('cooking-active', state.isPlaying);
}

/**
 * Handles grey state toggling for control elements based on playback positions.
 */
function updatePlaybackControlButtons() {
  if (!state.selectedRecipe) {
    el.btnPrev.disabled = true;
    el.btnNext.disabled = true;
    el.btnPlayPause.disabled = true;
    el.btnStop.disabled = true;
    return;
  }
  
  el.btnPlayPause.disabled = false;
  el.btnStop.disabled = false;
  
  el.btnPrev.disabled = state.currentStageIndex === 0;
  el.btnNext.disabled = state.currentStageIndex >= state.selectedRecipe.stages.length - 1;
  
  // Toggle Play / Pause Icon inside primary action circular button
  if (state.isPlaying) {
    el.btnPlayPause.innerHTML = `
      <svg style="width: 32px; height: 32px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M10 9v6m4-6v6" />
      </svg>
    `;
  } else {
    el.btnPlayPause.innerHTML = `
      <svg style="width: 32px; height: 32px; margin-left: 4px;" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
    `;
  }
}

/* ==========================================================================
   TIMER RUNNING ENGINE STATE MACHINE
   ========================================================================== */

/**
 * Toggles play and pause state.
 */
function handlePlayPause() {
  if (state.isAlarmActive) {
    dismissAlarm();
    return;
  }
  
  if (state.isPlaying) {
    pauseCooking();
  } else {
    startCooking();
  }
}

/**
 * Activates active timer interval running.
 */
function startCooking() {
  if (!state.selectedRecipe) return;
  
  Audio.initAudio();
  
  if (!state.isPlaying) {
    state.isPlaying = true;
    
    // Play warm starting sound synthesizers
    if (state.totalElapsed === 0) {
      Audio.playStartChime();
    }
    
    state.timerIntervalId = setInterval(tick, 1000);
    
    updatePlaybackControlButtons();
    updateTimerUI();
    
    // Check background notification permission on initial trigger
    requestNotificationPermission(true);
  }
}

/**
 * Pauses active timer interval loop.
 */
function pauseCooking() {
  if (state.isPlaying) {
    state.isPlaying = false;
    clearInterval(state.timerIntervalId);
    state.timerIntervalId = null;
    
    updatePlaybackControlButtons();
    updateTimerUI();
  }
}

/**
 * Resets active cooking and returns states to idle.
 */
function stopCooking() {
  pauseCooking();
  resetCookingState();
  renderTimeline();
  updateTimerUI();
}

/**
 * Timer tick execution executed every 1000ms.
 */
function tick() {
  if (state.stageTimeRemaining > 0) {
    state.stageTimeRemaining--;
    state.totalElapsed++;
    
    // Optional extremely quiet audio pulse on timer ticks to make UI feel alive
    // Audio.playTickSound();
  }
  
  updateTimerUI();
  
  // Sync cumulative visual texts
  el.totalElapsedVal.textContent = formatMinutesSeconds(state.totalElapsed);
  
  // Catch stage completions
  if (state.stageTimeRemaining <= 0) {
    triggerStageTransition();
  }
}

/**
 * Advances the active cooking sequence or triggers final completion alarm.
 */
function triggerStageTransition() {
  const recipe = state.selectedRecipe;
  const nextIndex = state.currentStageIndex + 1;
  
  // Pause the clock for action required
  pauseCooking();
  
  // Play the loud repeating alarm tune for all steps
  state.isAlarmActive = true;
  Audio.playAlarm();
  
  if (nextIndex < recipe.stages.length) {
    // Intermediate stage completed!
    sendBackgroundNotification(
      `Stage Completed: ${recipe.stages[state.currentStageIndex].name} 🔔`,
      `Time for the next step! Next: ${recipe.stages[nextIndex].name}.`
    );
    showAlarmBanner(false);
  } else {
    // All stages completed!
    sendBackgroundNotification(
      `Cooking Finished! 🍗`,
      `Your delicious "${recipe.name}" is ready! Enjoy your meal.`
    );
    showAlarmBanner(true);
  }
}

/**
 * Shifts the sequence index backward.
 */
function handlePrevStage() {
  if (state.currentStageIndex > 0) {
    const wasPlaying = state.isPlaying;
    pauseCooking();
    
    state.currentStageIndex--;
    
    // Subtract previous duration to recalculate totalElapsed
    const recipe = state.selectedRecipe;
    state.stageTimeRemaining = recipe.stages[state.currentStageIndex].time;
    
    // Recompute total elapsed time up to starting of this previous stage
    state.totalElapsed = recipe.stages.slice(0, state.currentStageIndex).reduce((sum, s) => sum + s.time, 0);
    
    renderTimeline();
    updateTimerUI();
    
    if (wasPlaying) startCooking();
    else updatePlaybackControlButtons();
  }
}

/**
 * Skips the active stage, transitioning immediately.
 */
function handleNextStage() {
  if (!state.selectedRecipe) return;
  const stages = state.selectedRecipe.stages;
  
  if (state.currentStageIndex < stages.length - 1) {
    const wasPlaying = state.isPlaying;
    pauseCooking();
    
    // Add remaining time of skipped stage to total elapsed
    state.totalElapsed += state.stageTimeRemaining;
    
    state.currentStageIndex++;
    state.stageTimeRemaining = stages[state.currentStageIndex].time;
    
    renderTimeline();
    updateTimerUI();
    
    if (wasPlaying) startCooking();
    else updatePlaybackControlButtons();
  }
}

/* ==========================================================================
   ALARM CRITICAL CALLOUT BANNER HANDLERS
   ========================================================================== */

function showAlarmBanner(isFinal = true) {
  if (state.selectedRecipe) {
    const headlineEl = el.alarmBanner.querySelector('.alarm-headline');
    const subEl = el.alarmRecipeName;
    const buttonEl = el.btnAlarmStop;
    
    const recipe = state.selectedRecipe;
    const currentStage = recipe.stages[state.currentStageIndex];
    
    if (isFinal) {
      if (headlineEl) headlineEl.textContent = "Cooking Complete! 🍗";
      subEl.textContent = `Your delicious "${recipe.name}" is ready.`;
      buttonEl.textContent = "DONE / STOP";
    } else {
      const nextStage = recipe.stages[state.currentStageIndex + 1];
      if (headlineEl) headlineEl.textContent = "Stage Complete! 🔔";
      subEl.textContent = `Finished: "${currentStage.name}". Next: "${nextStage.name}" (${nextStage.temp}°C).`;
      buttonEl.textContent = "START NEXT STEP";
    }
    
    el.alarmBanner.classList.add('active');
  }
}

function hideAlarmBanner() {
  el.alarmBanner.classList.remove('active');
}

function dismissAlarm() {
  Audio.stopAlarm();
  state.isAlarmActive = false;
  hideAlarmBanner();
  
  const recipe = state.selectedRecipe;
  const nextIndex = state.currentStageIndex + 1;
  
  if (recipe && nextIndex < recipe.stages.length) {
    // Advance to next stage and auto-start
    state.currentStageIndex = nextIndex;
    state.stageTimeRemaining = recipe.stages[nextIndex].time;
    renderTimeline();
    updateTimerUI();
    startCooking();
  } else {
    // Final stage completed, stop and reset
    stopCooking();
  }
}

/* ==========================================================================
   DYNAMIC FORM STAGE LIST WRITING (RECIPE MODAL CREATOR)
   ========================================================================== */

/**
 * Appends a new stage row configuration inside the modal form.
 */
function addStageRow(name = '', duration = 60, temp = 180) {
  const row = document.createElement('div');
  row.className = 'modal-stage-row';
  
  const min = Math.floor(duration / 60);
  const sec = duration % 60;
  
  row.innerHTML = `
    <div style="display: flex; flex-direction: column; width: 100%;">
      <label class="form-label">Stage Title</label>
      <input type="text" placeholder="e.g. Cook / Flip / Rest" class="form-input stage-input-name" value="${escapeHtml(name)}" required />
    </div>
    <div style="display: flex; flex-direction: column;">
      <label class="form-label">Temp (°C)</label>
      <input type="number" min="0" max="250" placeholder="180" class="form-input stage-input-temp" value="${temp}" required />
    </div>
    <div style="display: flex; flex-direction: column;">
      <label class="form-label">Min</label>
      <input type="number" min="0" max="180" placeholder="5" class="form-input stage-input-min" value="${min}" required />
    </div>
    <div style="display: flex; flex-direction: column;">
      <label class="form-label">Sec</label>
      <input type="number" min="0" max="59" placeholder="0" class="form-input stage-input-sec" value="${sec}" required />
    </div>
    <button type="button" title="Delete Step" class="btn-remove-stage" onclick="app.removeStageRow(this)">
      <svg style="width: 18px; height: 18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  `;
  
  el.modalStagesContainer.appendChild(row);
}

/**
 * Removes a selected stage row input.
 */
function removeStageRow(buttonElement) {
  const row = buttonElement.closest('.modal-stage-row');
  
  // Ensure we have at least 1 stage row inside the builder
  if (el.modalStagesContainer.children.length > 1) {
    row.remove();
  } else {
    alert("A cooking recipe requires at least one stage step.");
  }
}

/**
 * Form modal toggle visibility displays.
 */
function openCreateRecipeModal() {
  if (state.isPlaying) {
    alert("Cannot modify recipes while a timer is running.");
    return;
  }
  
  el.modalTitle.textContent = "Create Air Fryer Recipe";
  el.recipeIdInput.value = "";
  el.recipeNameInput.value = "";
  el.recipeCategorySelect.value = "breakfast";
  
  el.modalStagesContainer.innerHTML = '';
  // Populate first blank stage input
  addStageRow('Preheat Fryer', 180, 200);
  addStageRow('Main Cooking Run', 600, 200);
  
  el.recipeModal.classList.add('open');
}

/**
 * Populates and displays the modal form loaded with existing custom recipe settings.
 */
function openEditRecipeModal(id, event) {
  if (event) event.stopPropagation();
  
  if (state.isPlaying) {
    alert("Cannot modify recipes while a timer is running.");
    return;
  }
  
  const found = state.recipes.find(r => r.id === id);
  if (!found || found.isPreset) return;
  
  el.modalTitle.textContent = "Edit Recipe Profile";
  el.recipeIdInput.value = found.id;
  el.recipeNameInput.value = found.name;
  el.recipeCategorySelect.value = found.category || "breakfast";
  
  el.modalStagesContainer.innerHTML = '';
  found.stages.forEach(stage => {
    addStageRow(stage.name, stage.time, stage.temp);
  });
  
  el.recipeModal.classList.add('open');
}

function closeRecipeModal() {
  el.recipeModal.classList.remove('open');
}

/**
 * Processes modal inputs and updates local state databases.
 */
function handleRecipeFormSubmit(event) {
  event.preventDefault();
  
  const name = el.recipeNameInput.value.trim();
  const category = el.recipeCategorySelect.value;
  const id = el.recipeIdInput.value;
  
  // Scrape dynamic stage row fields
  const rows = el.modalStagesContainer.querySelectorAll('.modal-stage-row');
  const stages = [];
  
  let validationPassed = true;
  
  rows.forEach(row => {
    const stageName = row.querySelector('.stage-input-name').value.trim();
    const temp = parseInt(row.querySelector('.stage-input-temp').value) || 0;
    const min = parseInt(row.querySelector('.stage-input-min').value) || 0;
    const sec = parseInt(row.querySelector('.stage-input-sec').value) || 0;
    const totalTime = (min * 60) + sec;
    
    if (stageName === '') {
      alert("Please specify a title name for all stages.");
      validationPassed = false;
      return;
    }
    
    if (totalTime <= 0) {
      alert("All cooking stages must have a duration greater than 0 seconds.");
      validationPassed = false;
      return;
    }
    
    stages.push({
      name: stageName,
      time: totalTime,
      temp: temp
    });
  });
  
  if (!validationPassed) return;
  
  if (id === "") {
    // CREATE NEW CUSTOM RECIPE
    const newRecipe = {
      id: 'custom-' + Date.now().toString(),
      isPreset: false,
      name: name,
      category: category,
      stages: stages
    };
    state.recipes.push(newRecipe);
  } else {
    // UPDATE EXISTING CUSTOM RECIPE
    const recipeIndex = state.recipes.findIndex(r => r.id === id);
    if (recipeIndex !== -1 && !state.recipes[recipeIndex].isPreset) {
      state.recipes[recipeIndex].name = name;
      state.recipes[recipeIndex].category = category;
      state.recipes[recipeIndex].stages = stages;
    }
  }
  
  saveCustomRecipes();
  loadRecipes();
  closeRecipeModal();
  
  // Auto-select the newly created or modified recipe
  const selectId = id || state.recipes[state.recipes.length - 1].id;
  selectRecipe(selectId);
}

/* ==========================================================================
   SOUND CONTROLLER & MUTERS
   ========================================================================== */

function toggleMute() {
  state.isMuted = !state.isMuted;
  localStorage.setItem('airfryer_mute_pref', state.isMuted);
  Audio.setMuted(state.isMuted);
  updateMuteUI();
  
  // Warm synthesized hum to trigger sound context reactivation if unmuted
  if (!state.isMuted) {
    Audio.playTickSound();
  }
}

function updateMuteUI() {
  if (state.isMuted) {
    el.btnMute.innerHTML = `
      <svg style="width: 18px; height: 18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
      </svg>
    `;
    el.btnMute.classList.add('muted');
    el.btnMute.title = "Unmute Sounds";
  } else {
    el.btnMute.innerHTML = `
      <svg style="width: 18px; height: 18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      </svg>
    `;
    el.btnMute.classList.remove('muted');
    el.btnMute.title = "Mute Sounds";
  }
}

/* ==========================================================================
   NOTIFICATIONS API HANDLERS
   ========================================================================== */

function toggleNotifications() {
  if (!('Notification' in window)) {
    alert("Browser push notifications are not supported on this device.");
    return;
  }
  
  if (Notification.permission === 'granted') {
    // Toggle state locally to represent user mute of alerts
    state.notificationsEnabled = !state.notificationsEnabled;
    updateNotificationUI();
  } else if (Notification.permission !== 'denied') {
    requestNotificationPermission(false);
  } else {
    alert("Push notifications are currently blocked by your browser settings. Please enable them in site configurations.");
  }
}

function requestNotificationPermission(silentMode = false) {
  if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      state.notificationsEnabled = permission === 'granted';
      updateNotificationUI();
      if (state.notificationsEnabled && !silentMode) {
        new Notification("Notifications Enabled!", {
          body: "You'll be alerted when stages complete, even in the background.",
          icon: './icon.svg'
        });
      }
    });
  }
}

function updateNotificationUI() {
  if (state.notificationsEnabled) {
    el.btnNotify.innerHTML = `
      <svg style="width: 18px; height: 18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    `;
    el.btnNotify.title = "Disable Push Alerts";
    el.btnNotify.style.color = 'var(--accent-orange)';
    el.btnNotify.style.background = 'rgba(255, 107, 0, 0.1)';
  } else {
    el.btnNotify.innerHTML = `
      <svg style="width: 18px; height: 18px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
      </svg>
    `;
    el.btnNotify.title = "Enable Push Alerts";
    el.btnNotify.style.color = 'var(--text-muted)';
    el.btnNotify.style.background = 'rgba(255, 255, 255, 0.05)';
  }
}

/**
 * Dispatches HTML5 window notification popups.
 */
function sendBackgroundNotification(title, text) {
  if (state.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const notification = new Notification(title, {
        body: text,
        icon: './icon.svg',
        tag: 'airfryer-alert',
        requireInteraction: true // Keeps notification visible until clicked/cleared
      });
      notification.onclick = () => {
        window.focus();
        if (state.isAlarmActive) {
          dismissAlarm();
        }
        notification.close();
      };
    } catch (e) {
      // Fallback if ServiceWorker Registration triggers are required
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, {
          body: text,
          icon: './icon.svg',
          tag: 'airfryer-alert'
        });
      });
    }
  }
}

/* ==========================================================================
   EVENT REGISTER & ROUTING
   ========================================================================== */
function bindEvents() {
  // Top Navbar Action Toggles
  el.btnMute.addEventListener('click', toggleMute);
  el.btnNotify.addEventListener('click', toggleNotifications);
  
  // Custom Recipe Creator Modal triggers
  el.btnCreateRecipe.addEventListener('click', openCreateRecipeModal);
  el.modalClose.addEventListener('click', closeRecipeModal);
  el.btnCancelModal.addEventListener('click', closeRecipeModal);
  el.recipeForm.addEventListener('submit', handleRecipeFormSubmit);
  el.btnAddStageRow.addEventListener('click', () => addStageRow('', 300, 180));
  
  // Playback Control Dashboard bindings
  el.btnPlayPause.addEventListener('click', handlePlayPause);
  el.btnPrev.addEventListener('click', handlePrevStage);
  el.btnNext.addEventListener('click', handleNextStage);
  el.btnStop.addEventListener('click', stopCooking);
  el.btnAlarmStop.addEventListener('click', dismissAlarm);
  
  // Dismiss modal if clicking outside container
  window.addEventListener('click', (e) => {
    if (e.target === el.recipeModal) {
      closeRecipeModal();
    }
  });

  // Global window exporter to make standard onclick bindings accessible
  window.app = {
    handleRecipeClick: selectRecipe,
    openEditRecipeModal: openEditRecipeModal,
    deleteRecipe: deleteRecipe,
    removeStageRow: removeStageRow
  };
}

/* ==========================================================================
   SUPPORT UTILITIES
   ========================================================================== */

/**
 * Formats time from raw seconds representation into standard MM:SS clock visual.
 */
function formatMinutesSeconds(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Escapes raw strings into standardized browser-safe text variables.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Service Worker Cache Registrar
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW: Registered successfully', reg.scope))
        .catch(err => console.error('SW: Registration failed', err));
    });
  }
}
