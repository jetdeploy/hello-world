from django.contrib import admin
from django.urls import path

from counter.views import home

urlpatterns = [
    path("", home, name="home"),
    path("admin/", admin.site.urls),
]
