import os
import requests
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request

SCOPES = ['https://www.googleapis.com/auth/photospicker.mediaitems.readonly']

def authenticate():
    creds = None

    # if token.json exists, load it
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)

    # if no valid credentials, log in
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=8080, access_type='offline', prompt='consent')

        # save for next time
        with open('token.json', 'w') as f:
            f.write(creds.to_json())

    return creds

creds = authenticate()
print("authenticated successfully")