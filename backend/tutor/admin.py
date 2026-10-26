from django.contrib import admin
from .models import UserProfile, PracticeSession, Transcript, Feedback, WritingSubmission


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


@admin.register(WritingSubmission)
class WritingSubmissionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "created_at", "xp_earned")
    list_filter = ("created_at",)
    search_fields = ("user__email", "text")
