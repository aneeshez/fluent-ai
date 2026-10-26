import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from .models import PracticeSession, UserProfile, WritingSubmission


class ApiTestCase(TestCase):
    def post_json(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json")

    def create_user(self, email="learner@example.com", password="S0lid-test-password!"):
        user = get_user_model().objects.create_user(
            username=email, email=email, password=password, first_name="Learner"
        )
        UserProfile.objects.create(user=user, email=email, name="Learner")
        return user, password

    def test_health_endpoint(self):
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_invalid_json_returns_bad_request(self):
        response = self.client.post("/api/auth/login/", data="{", content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())

    def test_registration_creates_user_profile_and_session(self):
        response = self.post_json("/api/auth/register/", {
            "name": "New Learner",
            "email": "NEW@example.com",
            "password": "S0lid-test-password!",
        })
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(get_user_model().objects.filter(email="new@example.com").exists())
        self.assertTrue(self.client.session.get("_auth_user_id"))

    def test_login_and_logout(self):
        _, password = self.create_user()
        response = self.post_json("/api/auth/login/", {"email": "learner@example.com", "password": password})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)
        self.assertEqual(self.post_json("/api/auth/logout/", {}).status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)

    def test_dashboard_requires_authentication(self):
        self.assertEqual(self.client.get("/api/dashboard/").status_code, 401)

    @patch("tutor.views.analyze_text", return_value={
        "teacher_response": "Tell me more.", "corrected_text": "I went home.", "tips": []
    })
    def test_chat_saves_transcript_and_feedback(self, _analyze):
        response = self.post_json("/api/chat/", {"text": "I go home yesterday."})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["corrected_text"], "I went home.")
        session = PracticeSession.objects.get(pk=response.json()["session_id"])
        self.assertEqual(session.transcripts.count(), 2)
        self.assertEqual(session.transcripts.filter(speaker="user").first().feedbacks.count(), 1)

    def test_writing_requires_authentication(self):
        response = self.post_json("/api/analyze-writing/", {"text": "A long enough writing sample"})
        self.assertEqual(response.status_code, 401)

    def test_authenticated_writing_rejects_short_text(self):
        user, _ = self.create_user()
        self.client.force_login(user)
        response = self.post_json("/api/analyze-writing/", {"text": "Too short."})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(WritingSubmission.objects.count(), 0)
