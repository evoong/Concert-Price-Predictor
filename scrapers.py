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

# --- GLOBAL VARIABLES TO BE SET BY CALLER ---
driver = None
model = None
headers = {}

def set_globals(d, m, h):
    global driver, model, headers
    driver = d
    model = m
    headers = h

# --- UTILITY FUNCTIONS ---
def convert_string_to_number(s):
    if not s: return 0
    s = str(s).lower().strip()
    if ',' in s: return int(s.replace(',', ''))
    if 'k' in s: return int(float(s.replace('k', '')) * 1000)
    if 'm' in s: return int(float(s.replace('m', '')) * 1000000)
    if 'b' in s: return int(float(s.replace('b', '')) * 1000000000)
    try: return int(float(s))
    except: return 0

def clean_for_mysql(v):
    if v is None: return None
    if isinstance(v, (float, np.floating)) and np.isnan(v): return None
    if isinstance(v, (np.integer, np.floating)): return v.item()
    if isinstance(v, str) and v.lower() == 'nan': return None
    return v

def get_first_search_result(query):
    try:
        driver.get(f"https://www.google.com/search?q={query}")
        time.sleep(2)
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        res = soup.find('div', class_='g')
        if res and res.find('a'): return res.find('a')['href']
    except: pass
    
    try:
        driver.get(f"https://www.bing.com/search?q={query}")
        time.sleep(2)
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        res = soup.find('li', class_='b_algo')
        if res and res.find('a'): return res.find('a')['href']
    except: pass
    
    try:
        driver.get(f"https://search.yahoo.com/search?p={query}")
        time.sleep(2)
        soup = BeautifulSoup(driver.page_source, 'html.parser')
        res = soup.find('div', class_=re.compile(r'algo-sr|dd\\s+algo'))
        if res and res.find('a'): return res.find('a')['href']
    except: pass
    
    try:
        results = list(search(query, num_results=1))
        if results: return results[0]
    except: pass
    return None

# --- SCRAPER CLASSES ---
class InstagramProfile:
    def __init__(self, artist, username=None):
        self.artist = artist
        self.username = username
        self.follower_count = 0

    def get_username(self):
        if self.username: return self.username
        url = get_first_search_result(f'instagram {self.artist} official')
        if url:
            match = re.search(r'instagram\.com/([^/?]+)', url)
            if match and match.group(1) not in ['p', 'reels', 'stories']: 
                self.username = match.group(1)
        return self.username

    def _try_api(self):
        try:
            url = f'https://i.instagram.com/api/v1/users/web_profile_info/?username={self.username}'
            h = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'x-ig-app-id': '936619743392459'}
            r = requests.get(url, headers=h, timeout=10)
            if r.status_code == 200:
                self.follower_count = r.json()['data']['user']['edge_followed_by']['count']
                return True
        except: pass
        return False

    def _try_specialized(self):
        sites = [
            f'https://livecounts.nl/instagram-realtime/?u={self.username}',
            f'https://instastatistics.com/{self.username}'
        ]
        for url in sites:
            try:
                driver.get(url)
                time.sleep(7)
                valid_readings = []
                for i in range(5):
                    try:
                        try:
                            el = driver.find_element(By.CSS_SELECTOR, '.odometer-inside')
                        except:
                            el = driver.find_element(By.CSS_SELECTOR, '.odometer')
                        
                        if el:
                            txt = el.text
                            val = convert_string_to_number(re.sub(r'[^0-9KMBkm.]', '', txt))
                            if 1000 < val < 1000000000:
                                valid_readings.append(val)
                            if len(valid_readings) >= 2:
                                if abs(valid_readings[-1] - valid_readings[-2]) < (valid_readings[-1] * 0.01):
                                    self.follower_count = valid_readings[-1]
                                    return True
                    except: pass
                    time.sleep(2)
                if valid_readings:
                    self.follower_count = int(sum(valid_readings) / len(valid_readings))
                    return True
            except: pass
        return False

    def _try_selenium(self):
        try:
            driver.get(f'https://www.instagram.com/{self.username}/')
            time.sleep(5)
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            meta = soup.find('meta', attrs={'property': 'og:description'})
            if meta:
                content = meta.get('content', '')
                match = re.search(r'([\d,.]+[KMB]?)\s*Followers', content, re.I)
                if match: 
                    val = convert_string_to_number(match.group(1))
                    if 0 < val < 2000000000:
                        self.follower_count = val
                        return True
            if self.follower_count == 0:
                texts = soup.find_all(string=re.compile(r'Followers', re.I))
                for t in texts:
                    container = t.parent
                    full_text = container.get_text()
                    matches = re.findall(r'([\d,.]+[KMB]?)', full_text)
                    for m in matches:
                        v = convert_string_to_number(m)
                        if 1000 < v < 2000000000:
                            self.follower_count = v
                            return True
            return self.follower_count > 0
        except: pass
        return False

    def _try_gemini(self):
        if not model: return False
        try:
            prompt = f'Current Instagram follower count for {self.artist} (@{self.username})? Reply with ONE integer only.'
            r = model.generate_content(prompt)
            num = re.sub(r'\D', '', r.text)
            if num: self.follower_count = int(num); return True
        except: pass
        return False

    def __str__(self):
        return (f"Artist: {self.artist}\n"
                f"Instagram Username: {self.username}\n"
                f"Followers: {self.follower_count:,}")

    def __repr__(self):
        return f"<InstagramProfile(artist='{self.artist}', username='{self.username}', followers={self.follower_count})>"

    def get_all(self):
        if not self.get_username(): return None, 0
        if self._try_api(): return self.username, self.follower_count
        if self._try_specialized(): return self.username, self.follower_count 
        if self._try_selenium(): return self.username, self.follower_count
        self._try_gemini()
        return self.username, self.follower_count

