const API_BASE = "http://localhost:8000"; // ← update to Render URL after deploying

const state = {
  emergencyAnswers: {},
  generalAnswers:   {},
  intakeAnswers: {
    pain_score:     0,
    pain_location:  null,  // "A" | "B" | "C"
    pain_duration:  null,  // "A" | "B"
    injuries:       [],    // list of keys e.g. ["A","D"] or ["F"]
    symptoms:       [],    // list of keys e.g. ["C"] or ["F"]
    mental_state:   null,  // "A" | "B" | "C"
  },
  health: {
    pregnant:          null,
    immunocompromised: null,
    chronic:           null,
    medications:       null,
  },
};

// Intake now sits between general and health
const LAYERS = ["emergency", "general", "intake", "health", "other", "result"];
let currentLayer = 0;

function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

function updateProgress() {
  const steps = ["Emergency Screening", "General Symptoms", "Intake Assessment", "Health Background", "Other Symptoms"];
  const pct = Math.round((currentLayer / (LAYERS.length - 1)) * 100);
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-label").textContent =
    currentLayer < steps.length ? `Step ${currentLayer + 1} of ${steps.length}: ${steps[currentLayer]}` : "";
  show("progress-bar");
  show("progress-label");
}

// ── Yes/No question renderer (emergency & general layers) ─────────────────
function renderQuestions(containerId, questions, answersObj) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  questions.forEach((q) => {
    const item = document.createElement("div");
    item.className = "question-item";
    item.innerHTML = `
      <p class="question-text">${q.question}</p>
      <div class="yn-buttons">
        <button class="yn yes" data-id="${q.id}" data-val="true">Yes</button>
        <button class="yn no"  data-id="${q.id}" data-val="false">No</button>
      </div>`;
    container.appendChild(item);
  });
  container.querySelectorAll(".yn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      answersObj[id] = btn.dataset.val === "true";
      container.querySelectorAll(`.yn[data-id="${id}"]`).forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
}

// ── Intake question renderer (slider / radio / checkbox) ──────────────────
function renderIntakeQuestions(containerId, questions) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  questions.forEach((q) => {
    const item = document.createElement("div");
    item.className = "question-item";

    if (q.type === "slider") {
      // ── Slider ────────────────────────────────────────────────────────
      const current = state.intakeAnswers.pain_score;
      item.innerHTML = `
        <p class="question-text">${q.question}</p>
        <p class="question-hint">${q.hint || ""}</p>
        <div class="slider-wrap">
          <div class="pain-score-display">
            <span class="pain-big-num" id="intake-pain-num">${current}</span>
          </div>
          <input type="range" id="intake-slider-${q.id}"
                 min="${q.min}" max="${q.max}" value="${current}"
                 class="pain-slider" />
          <div class="slider-labels">
            <span>${q.min} — No pain</span>
            <span>5 — Moderate</span>
            <span>${q.max} — Worst possible</span>
          </div>
        </div>`;
      container.appendChild(item);

      document.getElementById(`intake-slider-${q.id}`).addEventListener("input", (e) => {
        state.intakeAnswers.pain_score = parseInt(e.target.value);
        document.getElementById("intake-pain-num").textContent = e.target.value;
      });

    } else if (q.type === "radio") {
      // ── Radio (single select) ─────────────────────────────────────────
      const currentVal = state.intakeAnswers[q.id];
      item.innerHTML = `
        <p class="question-text">${q.question}</p>
        <div class="intake-options" id="opts-${q.id}">
          ${q.options.map(opt => `
            <label class="intake-option ${currentVal === opt.key ? "selected" : ""}"
                   data-id="${q.id}" data-key="${opt.key}">
              <input type="radio" name="${q.id}" value="${opt.key}"
                     ${currentVal === opt.key ? "checked" : ""} hidden />
              <span class="option-key">${opt.key}</span>
              <span class="option-label">${opt.label}</span>
            </label>`).join("")}
        </div>`;
      container.appendChild(item);

      document.getElementById(`opts-${q.id}`).querySelectorAll(".intake-option").forEach((lbl) => {
        lbl.addEventListener("click", () => {
          state.intakeAnswers[q.id] = lbl.dataset.key;
          document.getElementById(`opts-${q.id}`)
            .querySelectorAll(".intake-option").forEach((l) => l.classList.remove("selected"));
          lbl.classList.add("selected");
        });
      });

    } else if (q.type === "checkbox") {
      // ── Checkbox (multi-select with exclusive option) ──────────────────
      const currentVals = state.intakeAnswers[q.id];
      item.innerHTML = `
        <p class="question-text">${q.question}</p>
        <div class="intake-options" id="opts-${q.id}">
          ${q.options.map(opt => `
            <label class="intake-option ${currentVals.includes(opt.key) ? "selected" : ""}"
                   data-id="${q.id}" data-key="${opt.key}"
                   data-exclusive="${opt.exclusive ? "true" : "false"}">
              <input type="checkbox" name="${q.id}" value="${opt.key}"
                     ${currentVals.includes(opt.key) ? "checked" : ""} hidden />
              <span class="option-key">${opt.key}</span>
              <span class="option-label">${opt.label}</span>
            </label>`).join("")}
        </div>`;
      container.appendChild(item);

      document.getElementById(`opts-${q.id}`).querySelectorAll(".intake-option").forEach((lbl) => {
        lbl.addEventListener("click", () => {
          const key       = lbl.dataset.key;
          const exclusive = lbl.dataset.exclusive === "true";
          let   arr       = state.intakeAnswers[q.id];

          if (exclusive) {
            state.intakeAnswers[q.id] = arr.includes(key) ? [] : [key];
          } else {
            // Remove any exclusive option first
            arr = arr.filter((k) => {
              const opt = q.options.find((o) => o.key === k);
              return !opt?.exclusive;
            });
            if (arr.includes(key)) {
              arr = arr.filter((k) => k !== key);
            } else {
              arr.push(key);
            }
            state.intakeAnswers[q.id] = arr;
          }

          // Sync visual state
          const fresh = state.intakeAnswers[q.id];
          document.getElementById(`opts-${q.id}`).querySelectorAll(".intake-option").forEach((l) => {
            const inp = l.querySelector("input");
            if (fresh.includes(l.dataset.key)) {
              l.classList.add("selected");
              inp.checked = true;
            } else {
              l.classList.remove("selected");
              inp.checked = false;
            }
          });
        });
      });
    }
  });
}

