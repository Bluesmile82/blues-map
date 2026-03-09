#!/usr/bin/env node
/**
 * Download all musician photos and apply circular masks.
 * Saves as PNG with transparent corners for use in deck.gl IconLayer.
 * 
 * Handles both:
 * - Local paths (/images/musicians/xxx.webp) - converts to circular PNG
 * - Remote URLs - downloads and converts to circular PNG
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const MUSICIANS_FILE = './src/data/musicians.json';
const OUTPUT_DIR = './public/images/musicians';
const SIZE = 128; // Output size in pixels

// Create circular mask SVG
function createCircleMask(size) {
  const r = size / 2;
  return Buffer.from(`
    <svg width="${size}" height="${size}">
      <circle cx="${r}" cy="${r}" r="${r}" fill="white"/>
    </svg>
  `);
}

// Generate output filename from musician ID
function getOutputPath(id) {
  return path.join(OUTPUT_DIR, `${id}.png`);
}

// Check if circular PNG already exists
function hasCircularPng(id) {
  return fs.existsSync(getOutputPath(id));
}

// Resolve image path - handles both local and remote
function resolveImagePath(imageUrl) {
  if (!imageUrl) return null;
  
  // Local path
  if (imageUrl.startsWith('/images/')) {
    const localPath = path.join('./public', imageUrl);
    if (fs.existsSync(localPath)) {
      return { type: 'local', path: localPath };
    }
    return null;
  }
  
  // Remote URL
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return { type: 'remote', url: imageUrl };
  }
  
  return null;
}

// Process local image file
async function processLocalImage(musician, localPath) {
  const { id, name } = musician;
  const outputPath = getOutputPath(id);
  
  try {
    const mask = createCircleMask(SIZE);
    
    await sharp(localPath)
      .resize(SIZE, SIZE, { fit: 'cover', position: 'center' })
      .composite([{
        input: mask,
        blend: 'dest-in',
      }])
      .png()
      .toFile(outputPath);

    console.log(`✅ ${name}: Converted from local`);
    return { id, status: 'success' };
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    return { id, status: 'error', error: error.message };
  }
}

// Download and process remote image
async function downloadAndProcess(musician, url) {
  const { id, name } = musician;
  const outputPath = getOutputPath(id);
  
  try {
    console.log(`⬇️  ${name}: Downloading...`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://en.wikipedia.org/',
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        return { id, status: 'rate-limited' };
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const mask = createCircleMask(SIZE);
    
    await sharp(buffer)
      .resize(SIZE, SIZE, { fit: 'cover', position: 'center' })
      .composite([{
        input: mask,
        blend: 'dest-in',
      }])
      .png()
      .toFile(outputPath);

    console.log(`✅ ${name}: Downloaded and saved`);
    return { id, status: 'success' };
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    return { id, status: 'error', error: error.message };
  }
}

// Process a single musician
async function processMusician(musician) {
  const { id, name, image } = musician;
  
  // Skip if already have circular PNG
  if (hasCircularPng(id)) {
    return { id, status: 'exists' };
  }
  
  const resolved = resolveImagePath(image);
  
  if (!resolved) {
    return { id, status: 'no-url' };
  }
  
  if (resolved.type === 'local') {
    return processLocalImage(musician, resolved.path);
  }
  
  // Skip placeholder URLs
  if (resolved.url.includes('ui-avatars.com') || resolved.url.includes('placeholder')) {
    return { id, status: 'placeholder' };
  }
  
  return downloadAndProcess(musician, resolved.url);
}

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load musicians
  const musicians = JSON.parse(fs.readFileSync(MUSICIANS_FILE, 'utf-8'));
  console.log(`\n📷 Processing ${musicians.length} musicians...\n`);

  const results = {
    success: 0,
    exists: 0,
    error: 0,
    'no-url': 0,
    placeholder: 0,
    'rate-limited': 0,
  };

  // First pass: process all local images (fast, no rate limits)
  console.log('=== Processing local images ===\n');
  for (const musician of musicians) {
    const resolved = resolveImagePath(musician.image);
    if (resolved?.type === 'local' && !hasCircularPng(musician.id)) {
      const result = await processLocalImage(musician, resolved.path);
      results[result.status] = (results[result.status] || 0) + 1;
    }
  }

  // Second pass: download remote images with rate limiting
  console.log('\n=== Downloading remote images ===\n');
  
  const remoteMusicians = musicians.filter(m => {
    const resolved = resolveImagePath(m.image);
    return resolved?.type === 'remote' && !hasCircularPng(m.id);
  });

  // Process one at a time with delay to avoid rate limits
  for (let i = 0; i < remoteMusicians.length; i++) {
    const musician = remoteMusicians[i];
    const resolved = resolveImagePath(musician.image);
    
    if (resolved?.url.includes('ui-avatars.com') || resolved?.url.includes('placeholder')) {
      results.placeholder++;
      continue;
    }
    
    const result = await downloadAndProcess(musician, resolved.url);
    results[result.status] = (results[result.status] || 0) + 1;
    
    // If rate limited, wait longer
    if (result.status === 'rate-limited') {
      console.log('⏳ Rate limited, waiting 5 seconds...');
      await delay(5000);
      // Retry once
      const retry = await downloadAndProcess(musician, resolved.url);
      if (retry.status === 'success') {
        results['rate-limited']--;
        results.success++;
      }
    }
    
    // Small delay between requests
    if (i < remoteMusicians.length - 1) {
      await delay(300);
    }
  }

  // Count existing
  for (const musician of musicians) {
    if (hasCircularPng(musician.id)) {
      results.exists++;
    }
  }
  // Subtract the ones we just processed
  results.exists -= results.success;

  console.log('\n📊 Summary:');
  console.log(`   ✅ Processed: ${results.success}`);
  console.log(`   ✓  Already existed: ${results.exists}`);
  console.log(`   ⚠️  No URL: ${results['no-url']}`);
  console.log(`   ⚠️  Placeholder: ${results.placeholder}`);
  console.log(`   ⏳ Rate limited: ${results['rate-limited']}`);
  console.log(`   ❌ Errors: ${results.error}`);
  console.log(`\n📁 Output: ${OUTPUT_DIR}\n`);
}

main().catch(console.error);
