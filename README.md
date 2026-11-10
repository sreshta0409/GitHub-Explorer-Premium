# GitHub Explorer Premium

🚀 **Live Demo:** https://github-explorer-premium.onrender.com

A premium multi-user GitHub Explorer with a modern interface.



# GitHub Explorer — Obsidian Edition

A premium dark-wine GitHub intelligence dashboard powered by Flask, SQLite and the live GitHub REST API. The original discovery interface and visual style are retained, with account-based workspaces added.

## Run locally on Windows PowerShell

1. Install Python 3.10 or newer.
2. Open PowerShell in this project folder.
3. Install the packages:

   ```powershell
   py -m pip install -r requirements.txt
   ```

4. Start the application:

   ```powershell
   py app.py
   ```

5. Open http://127.0.0.1:5000. The first visit takes you to the sign-in page. Choose **Create an account** to register.

## Accounts and personal workspaces

- Register with a name, email address and password (minimum 8 characters).
- Sign in with the same email and password whenever you return.
- Passwords are stored as secure password hashes, not plain text.
- Each account has its own saved repositories and recent search history.
- Signing out does not delete your account data. Sign back in to see it again.
- SQLite creates `github_explorer.db` automatically on first run.

## Features

- Live GitHub repository search, sorting and language filters.
- Repository detail modal with live metadata and language composition.
- Per-account bookmarks stored in SQLite.
- Per-account search history, including a clear-history action.
- Personal workspace identity and sign-out.
- Responsive layout, animated charts, keyboard-friendly controls and reduced-motion support.

## Notes

The app uses GitHub's unauthenticated REST API. GitHub applies rate limits to unauthenticated requests, so searches may temporarily pause after repeated use. Repository statistics come from GitHub; no fabricated live metrics are used.

For local college-project use, the built-in development secret is sufficient. Before deploying publicly, set a long random `SECRET_KEY` environment variable, use HTTPS, add CSRF protection, and run behind a production WSGI server. Never expose a GitHub personal access token in frontend JavaScript.
