from django.contrib import admin
from .models import UserProfile, PracticeSession, Transcript, Feedback


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "created_at")
    search_fields = ("name", "email")


@admin.register(PracticeSession)
class PracticeSessionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "challenge", "started_at", "ended_at")
    list_filter = ("challenge", "started_at")


@admin.register(Transcript)
class TranscriptAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "speaker", "timestamp")
    list_filter = ("speaker", "timestamp")
    search_fields = ("text",)


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    list_display = ("id", "transcript")
