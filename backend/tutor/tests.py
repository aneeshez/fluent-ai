import json
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import Client, TestCase

from .models import PracticeSession, UserProfile, WritingSubmission


class ApiTestCase(TestCase):
    def post_json(self, path, payload):
        return self.client.post(path, data=json.dumps(payload), content_type="application/json")

    def create_user(self, email="learner@example.com", password="S0lid-test-password!"):
        user = get_user_model().objects.create_user(
            username=email, email=email, password=password, first_name="Learner"
        )
        UserProfile.objects.create(user=user, email=email, name="Learner", email_verified=True)
        return user, password

    def test_health_endpoint(self):
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_frontend_pages_and_static_assets_are_served(self):
        for page in (
            "about", "challenges", "dashboard", "email-verify", "index", "login",
            "password-reset", "practice", "profile", "signup", "writing",
        ):
            with self.subTest(page=page):
                response = self.client.get(f"/{page}.html")
                self.assertEqual(response.status_code, 200)
                self.assertNotIn("{% static", response.content.decode())
        self.assertEqual(self.client.get("/static/css/design-system.css").status_code, 200)
        self.assertEqual(self.client.get("/static/js/api.js").status_code, 200)
        self.assertEqual(self.client.get("/not-a-page.html").status_code, 404)

    def test_invalid_json_returns_bad_request(self):
        response = self.client.post("/api/auth/login/", data="{", content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())

    def test_state_changing_auth_api_requires_csrf_token(self):
        client = Client(enforce_csrf_checks=True)
        response = client.post(
            "/api/auth/login/",
            data=json.dumps({"email": "learner@example.com", "password": "bad"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)
        token_response = client.get("/api/auth/csrf/")
        csrf_token = token_response.json()["csrfToken"]
        response = client.post(
            "/api/auth/login/",
            data=json.dumps({"email": "learner@example.com", "password": "bad"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(response.status_code, 401)

    def test_registration_requires_email_verification_before_login(self):
        response = self.post_json("/api/auth/register/", {
            "name": "New Learner",
            "email": "NEW@example.com",
            "password": "S0lid-test-password!",
        })
        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(get_user_model().objects.filter(email="new@example.com").exists())
        self.assertFalse(self.client.session.get("_auth_user_id"))
        user = get_user_model().objects.get(email="new@example.com")
        profile = UserProfile.objects.get(user=user)
        self.assertFalse(profile.email_verified)
        self.assertEqual(len(mail.outbox), 1)

        login_response = self.post_json("/api/auth/login/", {
            "email": user.email, "password": "S0lid-test-password!"
        })
        self.assertEqual(login_response.status_code, 403)

        verify_url = next(line for line in mail.outbox[-1].body.splitlines() if "/email-verify.html?" in line)
        values = parse_qs(urlsplit(verify_url).query)
        verified = self.post_json("/api/auth/email-verification/confirm/", {
            "uid": values["uid"][0], "token": values["token"][0],
        })
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(
            self.post_json("/api/auth/login/", {"email": user.email, "password": "S0lid-test-password!"}).status_code,
            200,
        )

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

    @patch("tutor.views.analyze_text", return_value={
        "teacher_response": "Tell me more.", "corrected_text": "Hello there.", "tips": []
    })
    def test_guest_session_is_private_to_its_browser(self, _analyze):
        owner = self.client
        response = self.post_json("/api/chat/", {"text": "Hello there."})
        self.assertEqual(response.status_code, 200)
        session_id = response.json()["session_id"]

        other_browser = self.client_class()
        stolen_finish = other_browser.post(
            "/api/session/finish/",
            data=json.dumps({"session_id": session_id}),
            content_type="application/json",
        )
        self.assertEqual(stolen_finish.status_code, 404)

        owner_finish = owner.post(
            "/api/session/finish/",
            data=json.dumps({"session_id": session_id}),
            content_type="application/json",
        )
        self.assertEqual(owner_finish.status_code, 200)

    def test_writing_requires_authentication(self):
        response = self.post_json("/api/analyze-writing/", {"text": "A long enough writing sample"})
        self.assertEqual(response.status_code, 401)

    def test_authenticated_writing_rejects_short_text(self):
        user, _ = self.create_user()
        self.client.force_login(user)
        response = self.post_json("/api/analyze-writing/", {"text": "Too short."})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(WritingSubmission.objects.count(), 0)

    def test_login_is_rate_limited(self):
        for _ in range(10):
            response = self.post_json("/api/auth/login/", {
                "email": "missing@example.com", "password": "wrong-password"
            })
            self.assertEqual(response.status_code, 401)
        blocked = self.post_json("/api/auth/login/", {
            "email": "missing@example.com", "password": "wrong-password"
        })
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked["Retry-After"], "900")

    def test_admin_login_is_rate_limited(self):
        for _ in range(10):
            response = self.client.post("/admin/login/", {"username": "unknown", "password": "wrong"})
            self.assertEqual(response.status_code, 200)
        blocked = self.client.post("/admin/login/", {"username": "unknown", "password": "wrong"})
        self.assertEqual(blocked.status_code, 429)

    def test_password_reset_email_and_token_update_password(self):
        user, old_password = self.create_user()
        response = self.post_json("/api/auth/password-reset/", {"email": user.email})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(mail.outbox[-1].to, [user.email])
        reset_url = next(line for line in mail.outbox[-1].body.splitlines() if "/password-reset.html?" in line)
        values = parse_qs(urlsplit(reset_url).query)
        new_password = "Another-safe-password-2026!"

        response = self.post_json("/api/auth/password-reset/confirm/", {
            "uid": values["uid"][0], "token": values["token"][0], "password": new_password,
        })
        self.assertEqual(response.status_code, 200, response.content)
        user.refresh_from_db()
        self.assertTrue(user.check_password(new_password))
        self.assertFalse(user.check_password(old_password))

        reused_token = self.post_json("/api/auth/password-reset/confirm/", {
            "uid": values["uid"][0], "token": values["token"][0], "password": old_password,
        })
        self.assertEqual(reused_token.status_code, 400)

    def test_password_reset_response_does_not_reveal_unknown_email(self):
        response = self.post_json("/api/auth/password-reset/", {"email": "nobody@example.com"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("If an account exists", response.json()["message"])
        self.assertEqual(len(mail.outbox), 0)

    def test_changing_account_email_requires_reverification(self):
        user, _ = self.create_user()
        self.client.force_login(user)
        response = self.post_json("/api/auth/profile/", {
            "name": "Learner", "email": "new-address@example.com"
        })
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["emailVerificationRequired"])
        profile = UserProfile.objects.get(user=user)
        self.assertFalse(profile.email_verified)
        self.assertEqual(profile.email, "new-address@example.com")
        self.assertFalse(self.client.session.get("_auth_user_id"))
        self.assertEqual(mail.outbox[-1].to, ["new-address@example.com"])
