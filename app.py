from functools import wraps
from pathlib import Path
import os
import re
import sqlite3

import requests
from flask import Flask, render_template, jsonify, request, redirect, url_for, session, flash
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / 'github_explorer.db'
GITHUB_API = 'https://api.github.com'

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get('SECRET_KEY', 'change-this-development-secret-before-deployment'),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
)

http = requests.Session()
http.headers.update({
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'GitHub-Explorer-Premium',
})


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def init_db():
    with db() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            full_name TEXT NOT NULL,
            snapshot TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, full_name)
        );
        CREATE TABLE IF NOT EXISTS searches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            query TEXT NOT NULL,
            searched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        ''')


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get('user_id'):
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Please sign in to continue.'}), 401
            return redirect(url_for('login'))
        return fn(*args, **kwargs)
    return wrapper


@app.get('/login')
def login():
    if session.get('user_id'):
        return redirect(url_for('index'))
    return render_template('auth.html', mode='login')


@app.post('/login')
def login_post():
    email = request.form.get('email', '').strip().lower()
    password = request.form.get('password', '')
    with db() as con:
        user = con.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
    if not user or not check_password_hash(user['password_hash'], password):
        flash('The email or password is incorrect.', 'error')
        return render_template('auth.html', mode='login', email=email), 401
    session.clear()
    session['user_id'] = user['id']
    session['user_name'] = user['name']
    session['user_email'] = user['email']
    return redirect(url_for('index'))


@app.get('/register')
def register():
    if session.get('user_id'):
        return redirect(url_for('index'))
    return render_template('auth.html', mode='register')


@app.post('/register')
def register_post():
    name = request.form.get('name', '').strip()
    email = request.form.get('email', '').strip().lower()
    password = request.form.get('password', '')
    if len(name) < 2 or len(name) > 60:
        flash('Please enter a name between 2 and 60 characters.', 'error')
        return render_template('auth.html', mode='register', name=name, email=email), 400
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        flash('Please enter a valid email address.', 'error')
        return render_template('auth.html', mode='register', name=name, email=email), 400
    if len(password) < 8:
        flash('Use a password with at least 8 characters.', 'error')
        return render_template('auth.html', mode='register', name=name, email=email), 400
    try:
        with db() as con:
            cur = con.execute(
                'INSERT INTO users(name, email, password_hash) VALUES (?, ?, ?)',
                (name, email, generate_password_hash(password))
            )
            user_id = cur.lastrowid
    except sqlite3.IntegrityError:
        flash('An account with that email already exists. Please sign in.', 'error')
        return render_template('auth.html', mode='register', name=name, email=email), 409
    session.clear()
    session['user_id'] = user_id
    session['user_name'] = name
    session['user_email'] = email
    return redirect(url_for('index'))


@app.post('/logout')
@login_required
def logout():
    session.clear()
    return redirect(url_for('login'))


@app.get('/')
@login_required
def index():
    return render_template('index.html')


@app.get('/api/me')
@login_required
def me():
    with db() as con:
        counts = con.execute('''SELECT
            (SELECT COUNT(*) FROM bookmarks WHERE user_id=?) AS bookmarks,
            (SELECT COUNT(*) FROM searches WHERE user_id=?) AS searches''',
            (session['user_id'], session['user_id'])).fetchone()
    return jsonify({'name': session.get('user_name'), 'email': session.get('user_email'),
                    'bookmark_count': counts['bookmarks'], 'search_count': counts['searches']})


@app.get('/api/bookmarks')
@login_required
def get_bookmarks():
    import json
    with db() as con:
        rows = con.execute('SELECT full_name, snapshot FROM bookmarks WHERE user_id=? ORDER BY created_at DESC',
                           (session['user_id'],)).fetchall()
    return jsonify([{'full_name': r['full_name'], 'snapshot': json.loads(r['snapshot'])} for r in rows])


@app.post('/api/bookmarks')
@login_required
def add_bookmark():
    import json
    data = request.get_json(silent=True) or {}
    repo = data.get('repository') or {}
    full_name = str(repo.get('full_name', '')).strip()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', full_name):
        return jsonify({'error': 'A valid repository is required.'}), 400
    with db() as con:
        con.execute('INSERT OR REPLACE INTO bookmarks(user_id, full_name, snapshot) VALUES (?, ?, ?)',
                    (session['user_id'], full_name, json.dumps(repo)))
    return jsonify({'ok': True})


@app.delete('/api/bookmarks/<path:full_name>')
@login_required
def remove_bookmark(full_name):
    with db() as con:
        con.execute('DELETE FROM bookmarks WHERE user_id=? AND full_name=?', (session['user_id'], full_name))
    return jsonify({'ok': True})


@app.post('/api/history')
@login_required
def save_search():
    data = request.get_json(silent=True) or {}
    query = str(data.get('query', '')).strip()[:300]
    if not query:
        return jsonify({'error': 'Search query is required.'}), 400
    with db() as con:
        con.execute('INSERT INTO searches(user_id, query) VALUES (?, ?)', (session['user_id'], query))
    return jsonify({'ok': True})


@app.get('/api/history')
@login_required
def get_history():
    with db() as con:
        rows = con.execute('SELECT query, searched_at FROM searches WHERE user_id=? ORDER BY id DESC LIMIT 30',
                           (session['user_id'],)).fetchall()
    return jsonify([dict(r) for r in rows])


@app.delete('/api/history')
@login_required
def clear_history():
    with db() as con:
        con.execute('DELETE FROM searches WHERE user_id=?', (session['user_id'],))
    return jsonify({'ok': True})


@app.get('/api/search')
@login_required
def search_repositories():
    query = request.args.get('q', 'stars:>1000').strip()[:300]
    sort = request.args.get('sort', 'stars')
    if sort not in {'stars', 'forks', 'updated', 'help-wanted-issues'}:
        sort = 'stars'
    order = request.args.get('order', 'desc')
    if order not in {'asc', 'desc'}:
        order = 'desc'
    try:
        page = max(1, min(int(request.args.get('page', 1)), 10))
        per_page = max(1, min(int(request.args.get('per_page', 24)), 100))
    except ValueError:
        return jsonify({'error': 'Invalid page settings.'}), 400
    try:
        response = http.get(f'{GITHUB_API}/search/repositories', params={
            'q': query, 'sort': sort, 'order': order, 'page': page, 'per_page': per_page
        }, timeout=15)
        if response.status_code == 403 and response.headers.get('X-RateLimit-Remaining') == '0':
            return jsonify({'error': 'GitHub API rate limit reached. Please wait a minute and try again.'}), 429
        response.raise_for_status()
        data = response.json()
        return jsonify({'total_count': data.get('total_count', 0), 'items': data.get('items', []),
                        'rate_limit_remaining': response.headers.get('X-RateLimit-Remaining')})
    except requests.RequestException:
        return jsonify({'error': 'GitHub is temporarily unavailable. Please try again.'}), 502


@app.get('/api/repository/<owner>/<repo>')
@login_required
def repository(owner, repo):
    try:
        response = http.get(f'{GITHUB_API}/repos/{owner}/{repo}', timeout=15)
        response.raise_for_status()
        return jsonify(response.json())
    except requests.RequestException:
        return jsonify({'error': 'Repository details could not be loaded.'}), 502


@app.get('/api/languages/<owner>/<repo>')
@login_required
def languages(owner, repo):
    try:
        response = http.get(f'{GITHUB_API}/repos/{owner}/{repo}/languages', timeout=15)
        response.raise_for_status()
        return jsonify(response.json())
    except requests.RequestException:
        return jsonify({'error': 'Language data could not be loaded.'}), 502


init_db()

if __name__ == '__main__':
    app.run(debug=False, port=5000)
