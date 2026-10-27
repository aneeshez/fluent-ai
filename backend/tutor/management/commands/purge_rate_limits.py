from django.core.management.base import BaseCommand
from django.utils import timezone

from tutor.models import RequestRateLimit


class Command(BaseCommand):
    help = "Delete expired hashed request-rate limit buckets."

    def handle(self, *args, **options):
        deleted, _ = RequestRateLimit.objects.filter(expires_at__lte=timezone.now()).delete()
        self.stdout.write(f"Deleted {deleted} expired rate-limit entries.")
