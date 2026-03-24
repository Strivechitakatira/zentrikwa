"""
Pytest configuration and shared fixtures.
Run tests: pytest tests/ -v
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)
