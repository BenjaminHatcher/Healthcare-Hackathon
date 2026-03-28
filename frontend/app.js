// Point this at your Render backend URL once deployed.
// During local dev, run the backend on port 8000.
const API_BASE = "https://your-app.onrender.com"; // ← update this after deploying

const btn = document.getElementById("submit-btn");
const resultSection = document.getElementById("result-section");
const resultText = document.getElementById("result-text");

btn.addEventListener("click", async () => {
  const symptoms = document.getElementById("symptoms").value.trim();
  if (!symptoms) return;

  btn.disabled = true;
  btn.textContent = "Checking...";
  resultSection.hidden = true;

  try {
    const res = await fetch(`${API_BASE}/api/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symptoms }),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const data = await res.json();
    resultText.textContent = data.recommendation;
    resultSection.hidden = false;
  } catch (err) {
    resultText.textContent = "Could not reach the server. Please try again.";
    resultSection.hidden = false;
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Find Care";
  }
});
