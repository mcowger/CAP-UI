#!/bin/bash

# CLIProxy Collector - Production Deployment Script
# This script automates the deployment process

set -e  # Exit on error

echo "🚀 CLIProxy Collector - Production Deployment"
echo "=============================================="
echo ""

# Check Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker is not installed"
    echo "   Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check Docker Compose is installed
if ! docker compose version &> /dev/null; then
    echo "❌ Error: Docker Compose is not installed"
    echo "   Please install Docker Compose v2"
    exit 1
fi

echo "✅ Docker and Docker Compose detected"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found"
    echo ""
    echo "Creating .env from example..."

    if [ -f .env.production.example ]; then
        cp .env.production.example .env
        echo "✅ Created .env file from .env.production.example"
        echo ""
        echo "⚠️  IMPORTANT: Edit .env and update these values:"
        echo "   - CLIPROXY_URL (your CLIProxy backend URL)"
        echo "   - CLIPROXY_MANAGEMENT_KEY (your management API key)"
        echo ""
        read -p "Press Enter after you've updated .env, or Ctrl+C to exit..."
    else
        echo "❌ Error: .env.production.example not found"
        exit 1
    fi
else
    echo "✅ .env file exists"
fi

# Validate required environment variables
echo ""
echo "📋 Validating environment variables..."

source .env

REQUIRED_VARS=("CLIPROXY_URL" "CLIPROXY_MANAGEMENT_KEY")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "❌ Error: Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Please update .env with the required values"
    exit 1
fi

echo "✅ All required environment variables are set"

# Create data directory if it doesn't exist
echo ""
echo "📁 Setting up data directory..."
mkdir -p data
chmod 755 data
echo "✅ Data directory ready"

# Build Docker image
echo ""
echo "🔨 Building Docker image..."
docker compose build

echo ""
echo "✅ Docker image built successfully"

# Start container
echo ""
echo "🚀 Starting container..."
docker compose up -d

echo ""
echo "✅ Container started"

# Wait for health check
echo ""
echo "🏥 Waiting for health check..."
sleep 5

MAX_RETRIES=12
RETRY_COUNT=0
HEALTHY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s -f http://localhost:${COLLECTOR_TRIGGER_PORT:-5001}/api/collector/health > /dev/null 2>&1; then
        HEALTHY=true
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "   Attempt $RETRY_COUNT/$MAX_RETRIES..."
    sleep 5
done

if [ "$HEALTHY" = true ]; then
    echo "✅ Health check passed!"
else
    echo "⚠️  Health check timeout - check logs with: docker compose logs"
fi

# Show status
echo ""
echo "📊 Deployment Status"
echo "===================="
docker compose ps

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📝 Useful commands:"
echo "   View logs:          docker compose logs -f"
echo "   Stop container:     docker compose down"
echo "   Restart:            docker compose restart"
echo "   Health check:       curl http://localhost:${COLLECTOR_TRIGGER_PORT:-5001}/api/collector/health"
echo "   Trigger collect:    curl -X POST http://localhost:${COLLECTOR_TRIGGER_PORT:-5001}/api/collector/trigger"
echo ""
echo "📚 For more information, see README-DOCKER.md"
