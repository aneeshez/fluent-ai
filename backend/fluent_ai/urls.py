from django.contrib import admin
from django.urls import path, include
from tutor import views as tutor_views
from tutor.views import rate_limit

admin.site.login = rate_limit("admin-login", limit=10, window=900)(admin.site.login)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', include('tutor.urls')),
    path('<str:page_name>.html', tutor_views.page, name='page'),
]
