import os
import re
import json
import time
import requests
import pandas as pd
import numpy as np
import mysql.connector
from bs4 import BeautifulSoup
from googlesearch import search
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
try:
    import google.generativeai as genai
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False

print("🚀 STARTING DYNAMIC RECOVERY SCRIPT")

# --- 1. SETTINGS & LOADER ---
def load_creds(path):
    if os.path.exists(path):
        with open(path, 'r') as f: return json.load(f)
    return {}

db_creds = load_creds('postgres_credentials.json')
spotify_creds = load_creds('spotify_credentials.json')
gemini_creds = load_creds('gemini_credentials.json')

def get_conn():
    creds = {k: (v.strip() if isinstance(v, str) else v) for k, v in db_creds.items()}
    if 'sslmode' in creds: del creds['sslmode']
    return mysql.connector.connect(**creds)

def clean_for_mysql(v):
    if v is None: return None
    if isinstance(v, (float, np.floating)) and np.isnan(v): return None
    if isinstance(v, (np.integer, np.floating)): return v.item()
    return v

# --- 2. INITIALIZE SERVICES ---
headers = {}
if spotify_creds:
    try:
        res = requests.post('https://accounts.spotify.com/api/token', 
                            data={'grant_type': 'client_credentials', 
                                  'client_id': spotify_creds['client_id'], 
                                  'client_secret': spotify_creds['client_secret']})
        if res.status_code == 200:
            headers = {'Authorization': f'Bearer {res.json()["access_token"]}'}
            print("✅ Spotify Auth Success")
    except: print("⚠️ Spotify Auth Failed")

model = None
if HAS_GEMINI and gemini_creds:
    try:
        genai.configure(api_key=gemini_creds['api_key'])
        model = genai.GenerativeModel('gemini-2.5-flash')
        print("🤖 Gemini Configured")
    except: print("⚠️ Gemini Config Failed")

chrome_options = Options()
chrome_options.add_argument('--headless')
chrome_options.add_argument('--no-sandbox')
chrome_options.add_argument('--disable-dev-shm-usage')
driver = webdriver.Chrome(options=chrome_options)
print("🌐 Selenium Ready")

# --- 3. HELPER FUNCTIONS ---
def convert_string_to_number(s):
    if not s: return 0
    s = str(s).lower().strip()
    if ',' in s: return int(s.replace(',', ''))
    if 'k' in s: return int(float(s.replace('k', '')) * 1000)
    if 'm' in s: return int(float(s.replace('m', '')) * 1000000)
    if 'b' in s: return int(float(s.replace('b', '')) * 1000000000)
    try: return int(float(s))
    except: return 0

def get_first_search_result(query):
    try:
        results = list(search(query, num_results=1))
        return results[0] if results else None
    except: return None

# --- 4. SCRAPER CLASSES ---
class InstagramProfile:
    def __init__(self, artist, username=None):
        self.artist = artist
        self.username = username
        self.follower_count = 0
    def get_all(self):
        try:
            url = f'https://i.instagram.com/api/v1/users/web_profile_info/?username={self.username}'
            h = {'User-Agent': 'Mozilla/5.0', 'x-ig-app-id': '936619743392459'}
            r = requests.get(url, headers=h, timeout=10)
            if r.status_code == 200:
                self.follower_count = r.json()['data']['user']['edge_followed_by']['count']
                return
        except: pass
        sites = [f'https://livecounts.nl/instagram-realtime/?u={self.username}']
        for url in sites:
            try:
                driver.get(url); time.sleep(7)
                valid = []
                for _ in range(5):
                    try:
                        el = driver.find_element(By.CSS_SELECTOR, '.odometer-inside, .odometer')
                        val = convert_string_to_number(re.sub(r'[^0-9KMBkm.]', '', el.text))
                        if 1000 < val < 1000000000: valid.append(val)
                        if len(valid) >= 2 and abs(valid[-1] - valid[-2]) < (valid[-1] * 0.01):
                            self.follower_count = valid[-1]; return
                    except: pass
                    time.sleep(2)
                if valid: self.follower_count = int(sum(valid)/len(valid)); return
            except: pass

class TwitterProfile:
    def __init__(self, artist, username=None):
        self.artist = artist
        self.username = username
        self.follower_count = 0
    def get_all(self):
        try:
            driver.get(f'https://livecounts.nl/twitter-realtime/?u={self.username}')
            time.sleep(7)
            valid = []
            for _ in range(5):
                try:
                    el = driver.find_element(By.CSS_SELECTOR, '.odometer-inside, .odometer')
                    val = convert_string_to_number(re.sub(r'[^0-9KMBkm.]', '', el.text))
                    if 1000 < val < 300000000: valid.append(val)
                    if len(valid) >= 2 and abs(valid[-1] - valid[-2]) < (valid[-1] * 0.01):
                        self.follower_count = valid[-1]; return
                except: pass
                time.sleep(2)
            if valid: self.follower_count = int(sum(valid)/len(valid)); return
        except: pass

