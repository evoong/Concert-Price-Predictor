#!/bin/bash
echo "🚀 Starting Socials Manager natively..."

# Kill any existing flask processes on 5001
lsof -ti:5001 | xargs kill -9 2>/dev/null

# Ensure dependencies are up to date
pip install -r requirements_web.txt

# Start the Flask app
python3 app.py