class TwitterProfile:
    def __init__(self, artist, username=None):
        self.artist = artist
        self.username = username
        self.follower_count = 0

    def get_username(self):
        if self.username: return self.username
        url = get_first_search_result(f'twitter {self.artist} official')
        if url:
            match = re.search(r'(?:twitter|x)\.com/([^/?]+)', url)
            if match and match.group(1) not in ['intent', 'share', 'search', 'i', 'x']: 
                self.username = match.group(1)
        return self.username

    def _try_verified(self):
        try:
            driver.get(f'https://x.com/{self.username}/verified_followers')
            time.sleep(5)
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            els = soup.find_all('a', href=re.compile(r'/verified_followers$'))
            for el in els:
                if 'Follower' in el.get_text():
                    match = re.search(r'([\d,.]+[KMB]?)', el.get_text(), re.I)
                    if match: 
                        val = convert_string_to_number(match.group(1))
                        if 0 < val < 200000000:
                            self.follower_count = val; return True
        except: pass
        return False

    def _try_specialized(self):
        sites = [
            f'https://livecounts.nl/twitter-realtime/?u={self.username}', 
            f'https://livecounts.io/twitter-live-follower-counter/{self.username}'
        ]
        for url in sites:
            try:
                driver.get(url); time.sleep(7)
                valid_readings = []
                for i in range(5):
                    try:
                        try:
                            el = driver.find_element(By.CSS_SELECTOR, '.odometer-inside')
                        except:
                            el = driver.find_element(By.CSS_SELECTOR, '.followers-odometer, .odometer')
                        if el:
                            val = convert_string_to_number(re.sub(r'[^0-9KMBkm.]', '', el.text))
                            if 1000 < val < 300000000: valid_readings.append(val)
                            if len(valid_readings) >= 2:
                                if abs(valid_readings[-1] - valid_readings[-2]) < (valid_readings[-1] * 0.01):
                                    self.follower_count = valid_readings[-1]; return True
                    except: pass
                    time.sleep(2)
                if valid_readings:
                    self.follower_count = int(sum(valid_readings) / len(valid_readings))
                    return True
            except: pass
        return False

    def _try_selenium_profile(self):
        try:
            driver.get(f'https://x.com/{self.username}')
            time.sleep(5)
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            txt = soup.get_text()
            matches = re.findall(r'([\d,.]+[KMB]?)\s*Followers', txt, re.I)
            candidates = [convert_string_to_number(m) for m in matches if 1000 < convert_string_to_number(m) < 200000000]
            if candidates: self.follower_count = max(candidates); return True
        except: pass
        return False

    def _try_google_snippet(self):
        try:
            u = f'https://www.google.com/search?q=twitter+{self.username}+followers'
            driver.get(u); time.sleep(2)
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            match = re.search(r'([\d,.]+[KMB]?)\s*Followers', soup.get_text(), re.I)
            if match:
                 val = convert_string_to_number(match.group(1))
                 if 1000 < val < 200000000: self.follower_count = val; return True
        except: pass
        return False

    def _try_gemini(self):
        if not model: return False
        try:
            prompt = f'Current Twitter follower count for {self.artist} (@{self.username})? Reply with ONE integer only.'
            r = model.generate_content(prompt)
            num = re.sub(r'\D', '', r.text)
            if num: self.follower_count = int(num); return True
        except: pass
        return False

    def __str__(self):
        return (f"Artist: {self.artist}\n"
                f"Twitter Username: {self.username}\n"
                f"Followers: {self.follower_count:,}")

    def __repr__(self):
        return f"<TwitterProfile(artist='{self.artist}', username='{self.username}', followers={self.follower_count})>"

    def get_all(self):
        if not self.get_username(): return None, 0
        if self._try_verified():
             if self.follower_count > 50000000: return self.username, self.follower_count
        if self._try_specialized(): return self.username, self.follower_count
        if self._try_selenium_profile(): return self.username, self.follower_count
        if self._try_google_snippet(): return self.username, self.follower_count
        self._try_gemini()
        return self.username, self.follower_count

