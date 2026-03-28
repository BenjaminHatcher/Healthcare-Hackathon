from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv
import os
 
app = FastAPI(title="HealthRoute API")
 
load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
 
# Allow requests from the frontend (any origin for dev; tighten in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
 
EMERGENCY_QUESTIONS = [
    {"id": "e1", "question": "Is the patient unconscious, responding only to pain, or actively seizing?"},
    {"id": "e2", "question": "Is the patient experiencing severe difficulty breathing (e.g., unable to speak, turning blue, or showing signs of an upper airway obstruction)?"},
    {"id": "e3", "question": "Are you experiencing sudden numbness or weakness on one side of your body?"},
    {"id": "e4", "question": "Does the patient have signs of severe shock or poor perfusion, such as marked pallor, cool/sweaty skin, or a very weak pulse?"},
    {"id": "e5", "question": "Is the patient confused, experiencing a sudden change in their normal behavior, or having a new impairment of their recent memory? "},
    {"id": "e6", "question": "Is the patient experiencing moderate breathing difficulties (e.g., speaking in clipped sentences or increased work to breathe)? "},
    {"id": "e7", "question": "Is the patient experiencing sudden, acute, and severe pain (rated 8 to 10 out of 10)?"},
    {"id": "e8", "question": "Has the patient experienced a major traumatic event (e.g., a high-speed vehicle crash, ejection from a vehicle, or a fall from greater than 6 meters)?"},
]
 
GENERAL_QUESTIONS = [
    {"id": "g1", "question": "Is the patient experiencing moderate acute pain (rated 4 to 7 out of 10)?"},
    {"id": "g2", "question": "Is the patient experiencing mild shortness of breath on exertion, but is otherwise able to speak in full sentences?"},
    {"id": "g3", "question": "Are you experiencing nausea or vomiting?"},
]
 
INTAKE_QUESTIONS = [
    {
        "id": "pain_score",
        "type": "slider",
        "question": "On a scale of 0 to 10, how severe is your pain right now?",
        "hint": "0 = no pain · 10 = worst pain imaginable",
        "min": 0,
        "max": 10,
    },
    {
        "id": "pain_location",
        "type": "radio",
        "question": "Where is your pain located?",
        "options": [
            {"key": "A", "label": "Head, chest, abdomen, or groin"},
            {"key": "B", "label": "Arms, legs, hands, feet, or skin surface"},
            {"key": "C", "label": "I am not in pain"},
        ],
    },
    {
        "id": "pain_duration",
        "type": "radio",
        "question": "How long have you had this pain?",
        "options": [
            {"key": "A", "label": "It is new pain"},
            {"key": "B", "label": "It is ongoing or recurring pain I have had for a long time"},
        ],
    },
    {
        "id": "injuries",
        "type": "checkbox",
        "question": "If you are here for an injury, which best describes it? (Select all that apply)",
        "options": [
            {"key": "A", "label": "A deep or large cut"},
            {"key": "B", "label": "An injury specifically to my arm, shoulder, or hand"},
            {"key": "C", "label": "A minor burn (smaller than the palm of my hand)"},
            {"key": "D", "label": "Minor scrapes, bruises, or a small cut"},
            {"key": "E", "label": "A minor animal or insect bite"},
            {"key": "F", "label": "Not applicable", "exclusive": True},
        ],
    },
    {
        "id": "symptoms",
        "type": "checkbox",
        "question": "If you are feeling ill, which best describes your main symptom? (Select all that apply)",
        "options": [
            {"key": "A", "label": "A small amount of rectal bleeding, minor vaginal spotting, or mild pain when urinating"},
            {"key": "B", "label": "Mild constipation"},
            {"key": "C", "label": "A cold, sore throat, or sinus issue with no breathing trouble"},
            {"key": "D", "label": "Mild diarrhea with no signs of dehydration"},
            {"key": "E", "label": "I am here for a routine dressing or bandage change"},
            {"key": "F", "label": "Not applicable", "exclusive": True},
        ],
    },
    {
        "id": "mental_state",
        "type": "radio",
        "question": "How would you describe your current mental or emotional state?",
        "options": [
            {"key": "A", "label": "Mildly anxious, agitated, or stressed"},
            {"key": "B", "label": "I have long-term (chronic) confusion, but it is no worse than my usual state"},
            {"key": "C", "label": "I feel calm and am acting like my normal self"},
        ],
    },
]
 
#  Classification helpers
def classify_pain_severity(score: int) -> str:
    if score <= 3:
        return "mild"
    elif score <= 7:
        return "moderate"
    return "severe"
 
