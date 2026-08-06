# Site-to-App Converter

A web service that converts any website URL into installable Android APK and Windows EXE applications.

## Architecture

- **Frontend**: React + Vite + TypeScript + Tailwind
- **Backend**: Node.js + Fastify
- **Database/Auth**: Supabase (Postgres, Auth, Storage)
- **Job Queue**: BullMQ + Redis
- **Build Infrastructure**: Docker containers for isolated builds

## Project Structure

```
/workspace
├── frontend/          # React converter UI
├── backend/           # Fastify API server
├── templates/
│   ├── android/       # Capacitor template for APK builds
│   └── windows/       # Electron template for EXE builds
└── README.md
```

## Quick Start Guide

### Prerequisites

1. **Node.js 20+** - Download from https://nodejs.org
2. **Redis** - Run via Docker: `docker run -d -p 6379:6379 redis:latest`
3. **Supabase Account** - Free tier at https://supabase.com

### Step 1: Set Up Supabase

1. Create a new project at https://app.supabase.com
2. Go to SQL Editor and run the contents of `backend/supabase-schema.sql`
3. Create two storage buckets:
   - `icons` (private)
   - `artifacts` (private)
4. Get your credentials from Settings → API:
   - Project URL
   - `service_role` key (secret, starts with `eyJ...`)
   - `anon` public key (starts with `eyJ...`)

### Step 2: Configure Environment Variables

**Backend** (`backend/.env`):
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
REDIS_HOST=localhost
REDIS_PORT=6379
```

**Frontend** (`frontend/.env`):
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 3: Install Dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### Step 4: Run the Application

You need **3 terminal windows**:

**Terminal 1 - Redis** (if not using Docker):
```bash
docker run -d -p 6379:6379 redis:latest
```

**Terminal 2 - Backend API**:
```bash
cd backend
npm start
# Server runs on http://localhost:3000
```

**Terminal 3 - Build Worker** (processes jobs):
```bash
cd backend
node src/worker.js
# Worker listens for build jobs
```

**Terminal 4 - Frontend**:
```bash
cd frontend
npm run dev
# Opens http://localhost:5173
```

### Step 5: Use the Application

1. Open http://localhost:5173 in your browser
2. Sign up with your email
3. Submit a conversion job:
   - Enter a website URL (must be HTTPS)
   - Provide an app name
   - Enter a package ID (e.g., `com.example.myapp`)
   - Select platforms (Android, Windows)
   - Optionally upload an icon
4. Poll for job status and download when complete

## Important Notes

### Build Requirements

The templates work but **full APK/EXE builds require additional tooling**:

**For Android APK builds:**
- JDK 17+
- Android SDK command-line tools
- Gradle
- Android keystore for signing

**For Windows EXE builds:**
- Node.js
- Wine (for cross-compilation on Linux)
- electron-builder

For testing without full build tools, you can:
1. Modify `src/worker.js` to skip actual builds
2. Test the API, auth, and job queue flow
3. Add real build tools later

### Security Features

- ✅ SSRF-safe URL validation (rejects private IPs)
- ✅ Strict package ID validation (reverse domain format only)
- ✅ XML escaping for app names
- ✅ Icon re-encoding to prevent polyglot attacks
- ✅ Supabase RLS for job ownership
- ✅ Rate limiting (10 requests/minute by default)
- ✅ Signed download URLs (1-hour expiry)

See `BUILD_SPEC.md` for the complete security specification.

## Troubleshooting

**"supabaseUrl is required" error:**
- Make sure `backend/.env` has valid `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`

**Redis connection error:**
- Ensure Redis is running: `docker ps | grep redis`
- Check `REDIS_HOST` in `.env` matches your Redis host

**Jobs stuck in "pending":**
- Make sure the worker is running: `node src/worker.js`
- Check Redis connection in both API and worker

**Build failures:**
- Android: Requires JDK + Android SDK installed
- Windows: Requires Node + Wine + electron-builder
- Check worker logs for specific errors