function goToLayer(index) {
  LAYERS.forEach((l) => hide(`section-${l}`));
  currentLayer = index;
  show(`section-${LAYERS[index]}`);
  updateProgress();
  window.scrollTo(0, 0);
}

// ── Layer 1: Emergency ────────────────────────────────────────────────────
async function initEmergency() {
  const res  = await fetch(`${API_BASE}/api/questions/emergency`);
  const data = await res.json();
  renderQuestions("questions-emergency", data.questions, state.emergencyAnswers);
  goToLayer(0);

  document.getElementById("btn-emergency").addEventListener("click", () => {
    const hasYes = Object.values(state.emergencyAnswers).some((v) => v === true);
    if (hasYes) {
      showResult({
        severity: "er",
        recommendation: "Based on your responses, you may be experiencing a medical emergency. Please call 911 or go to the nearest Emergency Room immediately. Do not drive yourself.",
      });
    } else {
      goToLayer(1);
      initGeneral();
    }
  });
}

// ── Layer 2: General ──────────────────────────────────────────────────────
async function initGeneral() {
  const res  = await fetch(`${API_BASE}/api/questions/general`);
  const data = await res.json();
  renderQuestions("questions-general", data.questions, state.generalAnswers);

  document.getElementById("btn-general").addEventListener("click", () => {
    goToLayer(2);
    initIntake();
  });
}

// ── Layer 3: Intake ───────────────────────────────────────────────────────
async function initIntake() {
  const res  = await fetch(`${API_BASE}/api/questions/intake`);
  const data = await res.json();
  renderIntakeQuestions("questions-intake", data.questions);

  document.getElementById("btn-intake").addEventListener("click", () => {
    const missing = [];
    if (state.intakeAnswers.pain_location === null) missing.push("pain location");
    if (state.intakeAnswers.pain_duration === null)  missing.push("pain duration");
    if (state.intakeAnswers.mental_state === null)   missing.push("mental state");
    if (state.intakeAnswers.injuries.length === 0)   missing.push("injury selection");
    if (state.intakeAnswers.symptoms.length === 0)   missing.push("symptom selection");

    if (missing.length > 0) {
      alert(`Please answer the following before continuing:\n• ${missing.join("\n• ")}`);
      return;
    }
    goToLayer(3);
  });
}

