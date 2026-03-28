# HealthRoute

Find the fastest care near you.

## Project Structure

```
healthroute/
├── backend/        # FastAPI (Python)
└── frontend/       # Plain HTML/CSS/JS
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

API will be live at `http://localhost:8000`  
Auto-docs at `http://localhost:8000/docs`

### Frontend

While developing locally, update `API_BASE` in `frontend/app.js`:

```js
const API_BASE = "http://localhost:8000";
```

Then just open `frontend/index.html` in your browser (or use VS Code Live Server).

---

## Deployment

### Backend → Render

1. Push the repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo, set root to `backend/`
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Copy the deployed URL (e.g. `https://healthroute-api.onrender.com`)

### Frontend → Vercel (or Render Static Site)

1. Go to [vercel.com](https://vercel.com) → New Project → connect repo
2. Set root to `frontend/`
3. Update `API_BASE` in `app.js` to your Render backend URL
4. Deploy

---

## Next Steps

- [ ] Step 1: Add triage decision tree in `backend/main.py`
- [ ] Step 2: Add mock clinic wait-time data (JSON)
- [ ] Step 3: Integrate map (Mapbox/Google Maps) in frontend
