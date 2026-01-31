import sys
import json
import os
import scrapers
import mysql.connector
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

# --- LOADER ---
def load_creds(path):
    if os.path.exists(path):
        with open(path, 'r') as f: return json.load(f)
    return {}

def get_conn():
    db_creds = load_creds('postgres_credentials.json')
    creds = {k: (v.strip() if isinstance(v, str) else v) for k, v in db_creds.items()}
    if 'sslmode' in creds: del creds['sslmode']
    return mysql.connector.connect(**creds)

def refresh_artist(artist_name):
    print(f"🔄 Refreshing: {artist_name}")
    
    # 1. Init Selenium & Gemini
    chrome_options = Options()
    chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    
    # Check for Chromium binary (Docker)
    if os.environ.get('CHROME_BIN'):
        chrome_options.binary_location = os.environ.get('CHROME_BIN')
        
    driver = webdriver.Chrome(options=chrome_options)
    
    model = None
    gemini_creds = load_creds('gemini_credentials.json')
    if gemini_creds:
        try:
            from google import genai
            client = genai.Client(api_key=gemini_creds['api_key'])
            model = client.models.get('gemini-2.5-flash')
        except: pass
        
    # Spotify Headers
    headers = {}
    sp_creds = load_creds('spotify_credentials.json')
    if sp_creds:
        try:
            import requests
            res = requests.post('https://accounts.spotify.com/api/token', 
                                data={'grant_type': 'client_credentials', 
                                      'client_id': sp_creds['client_id'], 
                                      'client_secret': sp_creds['client_secret']})
            if res.status_code == 200:
                headers = {'Authorization': f'Bearer {res.json()["access_token"]}'}
        except: pass

    scrapers.set_globals(driver, model, headers)
    
    last_error = None
    try:
        conn = get_conn()
        with conn.cursor(dictionary=True) as cur:
            cur.execute("SELECT * FROM ARTISTS WHERE name = %s", (artist_name,))
            row = cur.fetchone()
            
        if not row:
            print(f"❌ Artist {artist_name} not found in database.")
            return

        # Scrape
        try:
            ig = scrapers.InstagramProfile(artist_name, row.get('instagram_username'))
            ig.get_all()
        except Exception as e:
            print(f"IG Error: {e}")
            last_error = f"IG: {str(e)}"
        
        try:
            tw = scrapers.TwitterProfile(artist_name, row.get('twitter_username'))
            tw.get_all()
        except Exception as e:
            print(f"Twitter Error: {e}")
            last_error = (last_error + " | " if last_error else "") + f"Tw: {str(e)}"
            
        try:
            sp = scrapers.SpotifyProfile(artist_name, row.get('spotify_id'))
            sp.get_all()
        except Exception as e:
            print(f"Spotify Error: {e}")
            last_error = (last_error + " | " if last_error else "") + f"Sp: {str(e)}"
            
        try:
            sh = scrapers.StubhubProfile(artist_name, row.get('stubhub_url'))
            sh.get_all()
        except Exception as e:
            print(f"Stubhub Error: {e}")
            last_error = (last_error + " | " if last_error else "") + f"Sh: {str(e)}"
        
        # Save
        # Even if some scrapers failed, we save what we got and the error log
        q = """
            UPDATE ARTISTS SET 
                instagram_followers = %s,
                spotify_followers = %s,
                spotify_listeners = %s,
                spotify_popularity = %s,
                twitter_followers = %s,
                stubhub_favourites = %s,
                last_error = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE name = %s
        """
        v = (
            scrapers.clean_for_mysql(ig.follower_count) if 'ig' in locals() else None,
            scrapers.clean_for_mysql(sp.followers) if 'sp' in locals() else None,
            scrapers.clean_for_mysql(sp.listens) if 'sp' in locals() else None,
            scrapers.clean_for_mysql(sp.popularity) if 'sp' in locals() else None,
            scrapers.clean_for_mysql(tw.follower_count) if 'tw' in locals() else None,
            scrapers.clean_for_mysql(sh.favourites) if 'sh' in locals() else None,
            last_error,
            artist_name
        )
        
        with conn.cursor() as cur:
            cur.execute(q, v)
            conn.commit()
            
        if last_error:
            print(f"⚠️ Partial Success: Updated {artist_name} with errors: {last_error}")
        else:
            print(f"✅ Success: Updated {artist_name}")
            
    except Exception as e:
        error_msg = f"Fatal Scraper Error: {str(e)}"
        print(f"❌ {error_msg}")
        try:
            # Try to log fatal error to DB
            cur.execute("UPDATE ARTISTS SET last_error = %s WHERE name = %s", (error_msg, artist_name))
            conn.commit()
        except: pass
    finally:
        driver.quit()
        if 'conn' in locals(): conn.close()

