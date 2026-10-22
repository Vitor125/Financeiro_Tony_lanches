"""Verifica??o Firebase isolada das rotas e da persist?ncia financeira."""

import os
import threading

import firebase_admin
from firebase_admin import auth as firebase_auth
from firebase_admin.exceptions import FirebaseError
from google.auth.exceptions import GoogleAuthError

_firebase_app_lock = threading.Lock()


class AuthProviderUnavailable(Exception):
    pass


def _firebase_admin_app():
    project_id = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    if not project_id:
        raise RuntimeError("FIREBASE_PROJECT_ID não está configurado.")

    try:
        return firebase_admin.get_app()
    except ValueError:
        with _firebase_app_lock:
            try:
                return firebase_admin.get_app()
            except ValueError:
                return firebase_admin.initialize_app(options={"projectId": project_id})


def verify_firebase_token(token):
    try:
        admin_app = _firebase_admin_app()
    except (FirebaseError, GoogleAuthError, RuntimeError, ValueError) as exc:
        raise AuthProviderUnavailable from exc
    return firebase_auth.verify_id_token(token, app=admin_app, check_revoked=True)
