# NGINX API Gateway Reverse Proxy Setup

This directory contains configuration files for setting up a professional NGINX reverse proxy in front of the API Gateway, Frontend, and Forecasting services.

---

## Option 1: Docker Compose (Containerized Deployment)

If you are running the project using Docker, NGINX is integrated directly into the services group.

### To start:
1. Ensure Docker Desktop is running.
2. Run:
   ```bash
   docker-compose up -d reverse-proxy
   ```
3. Open your browser and navigate to `http://localhost/`.

---

## Option 2: Local Windows Development (Direct Host Running)

If you run the backend microservices and Vite frontend locally via `npm run dev` / `npm run start:dev`, you can run a native NGINX service on Windows as a local reverse proxy.

### Setup Steps:
1. **Download NGINX**:
   Download the latest stable version of NGINX for Windows from [nginx.org/en/download.html](https://nginx.org/en/download.html) and extract it (e.g. to `C:\nginx`).

2. **Copy configurations**:
   Make sure you copy the `mime.types` file from your NGINX installation `conf/` directory into this folder if it's missing, OR point NGINX to your config folder.

3. **Start NGINX on Windows**:
   Open a terminal (Command Prompt or PowerShell) inside your NGINX directory (`C:\nginx`) and run:
   ```cmd
   nginx.exe -c "D:\NestJS\SourceCode\warehouse-system\nginx\nginx-local.conf"
   ```
   *(Make sure to use the absolute path to your `nginx-local.conf` file).*

4. **Verify**:
   - Navigate to `http://localhost/` in your browser.
   - It will serve the Vite frontend from `localhost:5173`.
   - WebSockets for Vite HMR (hot-reload) will work correctly.
   - Requests to `/api/` will automatically proxy to the NestJS Gateway (`localhost:8000`).

5. **Stop NGINX**:
   To stop the running NGINX server, run:
   ```cmd
   nginx.exe -s stop
   ```
