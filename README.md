# MUAAFCT Posting App

This application is an automated scheduling and posting system designed to broadcast content primarily to WhatsApp, with an integrated admin dashboard to manage the scheduling and view statuses.

## Architecture Overview

The app is built as a monolithic application containing both the backend API/Scheduler and the frontend Admin Dashboard.

### Backend (Node.js & Express)
- **Framework:** Express.js (`server.js`)
- **Database:** SQLite (`database.sqlite`) is used for relational data storage and session management (`sessions.sqlite`).
- **Authentication:** Managed via `passport` and `passport-google-oauth20` (Google OAuth 2.0).
- **Core Services:**
  - **WhatsApp Integration:** Uses `whatsapp-web.js` to run a headless WhatsApp Web client for sending automated messages (`src/services/whatsapp.js`).
  - **Task Scheduling:** Uses `node-cron` (`src/services/scheduler.js`) for triggering scheduled posts and jobs automatically.
  - **Real-Time Updates:** Uses `socket.io` to communicate with the frontend, primarily handling the WhatsApp QR code authentication flow and real-time status updates (`src/services/socket.js`).
  - **File Uploads:** Handled via `express-fileupload`, storing files locally or in a configured volume directory (`/uploads`).

### Frontend (React & Vite)
- **Location:** The frontend source code lives inside the `/admin-dashboard` folder.
- **Framework:** React with TypeScript, built using Vite.
- **Serving:** In production, the backend serves the built frontend files (`admin-dashboard-dist`). If doing local dashboard development, it has its own Vite dev server.

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn
- A Google Cloud Console project set up with OAuth credentials (for login).

### Environment Variables
You will need a `.env` file at the root of the project. Important variables include:
- `PORT` - The port the server runs on (defaults to 3000).
- `SESSION_SECRET` - Secret for securely signing session cookies.
- Google OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, etc.).

### Installation & Setup
1. **Install backend dependencies:**
   ```bash
   npm install
   ```
2. **Setup the frontend:**
   ```bash
   cd admin-dashboard
   npm install
   ```

### Running Locally
To start the backend server locally (this will start the Express app, initialize SQLite, start the scheduler, and attempt to connect the WhatsApp client):
```bash
npm start
```

*Note: You may need to scan a QR code from the terminal (or the frontend dashboard) to link the WhatsApp client on the first run, although previously authenticated sessions are cached in `.wwebjs_auth`.*

To work on the admin dashboard, you can open a new terminal tab and start the Vite dev server inside the `admin-dashboard` directory.

## Project Structure
- `/src` - Backend source code (Controllers, Models, Routes, Services).
- `/admin-dashboard` - Frontend React application.
- `/scripts` - Assorted utility scripts used periodically in the project.
- `/uploads` - Directory where uploaded media is stored.
- `server.js` - Main backend entry point.
- `database.sqlite` / `sessions.sqlite` - Default SQLite databases.
