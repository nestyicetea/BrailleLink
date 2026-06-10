from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from .models import *
from .serializer import *


# ─── FOLDER VIEWSET ────────────────────────────────────────────

class FolderViewSet(viewsets.ViewSet):
    """
    Handle all Folder operations
    """
    
    # GET /folders/ - List all folders
    def list(self, request):
        folders = Folder.objects.all()
        serializer = FolderSerializer(folders, many=True)
        
        return Response({
            'status': 'success',
            'count': len(serializer.data),
            'folders': serializer.data
        }, status=status.HTTP_200_OK)
    
    # GET /folders/{id}/ - Get single folder
    def retrieve(self, request, pk=None):
        folder = get_object_or_404(Folder, pk=pk)
        serializer = FolderSerializer(folder)
        
        return Response({
            'folder_id': serializer.data['folder_id'],
            'folder_name': serializer.data['folder_name'],
            'created_at': serializer.data['created_at'],
            'updated_at': serializer.data['updated_at'],
            'images': serializer.data['images']
        }, status=status.HTTP_200_OK)
    
    # POST /folders/ - Create new folder
    def create(self, request):
        folder_data = {
            'folder_name': request.data.get('folder_name')
        }
        
        serializer = FolderSerializer(data=folder_data)
        
        if serializer.is_valid():
            folder = serializer.save()
            
            return Response({
                'folder_id': folder.folder_id,
                'folder_name': folder.folder_name,
                'created_at': folder.created_at,
                'updated_at': folder.updated_at,
                'images': []
            }, status=status.HTTP_201_CREATED)
        
        return Response({
            'status': 'error',
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # PUT /folders/{id}/ - Full update folder
    def update(self, request, pk=None):
        folder = get_object_or_404(Folder, pk=pk)
        
        update_data = {
            'folder_name': request.data.get('folder_name')
        }
        
        serializer = FolderSerializer(folder, data=update_data)
        
        if serializer.is_valid():
            updated_folder = serializer.save()
            
            return Response({
                'folder_id': updated_folder.folder_id,
                'folder_name': updated_folder.folder_name,
                'created_at': updated_folder.created_at,
                'updated_at': updated_folder.updated_at,
                'images': FolderSerializer(updated_folder).data['images']
            }, status=status.HTTP_200_OK)
        
        return Response({
            'status': 'error',
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # PATCH /folders/{id}/ - Partial update folder
    def partial_update(self, request, pk=None):
        folder = get_object_or_404(Folder, pk=pk)
        
        update_data = {}
        if 'folder_name' in request.data:
            update_data['folder_name'] = request.data['folder_name']
        
        serializer = FolderSerializer(folder, data=update_data, partial=True)
        
        if serializer.is_valid():
            updated_folder = serializer.save()
            
            return Response({
                'folder_id': updated_folder.folder_id,
                'folder_name': updated_folder.folder_name,
                'created_at': updated_folder.created_at,
                'updated_at': updated_folder.updated_at,
                'images': FolderSerializer(updated_folder).data['images']
            }, status=status.HTTP_200_OK)
        
        return Response({
            'status': 'error',
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # DELETE /folders/{id}/ - Delete folder
    def destroy(self, request, pk=None):
        folder = get_object_or_404(Folder, pk=pk)
        folder_name = folder.folder_name
        folder.delete()
        
        return Response({
            'status': 'success',
            'message': f'Folder "{folder_name}" deleted successfully',
            'deleted_folder_id': pk
        }, status=status.HTTP_200_OK)


# ─── IMAGE VIEWSET ────────────────────────────────────────────

class ImageViewSet(viewsets.ViewSet):
    """
    Handle all Image operations
    """
    
    # GET /images/ - List all images
    def list(self, request):
        images = Image.objects.all()
        serializer = ImageSerializer(images, many=True)
        
        return Response({
            'status': 'success',
            'count': len(serializer.data),
            'images': serializer.data
        }, status=status.HTTP_200_OK)
    
    # GET /images/{id}/ - Get single image
    def retrieve(self, request, pk=None):
        image = get_object_or_404(Image, pk=pk)
        serializer = ImageSerializer(image)
        
        return Response({
            'image_id': serializer.data['image_id'],
            'folder': serializer.data['folder'],
            'image_path': serializer.data['image_path'],
            'image_name': serializer.data['image_name'],
            'created_at': serializer.data['created_at'],
            'updated_at': serializer.data['updated_at']
        }, status=status.HTTP_200_OK)
    
    def create(self, request):
        try:
            print("=" * 50)
            print("Request FILES:", request.FILES)
            print("Request DATA:", request.data)
            
            # Get folder ID
            folder_id = request.data.get('folder')
            folder = None
            if folder_id and folder_id != 'null' and folder_id != 'undefined':
                try:
                    folder = Folder.objects.get(pk=folder_id)
                except Folder.DoesNotExist:
                    pass
            
            # Get the uploaded file
            uploaded_file = request.FILES.get('image')
            if not uploaded_file:
                return Response({
                    'status': 'error',
                    'errors': 'No image file provided'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get image name
            image_name = request.data.get('image_name', uploaded_file.name)
            
            # Create image record with the file
            image = Image.objects.create(
                folder=folder,
                image_path=uploaded_file,
                image_name=image_name
            )
            
            serializer = ImageSerializer(image)
            data = serializer.data
            if data.get('image_path'):
                data['image_url'] = request.build_absolute_uri(data['image_path'])
            
            return Response({
                'status': 'success',
                'message': 'Image uploaded successfully',
                'data': data
            }, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            print("Error:", str(e))
            import traceback
            traceback.print_exc()
            return Response({
                'status': 'error',
                'errors': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    # PUT /images/{id}/ - Full update image
    def update(self, request, pk=None):
        image = get_object_or_404(Image, pk=pk)
        
        update_data = {
            'folder': request.data.get('folder'),
            'image_path': request.data.get('image_path'),
            'image_name': request.data.get('image_name')
        }
        
        serializer = ImageSerializer(image, data=update_data)
        
        if serializer.is_valid():
            updated_image = serializer.save()
            
            return Response({
                'image_id': updated_image.image_id,
                'folder': updated_image.folder.folder_id if updated_image.folder else None,
                'image_path': updated_image.image_path,
                'image_name': updated_image.image_name,
                'created_at': updated_image.created_at,
                'updated_at': updated_image.updated_at
            }, status=status.HTTP_200_OK)
        
        return Response({
            'status': 'error',
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # PATCH /images/{id}/ - Partial update image
    def partial_update(self, request, pk=None):
        image = get_object_or_404(Image, pk=pk)
        
        update_data = {}
        if 'folder' in request.data:
            update_data['folder'] = request.data['folder']
        if 'image_path' in request.data:
            update_data['image_path'] = request.data['image_path']
        if 'image_name' in request.data:
            update_data['image_name'] = request.data['image_name']
        
        serializer = ImageSerializer(image, data=update_data, partial=True)
        
        if serializer.is_valid():
            updated_image = serializer.save()
            
            return Response({
                'image_id': updated_image.image_id,
                'folder': updated_image.folder.folder_id if updated_image.folder else None,
                'image_path': updated_image.image_path,
                'image_name': updated_image.image_name,
                'created_at': updated_image.created_at,
                'updated_at': updated_image.updated_at
            }, status=status.HTTP_200_OK)
        
        return Response({
            'status': 'error',
            'errors': serializer.errors
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # DELETE /images/{id}/ - Delete image
    def destroy(self, request, pk=None):
        image = get_object_or_404(Image, pk=pk)
        image_name = image.image_name or image.image_path
        image.delete()
        
        return Response({
            'status': 'success',
            'message': f'Image "{image_name}" deleted successfully',
            'deleted_image_id': pk
        }, status=status.HTTP_200_OK)