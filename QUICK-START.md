# Quick Start Guide - Node.js Setup

## ✅ Current Status

- **Node.js Version**: v24.14.0 ✓
- **npm Version**: 11.9.0 ✓
- **Location**: `C:\Program Files\nodejs`

## 🔧 PATH Configuration

### Current Session (Temporary)
You've already run this command in your current PowerShell session:
```powershell
$env:Path += ";C:\Program Files\nodejs"
```

This works for NOW, but you'll need to run it again each time you open PowerShell.

### Permanent Fix

**Option A: Using PowerShell Script (Recommended)**
1. Open PowerShell as Administrator (Right-click → Run as Administrator)
2. Navigate to project: `cd "D:\Projects\Customer Insights"`
3. Run: `.\add-nodejs-to-path.ps1`
4. Restart PowerShell

**Option B: Manual (GUI Method)**
1. Press `Win + X` → Select "System"
2. Click "Advanced system settings"
3. Click "Environment Variables"
4. Under "System variables", find "Path" → Click "Edit"
5. Click "New" → Add: `C:\Program Files\nodejs`
6. Click OK on all dialogs
7. Restart PowerShell

## 📦 Installing Dependencies

### Step 1: Ensure Node.js is in PATH
In your current PowerShell session, run:
```powershell
node --version
npm --version
```

If you get errors, run:
```powershell
$env:Path += ";C:\Program Files\nodejs"
```

### Step 2: Install Project Dependencies

The command `npm install` is currently running. This will:
- Install root workspace dependencies
- Install frontend dependencies (React, TypeScript, Vite, etc.)
- Install api-gateway dependencies (Express, JWT, PostgreSQL client, etc.)

**This takes 3-5 minutes on first run** because it downloads hundreds of packages.

You'll see a spinner animation (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) - this is normal!

### Step 3: Verify Installation

Once `npm install` completes, you should see:
```
added XXX packages in XXs
```

Then verify:
```powershell
# Check if node_modules folder was created
Test-Path node_modules

# Check if workspaces were installed
Test-Path frontend/node_modules
Test-Path api-gateway/node_modules
```

## 🚀 Next Steps After Installation

### 1. Configure Environment Variables
```powershell
copy .env.example .env
```

Then edit `.env` with your preferred text editor and update:
- `POSTGRES_PASSWORD` - Choose a strong password
- `JWT_SECRET` - Generate a random 32+ character string
- `JWT_REFRESH_SECRET` - Generate another random 32+ character string

### 2. Start Docker Desktop
- Make sure Docker Desktop is running (whale icon in system tray)
- If not installed, follow the README.md instructions

### 3. Start All Services
```powershell
npm run dev
```

This will:
- Start PostgreSQL database
- Start Redis cache
- Start API Gateway (Node.js)
- Start ML Service (Python)
- Start Frontend (React)

### 4. Run Database Migrations
In a NEW PowerShell window (keep the first one running):
```powershell
docker-compose exec api-gateway npm run migrate:latest
```

### 5. Access the Application
- Frontend: http://localhost:5173
- API Gateway: http://localhost:3000
- ML Service: http://localhost:8000
- API Docs: http://localhost:8000/docs

## 🐛 Troubleshooting

### npm install is stuck
- It's not stuck, it's downloading packages (can take 5-10 minutes)
- You'll see a spinner animation - this is normal
- Wait for "added XXX packages" message

### npm install failed
```powershell
# Clear cache and try again
npm cache clean --force
npm install
```

### Node.js not found after restart
- You need to add Node.js to PATH permanently (see above)
- Or run this in each new PowerShell session:
  ```powershell
  $env:Path += ";C:\Program Files\nodejs"
  ```

### Permission errors
- Run PowerShell as Administrator
- Or try: `npm install --no-optional`

## 📝 Useful Commands

```powershell
# Check Node.js and npm versions
node --version
npm --version

# Check if dependencies are installed
ls node_modules

# View package.json scripts
npm run

# Install a specific package
npm install package-name

# Update all packages
npm update

# Clean install (removes node_modules and reinstalls)
rm -r node_modules
npm install
```

## 🎯 Summary

**What you've done:**
1. ✅ Located Node.js at `C:\Program Files\nodejs`
2. ✅ Added Node.js to PATH (temporarily)
3. ✅ Started `npm install` (currently running)

**What's next:**
1. ⏳ Wait for `npm install` to complete
2. 🔧 Add Node.js to PATH permanently (optional but recommended)
3. ⚙️ Configure `.env` file
4. 🐳 Start Docker Desktop
5. 🚀 Run `npm run dev`

**Need help?** Check the main README.md for detailed troubleshooting!
