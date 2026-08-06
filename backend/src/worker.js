import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const execAsync = promisify(exec);

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

// Template paths
const ANDROID_TEMPLATE_PATH = join(__dirname, '../../templates/android');
const WINDOWS_TEMPLATE_PATH = join(__dirname, '../../templates/windows');

/**
 * Replace placeholders in template files
 */
async function replacePlaceholders(templatePath, outputPath, replacements) {
  const files = await fs.readdir(templatePath, { recursive: true });
  
  for (const file of files) {
    const srcPath = join(templatePath, file);
    const destPath = join(outputPath, file);
    
    try {
      const stat = await fs.stat(srcPath);
      if (stat.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        continue;
      }
      
      const content = await fs.readFile(srcPath, 'utf-8');
      let replaced = content;
      
      for (const [placeholder, value] of Object.entries(replacements)) {
        replaced = replaced.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), value);
      }
      
      await fs.mkdir(dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, replaced, 'utf-8');
    } catch (error) {
      // Skip binary files or files that can't be read as text
      if (!error.message.includes('invalid utf-8')) {
        throw error;
      }
      // Copy binary files as-is
      await fs.mkdir(dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Build Android APK
 */
async function buildAndroid(jobData, buildDir) {
  const outputDir = join(buildDir, 'android-output');
  
  // Copy and process template
  await replacePlaceholders(ANDROID_TEMPLATE_PATH, outputDir, {
    PACKAGE_ID: jobData.packageId,
    APP_NAME: jobData.appName,
    TARGET_URL: jobData.url,
  });
  
  // Copy icon if provided
  if (jobData.iconPath) {
    const { data: iconData, error: downloadError } = await supabase.storage
      .from('icons')
      .download(jobData.iconPath);
    
    if (!downloadError && iconData) {
      const iconBuffer = await iconData.arrayBuffer();
      await fs.writeFile(join(outputDir, 'app/src/main/res/mipmap-hdpi/ic_launcher.png'), Buffer.from(iconBuffer));
    }
  }
  
  // Run Gradle build
  try {
    await execAsync('./gradlew assembleRelease', { cwd: outputDir });
    
    // Find the APK
    const apkPath = join(outputDir, 'app/build/outputs/apk/release/app-release.apk');
    
    // Upload to Supabase Storage
    const artifactPath = `${jobData.userId}/${jobData.jobId}/app.apk`;
    const apkBuffer = await fs.readFile(apkPath);
    
    const { error: uploadError } = await supabase.storage
      .from('artifacts')
      .upload(artifactPath, apkBuffer, { contentType: 'application/vnd.android.package-archive' });
    
    if (uploadError) throw uploadError;
    
    return { android: artifactPath };
  } catch (error) {
    console.error('Android build failed:', error);
    throw error;
  }
}

/**
 * Build Windows EXE
 */
async function buildWindows(jobData, buildDir) {
  const outputDir = join(buildDir, 'windows-output');
  
  // Copy and process template
  await replacePlaceholders(WINDOWS_TEMPLATE_PATH, outputDir, {
    PACKAGE_ID: jobData.packageId,
    APP_NAME: jobData.appName,
    APP_NAME_SAFE: jobData.appName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
    TARGET_URL: jobData.url,
  });
  
  // Install dependencies
  await execAsync('npm install', { cwd: outputDir });
  
  // Build with electron-builder
  try {
    await execAsync('npm run build', { cwd: outputDir });
    
    // Find the EXE
    const exePattern = join(outputDir, 'dist/*.exe');
    const distFiles = await fs.readdir(join(outputDir, 'dist'));
    const exeFile = distFiles.find(f => f.endsWith('.exe'));
    
    if (!exeFile) throw new Error('No EXE file found after build');
    
    const exePath = join(outputDir, 'dist', exeFile);
    
    // Upload to Supabase Storage
    const artifactPath = `${jobData.userId}/${jobData.jobId}/app.exe`;
    const exeBuffer = await fs.readFile(exePath);
    
    const { error: uploadError } = await supabase.storage
      .from('artifacts')
      .upload(artifactPath, exeBuffer, { contentType: 'application/x-msdownload' });
    
    if (uploadError) throw uploadError;
    
    return { windows: artifactPath };
  } catch (error) {
    console.error('Windows build failed:', error);
    throw error;
  }
}

/**
 * Process a build job
 */
async function processJob(job) {
  const { jobId, userId, url, appName, packageId, platforms, iconPath } = job.data;
  
  console.log(`Processing job ${jobId} for user ${userId}`);
  
  // Update job status to processing
  await supabase
    .from('jobs')
    .update({ status: 'processing' })
    .eq('id', jobId);
  
  const buildDir = join('/tmp', `build-${jobId}`);
  await fs.mkdir(buildDir, { recursive: true });
  
  try {
    const artifactPaths = {};
    
    // Build requested platforms
    if (platforms.includes('android')) {
      try {
        const androidPath = await buildAndroid(job.data, buildDir);
        Object.assign(artifactPaths, androidPath);
      } catch (error) {
        console.error(`Android build failed for job ${jobId}:`, error);
        // Continue with other platforms
      }
    }
    
    if (platforms.includes('windows')) {
      try {
        const windowsPath = await buildWindows(job.data, buildDir);
        Object.assign(artifactPaths, windowsPath);
      } catch (error) {
        console.error(`Windows build failed for job ${jobId}:`, error);
        // Continue with other platforms
      }
    }
    
    if (Object.keys(artifactPaths).length === 0) {
      throw new Error('All platform builds failed');
    }
    
    // Update job as completed
    await supabase
      .from('jobs')
      .update({
        status: 'completed',
        artifact_paths: artifactPaths,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    
    console.log(`Job ${jobId} completed successfully`);
  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    
    // Update job as failed
    await supabase
      .from('jobs')
      .update({
        status: 'failed',
        error_message: error.message,
      })
      .eq('id', jobId);
  } finally {
    // Cleanup build directory
    try {
      await fs.rm(buildDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Failed to cleanup build directory:', cleanupError);
    }
  }
}

// Create worker
const worker = new Worker('build-jobs', processJob, {
  connection: redisConnection,
  concurrency: 2, // Process 2 jobs concurrently
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

console.log('Build worker started...');

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down worker...');
  await worker.close();
  await redisConnection.quit();
  process.exit(0);
});
