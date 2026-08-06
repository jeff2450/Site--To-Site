import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { createClient } from '@supabase/supabase-js';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Initialize Redis connection
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
});

// Initialize BullMQ queue
const buildQueue = new Queue('build-jobs', {
  connection: redisConnection,
});

// Create Fastify instance
const fastify = Fastify({
  logger: true,
});

// Register plugins
await fastify.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
});

await fastify.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for icons
  },
});

await fastify.register(rateLimit, {
  max: parseInt(process.env.RATE_LIMIT_MAX) || 10,
  timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS) || 60,
});

/**
 * SSRF-Safe URL Validation
 * Rejects URLs that resolve to private, loopback, or link-local IPs
 */
async function validateUrl(urlString) {
  try {
    const url = new URL(urlString);
    
    // Only allow HTTPS
    if (url.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs are allowed' };
    }
    
    // Resolve hostname and check IP
    const dns = await import('dns').then(m => m.promises);
    const addresses = await dns.resolve(url.hostname);
    
    for (const addr of addresses) {
      // Check for private/loopback/link-local IPs
      if (
        addr.startsWith('10.') ||
        addr.startsWith('192.168.') ||
        addr.startsWith('172.16.') ||
        addr.startsWith('172.17.') ||
        addr.startsWith('172.18.') ||
        addr.startsWith('172.19.') ||
        addr.startsWith('172.2') ||
        addr.startsWith('172.30.') ||
        addr.startsWith('172.31.') ||
        addr === '127.0.0.1' ||
        addr.startsWith('169.254.') || // Link-local
        addr === '::1' || // IPv6 loopback
        addr.startsWith('fc') || // IPv6 unique local
        addr.startsWith('fd') ||
        addr.startsWith('fe80:') // IPv6 link-local
      ) {
        return { valid: false, error: 'URL resolves to a private or internal IP address' };
      }
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate package ID (reverse domain format)
 * Only allows a-z, 0-9, and dots in standard format
 */
function validatePackageId(packageId) {
  const pattern = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;
  if (!pattern.test(packageId)) {
    return { 
      valid: false, 
      error: 'Package ID must be in reverse domain format (e.g., com.example.app), containing only lowercase letters, numbers, and dots' 
    };
  }
  if (packageId.length > 255) {
    return { valid: false, error: 'Package ID is too long (max 255 characters)' };
  }
  return { valid: true };
}

/**
 * Escape string for XML
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Process and validate icon upload
 */
async function processIcon(fileData) {
  try {
    // Validate it's actually an image using sharp
    const metadata = await sharp(fileData).metadata();
    
    if (!['png', 'jpeg', 'webp'].includes(metadata.format)) {
      return { success: false, error: 'Icon must be PNG, JPEG, or WebP format' };
    }
    
    // Re-encode to PNG to neutralize any polyglot attacks
    const processedBuffer = await sharp(fileData)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    
    return { success: true, buffer: processedBuffer };
  } catch (error) {
    return { success: false, error: 'Invalid image file' };
  }
}

/**
 * POST /api/jobs - Submit a new build job
 */
fastify.post('/api/jobs', async (request, reply) => {
  try {
    // Get authenticated user from Supabase auth header
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return reply.status(401).send({ error: 'Invalid authentication token' });
    }
    
    const { url, appName, packageId, platforms } = request.body;
    
    // Validate inputs
    const urlValidation = await validateUrl(url);
    if (!urlValidation.valid) {
      return reply.status(400).send({ error: urlValidation.error });
    }
    
    const packageValidation = validatePackageId(packageId);
    if (!packageValidation.valid) {
      return reply.status(400).send({ error: packageValidation.error });
    }
    
    if (!appName || appName.trim().length === 0) {
      return reply.status(400).send({ error: 'App name is required' });
    }
    
    if (appName.length > 100) {
      return reply.status(400).send({ error: 'App name is too long (max 100 characters)' });
    }
    
    // Validate platforms
    const validPlatforms = ['android', 'windows'];
    const selectedPlatforms = Array.isArray(platforms) 
      ? platforms.filter(p => validPlatforms.includes(p))
      : [platforms].filter(p => validPlatforms.includes(p));
    
    if (selectedPlatforms.length === 0) {
      return reply.status(400).send({ error: 'At least one valid platform must be selected (android, windows)' });
    }
    
    // Process icon if provided
    let iconPath = null;
    if (request.isMultipart()) {
      const file = await request.file();
      if (file) {
        const chunks = [];
        for await (const chunk of file.file) {
          chunks.push(chunk);
        }
        const fileData = Buffer.concat(chunks);
        
        const iconResult = await processIcon(fileData);
        if (!iconResult.success) {
          return reply.status(400).send({ error: iconResult.error });
        }
        
        // Upload icon to Supabase Storage
        const iconFileName = `${user.id}/${uuidv4()}.png`;
        const { error: uploadError } = await supabase.storage
          .from('icons')
          .upload(iconFileName, iconResult.buffer, { contentType: 'image/png' });
        
        if (uploadError) {
          request.log.error('Failed to upload icon:', uploadError);
          return reply.status(500).send({ error: 'Failed to process icon' });
        }
        
        iconPath = iconFileName;
      }
    }
    
    // Create job record in database with RLS
    const jobId = uuidv4();
    const escapedAppName = escapeXml(appName.trim());
    
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        id: jobId,
        user_id: user.id,
        url: url,
        app_name: escapedAppName,
        package_id: packageId,
        platforms: selectedPlatforms,
        icon_path: iconPath,
        status: 'pending',
      })
      .select()
      .single();
    
    if (jobError) {
      request.log.error('Failed to create job:', jobError);
      return reply.status(500).send({ error: 'Failed to create job' });
    }
    
    // Add job to queue
    await buildQueue.add('build-app', {
      jobId,
      userId: user.id,
      url,
      appName: escapedAppName,
      packageId,
      platforms: selectedPlatforms,
      iconPath,
    });
    
    request.log.info({ jobId, userId: user.id, url, appName: escapedAppName }, 'Job created');
    
    reply.status(201).send({
      id: jobId,
      status: 'pending',
      message: 'Job queued successfully',
    });
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: 'Internal server error' });
  }
});

