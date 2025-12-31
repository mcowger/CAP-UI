# Docker Deployment Guide - CLIProxy Usage Collector

This guide covers deploying the CLIProxy Usage Collector in production using Docker.

## Quick Start

### Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- CLIProxy instance running (locally or remotely)

### 1. Environment Setup

Create a `.env` file in the project root:

```bash
# Copy from example
cp .env.example .env

# Edit with your values
nano .env
```

Required environment variables:

```env
# CLIProxy Configuration
CLIPROXY_URL=http://host.docker.internal:8317  # Use host.docker.internal for localhost CLIProxy
CLIPROXY_MANAGEMENT_KEY=your-actual-management-key

# Collector Configuration
COLLECTOR_INTERVAL_SECONDS=300
COLLECTOR_TRIGGER_PORT=5001

# Timezone Configuration
TIMEZONE_OFFSET_HOURS=7

# Database (will be mounted to ./data/)
DB_PATH=/app/data/collector.db
```

### 2. Create Data Directory

```bash
# Create directory for SQLite database
mkdir -p data

# Set proper permissions
chmod 755 data
```

### 3. Deploy with Docker Compose

```bash
# Build and start the container
docker compose up -d

# View logs
docker compose logs -f

# Check health status
docker compose ps
```

### 4. Verify Deployment

```bash
# Health check
curl http://localhost:5001/api/collector/health

# Trigger manual collection
curl -X POST http://localhost:5001/api/collector/trigger

# Check database
ls -lh ./data/
```

## Docker Commands

### Build Image

```bash
# Build without cache
docker compose build --no-cache

# Build with specific tag
docker build -t cliproxy-collector:latest .
```

### Container Management

```bash
# Start container
docker compose up -d

# Stop container
docker compose down

# Restart container
docker compose restart

# View logs (last 100 lines, follow)
docker compose logs -f --tail=100

# Execute commands in running container
docker compose exec collector bun --version
```

### Database Management

```bash
# Backup database
cp ./data/collector.db ./data/collector-backup-$(date +%Y%m%d-%H%M%S).db

# View database size
du -sh ./data/collector.db

# Access SQLite CLI in container
docker compose exec collector bun run -e 'import { Database } from "bun:sqlite"; const db = new Database("/app/data/collector.db"); console.log(db.query("SELECT COUNT(*) as count FROM usage_snapshots").get())'
```

## Production Deployment Options

### Option 1: Docker Compose (Recommended for Single Server)

Use the provided `docker-compose.yml`:

```bash
docker compose up -d
```

### Option 2: Docker Run (Manual)

```bash
# Create data directory
mkdir -p /opt/cliproxy-collector/data

# Run container
docker run -d \
  --name cliproxy-collector \
  --restart unless-stopped \
  -p 5001:5001 \
  -v /opt/cliproxy-collector/data:/app/data \
  -e CLIPROXY_URL=http://your-cliproxy-host:8317 \
  -e CLIPROXY_MANAGEMENT_KEY=your-key \
  -e COLLECTOR_INTERVAL_SECONDS=300 \
  -e COLLECTOR_TRIGGER_PORT=5001 \
  -e TIMEZONE_OFFSET_HOURS=7 \
  -e DB_PATH=/app/data/collector.db \
  cliproxy-collector:latest
```

### Option 3: Docker Swarm

Create `stack.yml`:

```yaml
version: '3.8'

services:
  collector:
    image: cliproxy-collector:latest
    ports:
      - "5001:5001"
    environment:
      - CLIPROXY_URL=http://cliproxy:8317
      - CLIPROXY_MANAGEMENT_KEY_FILE=/run/secrets/cliproxy_key
      - COLLECTOR_INTERVAL_SECONDS=300
      - COLLECTOR_TRIGGER_PORT=5001
      - TIMEZONE_OFFSET_HOURS=7
      - DB_PATH=/app/data/collector.db
    volumes:
      - collector-data:/app/data
    secrets:
      - cliproxy_key
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3

volumes:
  collector-data:

secrets:
  cliproxy_key:
    external: true
```

Deploy:

```bash
docker stack deploy -c stack.yml cliproxy
```

## Networking

### Connecting to CLIProxy on Host Machine

Use `host.docker.internal` (automatically configured in docker-compose.yml):

```env
CLIPROXY_URL=http://host.docker.internal:8317
```

### Connecting to Remote CLIProxy

Use the actual hostname/IP:

```env
CLIPROXY_URL=http://cliproxy.example.com:8317
```

### Custom Docker Network

```bash
# Create network
docker network create cliproxy-network

# Update docker-compose.yml to use network
# Add to service:
#   networks:
#     - cliproxy-network

# Deploy
docker compose up -d
```

## Volume Management

