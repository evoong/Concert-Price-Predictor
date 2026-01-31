from flask import Flask, jsonify, request
import mysql.connector
import json
import os
import subprocess
from datetime import datetime

app = Flask(__name__, static_folder='static', static_url_path='')

def load_creds(path):
    if os.path.exists(path):
        with open(path, 'r') as f: return json.load(f)
    return {}

def get_db_conn():
    db_creds = load_creds('postgres_credentials.json')
    creds = {k: (v.strip() if isinstance(v, str) else v) for k, v in db_creds.items()}
    if 'sslmode' in creds: del creds['sslmode']
    return mysql.connector.connect(**creds)

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/artists', methods=['GET'])
def get_artists():
    try:
        conn = get_db_conn()
        with conn.cursor(dictionary=True) as cur:
            cur.execute("SELECT * FROM ARTISTS ORDER BY updated_at DESC")
            rows = cur.fetchall()
        conn.close()
        
        # Format timestamps for JSON
        for row in rows:
            if row['updated_at']:
                row['updated_at'] = row['updated_at'].strftime('%Y-%m-%d %H:%M:%S')
                
        return jsonify(rows)
    except Exception as e:
        print(f"❌ Database error: {e}")
        return jsonify({"error": f"Database connection failed: {str(e)}"}), 500

@app.route('/api/refresh', methods=['POST'])
def refresh_artist():
    data = request.json
    artist_name = data.get('name')
    if not artist_name:
        return jsonify({"error": "Artist name required"}), 400
        
    try:
        # Run the scraper script in the background
        # Note: In a production environment, this should be a task queue (e.g. Celery)
        # For this demo, we'll run it and return success immediately if it starts
        subprocess.Popen(['python3', 'api_scraper.py', artist_name])
        return jsonify({"message": f"Refresh triggered for {artist_name}"}), 202
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/update_artist', methods=['POST'])
def update_artist():
    data = request.json
    artist_name = data.get('name')
    if not artist_name:
        return jsonify({"error": "Artist name required"}), 400
        
    # List of allowed fields to update
    id_fields = ['instagram_username', 'spotify_id', 'twitter_username', 'stubhub_url', 'spotify_genre']
    num_fields = ['instagram_followers', 'spotify_followers', 'spotify_listeners', 'spotify_popularity', 'twitter_followers', 'stubhub_favourites']
    
    update_parts = []
    params = []
    
    for f in id_fields:
        if f in data:
            update_parts.append(f"{f} = %s")
            params.append(data[f])
            
    for f in num_fields:
        if f in data:
            update_parts.append(f"{f} = %s")
            # Ensure numeric conversion or None
            val = data[f]
            if val == '' or val is None:
                params.append(None)
            else:
                try: params.append(float(val))
                except: params.append(None)

    if not update_parts:
        return jsonify({"error": "No fields to update"}), 400

    params.append(artist_name)
    q = f"UPDATE ARTISTS SET {', '.join(update_parts)}, updated_at = CURRENT_TIMESTAMP WHERE name = %s"
    
    try:
        conn = get_db_conn()
        with conn.cursor() as cur:
            cur.execute(q, tuple(params))
            conn.commit()
        conn.close()
        return jsonify({"message": "Artist updated successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
