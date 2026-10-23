from django.db import models
from django.utils import timezone


class UserProfile(models.Model):
    name = models.CharField(max_length=100, default='Guest')
    email = models.EmailField(unique=True)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"{self.name} ({self.email})"


class PracticeSession(models.Model):
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="sessions", null=True, blank=True)
    challenge = models.CharField(max_length=50, blank=True, null=True)
    started_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)

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
