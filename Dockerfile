FROM node:20-slim

# Minimal dependencies — tzdata for timezone, ca-certificates for HTTPS
RUN apt-get update && apt-get install -y \
    tzdata \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Africa/Lagos

WORKDIR /app

# --- Build the admin dashboard frontend ---
COPY admin-dashboard/package*.json ./admin-dashboard/
RUN cd admin-dashboard && npm install
COPY admin-dashboard/ ./admin-dashboard/
RUN cd admin-dashboard && npx vite build
RUN mv admin-dashboard/dist ./admin-dashboard-dist && rm -rf admin-dashboard

# --- Install backend dependencies ---
COPY package*.json ./
RUN npm install --omit=dev

# Copy all remaining backend code
COPY . .

# Expose the port
EXPOSE 3000

# Start the application
CMD ["node", "--max-old-space-size=512", "--expose-gc", "server.js"]
