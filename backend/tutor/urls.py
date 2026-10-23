from django.urls import path
from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("health/", views.health_check, name="health"),
    path("api/chat/", views.chat_view, name="api-chat"),
    path("api/analyze-writing/", views.analyze_writing_view, name="api-analyze-writing"),
]
