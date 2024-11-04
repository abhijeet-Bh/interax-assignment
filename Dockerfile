# Use Go 1.23 as the base image
FROM golang:1.23

# Set working directory inside the container
WORKDIR /app

# Install ffmpeg using apt-get
RUN apt-get update && apt-get install -y ffmpeg

# Copy go.mod and go.sum files to install dependencies
COPY go.mod go.sum ./

# Download and cache Go modules
RUN go mod download

# Copy the source code into the container
COPY . .

# Build the application
RUN go build -o main .

# Expose the application port (adjust if necessary)
EXPOSE 8080

# Run the application
CMD ["./main"]