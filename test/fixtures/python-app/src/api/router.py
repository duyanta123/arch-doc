"""API routes."""
from fastapi import APIRouter
from auth.service import authenticate

router = APIRouter()


def get_user():
    return authenticate()
