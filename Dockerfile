FROM node:20-slim

# Install Chromium and all its dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libxshmfence1 \
    wget \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to skip downloading Chrome and use the installed one
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# --- Build the admin dashboard frontend ---
COPY admin-dashboard/package*.json ./admin-dashboard/
RUN cd admin-dashboard && npm install
COPY admin-dashboard/ ./admin-dashboard/
RUN cd admin-dashboard && npm run build

# --- Install backend dependencies ---
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend application code
COPY server.js ./
COPY src/ ./src/
COPY config/ ./config/
COPY scripts/ ./scripts/
COPY .env* ./

# Move the built frontend to a dist folder the server can serve
RUN mv admin-dashboard/dist ./admin-dashboard-dist

# Expose the port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