def refresh_artist_column(artist_name, source, allow_fallback=True):
    """Refresh only a specific data source for an artist. Falls back to full refresh on failure."""
    print(f"🔄 Refreshing {source} for: {artist_name}")

    chrome_options = Options()
    chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')

    if os.environ.get('CHROME_BIN'):
        chrome_options.binary_location = os.environ.get('CHROME_BIN')

    driver = webdriver.Chrome(options=chrome_options)

    model = None
    gemini_creds = load_creds('gemini_credentials.json')
    if gemini_creds:
        try:
            from google import genai
            client = genai.Client(api_key=gemini_creds['api_key'])
            model = client.models.get('gemini-2.5-flash')
        except: pass

    headers = {}
    if source == 'spotify':
        sp_creds = load_creds('spotify_credentials.json')
        if sp_creds:
            try:
                import requests
                res = requests.post('https://accounts.spotify.com/api/token',
                                    data={'grant_type': 'client_credentials',
                                          'client_id': sp_creds['client_id'],
                                          'client_secret': sp_creds['client_secret']})
                if res.status_code == 200:
                    headers = {'Authorization': f'Bearer {res.json()["access_token"]}'}
            except: pass

    scrapers.set_globals(driver, model, headers)

    last_error = None
    scrape_failed = False

    def upsert_now(update_parts, values, error_msg=None):
        """Immediately save values to DB."""
        try:
            conn = get_conn()
            update_parts.append("last_error = %s")
            update_parts.append("updated_at = CURRENT_TIMESTAMP")
            values.append(error_msg)
            values.append(artist_name)
            q = f"UPDATE ARTISTS SET {', '.join(update_parts)} WHERE name = %s"
            with conn.cursor() as cur:
                cur.execute(q, tuple(values))
                conn.commit()
            conn.close()
            print(f"✅ Saved {source} for {artist_name}")
            return True
        except Exception as e:
            print(f"❌ DB save error: {e}")
            return False

    try:
        conn = get_conn()
        with conn.cursor(dictionary=True) as cur:
            cur.execute("SELECT * FROM ARTISTS WHERE name = %s", (artist_name,))
            row = cur.fetchone()
        conn.close()

        if not row:
            print(f"❌ Artist {artist_name} not found in database.")
            return

        if source == 'instagram':
            try:
                ig = scrapers.InstagramProfile(artist_name, row.get('instagram_username'))
                ig.get_all()
                val = scrapers.clean_for_mysql(ig.follower_count)
                if val is not None:
                    upsert_now(["instagram_followers = %s"], [val])
                else:
                    scrape_failed = True
                    last_error = "IG: No value returned"
            except Exception as e:
                last_error = f"IG: {str(e)}"
                scrape_failed = True

        elif source == 'twitter':
            try:
                tw = scrapers.TwitterProfile(artist_name, row.get('twitter_username'))
                tw.get_all()
                val = scrapers.clean_for_mysql(tw.follower_count)
                if val is not None:
                    upsert_now(["twitter_followers = %s"], [val])
                else:
                    scrape_failed = True
                    last_error = "Tw: No value returned"
            except Exception as e:
                last_error = f"Tw: {str(e)}"
                scrape_failed = True

        elif source == 'spotify':
            try:
                sp = scrapers.SpotifyProfile(artist_name, row.get('spotify_id'))
                sp.get_all()
                followers = scrapers.clean_for_mysql(sp.followers)
                listeners = scrapers.clean_for_mysql(sp.listens)
                popularity = scrapers.clean_for_mysql(sp.popularity)
                # Save immediately if we got any values
                if followers is not None or listeners is not None or popularity is not None:
                    upsert_now(
                        ["spotify_followers = %s", "spotify_listeners = %s", "spotify_popularity = %s"],
                        [followers, listeners, popularity]
                    )
                else:
                    scrape_failed = True
                    last_error = "Sp: No values returned"
            except Exception as e:
                last_error = f"Sp: {str(e)}"
                scrape_failed = True

        elif source == 'stubhub':
            try:
                sh = scrapers.StubhubProfile(artist_name, row.get('stubhub_url'))
                sh.get_all()
                val = scrapers.clean_for_mysql(sh.favourites)
                if val is not None:
                    upsert_now(["stubhub_favourites = %s"], [val])
                else:
                    scrape_failed = True
                    last_error = "Sh: No value returned"
            except Exception as e:
                last_error = f"Sh: {str(e)}"
                scrape_failed = True

        if last_error:
            print(f"⚠️ Error: {last_error}")

    except Exception as e:
        print(f"❌ Fatal Error: {str(e)}")
        scrape_failed = True
    finally:
        driver.quit()

    # Fallback to full refresh if column-specific scrape failed
    if scrape_failed and allow_fallback:
        print(f"🔄 Falling back to full refresh for {artist_name}...")
        refresh_artist(artist_name)

if __name__ == "__main__":
    if len(sys.argv) > 2:
        # Column-specific refresh: python3 api_scraper.py <artist_name> <source>
        source = sys.argv[-1].lower()
        artist_name = " ".join(sys.argv[1:-1])
        if source in ['instagram', 'twitter', 'spotify', 'stubhub']:
            refresh_artist_column(artist_name, source)
        else:
            refresh_artist(" ".join(sys.argv[1:]))
    elif len(sys.argv) > 1:
        refresh_artist(" ".join(sys.argv[1:]))
    else:
        print("Usage: python3 api_scraper.py <artist_name> [source]")
