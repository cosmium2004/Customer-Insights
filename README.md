# AI-Powered Customer Insights Platform

A web application that enables businesses to understand customer behavior patterns and sentiment trends through real-time analysis of user interactions and feedback data.

## Architecture

- **Frontend**: React.js with TypeScript
- **API Gateway**: Node.js with Express
- **ML Service**: Python with FastAPI
- **Database**: PostgreSQL 15
- **Cache**: Redis 7

## Complete Setup Guide for Windows

This guide assumes you're starting from scratch with no software installed. Follow these steps in order.

### Step 1: Install Docker Desktop (with WSL 2)

Docker Desktop allows you to run all services in containers without installing PostgreSQL, Redis, or Python directly.

1. **Enable WSL 2** (Windows Subsystem for Linux):
   - Open PowerShell as Administrator
   - Run: `wsl --install`
   - Restart your computer when prompted
   - After restart, a Ubuntu terminal will open. Create a username and password when asked

2. **Download Docker Desktop**:
   - Visit: https://www.docker.com/products/docker-desktop/
   - Click "Download for Windows"
   - Run the installer (Docker Desktop Installer.exe)

3. **Install Docker Desktop**:
   - Follow the installation wizard
   - Ensure "Use WSL 2 instead of Hyper-V" is checked
   - Complete the installation and restart if prompted

4. **Start Docker Desktop**:
   - Launch Docker Desktop from the Start menu
   - Accept the service agreement
   - Wait for Docker to start (the whale icon in the system tray will be steady)
   - You can verify Docker is running by opening PowerShell and typing: `docker --version`

### Step 2: Install Node.js (18+)

Node.js is required to run npm commands and manage dependencies.

1. **Download Node.js**:
   - Visit: https://nodejs.org/
   - Download the LTS version (18.x or higher)
   - Run the installer (node-v18.x.x-x64.msi)

2. **Install Node.js**:
   - Follow the installation wizard
   - Accept the license agreement
   - Use default installation path
   - Check "Automatically install the necessary tools" if prompted
   - Complete the installation

3. **Verify Installation**:
   - Open a new PowerShell or Command Prompt window
   - Run: `node --version` (should show v18.x.x or higher)
   - Run: `npm --version` (should show version number)

### Step 3: Install Git (Optional but Recommended)

Git helps you clone the repository and manage version control.

1. **Download Git**:
   - Visit: https://git-scm.com/download/win
   - Download the installer
   - Run the installer (Git-2.x.x-64-bit.exe)

2. **Install Git**:
   - Use default settings throughout the installation
   - For "Choosing the default editor", select your preferred editor or leave as Vim
   - For "Adjusting your PATH environment", select "Git from the command line and also from 3rd-party software"
   - Complete the installation

3. **Verify Installation**:
   - Open a new PowerShell or Command Prompt window
   - Run: `git --version`

## Project Setup

### Step 1: Navigate to Project Directory

Open PowerShell or Command Prompt and navigate to the project folder:

```bash
cd path\to\ai-customer-insights-platform
```

### Step 2: Install Dependencies

Install all Node.js dependencies:

```bash
npm install
```

This will install dependencies for the root project and all services. It may take a few minutes.

### Step 3: Configure Environment Variables

1. **Copy the example environment file**:
   ```bash
   copy .env.example .env
   ```

2. **Edit the `.env` file** with a text editor (Notepad, VS Code, etc.) and update the following:

   ```env
   # Database Configuration
   POSTGRES_DB=customer_insights
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=MySecurePassword123!
   
   # JWT Configuration (generate random strings, at least 32 characters)
   JWT_SECRET=your_random_secret_key_min_32_characters_long_here
   JWT_REFRESH_SECRET=your_random_refresh_secret_key_min_32_characters_long
   
   # Redis Configuration
   REDIS_URL=redis://localhost:6379
   
   # API Gateway Configuration
   PORT=3000
   NODE_ENV=development
   DATABASE_URL=postgresql://postgres:MySecurePassword123!@localhost:5432/customer_insights
   
   # ML Service Configuration
   ML_SERVICE_URL=http://localhost:8000
   
   # Frontend Configuration
   VITE_API_URL=http://localhost:3000
   ```

   **Important**: 
   - Replace `MySecurePassword123!` with a strong password
   - Generate random strings for JWT secrets (you can use online generators or create your own)
   - Make sure the password in `DATABASE_URL` matches `POSTGRES_PASSWORD`

### Step 4: Start the Application

1. **Start all Docker services**:
   ```bash
   npm run dev
   ```

2. **What to expect**:
   - First run will take 5-10 minutes as Docker downloads images and builds containers
   - You'll see logs from all services (frontend, api-gateway, ml-service, postgres, redis)
   - Wait for messages indicating services are ready:
     - `frontend    | VITE ready in XXX ms`
     - `api-gateway | Server listening on port 3000`
     - `ml-service  | Uvicorn running on http://0.0.0.0:8000`

3. **Run database migrations** (in a new PowerShell/Command Prompt window):
   ```bash
   docker-compose exec api-gateway npm run migrate:latest
   ```

   This creates the necessary database tables.

## Access the Application

Once all services are running, you can access:

- **Frontend**: http://localhost:5173
- **API Gateway**: http://localhost:3000
- **ML Service**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

## Development Commands

### Starting and Stopping Services

```bash
# Start all services
npm run dev

# Stop all services (Ctrl+C in the terminal, then run:)
docker-compose down

# Stop and remove all data (databases, caches)
docker-compose down -v
```

### View Logs

```bash
# View logs from all services
docker-compose logs

# View logs from a specific service
docker-compose logs api-gateway
docker-compose logs ml-service
docker-compose logs frontend

# Follow logs in real-time
docker-compose logs -f
```

