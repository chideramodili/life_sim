# Life sim starter (milestone 3: accounts and saving)

A small multiplayer prototype with sign-up, login, saved progress, three rooms (Plaza, Gym, Market), paid travel, and a camera you can rotate and zoom.

## What you need
- Node.js version 22.13 or newer. Check with `node -v`.
- VS Code and two terminal windows.
- Your laptop's date and time must be correct, or `npm install` fails with "certificate is not yet valid".

## Run it
If an older version is still running, press Ctrl + C in both of its terminals first. Use this new folder.

Terminal 1, the game server:

    cd server
    npm install
    npm run dev

Terminal 2, the browser client (a new terminal, then `cd client`, or `cd ..\client` if the prompt ends in `\server`):

    cd client
    npm install
    npm run dev

Open the address Vite prints (usually http://localhost:5173).

## Try this
1. Create an account in one tab (username 3 to 16 letters, numbers, or underscores; password 8 or more characters).
2. Eat a meal, take a taxi to the Gym, then close the tab.
3. Open the page again and log in. Your cash, food, and room are still there.
4. Press Ctrl + C in the server terminal, start it again with `npm run dev`, and log in. Everything is still saved.
5. Open a second tab and create a second account. Each tab is its own login, so you can test two players. Logging into the same account twice logs the first one out.
6. Drag to rotate the camera. Scroll or pinch to zoom. Tap or click the ground (without dragging) to walk.

## Test the accounts with Postman
Base address: `http://localhost:3001`

- **POST /api/signup**, Body, raw, JSON: `{"username": "tester1", "password": "password123"}`. Returns 201 and a token.
- **POST /api/login**, same body. Returns 200 and a token.
- **GET /api/me**, Authorization tab, Bearer Token, paste the token. Returns your saved cash, food, and room.
- **POST /api/logout**, same Bearer Token. Returns 204, and the token stops working.
- Try a wrong password (401), a 2-letter username (400), the same username twice (409), and more than 10 attempts in 15 minutes (429).

## Where your data is
The database is one file: `server/data/game.db`. Delete it (with the server stopped) to start fresh.

## How it works
- `server/index.js` owns the truth: accounts, money, positions, rooms, and trips. Passwords are stored as salted hashes, login tokens are stored as hashes, and every database query uses placeholders. Progress saves every 10 seconds, when a player leaves, and when the server stops.
- `client/src/main.js` shows the login screen, draws what the server sends, and sends requests. It never decides money, positions, or trips.
- The login token lives in the browser tab (`sessionStorage`). Switch it to `localStorage` in `main.js` when you want players to stay logged in after closing the tab.

## Before real players
- Set `CLIENT_ORIGIN` to your real website address instead of allowing every origin.
- Serve the game over HTTPS. Logins sent over plain HTTP can be read on the network.
- Move from the SQLite file to a hosted database, and set up backups.
- Add a way to reset a forgotten password (this version has none).
- Check your local data-protection rules, and add a privacy policy and a delete-account option.

## Next steps
1. The Home tab's needs sheet and the styled look.
2. A rigged character with a walking animation.
3. The story layer, loading Chapter 1 from data.
4. Chat, with report and mute tools.
5. Put it online and test with real players.
