const API_BASE = "http://localhost:8000"; // ← update to your deployed URL after deploying

const state = {
  emergencyAnswers: {},
  generalAnswers:   {},
  intakeAnswers: {
    pain_score:     0,
    pain_location:  null,
    pain_duration:  null,
    injuries:       [],
    symptoms:       [],
    mental_state:   null,
  },
  health: {
    pregnant:          null,
    immunocompromised: null,
    chronic:           null,
    medications:       null,
  },
  userLat: null,
  userLng: null,
};

const LAYERS = ["emergency", "general", "intake", "health", "other", "result"];
let currentLayer = 0;
let leafletMap = null;

function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

// ── Get user location silently on page load ───────────────────────────────
function requestLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.userLat = pos.coords.latitude;
      state.userLng = pos.coords.longitude;
    },
    () => {
      // User denied or unavailable — fall back to Victoria, BC
      state.userLat = 48.4284;
      state.userLng = -123.3656;
    }
  );
}

function updateProgress() {
  const steps = ["Emergency Screening", "General Symptoms", "Intake Assessment", "Health Background", "Other Symptoms"];
  const pct = Math.round((currentLayer / (LAYERS.length - 1)) * 100);
  document.getElementById("progress-fill").style.width = pct + "%";
  document.getElementById("progress-label").textContent =
    currentLayer < steps.length ? `Step ${currentLayer + 1} of ${steps.length}: ${steps[currentLayer]}` : "";
  show("progress-bar");
  show("progress-label");
}

// ── Yes/No question renderer ──────────────────────────────────────────────
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

// ── Intake question renderer ──────────────────────────────────────────────
function renderIntakeQuestions(containerId, questions) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  questions.forEach((q) => {
    const item = document.createElement("div");
    item.className = "question-item";

    if (q.type === "slider") {
      const current = state.intakeAnswers.pain_score;
      item.innerHTML = `
        <p class="question-text">${q.question}</p>
        <p class="question-hint" style="font-size:0.9em;color:#666;">${q.hint || ""}</p>
        <div class="slider-wrap" style="margin-top:15px;">
          <div style="font-size:1.5em;font-weight:bold;margin-bottom:10px;">
            <span id="intake-pain-num">${current}</span> / 10
          </div>
          <input type="range" id="intake-slider-${q.id}" min="${q.min}" max="${q.max}" value="${current}"
                 style="width:100%;margin-bottom:10px;" />
          <div style="display:flex;justify-content:space-between;font-size:0.8em;color:#555;">
            <span>${q.min} — No pain</span><span>5 — Moderate</span><span>${q.max} — Worst possible</span>
          </div>
        </div>`;
      container.appendChild(item);
      document.getElementById(`intake-slider-${q.id}`).addEventListener("input", (e) => {
        state.intakeAnswers.pain_score = parseInt(e.target.value);
        document.getElementById("intake-pain-num").textContent = e.target.value;
      });

    } else if (q.type === "radio") {
      const currentVal = state.intakeAnswers[q.id];
      item.innerHTML = `
        <p class="question-text">${q.question}</p>
        <div id="opts-${q.id}" style="display:flex;flex-direction:column;gap:10px;margin-top:15px;">
          ${q.options.map(opt => `
            <label style="cursor:pointer;display:flex;align-items:flex-start;gap:10px;font-size:1.1em;">
              <input type="radio" name="${q.id}" value="${opt.key}"
                     ${currentVal === opt.key ? "checked" : ""} style="margin-top:4px;" />
              <strong>${opt.key}</strong> <span>${opt.label}</span>
            </label>`).join("")}
        </div>`;
      container.appendChild(item);
      document.getElementById(`opts-${q.id}`).addEventListener("change", (e) => {
        state.intakeAnswers[q.id] = e.target.value;
      });

    } else if (q.type === "checkbox") {
      const currentVals = state.intakeAnswers[q.id];
      item.innerHTML = `
        <p class="question-text">${q.question}</p>
        <div id="opts-${q.id}" style="display:flex;flex-direction:column;gap:10px;margin-top:15px;">
          ${q.options.map(opt => `
            <label style="cursor:pointer;display:flex;align-items:flex-start;gap:10px;font-size:1.1em;">
              <input type="checkbox" name="${q.id}" value="${opt.key}" data-exclusive="${opt.exclusive ? "true" : "false"}"
                     ${currentVals.includes(opt.key) ? "checked" : ""} style="margin-top:4px;" />
              <strong>${opt.key}</strong> <span>${opt.label}</span>
            </label>`).join("")}
        </div>`;
      container.appendChild(item);
      document.getElementById(`opts-${q.id}`).addEventListener("change", (e) => {
        const inputs = Array.from(document.getElementById(`opts-${q.id}`).querySelectorAll("input[type='checkbox']"));
        const changedInput = e.target;
        if (changedInput.dataset.exclusive === "true" && changedInput.checked) {
          inputs.forEach(inp => { if (inp !== changedInput) inp.checked = false; });
        } else if (changedInput.checked) {
          const excl = inputs.find(inp => inp.dataset.exclusive === "true");
          if (excl) excl.checked = false;
        }
        state.intakeAnswers[q.id] = inputs.filter(inp => inp.checked).map(inp => inp.value);
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
        maps_query: "hospital emergency",
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
function initHealthButtons() {
  document.querySelectorAll(".yn[data-field]").forEach((btn) => {
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
  });
  document.querySelectorAll(".yn[data-field]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.field;
      const val   = btn.dataset.val === "true";
      state.health[field] = val;
      document.querySelectorAll(`.yn[data-field="${field}"]`).forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      if (field === "chronic")     document.getElementById("chronic-detail-wrap").hidden    = !val;
      if (field === "medications") document.getElementById("medications-detail-wrap").hidden = !val;
    });
  });
}

initHealthButtons();
document.getElementById("btn-health").addEventListener("click", () => goToLayer(4));

// ── Layer 5: Submit ───────────────────────────────────────────────────────
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
        health_answers:            {},
        intake_pain_score:         state.intakeAnswers.pain_score,
        intake_pain_location:      state.intakeAnswers.pain_location ?? "C",
        intake_pain_duration:      state.intakeAnswers.pain_duration ?? "A",
        intake_injuries:           state.intakeAnswers.injuries,
        intake_symptoms:           state.intakeAnswers.symptoms,
        intake_mental_state:       state.intakeAnswers.mental_state  ?? "C",
        age:                       parseInt(document.getElementById("age").value) || 0,
        is_pregnant:               state.health.pregnant          ?? false,
        is_immunocompromised:      state.health.immunocompromised ?? false,
        has_chronic_conditions:    state.health.chronic           ?? false,
        chronic_conditions_detail: document.getElementById("chronic-detail").value,
        has_medications:           state.health.medications       ?? false,
        medications_detail:        document.getElementById("medications-detail").value,
        other_symptoms:            document.getElementById("other-symptoms").value,
        latitude:                  state.userLat,
        longitude:                 state.userLng,
      }),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    showResult(await res.json());
  } catch (err) {
    showResult({ severity: "clinic", recommendation: "Could not reach server. Please try again.", maps_query: null });
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

  // Show map if we have a query and a location
  if (data.maps_query && state.userLat && state.userLng) {
    showMap(data.maps_query, state.userLat, state.userLng);
  } else {
    hide("map-section");
  }
}

