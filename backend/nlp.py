"""
Conversational NLP module powered by Groq.
Handles dialogue generation, context memory, and feedback.
"""
import logging
import os

logger = logging.getLogger(__name__)

try:
    from groq import Groq
    GROQ_OK = True
except ImportError:
    GROQ_OK = False
    Groq = None

# Base prompt configuration for conversational tutoring
SYSTEM = (
    "You are Luna, a friendly English tutor having a REAL face-to-face conversation. "
    "You speak like a real person — short, warm, natural. "
    "\n\nCRITICAL RULES:"
    "\n- MAXIMUM 1-2 short sentences. Never more. This is spoken conversation, not text."
    "\n- React naturally first: 'Oh nice!', 'Hmm interesting!', 'Ha, I love that!'"
    "\n- Then either correct ONE thing OR ask ONE follow-up question. Never both."
    "\n- Sound like a friend chatting, not a teacher lecturing."
    "\n- Use casual spoken English: contractions, simple words."
    "\n- NEVER write paragraphs. NEVER list things. NEVER use bullet points."
    "\n\nExamples of GOOD responses:"
    "\n- 'Oh cool, you're from Mumbai! What do you like most about living there?'"
    "\n- 'Nice! Just a small tip — say \"I went\" instead of \"I go\". So what happened next?'"
    "\n- 'Ha, that sounds fun! Tell me more about that.'"
    "\n\nExamples of BAD responses (NEVER do this):"
    "\n- Long paragraphs explaining grammar rules"
    "\n- Multiple corrections at once"
    "\n- Formal teacher-style responses"
)

# Prompts tailored to specific practice scenarios
CHALLENGE_PROMPTS = {
    "self_intro": (
        "You are Luna coaching a Self Introduction. "
        "Guide the student through: name, where they're from, what they do, hobbies. "
        "Go one at a time. Correct grammar naturally. "
        "MAXIMUM 1-2 short sentences per response. Sound like a friend, not a teacher."
    ),
    "describe_home": (
        "You are Luna coaching a 'Describe Your Home' session. "
        "Help them describe rooms, furniture, what they like. "
        "Teach spatial words naturally. "
        "MAXIMUM 1-2 short sentences per response. Sound like a friend."
    ),
    "favorite_food": (
        "You are Luna coaching a 'Favorite Food' session. "
        "Help them describe taste, ingredients, memories around food. "
        "MAXIMUM 1-2 short sentences per response. Sound like a friend chatting about food."
    ),
    "story_telling": (
        "You are Luna coaching a Story Telling session. "
        "Help the student tell a personal story — ask about what happened, who was there, how they felt. "
        "MAXIMUM 1-2 short sentences per response. React naturally like a friend listening to a story."
    ),
    "job_interview": (
        "You are Luna acting as a job interviewer. Ask ONE interview question at a time. "
        "After they answer, give one brief comment then ask the next question. "
        "MAXIMUM 1-2 short sentences. Sound professional but friendly."
    ),
    "morning_routine": (
        "You are Luna coaching a 'Morning Routine' session. "
        "Help them describe their morning step by step using time and sequence words. "
        "MAXIMUM 1-2 short sentences per response. Sound like a friend."
    ),
    "interview_prep": (
        "You are Luna teaching interview techniques: STAR method, elevator pitch, power words. "
        "Teach ONE technique at a time, then ask the student to practice it. "
        "MAXIMUM 1-2 short sentences per response."
    ),
    "debate": (
        "You are Luna running a debate. Present a topic, let them pick a side, then challenge their arguments. "
        "MAXIMUM 1-2 short sentences per response. Be a friendly opponent."
    ),
}

# Guidance appended based on assessed student confidence
CONFIDENCE_PROMPTS = {
    "low": (
        "\n\n[CONFIDENCE: LOW] Be extra warm and encouraging. "
        "Praise first, then gently correct ONE thing."
    ),
    "growing": (
        "\n\n[CONFIDENCE: GROWING] Encouraging but introduce gentle corrections. "
        "Say 'Nice! And you could also say...'."
    ),
    "steady": (
        "\n\n[CONFIDENCE: STEADY] Balance encouragement with corrections. "
        "Introduce new vocabulary naturally."
    ),
    "high": (
        "\n\n[CONFIDENCE: HIGH] Challenge them with advanced vocabulary and idioms. "
        "Ask deeper follow-up questions."
    ),
}

# Opening lines for challenge scenarios
CHALLENGE_GREETINGS = {
    "self_intro": "Hey! Let's practice introductions. Start by telling me your name!",
    "describe_home": "Let's talk about your home! What kind of place do you live in?",
    "favorite_food": "Ooh I love talking about food! What's your favorite dish?",
    "story_telling": "Tell me a story! What's something interesting that happened to you recently?",
    "job_interview": "Alright, let's do a mock interview. Ready? Tell me about yourself.",
    "morning_routine": "Let's talk about your morning! What's the first thing you do when you wake up?",
    "interview_prep": "Today I'll teach you some killer interview techniques. Ever heard of the STAR method?",
    "debate": "Let's debate! Here's the topic: 'Social media does more harm than good.' Agree or disagree?",
}

_client = None

def _get_client():
    global _client
    if _client is None and GROQ_OK:
        key = os.getenv("GROQ_API_KEY", "")
        if key:
            _client = Groq(api_key=key)
    return _client


def analyze_text(transcript, challenge=None, confidence_level=None, conversation_history=None):
    """Get a contextual AI response with conversation memory."""
    client = _get_client()
    if not client:
        return {"teacher_response": "That's interesting! Tell me more.", "corrected_text": transcript, "tips": []}

    # Build system prompt
    system_prompt = CHALLENGE_PROMPTS.get(challenge, SYSTEM) if challenge else SYSTEM

    # Append confidence adaptation
    if confidence_level and confidence_level in CONFIDENCE_PROMPTS:
        system_prompt += CONFIDENCE_PROMPTS[confidence_level]
        logger.info(f"🎯 Confidence: {confidence_level}")

    # Build messages with conversation history
    messages = [{"role": "system", "content": system_prompt}]

    # Add conversation history (last 10 messages for context)
    if conversation_history:
        for msg in conversation_history[-10:]:
            role = "user" if msg.get("type") == "user" else "assistant"
            messages.append({"role": role, "content": msg.get("text", "")})

    # Add current message
    messages.append({"role": "user", "content": transcript})

    try:
        comp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            max_tokens=100,
            temperature=0.8,
        )
        reply = comp.choices[0].message.content or "That's interesting! Tell me more about that."
        return {"teacher_response": reply.strip(), "corrected_text": transcript, "tips": []}
    except Exception as e:
        logger.error(f"Groq error: {e}")
        # Fallback to 70b if 8b fails
        try:
            comp = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=messages,
                max_tokens=100,
                temperature=0.8,
            )
            reply = comp.choices[0].message.content or "Nice! Keep going!"
            return {"teacher_response": reply.strip(), "corrected_text": transcript, "tips": []}
        except Exception as e2:
            logger.error(f"Fallback Groq error: {e2}")
            return {"teacher_response": "Nice effort! Keep practicing, you're doing well!", "corrected_text": transcript, "tips": []}