def classify_pain_location(answer: str) -> str:
    return {"A": "central", "B": "peripheral", "C": "no_pain"}.get(answer, "unknown")
 
def classify_pain_duration(answer: str) -> str:
    return {"A": "acute", "B": "chronic"}.get(answer, "unknown")
 
def classify_mental_state(answer: str) -> str:
    return {
        "A": "mildly anxious/agitated/stressed",
        "B": "chronic confusion (at baseline)",
        "C": "calm and acting normally",
    }.get(answer, "unknown")
 
class QuestionsResponse(BaseModel):
    layer: str
    questions: list[dict]
 
 
class TriageRequest(BaseModel):
    emergency_answers: dict[str, bool]
    general_answers: dict[str, bool]
    pain_level: int = 0
    pain_location: str = ""
    # Intake questionnaire
    intake_pain_score: int = 0
    intake_pain_location: str = "C"
    intake_pain_duration: str = "A"
    intake_injuries: list[str] = []
    intake_symptoms: list[str] = []
    intake_mental_state: str = "C"
    # Health background
    age: int
    is_pregnant: bool
    is_immunocompromised: bool
    has_chronic_conditions: bool
    chronic_conditions_detail: str
    has_medications: bool
    medications_detail: str
    # Location
    latitude: float | None = None
    longitude: float | None = None
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
 
@app.get("/api/questions/intake")
def get_intake_questions():
    return {"layer": "intake", "questions": INTAKE_QUESTIONS}
 
 
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
 
    other = request.other_symptoms.strip() or "None provided."
 
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
 
    # Classify intake answers
    pain_severity = classify_pain_severity(request.intake_pain_score)
    pain_loc_type = classify_pain_location(request.intake_pain_location)
    pain_dur_type = classify_pain_duration(request.intake_pain_duration)
    mental_state  = classify_mental_state(request.intake_mental_state)
 
    injury_map = {"A": "deep/large cut", "B": "arm/shoulder/hand injury",
                  "C": "minor burn", "D": "minor scrapes/bruises/small cut",
                  "E": "minor animal or insect bite", "F": "not applicable"}
    symptom_map = {"A": "rectal bleeding / vaginal spotting / painful urination",
                   "B": "mild constipation", "C": "cold/sore throat/sinus issue",
                   "D": "mild diarrhea", "E": "routine dressing change", "F": "not applicable"}
 
    injuries_str = ", ".join(injury_map.get(k, k) for k in request.intake_injuries) or "not reported"
    symptoms_str = ", ".join(symptom_map.get(k, k) for k in request.intake_symptoms) or "not reported"
 
    location_info = (
        f"Patient location: {request.latitude}, {request.longitude} (lat/lng). "
        f"This is in British Columbia, Canada."
        if request.latitude and request.longitude
        else "Patient location: not provided."
    )
 
    prompt = f"""You are a medical triage assistant helping patients in British Columbia, Canada decide where to seek care.
Based on the patient's responses below, recommend one of: go to the ER, visit a walk-in clinic, or manage at home.
Be concise (2-3 sentences). Do not diagnose. Always err on the side of caution.
 
EMERGENCY SCREENING (all No — patient passed):
{emergency_summary}
 
GENERAL SYMPTOMS:
{general_summary}
 
INTAKE QUESTIONNAIRE:
- Self-reported pain score: {request.intake_pain_score}/10 → classified as {pain_severity}
- Pain location type: {pain_loc_type}
- Pain duration type: {pain_dur_type}
- Injury description: {injuries_str}
- Illness symptoms: {symptoms_str}
- Mental/emotional state: {mental_state}
 
HEALTH BACKGROUND:
- Age: {request.age}
- Pregnant: {'Yes' if request.is_pregnant else 'No'}
- Immunocompromised: {'Yes' if request.is_immunocompromised else 'No'}
- Chronic conditions: {chronic}
- Current medications: {medications}
 
OTHER SYMPTOMS (patient's own words):
{other}
 
PATIENT LOCATION:
{location_info}
 
If recommending a clinic, suggest what type of specialist would be most appropriate (e.g. physiotherapist, dermatologist, urgent care) and name a specific real clinic near the patient's coordinates if you know of one. If unsure of a specific clinic, describe the type to look for and suggest they search Google Maps.
 
If your recommendation is to manage at home, include a short section titled "Home Care Tips:" with 3-5 practical things the patient can do to help themselves recover.
 
End your response with exactly one of these on its own line: SEVERITY: er | SEVERITY: clinic | SEVERITY: home"""
 
    response = client.models.generate_content(
        model="gemini-1.5-flash-8b",
        contents=prompt,
    )
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