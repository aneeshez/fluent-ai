from django.conf import settings
from django.db import models
from django.utils import timezone


class UserProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="fluent_profile",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=100, default='Guest')
    email = models.EmailField(unique=True)
    email_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"{self.name} ({self.email})"


class PracticeSession(models.Model):
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="sessions", null=True, blank=True)
    guest_session_key = models.CharField(max_length=40, null=True, blank=True, db_index=True)
    challenge = models.CharField(max_length=50, blank=True, null=True)
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    xp_earned = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"Session {self.id} - {self.challenge or 'Free Talk'}"


class Transcript(models.Model):
    session = models.ForeignKey(PracticeSession, on_delete=models.CASCADE, related_name="transcripts")
    speaker = models.CharField(max_length=10, default="user")  # 'user' or 'ai'
    text = models.TextField()
    timestamp = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"{self.speaker}: {self.text[:40]}"


class Feedback(models.Model):
    transcript = models.ForeignKey(Transcript, on_delete=models.CASCADE, related_name="feedbacks")
    corrected_text = models.TextField(blank=True)
    tips_json = models.TextField(blank=True)
    teacher_response = models.TextField(blank=True)

    def __str__(self):
        return f"Feedback on Transcript #{self.transcript_id}"


class WritingSubmission(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="writing_submissions",
    )
    prompt = models.TextField(blank=True)
    text = models.TextField()
    result_json = models.JSONField(default=dict)
    xp_earned = models.PositiveIntegerField(default=40)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"Writing submission #{self.pk} by {self.user.email}"


class RequestRateLimit(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(db_index=True)

    def __str__(self):
        return f"Rate limit bucket ending at {self.expires_at}"
