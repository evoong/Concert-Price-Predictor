FROM python:3.11-slim

# Install system dependencies for Chromium/Selenium (better for arm64/Mac)
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set Selenium to use Chromium
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROMEDRIVER_PATH=/usr/bin/chromium-driver

# Set working directory
WORKDIR /app

# Copy requirement files and install
COPY requirements_web.txt .
RUN pip install --no-cache-dir -r requirements_web.txt

# Copy application files
COPY . .

# Expose port and start app
EXPOSE 5000
CMD ["python", "app.py"]
