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

## Security Considerations

This service handles user-submitted URLs and generates downloadable applications. Key security measures:

1. **SSRF Protection**: URL validation rejects private/loopback IPs
2. **Input Validation**: Strict allow-lists for package IDs, escaped app names
3. **Access Control**: Supabase RLS ensures users can only access their own jobs
4. **Isolated Builds**: Ephemeral Docker containers with no privileged access
5. **Signed URLs**: Time-limited download links for build artifacts

See the full security specification in BUILD_SPEC.md. 
