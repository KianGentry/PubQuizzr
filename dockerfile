FROM node:18

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json (if you have them)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all app files
COPY . .

# Expose the port
EXPOSE 3011

# Start the server
CMD ["node", "server.js"]
