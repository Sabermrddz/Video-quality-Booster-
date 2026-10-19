# GAN Video Enhancer

A lightweight Express + frontend prototype for uploading a short video, sending it to a worker, and returning an enhanced version using a GAN-based super-resolution workflow.

## Features

- Upload a short video clip
- Local storage mode for development
- Optional Backblaze B2 integration
- Worker job queue and processing lifecycle
- Download enhanced output after processing
- Simple landing page built to match the provided reference design

## Tech Stack

- Node.js
- Express
- Multer
- Backblaze B2 SDK (optional)
- Static frontend served from `public/`

## Project Structure

- `server.js` – Express API and app server
- `public/` – static frontend assets
- `jobs.js` – job queue / in-memory job state
- `b2.js` – optional B2 upload helpers
- `.env.example` – sample environment configuration
- `worker/` – worker-related assets

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables if needed:

   ```bash
   copy .env.example .env
   ```

3. Start the app:

   ```bash
   npm start
   ```

4. Open:

   ```text
   http://localhost:3000
   ```

## Environment Variables

Optional values you may set in `.env`:

- `PORT` – server port, default `3000`
- `WORKER_SECRET` – required for worker API auth
- `B2_KEY_ID` / `B2_APPLICATION_KEY` / `B2_BUCKET_ID` / `B2_BUCKET_NAME` – for Backblaze B2 storage

## Notes

- The app runs in local mode by default if B2 is not configured.
- If port `3000` is already in use, stop the existing Node process and restart the server.
- This project is a prototype and is intended for local development and demo use.
