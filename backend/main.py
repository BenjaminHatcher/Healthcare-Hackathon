from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv
import os

app = FastAPI(title="HealthRoute API")

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-1.5-flash")

# Allow requests from the frontend (any origin for dev; tighten in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

EMERGENCY_QUESTIONS = [
    {"id": "e1", "question": "Are you experiencing chest pain or pressure?"},
    {"id": "e2", "question": "Are you having difficulty breathing or shortness of breath?"},
    {"id": "e3", "question": "Are you experiencing sudden numbness or weakness on one side of your body?"},
    {"id": "e4", "question": "Have you lost consciousness or are you feeling like you might faint?"},
    {"id": "e5", "question": "Are you experiencing severe, uncontrolled bleeding?"},
]

GENERAL_QUESTIONS = [
    {"id": "g1", "question": "Do you have a fever above 38°C (100.4°F)?"},
    {"id": "g2", "question": "Have your symptoms been going on for more than 3 days?"},
    {"id": "g3", "question": "Are you experiencing nausea or vomiting?"},
    {"id": "g4", "question": "Do you have any pain that is getting progressively worse?"},
    {"id": "g5", "question": "Are your symptoms affecting your ability to do normal daily activities?"},
]


class QuestionsResponse(BaseModel):
    layer: str
    questions: list[dict]


class TriageRequest(BaseModel):
    emergency_answers: dict[str, bool]
    general_answers: dict[str, bool]
    health_answers: dict[str, bool]
    pain_level: int
    pain_location: str 
    # Health background
    age: int
    is_pregnant: bool
    is_immunocompromised: bool
    has_chronic_conditions: bool
    chronic_conditions_detail: str   # filled if has_chronic_conditions = true
    has_medications: bool
    medications_detail: str          # filled if has_medications = true
    # Free text
    other_symptoms: str


class TriageResponse(BaseModel):
    recommendation: str
    severity: str  # "er" | "clinic" | "home"


@app.get("/")
def root():
    return {"status": "HealthRoute API is running"}


@app.get("/api/questions/emergency", response_model=QuestionsResponse)
def get_emergency_questions():
    return QuestionsResponse(layer="emergency", questions=EMERGENCY_QUESTIONS)


@app.get("/api/questions/general", response_model=QuestionsResponse)
def get_general_questions():
    return QuestionsResponse(layer="general", questions=GENERAL_QUESTIONS)




@app.post("/api/triage", response_model=TriageResponse)
def triage(request: TriageRequest):

    # Fast-path: any emergency "yes" → immediate ER, skip Gemini
    if any(request.emergency_answers.values()):
        return TriageResponse(
            recommendation="Based on your responses, you may be experiencing a medical emergency. Please call 911 or go to the nearest Emergency Room immediately. Do not drive yourself.",
            severity="er",
        )

    def summarise(questions, answers):
        lines = []
        for q in questions:
            val = answers.get(q["id"], False)
            lines.append(f"- {q['question']} → {'Yes' if val else 'No'}")
        return "\n".join(lines)

    emergency_summary = summarise(EMERGENCY_QUESTIONS, request.emergency_answers)
    general_summary   = summarise(GENERAL_QUESTIONS,   request.general_answers)

    pain_level    = request.pain_level
    pain_location = request.pain_location.strip() or "Not specified"
    other         = request.other_symptoms.strip() or "None provided."

    chronic = (
        request.chronic_conditions_detail.strip()
        if request.has_chronic_conditions and request.chronic_conditions_detail.strip()
        else ("Yes (no detail given)" if request.has_chronic_conditions else "No")
    )

    medications = (
        request.medications_detail.strip()
        if request.has_medications and request.medications_detail.strip()
        else ("Yes (no detail given)" if request.has_medications else "No")
    )

    prompt = f"""You are a medical triage assistant helping patients in British Columbia, Canada decide where to seek care.
Based on the patient's responses below, recommend one of: go to the ER, visit a walk-in clinic, or manage at home.
Be concise (2-3 sentences). Do not diagnose. Always err on the side of caution.

EMERGENCY SCREENING (all No — patient passed):
{emergency_summary}

GENERAL SYMPTOMS:
{general_summary}
- Pain level: {pain_level} out of 10
- Pain location: {pain_location}

HEALTH BACKGROUND:
- Age: {request.age}
- Pregnant: {'Yes' if request.is_pregnant else 'No'}
- Immunocompromised: {'Yes' if request.is_immunocompromised else 'No'}
- Chronic conditions: {chronic}
- Current medications: {medications}

OTHER SYMPTOMS (patient's own words):
{other}

End your response with exactly one of these on its own line: SEVERITY: er | SEVERITY: clinic | SEVERITY: home"""

    response = model.generate_content(prompt)
    raw = response.text.strip()

    severity = "clinic"
    if "SEVERITY: er" in raw:
        severity = "er"
    elif "SEVERITY: home" in raw:
        severity = "home"

    recommendation = (
        raw.replace("SEVERITY: er", "")
           .replace("SEVERITY: clinic", "")
           .replace("SEVERITY: home", "")
           .strip()
    )

    return TriageResponse(recommendation=recommendation, severity=severity)
