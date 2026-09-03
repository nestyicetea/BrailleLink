from django.db import models

# Create your models here.


class Folder(models.Model):
    folder_id = models.AutoField(primary_key=True)
    folder_name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'folders'

    def __str__(self):
        return self.folder_name


class Image(models.Model):
    image_id = models.AutoField(primary_key=True)
    folder = models.ForeignKey(
        Folder,
        on_delete=models.CASCADE,
        related_name='images',
        null=True,
        blank=True
    )
    image_path = models.ImageField(upload_to='images/', max_length=500, null=True, blank=True)  # Changed to ImageField
    image_name = models.CharField(max_length=255, null=True, blank=True)
    output_text = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'images'

    def __str__(self):
        return self.image_name or str(self.image_path)