### Database Operations

```bash
# Run migrations
docker-compose exec api-gateway npm run migrate:latest

# Rollback last migration
docker-compose exec api-gateway npm run migrate:rollback

# Seed database with sample data
docker-compose exec api-gateway npm run seed:run

# Access PostgreSQL CLI
docker-compose exec postgres psql -U postgres -d customer_insights
```

### Redis Operations

```bash
# Access Redis CLI
docker-compose exec redis redis-cli

# Common Redis commands (once in CLI):
# KEYS *           - List all keys
# GET key          - Get value of a key
# FLUSHALL         - Clear all data
# EXIT             - Exit CLI
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests for specific service
npm run test:api
npm run test:frontend
```

### Code Quality

```bash
# Lint code
npm run lint

# Format code
npm run format
```

### Individual Service Development

```bash
# Run only frontend
npm run dev:frontend

# Run only API gateway
npm run dev:api

# Run only ML service
npm run dev:ml
```

## Troubleshooting

### Docker Desktop Not Starting

**Problem**: Docker Desktop fails to start or shows "Docker Desktop starting..." indefinitely.

**Solutions**:
- Ensure WSL 2 is properly installed: `wsl --status` in PowerShell
- Restart your computer
- Check if Hyper-V is enabled (Windows Features)
- Try resetting Docker Desktop: Settings → Troubleshoot → Reset to factory defaults

### Port Already in Use

**Problem**: Error message like "Port 5432 is already in use" or "Port 3000 is already in use".

**Solutions**:
- Check what's using the port: `netstat -ano | findstr :5432` (replace 5432 with your port)
- Stop the conflicting service or change the port in `docker-compose.yml`
- Common conflicts:
  - Port 5432: Local PostgreSQL installation
  - Port 6379: Local Redis installation
  - Port 3000: Other Node.js applications
  - Port 5173: Other Vite applications

### Database Connection Issues

**Problem**: API Gateway can't connect to the database.

**Solutions**:
- Ensure PostgreSQL container is running: `docker-compose ps`
- Check if migrations have been run: `docker-compose exec api-gateway npm run migrate:latest`
- Verify environment variables in `.env` match (especially password)
- Check database logs: `docker-compose logs postgres`
- Restart services: `docker-compose restart`

### npm install Failures

**Problem**: `npm install` fails with errors.

**Solutions**:
- Ensure you have Node.js 18+ installed: `node --version`
- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` folders and `package-lock.json`, then run `npm install` again
- Run PowerShell as Administrator if you get permission errors
- Check your internet connection (npm needs to download packages)

### Docker Build Failures

**Problem**: Docker containers fail to build.

**Solutions**:
- Ensure Docker Desktop is running
- Check Docker has enough resources: Docker Desktop → Settings → Resources
  - Recommended: 4GB RAM minimum, 2 CPUs minimum
- Clear Docker cache: `docker system prune -a` (warning: removes all unused images)
- Check Docker logs: `docker-compose logs [service-name]`
- Rebuild containers: `docker-compose up --build`

### WSL 2 Issues

**Problem**: WSL 2 errors or Docker can't use WSL 2.

**Solutions**:
- Update WSL: `wsl --update` in PowerShell (as Administrator)
- Set WSL 2 as default: `wsl --set-default-version 2`
- Check WSL version: `wsl --list --verbose`
- Restart WSL: `wsl --shutdown`, then restart Docker Desktop

### Application Not Loading in Browser

**Problem**: Can't access http://localhost:5173 or other URLs.

**Solutions**:
- Wait for all services to fully start (check logs)
- Verify services are running: `docker-compose ps` (all should show "Up")
- Try accessing http://127.0.0.1:5173 instead
- Clear browser cache or try incognito mode
- Check Windows Firewall isn't blocking the ports

## Project Structure

```
.
├── frontend/              # React frontend application
│   ├── src/              # Source code
│   ├── public/           # Static assets
│   └── Dockerfile        # Frontend container configuration
├── api-gateway/          # Node.js API gateway
│   ├── src/              # Source code
│   ├── migrations/       # Database migrations
│   └── Dockerfile        # API container configuration
├── ml-service/           # Python ML service
│   ├── app/              # Application code
│   ├── models/           # ML models
│   └── Dockerfile        # ML service container configuration
├── database/             # Database scripts
│   ├── migrations/       # Schema migrations
│   └── seeds/            # Sample data
├── docker-compose.yml    # Docker orchestration configuration
├── .env.example          # Example environment variables
└── package.json          # Root project dependencies
```

## Security Notes

### Protecting Your .env File

The `.env` file contains sensitive information like passwords and secret keys.

**Important Security Practices**:

1. **Never commit `.env` to version control**
   - The `.env` file is already in `.gitignore`
   - Only commit `.env.example` with placeholder values

2. **Use strong passwords and secrets**
   - Database passwords: At least 16 characters, mix of letters, numbers, symbols
   - JWT secrets: At least 32 random characters
   - Never use default or example values in production

3. **Keep secrets secret**
   - Don't share your `.env` file
   - Don't post it in public forums or chat
   - Don't include it in screenshots

4. **Different secrets for different environments**
   - Use different passwords for development and production
   - Rotate secrets periodically
   - Use environment-specific `.env` files

5. **Generate secure random secrets**
   - Use password generators or command-line tools
   - Example PowerShell command to generate random string:
     ```powershell
     -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
     ```

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Node.js Documentation](https://nodejs.org/docs/)
- [React Documentation](https://react.dev/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## Getting Help

If you encounter issues not covered in the troubleshooting section:

1. Check the logs: `docker-compose logs`
2. Search for the error message online
3. Check the project's issue tracker
4. Ask for help with specific error messages and logs
