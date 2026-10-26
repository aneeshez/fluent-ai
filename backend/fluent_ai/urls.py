from django.conf import settings
from django.contrib import admin
from django.urls import path, include, re_path
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('tutor.urls')),
    # Serve all frontend static files (CSS, JS, images) directly from the frontend folder
    re_path(r'^(?P<path>.+)$', serve, {'document_root': settings.FRONTEND_DIR}),
]
