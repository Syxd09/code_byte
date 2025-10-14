#!/bin/bash

# Vercel build script for native modules
echo "Starting Vercel build process..."

# Install dependencies
npm ci

# Rebuild native modules for the target platform
echo "Rebuilding sqlite3 for deployment platform..."
npm rebuild sqlite3

# Run database migration if needed
echo "Running database migration..."
npm run migrate

echo "Build completed successfully"