// ── Layer 4: Health ───────────────────────────────────────────────────────
document.getElementById("btn-health").addEventListener("click", () => goToLayer(4));

// ── Layer 5: Submit ───────────────────────────────────────────────────────
document.getElementById("btn-other").addEventListener("click", async () => {
  const btn = document.getElementById("btn-other");
  btn.disabled = true;
  btn.textContent = "Getting your location...";

  let latitude = null;
  let longitude = null;
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
    );
    latitude  = pos.coords.latitude;
    longitude = pos.coords.longitude;
  } catch {
    // Location denied or unavailable — continue without it
  }
  btn.textContent = "Analysing...";

  try {
    const res = await fetch(`${API_BASE}/api/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emergency_answers:         state.emergencyAnswers,
        general_answers:           state.generalAnswers,
        health_answers:            {},  // reserved for future use
        // Intake questionnaire
        intake_pain_score:         state.intakeAnswers.pain_score,
        intake_pain_location:      state.intakeAnswers.pain_location ?? "C",
        intake_pain_duration:      state.intakeAnswers.pain_duration ?? "A",
        intake_injuries:           state.intakeAnswers.injuries,
        intake_symptoms:           state.intakeAnswers.symptoms,
        intake_mental_state:       state.intakeAnswers.mental_state  ?? "C",
        // Health background
        age:                       parseInt(document.getElementById("age").value) || 0,
        is_pregnant:               state.health.pregnant          ?? false,
        is_immunocompromised:      state.health.immunocompromised ?? false,
        has_chronic_conditions:    state.health.chronic           ?? false,
        chronic_conditions_detail: document.getElementById("chronic-detail").value,
        has_medications:           state.health.medications       ?? false,
        medications_detail:        document.getElementById("medications-detail").value,
        other_symptoms:            document.getElementById("other-symptoms").value,
        latitude:  latitude,
        longitude: longitude,
        intake_pain_score:    parseInt(document.getElementById("pain-level").value),
        intake_pain_location: document.getElementById("pain-location").value,
        intake_pain_duration: "A",   // placeholder until you build that UI
        intake_injuries:      [],     // placeholder until you build that UI
        intake_symptoms:      [],     // placeholder until you build that UI
        intake_mental_state:  "C",   // placeholder until you build that UI
      }),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    showResult(await res.json());
  } catch (err) {
    showResult({ severity: "clinic", recommendation: "Could not reach server. Please try again." });
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Get Recommendation";
  }
});

// ── Result ────────────────────────────────────────────────────────────────
function showResult(data) {
  const labels = { er: "🚨 Go to the ER Now", clinic: "🏥 Visit a Walk-In Clinic", home: "🏠 Manage at Home" };
  const colors = { er: "#d62828", clinic: "#f4a261", home: "#2a9d8f" };
  document.getElementById("severity-badge").textContent      = labels[data.severity] || data.severity;
  document.getElementById("severity-badge").style.background = colors[data.severity] || "#555";
  document.getElementById("result-text").textContent         = data.recommendation;
  hide("progress-bar");
  hide("progress-label");
  goToLayer(5);
}

// ── Restart ───────────────────────────────────────────────────────────────
document.getElementById("restart-btn").addEventListener("click", () => {
  state.emergencyAnswers = {};
  state.generalAnswers   = {};
  state.intakeAnswers    = {
    pain_score:    0,
    pain_location: null,
    pain_duration: null,
    injuries:      [],
    symptoms:      [],
    mental_state:  null,
  };
  state.health = { pregnant: null, immunocompromised: null, chronic: null, medications: null };

  document.getElementById("other-symptoms").value           = "";
  document.getElementById("age").value                      = "";
  document.getElementById("chronic-detail").value           = "";
  document.getElementById("medications-detail").value       = "";
  document.getElementById("chronic-detail-wrap").hidden     = true;
  document.getElementById("medications-detail-wrap").hidden = true;
  document.querySelectorAll(".yn").forEach((b) => b.classList.remove("selected"));

  initEmergency();
});

initEmergency();