// ── Map: Nominatim search + Leaflet render ────────────────────────────────
async function showMap(query, lat, lng) {
  show("map-section");

  // Clear previous map instance if any
  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
  }

  document.getElementById("clinic-list").innerHTML = "<li class='clinic-loading'>Searching nearby...</li>";

  // Search Nominatim for matching places near the user
  const bbox = buildBbox(lat, lng, 10); // 10 km radius bounding box
  const url = `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(query)}&` +
    `format=json&limit=5&addressdetails=1&` +
    `bounded=1&viewbox=${bbox}`;

  let places = [];
  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": "en", "User-Agent": "HealthRouteApp/1.0" }
    });
    places = await res.json();
  } catch (e) {
    console.error("Nominatim error", e);
  }

  // Init Leaflet map centred on user
  leafletMap = L.map("map").setView([lat, lng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(leafletMap);

  // Blue dot for user location
  L.circleMarker([lat, lng], {
    radius: 8, fillColor: "#0077b6", color: "#fff",
    weight: 2, opacity: 1, fillOpacity: 0.9,
  }).addTo(leafletMap).bindPopup("📍 You are here");

  const listEl = document.getElementById("clinic-list");
  listEl.innerHTML = "";

  if (places.length === 0) {
    listEl.innerHTML = `<li class="clinic-none">No results found nearby. Try searching <a href="https://www.google.com/maps/search/${encodeURIComponent(query)}" target="_blank">Google Maps</a>.</li>`;
    return;
  }

  const bounds = [[lat, lng]];

  places.forEach((place, i) => {
    const pLat = parseFloat(place.lat);
    const pLng = parseFloat(place.lon);
    const name = place.display_name.split(",").slice(0, 2).join(", ");
    const dist = haversineKm(lat, lng, pLat, pLng).toFixed(1);

    // Red marker for each result
    const marker = L.marker([pLat, pLng]).addTo(leafletMap);
    marker.bindPopup(`<strong>${name}</strong><br>${dist} km away`);
    bounds.push([pLat, pLng]);

    // List item with directions link
    const li = document.createElement("li");
    li.className = "clinic-item";
    li.innerHTML = `
      <div class="clinic-name">${i + 1}. ${name}</div>
      <div class="clinic-meta">${dist} km away</div>
      <a class="clinic-directions"
         href="https://www.openstreetmap.org/directions?from=${lat},${lng}&to=${pLat},${pLng}"
         target="_blank">Get Directions →</a>`;
    listEl.appendChild(li);
  });

  // Fit map to show user + all results
  leafletMap.fitBounds(bounds, { padding: [30, 30] });
}

// ── Helpers ───────────────────────────────────────────────────────────────

// Build a bounding box string for Nominatim (min_lon,min_lat,max_lon,max_lat)
function buildBbox(lat, lng, radiusKm) {
  const d = radiusKm / 111; // rough degrees per km
  return `${lng - d},${lat - d},${lng + d},${lat + d}`;
}

// Haversine distance in km
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(deg) { return deg * Math.PI / 180; }

// ── Restart ───────────────────────────────────────────────────────────────
document.getElementById("restart-btn").addEventListener("click", () => {
  state.emergencyAnswers = {};
  state.generalAnswers   = {};
  state.intakeAnswers    = {
    pain_score: 0, pain_location: null, pain_duration: null,
    injuries: [], symptoms: [], mental_state: null,
  };
  state.health = { pregnant: null, immunocompromised: null, chronic: null, medications: null };

  document.getElementById("other-symptoms").value           = "";
  document.getElementById("age").value                      = "";
  document.getElementById("chronic-detail").value           = "";
  document.getElementById("medications-detail").value       = "";
  document.getElementById("chronic-detail-wrap").hidden     = true;
  document.getElementById("medications-detail-wrap").hidden = true;
  document.querySelectorAll(".yn").forEach((b) => b.classList.remove("selected"));

  hide("map-section");
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }

  initHealthButtons();
  initEmergency();
});

// ── Boot ──────────────────────────────────────────────────────────────────
requestLocation();
initEmergency();