### Using Bind Mount (Default)

Database stored in `./data/` on host:

```yaml
volumes:
  - ./data:/app/data
```

**Pros**: Easy access, simple backups
**Cons**: Path dependent, permissions issues on some systems

### Using Named Volume

Update `docker-compose.yml`:

```yaml
volumes:
  - collector-data:/app/data

# Add at bottom:
volumes:
  collector-data:
```

**Pros**: Docker-managed, better performance
**Cons**: Harder to access directly

### Backup Named Volume

```bash
# Backup
docker run --rm \
  -v collector_collector-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/collector-data-$(date +%Y%m%d).tar.gz -C /data .

# Restore
docker run --rm \
  -v collector_collector-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar xzf /backup/collector-data-20240101.tar.gz -C /data
```

## Monitoring

### Health Checks

```bash
# Docker health status
docker compose ps

# HTTP health endpoint
curl http://localhost:5001/api/collector/health

# Expected response:
# {"status":"healthy","uptime":12345,"database":"connected"}
```

### Logs

```bash
# Real-time logs
docker compose logs -f

# Last 50 lines
docker compose logs --tail=50

# Export logs to file
docker compose logs > collector-$(date +%Y%m%d).log
```

### Resource Usage

```bash
# Container stats
docker stats cliproxy-collector

# Resource usage history
docker compose top
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose logs

# Verify environment variables
docker compose config

# Check permissions on data directory
ls -la ./data/

# Rebuild from scratch
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Database Locked

```bash
# Stop container
docker compose down

# Check for stale lock files
ls -la ./data/

# Remove WAL files if needed (BE CAREFUL)
rm ./data/collector.db-shm ./data/collector.db-wal

# Restart
docker compose up -d
```

### Can't Connect to CLIProxy

```bash
# Test network connectivity from container
docker compose exec collector ping -c 3 host.docker.internal

# Check CLIProxy is accessible
curl http://localhost:8317/health

# Verify environment variable
docker compose exec collector printenv CLIPROXY_URL
```

### Permission Denied on Data Directory

```bash
# Fix ownership (if using bind mount)
sudo chown -R 1000:1000 ./data/

# Or use current user
sudo chown -R $(id -u):$(id -g) ./data/
```

## Security Best Practices

### 1. Secrets Management

**Don't commit `.env` to git!**

Use Docker secrets for production:

```bash
# Create secret
echo "your-management-key" | docker secret create cliproxy_key -

# Update docker-compose.yml to use secrets
# environment:
#   - CLIPROXY_MANAGEMENT_KEY_FILE=/run/secrets/cliproxy_key
# secrets:
#   - cliproxy_key
```

### 2. Network Isolation

```bash
# Use internal network
# In docker-compose.yml:
# networks:
#   cliproxy-internal:
#     internal: true
```

### 3. Resource Limits

Already configured in docker-compose.yml:

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
```

### 4. Read-Only Filesystem (Advanced)

```yaml
# In docker-compose.yml service:
read_only: true
tmpfs:
  - /tmp
volumes:
  - ./data:/app/data:rw  # Only data dir writable
```

## Upgrading

### Pull Latest Image

```bash
# Pull latest code
git pull origin main

# Rebuild
docker compose build --no-cache

# Restart with new image
docker compose down
docker compose up -d

# Verify
docker compose logs -f
```

### Zero-Downtime Update (Advanced)

```bash
# Build new image with different tag
docker build -t cliproxy-collector:v2 .

# Start new container on different port
docker run -d --name collector-v2 -p 5002:5001 -v $(pwd)/data:/app/data cliproxy-collector:v2

# Verify new version works
curl http://localhost:5002/api/collector/health

# Update load balancer / reverse proxy to point to 5002

# Stop old container
docker stop cliproxy-collector
docker rm cliproxy-collector

# Rename new container
docker rename collector-v2 cliproxy-collector
```

## Performance Tuning

### SQLite Optimization

Database is already configured with WAL mode in the application. For additional tuning:

```bash
# Check database integrity
docker compose exec collector bun run -e 'import { Database } from "bun:sqlite"; const db = new Database("/app/data/collector.db"); db.exec("PRAGMA integrity_check;")'

# Vacuum database (reclaim space)
docker compose exec collector bun run -e 'import { Database } from "bun:sqlite"; const db = new Database("/app/data/collector.db"); db.exec("VACUUM;")'
```

### Container Resource Tuning

Adjust in `docker-compose.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'        # Increase for more CPU
      memory: 1G         # Increase for larger datasets
    reservations:
      cpus: '0.5'
      memory: 512M
```

## Support

- **Issues**: https://github.com/your-org/collector/issues
- **Documentation**: See main README.md
- **Logs**: Check `docker compose logs`
