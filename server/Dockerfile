# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /zapp-server ./cmd/zapp-server

# Final stage
FROM alpine:3.20

RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app

COPY --from=builder /zapp-server /usr/local/bin/zapp-server

EXPOSE 8080
VOLUME ["/app/data"]

ENV ZAPP_SERVER_BIND="0.0.0.0:8080"
ENV ZAPP_SERVER_DB="/app/data/relay.db"

ENTRYPOINT ["zapp-server"]
