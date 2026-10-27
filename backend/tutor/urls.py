from django.urls import path
from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("health/", views.health_check, name="health"),
    path("api/auth/csrf/", views.csrf_token_view, name="api-auth-csrf"),
    path("api/auth/register/", views.register_view, name="api-auth-register"),
    path("api/auth/login/", views.login_view, name="api-auth-login"),
    path("api/auth/email-verification/resend/", views.resend_verification_view, name="api-auth-email-verification-resend"),
    path("api/auth/email-verification/confirm/", views.confirm_verification_view, name="api-auth-email-verification-confirm"),
    path("api/auth/password-reset/", views.password_reset_request_view, name="api-auth-password-reset"),
    path("api/auth/password-reset/confirm/", views.password_reset_confirm_view, name="api-auth-password-reset-confirm"),
    path("api/auth/me/", views.current_user_view, name="api-auth-me"),
    path("api/auth/logout/", views.logout_view, name="api-auth-logout"),
    path("api/auth/profile/", views.update_profile_view, name="api-auth-profile"),
    path("api/auth/password/", views.change_password_view, name="api-auth-password"),
    path("api/auth/delete/", views.delete_account_view, name="api-auth-delete"),
    path("api/chat/", views.chat_view, name="api-chat"),
    path("api/session/finish/", views.finish_session_view, name="api-session-finish"),
    path("api/progress/reset/", views.reset_progress_view, name="api-progress-reset"),
    path("api/analyze-writing/", views.analyze_writing_view, name="api-analyze-writing"),
    path("api/dashboard/", views.dashboard_view, name="api-dashboard"),
    path("api/export/", views.export_data_view, name="api-export"),
]
