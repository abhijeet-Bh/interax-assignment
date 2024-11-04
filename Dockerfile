# Dockerfile
FROM golang:1.20-alpine

WORKDIR /app

RUN apk update && apk add --no-cache ffmpeg

COPY go.mod go.sum ./
RUN go mod download

COPY . .

CMD ["go", "run", "main.go"]