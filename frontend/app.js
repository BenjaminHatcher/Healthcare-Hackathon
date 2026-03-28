const API_BASE = "http://localhost:8000"; // ← update to Render URL after deploying

const state = {
  emergencyAnswers: {},
  generalAnswers:   {},
  // health background
  health: {
    pregnant:         null,
    immunocompromised: null,
    chronic:          null,
    medications:      null,
  },
};

const LAYERS = ["emergency", "general", "health", "other", "result"];
let currentLayer = 0;

function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

function updateProgress() {
  const steps = ["Emergency Screening", "General Symptoms", "Health Background", "Other Symptoms"];
  const pct = Math.round((currentLayer / (LAYERS.length - 1)) * 100);
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-label").textContent =
    currentLayer < steps.length ? `Step ${currentLayer + 1} of ${steps.length}: ${steps[currentLayer]}` : "";
  show("progress-bar");
  show("progress-label");
}

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
      const id  = btn.dataset.id;
      answersObj[id] = btn.dataset.val === "true";
      container.querySelectorAll(`.yn[data-id="${id}"]`).forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
}

function goToLayer(index) {
  LAYERS.forEach((l) => hide(`section-${l}`));
  currentLayer = index;
  show(`section-${LAYERS[index]}`);
  updateProgress();
  window.scrollTo(0, 0);
}

// ── Pain slider live update ───────────────────────────────────────────────
document.getElementById("pain-level").addEventListener("input", (e) => {
  document.getElementById("pain-display").textContent = e.target.value;
});

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
  });
}

// ── Layer 3: Health ───────────────────────────────────────────────────────
document.getElementById("btn-health").addEventListener("click", () => goToLayer(3));

// ── Layer 4: Submit ───────────────────────────────────────────────────────
document.getElementById("btn-other").addEventListener("click", async () => {
  const btn = document.getElementById("btn-other");
  btn.disabled = true;
  btn.textContent = "Analysing...";

  try {
    const res = await fetch(`${API_BASE}/api/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emergency_answers:         state.emergencyAnswers,
        general_answers:           state.generalAnswers,
        pain_level:                parseInt(document.getElementById("pain-level").value),
        pain_location:             document.getElementById("pain-location").value,
        age:                       parseInt(document.getElementById("age").value) || 0,
        is_pregnant:               state.health.pregnant          ?? false,
        is_immunocompromised:      state.health.immunocompromised ?? false,
        has_chronic_conditions:    state.health.chronic           ?? false,
        chronic_conditions_detail: document.getElementById("chronic-detail").value,
        has_medications:           state.health.medications       ?? false,
        medications_detail:        document.getElementById("medications-detail").value,
        other_symptoms:            document.getElementById("other-symptoms").value,
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
  document.getElementById("severity-badge").textContent     = labels[data.severity] || data.severity;
  document.getElementById("severity-badge").style.background = colors[data.severity] || "#555";
  document.getElementById("result-text").textContent        = data.recommendation;
  hide("progress-bar");
  hide("progress-label");
  goToLayer(4);
}

// ── Restart ───────────────────────────────────────────────────────────────
document.getElementById("restart-btn").addEventListener("click", () => {
  state.emergencyAnswers = {};
  state.generalAnswers   = {};
  state.health           = { pregnant: null, immunocompromised: null, chronic: null, medications: null };
  document.getElementById("other-symptoms").value     = "";
  document.getElementById("pain-location").value      = "";
  document.getElementById("pain-level").value         = "0";
  document.getElementById("pain-display").textContent = "0";
  document.getElementById("age").value                = "";
  document.getElementById("chronic-detail").value     = "";
  document.getElementById("medications-detail").value = "";
  document.getElementById("chronic-detail-wrap").hidden     = true;
  document.getElementById("medications-detail-wrap").hidden = true;
  document.querySelectorAll(".yn").forEach((b) => b.classList.remove("selected"));
  initEmergency();
});



initEmergency();
