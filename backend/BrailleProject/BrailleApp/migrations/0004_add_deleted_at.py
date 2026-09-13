# Generated migration for adding deleted_at field
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('BrailleApp', '0003_image_output_text'),
    ]

    operations = [
        migrations.AddField(
            model_name='folder',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='image',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
