FROM node:18

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all app files
COPY . .

ARG ADMIN_PIN
RUN echo "window.ADMIN_PIN = '${ADMIN_PIN}'; console.log('window.ADMIN_PIN injected:', window.ADMIN_PIN);" \
    > ./public/admin-pin.js

# Expose the port
EXPOSE 3011

# Start the server
CMD ["node", "server.js"]