from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

# Create router
router = DefaultRouter()

# Register viewsets
router.register(r'folders', FolderViewSet, basename='folder')
router.register(r'images', ImageViewSet, basename='image')

urlpatterns = [
    # Include router URLs
    path('', include(router.urls)),
]

