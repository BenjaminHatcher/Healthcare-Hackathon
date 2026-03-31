# HealthRoute

Find the fastest care near you.

## Project Structure

```
healthroute/
├── backend/
│   ├── main.py          # FastAPI app, Gemini triage endpoint
└── frontend/
    ├── index.html       # App shell, Leaflet CDN imports
    ├── style.css        # All styles including map + clinic list
    └── app.js           # State machine, Nominatim search, Leaflet map
```

---

## Local Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

## Next Steps

- [ ] Step 1: Sort out Gemini API`
- [ ] Step 2: Add mock clinic wait-time data (JSON)
- [ ] Step 3: MAYBE: Provide a triage summary for patients to provide to clinician