class SpotifyProfile:
    def __init__(self, artist, spotifyID=None):
        self.artist = artist
        self.spotifyID = spotifyID
        self.followers = 0
        self.listens = 0
        self.popularity = 0
        self.genre = None
    def get_all(self):
        if not self.spotifyID: return
        if headers:
            try:
                r = requests.get(f'https://api.spotify.com/v1/artists/{self.spotifyID}', headers=headers, timeout=10)
                if r.status_code == 200:
                    res = r.json()
                    self.followers = res['followers']['total']
                    self.popularity = res['popularity']
                    if res.get('genres'): self.genre = res['genres'][0]
            except: pass
        try:
            url = f'https://open.spotify.com/artist/{self.spotifyID}'
            h = {'User-Agent': 'Mozilla/5.0'}
            r = requests.get(url, headers=h, timeout=10)
            m = re.search(r'([\d,.]+[KMB]?)\s*monthly listeners', r.text, re.I)
            if m: self.listens = convert_string_to_number(m.group(1))
        except: pass

class StubhubProfile:
    def __init__(self, artist, url=None):
        self.artist = artist
        self.url = url
        self.favourites = 0
    def get_all(self):
        if not self.url or 'stubhub' not in self.url: return
        try:
            driver.get(self.url); time.sleep(5)
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            m = re.search(r'([\d,.]+)\s*favorited', soup.get_text(), re.I)
            if m: self.favourites = convert_string_to_number(m.group(1))
        except: pass

# --- 5. MAIN PROCESSING ---
def main():
    fails_path = 'failed_scrapes.csv'
    if not os.path.exists(fails_path):
        print("❌ No failed_scrapes.csv found."); return

    fails_df = pd.read_csv(fails_path)
    if fails_df.empty: 
        print("✨ No failures to process."); return
        
    print(f"📊 Processing {len(fails_df)} entries from {fails_path}...")

    conn = get_conn()
    artist_names = fails_df['Artist'].unique().tolist()
    format_strings = ','.join(['%s'] * len(artist_names))
    query = f"SELECT * FROM ARTISTS WHERE name IN ({format_strings})"
    
    with conn.cursor(dictionary=True) as cur:
        cur.execute(query, tuple(artist_names))
        db_rows = {r['name']: r for r in cur.fetchall()}

    remaining_failures = []

    for _, fail_row in fails_df.iterrows():
        name = fail_row['Artist']
        details = str(fail_row['Details'])
        
        if name not in db_rows: 
            print(f"⚠️ {name} not in DB. Skipping."); continue
            
        row = db_rows[name]
        start_t = time.time()
        
        # Init with current DB data
        ig = InstagramProfile(name, row.get('instagram_username'))
        ig.follower_count = row.get('instagram_followers', 0) or 0
        sp = SpotifyProfile(name, row.get('spotify_id'))
        sp.followers = row.get('spotify_followers', 0) or 0
        sp.listens = row.get('spotify_listeners', 0) or 0
        sp.popularity = row.get('spotify_popularity', 0) or 0
        sp.genre = row.get('spotify_genre')
        tw = TwitterProfile(name, row.get('twitter_username'))
        tw.follower_count = row.get('twitter_followers', 0) or 0
        sh = StubhubProfile(name, row.get('stubhub_url'))
        sh.favourites = row.get('stubhub_favourites', 0) or 0
        
        # Track what still fails
        failed_now = []
        retried = []
        
        if 'IG' in details:
            retried.append('IG')
            ig.get_all()
            if ig.follower_count == 0: failed_now.append('IG: Got 0')
        if 'Spotify' in details:
            retried.append('Spotify')
            sp.get_all()
            if sp.followers == 0: failed_now.append('Spotify Fol: Got 0')
            if sp.listens == 0: failed_now.append('Spotify Lis: Got 0')
        if 'Twitter' in details:
            retried.append('Twitter')
            tw.get_all()
            if tw.follower_count == 0: failed_now.append('Twitter: Got 0')
        if 'Stubhub' in details:
            retried.append('Stubhub')
            sh.get_all()
            if sh.favourites == 0: failed_now.append('Stubhub: Got 0')
            
        # Update DB
        try:
            u_vals = (ig.follower_count, sp.followers, sp.listens, sp.popularity, sp.genre, tw.follower_count, sh.favourites, name)
            u_vals = tuple(clean_for_mysql(x) for x in u_vals)
            with conn.cursor() as cur:
                cur.execute("UPDATE ARTISTS SET instagram_followers=%s, spotify_followers=%s, spotify_listeners=%s, spotify_popularity=%s, spotify_genre=%s, twitter_followers=%s, stubhub_favourites=%s, updated_at=CURRENT_TIMESTAMP WHERE name=%s", u_vals)
                conn.commit()
            
            elapsed = time.time() - start_t
            if not failed_now:
                print(f"✅ [RECOVERED] {name:<25} | {elapsed:.1f}s | Fixed: {', '.join(retried)}")
            else:
                print(f"⚠️ [PARTIAL] {name:<27} | {elapsed:.1f}s | Still Missing: {', '.join(failed_now)}")
                remaining_failures.append({'Artist': name, 'Status': 'Warning', 'Details': ", ".join(failed_now)})
        except Exception as e:
            print(f"❌ [FAILED] {name}: {e}")
            remaining_failures.append(fail_row.to_dict())

    # Update the CSV file
    if remaining_failures:
        pd.DataFrame(remaining_failures).to_csv(fails_path, index=False)
        print(f"\n📁 Updated {fails_path}. {len(remaining_failures)} entries remain.")
    else:
        if os.path.exists(fails_path): os.remove(fails_path)
        print(f"\n✨ ALL FAILURES RECOVERED! {fails_path} has been removed.")

    conn.close(); driver.quit()

if __name__ == "__main__":
    main()