/**
 * GET /api/jobs/:id - Get job status
 */
fastify.get('/api/jobs/:id', async (request, reply) => {
  try {
    const { id } = request.params;
    
    // Get authenticated user
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return reply.status(401).send({ error: 'Invalid authentication token' });
    }
    
    // Fetch job (RLS ensures user can only access their own jobs)
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    
    if (jobError || !job) {
      return reply.status(404).send({ error: 'Job not found' });
    }
    
    // Generate signed download URL if job is complete
    let downloadUrls = {};
    if (job.status === 'completed' && job.artifact_paths) {
      for (const [platform, path] of Object.entries(job.artifact_paths)) {
        const { data } = await supabase.storage
          .from('artifacts')
          .createSignedUrl(path, 3600); // 1 hour expiry
        if (data) {
          downloadUrls[platform] = data.signedUrl;
        }
      }
    }
    
    reply.send({
      ...job,
      downloadUrls: Object.keys(downloadUrls).length > 0 ? downloadUrls : undefined,
    });
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: 'Internal server error' });
  }
});

/**
 * GET /api/jobs - List user's jobs
 */
fastify.get('/api/jobs', async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return reply.status(401).send({ error: 'Invalid authentication token' });
    }
    
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id, url, app_name, package_id, platforms, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (jobsError) {
      request.log.error('Failed to fetch jobs:', jobsError);
      return reply.status(500).send({ error: 'Failed to fetch jobs' });
    }
    
    reply.send(jobs || []);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({ error: 'Internal server error' });
  }
});

/**
 * Health check endpoint
 */
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Start server
const PORT = process.env.PORT || 3000;
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Server running on port ${PORT}`);
} catch (error) {
  fastify.log.error(error);
  process.exit(1);
}
