from rest_framework import serializers
from .models import *

class BaseSerializer(serializers.Serializer):
    """Base serializer with universal helper"""
    
    @staticmethod
    def get(model, object_id=None, **kwargs):
        """
        Universal helper - gets object(s) from ANY table
        - If object_id provided: gets single object by ID
        - If no object_id: gets all objects
        - If kwargs provided: filters by criteria
        """
        if object_id is not None:
            # Get single object by ID
            try:
                return model.objects.get(pk=object_id)
            except model.DoesNotExist:
                return None
        elif kwargs:
            # Filter by criteria
            return model.objects.filter(**kwargs)
        else:
            # Get all objects
            return model.objects.all()


class ImageSerializer(BaseSerializer, serializers.ModelSerializer):
    class Meta:
        model = Image
        fields = '__all__'


class FolderSerializer(BaseSerializer, serializers.ModelSerializer):
    images = ImageSerializer(many=True, read_only=True)
    
    class Meta:
        model = Folder
        fields = '__all__'