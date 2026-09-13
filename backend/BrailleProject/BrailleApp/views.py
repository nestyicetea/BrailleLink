from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from .models import *
from .serializer import *
from PIL import Image as PILImage
from PIL import ImageEnhance, ImageFilter
from .image_processing import process_braille_image
import io
import cv2
import numpy as np
import base64


# ─── FOLDER VIEWSET ────────────────────────────────────────────

class FolderViewSet(viewsets.ViewSet):
    """
    Handle all Folder operations
    """
    
    # GET /folders/ - List all folders (exclude deleted)
    def list(self, request):
        folders = Folder.objects.filter(deleted_at__isnull=True)
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
    
    # DELETE /folders/{id}/ - Soft delete folder
    def destroy(self, request, pk=None):
        from django.utils import timezone
        folder = get_object_or_404(Folder, pk=pk)
        folder_name = folder.folder_name
        
        # Soft delete the folder and all its images
        folder.deleted_at = timezone.now()
        folder.save()
        
        # Also soft delete all images in this folder
        Image.objects.filter(folder=folder, deleted_at__isnull=True).update(deleted_at=timezone.now())
        
        return Response({
            'status': 'success',
            'message': f'Folder "{folder_name}" moved to recently deleted',
            'deleted_folder_id': pk
        }, status=status.HTTP_200_OK)
    
    # GET /folders/recently_deleted/ - List deleted folders
    @action(detail=False, methods=['GET'])
    def recently_deleted(self, request):
        folders = Folder.objects.filter(deleted_at__isnull=False).order_by('-deleted_at')
        serializer = FolderSerializer(folders, many=True)
        
        return Response({
            'status': 'success',
            'count': len(serializer.data),
            'folders': serializer.data
        }, status=status.HTTP_200_OK)
    
    # POST /folders/{id}/restore/ - Restore deleted folder
    @action(detail=True, methods=['POST'])
    def restore(self, request, pk=None):
        folder = get_object_or_404(Folder, pk=pk)
        
        if folder.deleted_at is None:
            return Response({
                'status': 'error',
                'message': 'Folder is not deleted'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Restore the folder and all its images
        folder.deleted_at = None
        folder.save()
        
        Image.objects.filter(folder=folder).update(deleted_at=None)
        
        return Response({
            'status': 'success',
            'message': f'Folder "{folder.folder_name}" restored successfully'
        }, status=status.HTTP_200_OK)
    
    # DELETE /folders/{id}/permanent/ - Permanently delete folder
    @action(detail=True, methods=['DELETE'])
    def permanent(self, request, pk=None):
        folder = get_object_or_404(Folder, pk=pk)
        folder_name = folder.folder_name
        folder.delete()  # Hard delete
        
        return Response({
            'status': 'success',
            'message': f'Folder "{folder_name}" permanently deleted'
        }, status=status.HTTP_200_OK)


# ─── IMAGE VIEWSET ────────────────────────────────────────────

def straighten_image(img):
    """
    Detect skew angle, straighten the image, and crop to document boundaries
    """
    try:
        # Convert PIL image to OpenCV format
        if isinstance(img, PILImage.Image):
            img_cv = np.array(img)
            if len(img_cv.shape) == 3:
                img_cv = cv2.cvtColor(img_cv, cv2.COLOR_RGB2BGR)
            else:
                img_cv = cv2.cvtColor(img_cv, cv2.COLOR_GRAY2BGR)
        else:
            img_cv = img
        
        original_height, original_width = img_cv.shape[:2]
        
        # Convert to grayscale
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Apply adaptive thresholding
        binary = cv2.adaptiveThreshold(
            blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY, 11, 2
        )
        
        # Find contours
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if contours:
            # Get the largest contour (document)
            largest = max(contours, key=cv2.contourArea)
            
            # Get the minimum area rectangle
            rect = cv2.minAreaRect(largest)
            angle = rect[2]
            
            # Adjust angle
            if angle < -45:
                angle = 90 + angle
            elif angle > 45:
                angle = angle - 90
            
            print(f"Detected skew angle: {angle} degrees")
            
            # Only straighten if angle is significant
            if abs(angle) > 0.5:
                # Get rotation matrix
                center = (original_width // 2, original_height // 2)
                rotation_matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
                
                # Calculate new dimensions to fit entire image
                cos = abs(rotation_matrix[0, 0])
                sin = abs(rotation_matrix[0, 1])
                new_width = int((original_height * sin) + (original_width * cos))
                new_height = int((original_height * cos) + (original_width * sin))
                
                # Adjust rotation matrix
                rotation_matrix[0, 2] += (new_width / 2) - center[0]
                rotation_matrix[1, 2] += (new_height / 2) - center[1]
                
                # Apply rotation with white background
                rotated = cv2.warpAffine(
                    img_cv, rotation_matrix, (new_width, new_height),
                    borderMode=cv2.BORDER_CONSTANT,
                    borderValue=(255, 255, 255)
                )
                
                # Now find the document in the rotated image
                rotated_gray = cv2.cvtColor(rotated, cv2.COLOR_BGR2GRAY)
                rotated_binary = cv2.adaptiveThreshold(
                    rotated_gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                    cv2.THRESH_BINARY, 11, 2
                )
                
                # Find contours in rotated image
                rotated_contours, _ = cv2.findContours(
                    rotated_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
                )
                
                if rotated_contours:
                    # Get the largest contour (document)
                    largest_rotated = max(rotated_contours, key=cv2.contourArea)
                    
                    # Get bounding rectangle
                    x, y, w, h = cv2.boundingRect(largest_rotated)
                    
                    # Add small padding (5%)
                    padding_x = int(w * 0.05)
                    padding_y = int(h * 0.05)
                    x = max(0, x - padding_x)
                    y = max(0, y - padding_y)
                    w = min(rotated.shape[1] - x, w + 2 * padding_x)
                    h = min(rotated.shape[0] - y, h + 2 * padding_y)
                    
                    # Crop to document
                    cropped = rotated[y:y+h, x:x+w]
                    
                    # Convert back to PIL Image
                    straightened_pil = PILImage.fromarray(cv2.cvtColor(cropped, cv2.COLOR_BGR2RGB))
                    return straightened_pil
                
                # If contours not found in rotated image, return rotated but uncropped
                straightened_pil = PILImage.fromarray(cv2.cvtColor(rotated, cv2.COLOR_BGR2RGB))
                return straightened_pil
        
        # If no contours detected, return original
        print("No document detected, returning original")
        return img
        
    except Exception as e:
        print(f"Straighten error: {str(e)}")
        import traceback
        traceback.print_exc()
        return img

def level_background(gray, blur_ksize=101, clip_limit=2.0, tile_grid_size=(8, 8)):
    """
    Stage 1: background leveling + illumination compensation (CLAHE).
    Estimates the slow-changing paper tone/lighting with a large blur,
    divides it out to cancel discoloration and uneven room light, then
    CLAHE re-punches local contrast so the dot relief shading reads clearly.
    """
    gray = gray.astype(np.float32)

    background = cv2.GaussianBlur(gray, (blur_ksize, blur_ksize), 0)
    background[background == 0] = 1  # avoid divide-by-zero

    leveled = cv2.divide(gray, background, scale=255)
    leveled = np.clip(leveled, 0, 255).astype(np.uint8)

    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    return clahe.apply(leveled)
# ─── ALGORITHM 1: FIRST-ORDER SPATIAL DERIVATIVE SHADOW GRADIENT FILTERING ───

def process_algorithm1(img):
    """
    Algorithm 1: First-Order Spatial Derivative Shadow Gradient Filtering
    
    Mathematical formulation:
    Gx = I * Kx = ∂I/∂x    (Horizontal gradient)
    Gy = I * Ky = ∂I/∂y    (Vertical gradient)
    M(x,y) = √(Gx² + Gy²)  (Gradient magnitude)
    θ(x,y) = tan⁻¹(Gy/Gx)  (Orientation angle)
    
    This algorithm suppresses background clutter (folds, edges, lighting variations)
    while preserving Braille dots using gradient-based filtering.
    """
    try:
        # Convert PIL to OpenCV
        if isinstance(img, PILImage.Image):
            img_cv = np.array(img)
            if len(img_cv.shape) == 3:
                img_cv = cv2.cvtColor(img_cv, cv2.COLOR_RGB2BGR)
            else:
                img_cv = cv2.cvtColor(img_cv, cv2.COLOR_GRAY2BGR)
        else:
            img_cv = img
        
        if img_cv is None:
            raise ValueError("Could not load image")
        
        # Step 1: Convert to grayscale
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        
        # Step 2: Normalize image for stable gradient calculation
        gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
        
        # Step 3: Apply Gaussian blur to reduce noise (preserve dot edges)
        blurred = cv2.GaussianBlur(gray, (3, 3), 0)
        
        # Step 4: Calculate horizontal gradient Gx = ∂I/∂x using Sobel
        Gx = cv2.Sobel(blurred, cv2.CV_64F, 1, 0, ksize=3)
        
        # Step 5: Calculate vertical gradient Gy = ∂I/∂y using Sobel
        Gy = cv2.Sobel(blurred, cv2.CV_64F, 0, 1, ksize=3)
        
        # Step 6: Calculate gradient magnitude M(x,y) = √(Gx² + Gy²)
        magnitude = np.sqrt(Gx**2 + Gy**2)
        magnitude = cv2.normalize(magnitude, None, 0, 255, cv2.NORM_MINMAX)
        magnitude = magnitude.astype(np.uint8)
        
        # Step 7: Calculate gradient orientation θ(x,y) = atan2(Gy, Gx)
        orientation = np.arctan2(Gy, Gx)
        
        # Step 8: Suppress background clutter
        # Use large Gaussian blur to estimate background illumination
        background = cv2.GaussianBlur(magnitude, (51, 51), 0)
        
        # Subtract background to remove low-frequency variations
        suppressed = cv2.subtract(magnitude, background)
        suppressed = cv2.normalize(suppressed, None, 0, 255, cv2.NORM_MINMAX)
        suppressed = suppressed.astype(np.uint8)
        
        # Step 9: Apply adaptive thresholding to get binary mask
        # Otsu's method automatically determines optimal threshold
        _, binary = cv2.threshold(suppressed, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Step 10: Morphological cleaning - preserve dot structures
        kernel = np.ones((3, 3), np.uint8)
        
        # Opening removes small noise (erosion then dilation)
        opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        
        # Closing fills small holes in dots (dilation then erosion)
        closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel)
        
        # Step 11: Filter connected components by area to keep only Braille dots
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Create final mask with white background
        final_mask = np.full_like(closed, 255)  # Start with all white (255)
        
        # Parameters for Braille dot filtering
        min_dot_area = 10
        max_dot_area = 200
        
        dot_count = 0
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if min_dot_area < area < max_dot_area:
                # This is a Braille dot - draw it in black (0) on white background
                cv2.drawContours(final_mask, [cnt], -1, 0, -1)  # 0 = black
                dot_count += 1
        
        # Step 12: Create overlay - original with green highlighted dots
        overlay = img_cv.copy()
        
        # Create a color mask for highlighting
        highlight_mask = np.zeros_like(img_cv)
        # Find dots in the final mask (black = dot on white background)
        dot_pixels = np.where(final_mask == 0)
        highlight_mask[dot_pixels] = [0, 255, 0]  # Green highlight
        
        # Blend overlay
        overlay = cv2.addWeighted(img_cv, 0.7, highlight_mask, 0.3, 0)
        
        # Convert results to PIL
        mask_pil = PILImage.fromarray(final_mask)
        overlay_pil = PILImage.fromarray(cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB))
        magnitude_pil = PILImage.fromarray(magnitude)
        suppressed_pil = PILImage.fromarray(suppressed)
        binary_pil = PILImage.fromarray(binary)
        closed_pil = PILImage.fromarray(closed)
        
        return {
            'mask': mask_pil,           # White background with black dots
            'overlay': overlay_pil,     # Original with green highlighted dots
            'magnitude': magnitude_pil,
            'suppressed': suppressed_pil,
            'binary': binary_pil,
            'closed': closed_pil,
            'dot_count': dot_count,
            'success': True
        }
        
    except Exception as e:
        print(f"Algorithm 1 error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e)
        }



class Algorithm1ViewSet(viewsets.ViewSet):
    """
    Algorithm 1: First-Order Spatial Derivative Shadow Gradient Filtering.
    Traditional image-processing approach for Braille enhancement (no ML).
    """

    @action(detail=False, methods=['POST'])
    def process(self, request):
        try:
            uploaded_file = request.FILES.get('image')
            if not uploaded_file:
                return Response({
                    'status': 'error',
                    'message': 'No image provided'
                }, status=status.HTTP_400_BAD_REQUEST)

            kernel_size = int(request.data.get('kernel_size', 3))
            if kernel_size % 2 == 0:
                kernel_size += 1

            img = PILImage.open(uploaded_file).convert('RGB')

            # Stage 1: background leveling / illumination compensation
            gray_for_leveling = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
            h, w = gray_for_leveling.shape
            level_ksize = max(3, (min(h, w) // 8) | 1)  # scale to image size, force odd
            leveled = level_background(gray_for_leveling, blur_ksize=level_ksize)
            leveled_pil = PILImage.fromarray(leveled)

            # Stage 2+: run Algorithm 1 on the leveled image, not the raw capture
            result = process_braille_image(leveled_pil, kernel_size=kernel_size)

            def to_b64(arr_or_pil, colormap=None):
                if isinstance(arr_or_pil, np.ndarray):
                    if colormap is not None:
                        colored = cv2.applyColorMap(arr_or_pil.astype(np.uint8), colormap)
                        arr_or_pil = cv2.cvtColor(colored, cv2.COLOR_BGR2RGB)
                    pil_img = PILImage.fromarray(arr_or_pil)
                else:
                    pil_img = arr_or_pil
                buf = io.BytesIO()
                pil_img.save(buf, format='JPEG', quality=95)
                return base64.b64encode(buf.getvalue()).decode('utf-8')

            response_data = {
                'status': 'success',
                'preprocessed_image': to_b64(leveled),  # ← new: Stage 1 relief-shaded output
                'filtered_image': to_b64(result['mask']),
                'overlay': to_b64(cv2.cvtColor(result['overlay'], cv2.COLOR_BGR2RGB)),
                'magnitude': to_b64(result['magnitude'], colormap=cv2.COLORMAP_JET),
                'dot_count': result['dot_count'],
                'message': f"Algorithm 1 completed. Found {result['dot_count']} Braille dots.",
            }

            if str(request.data.get('include_debug', '')).lower() in ('1', 'true'):
                orientation_deg = np.degrees(result['orientation'])
                orientation_norm = cv2.normalize(orientation_deg, None, 0, 255, cv2.NORM_MINMAX)
                response_data['debug'] = {
                    'grayscale': to_b64(result['grayscale']),
                    'gradient_x': to_b64(cv2.normalize(result['Gx'], None, 0, 255, cv2.NORM_MINMAX)),
                    'gradient_y': to_b64(cv2.normalize(result['Gy'], None, 0, 255, cv2.NORM_MINMAX)),
                    'orientation': to_b64(orientation_norm, colormap=cv2.COLORMAP_JET),
                    'background': to_b64(result['background']),
                    'suppressed': to_b64(result['suppressed']),
                }

            return Response(response_data, status=status.HTTP_200_OK)

        except Exception as e:
            print(f"Algorithm 1 API error: {str(e)}")
            import traceback
            traceback.print_exc()
            return Response({
                'status': 'error',
            'message': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ImageViewSet(viewsets.ViewSet):
    """
    Handle all Image operations
    """
    
    # GET /images/ - List all images (exclude deleted)
    def list(self, request):
        images = Image.objects.filter(deleted_at__isnull=True)
        serializer = ImageSerializer(images, many=True)
        
        images_data = []
        for img, data in zip(images, serializer.data):
            item = dict(data)
            # Add actual file size in bytes
            try:
                item['file_size'] = img.image_path.size if img.image_path else 0
            except Exception:
                item['file_size'] = 0
            images_data.append(item)
        
        return Response({
            'status': 'success',
            'count': len(images_data),
            'images': images_data
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
            output_text = request.data.get('output_text')
            
            # Create image record with the file
            image = Image.objects.create(
                folder=folder,
                image_path=uploaded_file,
                image_name=image_name,
                output_text=output_text
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
        
    @action(detail=False, methods=['POST'])
    def dewarp(self, request):
        try:
            uploaded_file = request.FILES.get('image')
            if not uploaded_file:
                return Response({
                    'status': 'error',
                    'message': 'No image provided'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Open image with PIL
            img = PILImage.open(uploaded_file)
            
            # Step 1: Straighten the image (deskew)
            print("Straightening image...")
            img = straighten_image(img)
            
            # Step 2: Convert to grayscale for scanner effect
            if img.mode != 'L':
                img = img.convert('L')
            
            # Step 3: Enhance contrast (reduced from 2.0 to 1.2)
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(1.2)
            
            # Step 4: Enhance brightness (reduced from 1.5 to 1.1)
            enhancer = ImageEnhance.Brightness(img)
            img = enhancer.enhance(1.1)
            
            # Save to bytes with good quality
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='JPEG', quality=90)
            img_byte_arr = img_byte_arr.getvalue()
            
            # Convert to base64
            img_base64 = base64.b64encode(img_byte_arr).decode('utf-8')
            
            return Response({
                'status': 'success',
                'image': img_base64
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            print(f"Dewarp error: {str(e)}")
            import traceback
            traceback.print_exc()
            return Response({
                'status': 'error',
                'message': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
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
        
        if 'image_name' in request.data:
            image.image_name = request.data['image_name']
        if 'folder' in request.data:
            folder_id = request.data['folder']
            if folder_id:
                image.folder = get_object_or_404(Folder, pk=folder_id)
            else:
                image.folder = None
        if 'output_text' in request.data:
            image.output_text = request.data['output_text']
        
        image.save()
        
        return Response({
            'image_id': image.image_id,
            'folder': image.folder.folder_id if image.folder else None,
            'image_path': str(image.image_path),
            'image_name': image.image_name,
            'created_at': image.created_at,
            'updated_at': image.updated_at
        }, status=status.HTTP_200_OK)
    
    # DELETE /images/{id}/ - Soft delete image
    def destroy(self, request, pk=None):
        from django.utils import timezone
        image = get_object_or_404(Image, pk=pk)
        image_name = image.image_name or image.image_path
        
        # Soft delete
        image.deleted_at = timezone.now()
        image.save()
        
        return Response({
            'status': 'success',
            'message': f'Image "{image_name}" moved to recently deleted',
            'deleted_image_id': pk
        }, status=status.HTTP_200_OK)
    
    # GET /images/recently_deleted/ - List deleted images
    @action(detail=False, methods=['GET'])
    def recently_deleted(self, request):
        images = Image.objects.filter(deleted_at__isnull=False).order_by('-deleted_at')
        serializer = ImageSerializer(images, many=True)
        
        images_data = []
        for img, data in zip(images, serializer.data):
            item = dict(data)
            try:
                item['file_size'] = img.image_path.size if img.image_path else 0
            except Exception:
                item['file_size'] = 0
            images_data.append(item)
        
        return Response({
            'status': 'success',
            'count': len(images_data),
            'images': images_data
        }, status=status.HTTP_200_OK)
    
    # POST /images/{id}/restore/ - Restore deleted image
    @action(detail=True, methods=['POST'])
    def restore(self, request, pk=None):
        image = get_object_or_404(Image, pk=pk)
        
        if image.deleted_at is None:
            return Response({
                'status': 'error',
                'message': 'Image is not deleted'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Restore the image
        image.deleted_at = None
        image.save()
        
        return Response({
            'status': 'success',
            'message': f'Image "{image.image_name}" restored successfully'
        }, status=status.HTTP_200_OK)
    
    # DELETE /images/{id}/permanent/ - Permanently delete image
    @action(detail=True, methods=['DELETE'])
    def permanent(self, request, pk=None):
        image = get_object_or_404(Image, pk=pk)
        image_name = image.image_name or str(image.image_path)
        image.delete()  # Hard delete
        
        return Response({
            'status': 'success',
            'message': f'Image "{image_name}" permanently deleted'
        }, status=status.HTTP_200_OK)