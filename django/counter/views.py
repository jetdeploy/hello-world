import logging

from django.db import transaction
from django.shortcuts import render

from .models import Visit

logger = logging.getLogger(__name__)


def home(request):
    with transaction.atomic():
        Visit.objects.create()
        count = Visit.objects.count()
    logger.info("home view served visit %s", count)
    return render(request, "counter/home.html", {"count": count})