class SpotifyProfile:
    def __init__(self, artist, spotifyID=None, genre=None):
        self.artist = artist
        self.spotifyID = spotifyID
        self.genre = genre
        self.followers = 0
        self.popularity = 0
        self.listens = 0
        self.url = None

    def get_id(self):
        if self.spotifyID: return
        if headers:
            try:
                r = requests.get(f'https://api.spotify.com/v1/search?q=artist:{self.artist}&type=artist&limit=1', headers=headers, timeout=10)
                if r.status_code == 200:
                    items = r.json()['artists']['items']
                    if items: self.spotifyID = items[0]['id']
            except: pass
        if not self.spotifyID:
            u = get_first_search_result(f'spotify artist {self.artist}')
            if u:
                m = re.search(r'artist/([a-zA-Z0-9]+)', u)
                if m: self.spotifyID = m.group(1)

    def get_stats(self):
        if not self.spotifyID: return
        if headers:
            try:
                r = requests.get(f'https://api.spotify.com/v1/artists/{self.spotifyID}', headers=headers, timeout=10)
                if r.status_code == 200:
                    res = r.json()
                    self.followers = res['followers']['total']
                    self.popularity = res['popularity']
                    if res.get('genres'): self.genre = res['genres'][0]
                    if 'external_urls' in res: self.url = res['external_urls'].get('spotify')
            except: pass
        
        if not self.url: self.url = f'https://open.spotify.com/artist/{self.spotifyID}'
        if not self.url.startswith('http'): self.url = 'https://' + self.url
        
        try:
            h = {'User-Agent': 'Mozilla/5.0'}
            r = requests.get(self.url, headers=h, timeout=10)
            soup = BeautifulSoup(r.content, 'html.parser')
            meta = soup.find('meta', attrs={'property': 'og:description'})
            if meta:
                m = re.search(r'([\d,.]+[KMB]?)\s*monthly listeners', meta.get('content',''), re.I)
                if m: self.listens = convert_string_to_number(m.group(1))
        except: pass
        
        if self.listens == 0:
            try:
                driver.get(self.url); time.sleep(5)
                soup = BeautifulSoup(driver.page_source, 'html.parser')
                meta = soup.find('meta', attrs={'property': 'og:description'})
                if meta:
                    m = re.search(r'([\d,.]+[KMB]?)\s*monthly listeners', meta.get('content',''), re.I)
                    if m: self.listens = convert_string_to_number(m.group(1))
                if self.listens == 0:
                     m = re.search(r'([\d,.]+[KMB]?)\s*monthly listeners', soup.get_text(), re.I)
                     if m: self.listens = convert_string_to_number(m.group(1))
            except: pass

    def __str__(self):
        return (f"Artist: {self.artist}\n"
                f"Spotify ID: {self.spotifyID}\n"
                f"Genre: {self.genre}\n"
                f"Followers: {self.followers:,}\n"
                f"Popularity: {self.popularity}\n"
                f"Monthly Listeners: {self.listens:,}")

    def __repr__(self):
        return f"<SpotifyProfile(artist='{self.artist}', id='{self.spotifyID}', followers={self.followers})>"

    def get_all(self):
        self.get_id()
        self.get_stats()
        return self.spotifyID, self.genre, self.followers, self.popularity, self.listens

class StubhubProfile:
    def __init__(self, artist, url=None):
        self.artist = artist
        self.url = url
        self.favourites = 0

    def get_url(self):
        if self.url: return self.url
        u = get_first_search_result(f'stubhub {self.artist} tickets performer')
        if u:
            match = re.search(r'stubhub\.(ca|com)/([^?\s]+)', u)
            if match: self.url = '/' + match.group(2)
        return self.url

    def _scrape(self):
        target_urls = [self.url] if self.url and self.url.startswith('http') else [f'https://www.{d}{self.url}' for d in ['stubhub.ca', 'stubhub.com']]
        for u in target_urls:
            try:
                driver.get(u); time.sleep(5)
                soup = BeautifulSoup(driver.page_source, 'html.parser')
                candidates = soup.find_all(string=re.compile(r'^\s*\d+(?:\.\d+)?[KMB]?\s*$'))
                for candidate in candidates:
                    curr = candidate.parent
                    for _ in range(4):
                        if curr and (curr.find('svg') or curr.find('path')):
                             val = convert_string_to_number(candidate.strip())
                             if val > 0: return val
                        if curr: curr = curr.parent
                tag = soup.find(string=re.compile(r'Favorites|Favourites', re.I))
                if tag:
                    m = re.search(r'([\d,.]+[KMB]?)', tag.parent.get_text() + ' ' + (tag.parent.parent.get_text() if tag.parent.parent else ''))
                    if m: 
                        val = convert_string_to_number(m.group(1))
                        if val > 0: return val
                script = soup.find('script', {'id': 'index-data', 'type': 'application/json'})
                if script and script.string:
                    data = json.loads(script.string)
                    val = data.get('performer', {}).get('favorites', 0) or data.get('performerSummary', {}).get('favorites', 0)
                    if val > 0: return val
            except: pass
        return 0

    def __str__(self):
        return (f"Artist: {self.artist}\n"
                f"Stubhub URL: {self.url}\n"
                f"Favourites: {self.favourites:,}")

    def __repr__(self):
        return f"<StubhubProfile(artist='{self.artist}', url='{self.url}', favourites={self.favourites})>"

    def get_all(self):
        if not self.get_url(): return None, 0
        self.favourites = self._scrape()
        return self.url, self.favourites
