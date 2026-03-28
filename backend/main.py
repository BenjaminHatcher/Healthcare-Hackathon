from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="HealthRoute API")

# Allow requests from the frontend (any origin for dev; tighten in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TriageRequest(BaseModel):
    symptoms: str


class TriageResponse(BaseModel):
    recommendation: str
    severity: str  # "er" | "clinic" | "home"


@app.get("/")
def root():
    return {"status": "HealthRoute API is running"}


@app.post("/api/triage", response_model=TriageResponse)
def triage(request: TriageRequest):
    # Placeholder — triage logic goes here in Step 1
    return TriageResponse(
        recommendation="Triage logic not yet implemented.",
        severity="clinic",
    )
